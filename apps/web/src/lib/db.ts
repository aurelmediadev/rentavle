import "server-only";
import { createDbClients, type DbClients } from "@rentavle/db";

const globalForDb = globalThis as unknown as { rentavleDb?: DbClients };

function connect(): DbClients {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return createDbClients(url);
}

// Reuse one pool across hot reloads in development.
export const db = globalForDb.rentavleDb ?? connect();
if (process.env.NODE_ENV !== "production") globalForDb.rentavleDb = db;
