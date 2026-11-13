import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { requireDatabaseUrl } from "@/lib/env";
import * as schema from "./schema";

let db: ReturnType<typeof createDb> | undefined;

function createDb() {
  return drizzle(neon(requireDatabaseUrl()), { schema });
}

/** Lazy so importing this file never needs a database. */
export function getDb() {
  db ??= createDb();
  return db;
}
