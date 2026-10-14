import { defineConfig } from 'drizzle-kit';

// Migrations are generated into the Supabase folder and applied with the Supabase
// CLI (`supabase db reset` locally, `supabase db push` in production).
// Tables live in Drizzle; RLS helper functions and policies live in custom SQL
// migrations (`pnpm --filter @rentavle/db generate:custom --name=...`).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: '../../supabase/migrations',
  migrations: { prefix: 'supabase' },
  schemaFilter: ['public'],
  casing: 'snake_case',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55322/postgres',
  },
});
