import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { adAccounts } from "@/db/schema";
import { HttpError } from "./http";

export function listAdAccounts(ownerId: string) {
  return getDb().select().from(adAccounts).where(eq(adAccounts.ownerId, ownerId)).orderBy(asc(adAccounts.createdAt));
}

export async function getOwnedAccount(ownerId: string, id: string) {
  const [row] = await getDb()
    .select()
    .from(adAccounts)
    .where(and(eq(adAccounts.id, id), eq(adAccounts.ownerId, ownerId)));
  if (!row) throw new HttpError(404, "Ad account not found.");
  return row;
}

export async function createAdAccount(ownerId: string, input: { name: string }) {
  const [row] = await getDb().insert(adAccounts).values({ ownerId, name: input.name }).returning();
  return row!;
}

export async function updateAdAccount(ownerId: string, id: string, input: { name: string }) {
  const [row] = await getDb()
    .update(adAccounts)
    .set({ name: input.name, updatedAt: new Date() })
    .where(and(eq(adAccounts.id, id), eq(adAccounts.ownerId, ownerId)))
    .returning();
  if (!row) throw new HttpError(404, "Ad account not found.");
  return row;
}
