import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Schema = typeof schema;
export type Database = PostgresJsDatabase<Schema>;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Claims of a verified Supabase access token (what `auth.getClaims()` returns). */
export interface JwtClaims {
  sub: string;
  role?: string;
  email?: string;
  [claim: string]: unknown;
}

export interface DbClients {
  /**
   * Bypasses RLS. Only for trusted server code that is not acting on behalf of
   * a user: background jobs, webhooks, migrations, tests. Never for user requests.
   */
  admin: Database;
  /** Runs `fn` in a transaction as the given user, so every RLS policy applies. */
  withUser<T>(claims: JwtClaims, fn: (tx: Transaction) => Promise<T>): Promise<T>;
  /** Runs `fn` as an anonymous visitor (public pages): only what anon is granted. */
  asAnon<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function createDbClients(databaseUrl: string): DbClients {
  // `prepare: false` keeps compatibility with Supabase's transaction pooler.
  const connection = postgres(databaseUrl, { prepare: false });
  const admin = drizzle({ client: connection, schema, casing: 'snake_case' });

  return {
    admin,
    async withUser(claims, fn) {
      if (!claims.sub) throw new Error('withUser requires verified JWT claims');
      const role = claims.role === 'authenticated' ? 'authenticated' : 'anon';
      return admin.transaction(async (tx) => {
        // Same settings PostgREST applies, so auth.uid() and auth.jwt() work.
        await tx.execute(sql`
          select
            set_config('request.jwt.claims', ${JSON.stringify(claims)}, true),
            set_config('request.jwt.claim.sub', ${claims.sub}, true),
            set_config('role', ${role}, true)
        `);
        return fn(tx);
      });
    },
    asAnon(fn) {
      return admin.transaction(async (tx) => {
        await tx.execute(sql`select set_config('role', 'anon', true)`);
        return fn(tx);
      });
    },
    close: () => connection.end(),
  };
}
