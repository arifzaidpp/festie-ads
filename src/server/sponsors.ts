import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { sponsors } from "@/db/schema";
import { HttpError, isStillReferenced } from "./http";

type SponsorInput = { name: string; contactEmail?: string | null; notes?: string | null };

export function listSponsors(accountId: string) {
  return getDb().select().from(sponsors).where(eq(sponsors.accountId, accountId)).orderBy(asc(sponsors.name));
}

export async function createSponsor(ownerId: string, accountId: string, input: SponsorInput) {
  const [row] = await getDb()
    .insert(sponsors)
    .values({ ownerId, accountId, name: input.name, contactEmail: input.contactEmail ?? null, notes: input.notes ?? null })
    .returning();
  return row!;
}

export async function updateSponsor(accountId: string, id: string, input: SponsorInput) {
  const [row] = await getDb()
    .update(sponsors)
    .set({
      name: input.name,
      contactEmail: input.contactEmail ?? null,
      notes: input.notes ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(sponsors.id, id), eq(sponsors.accountId, accountId)))
    .returning();
  if (!row) throw new HttpError(404, "Sponsor not found.");
  return row;
}

export async function deleteSponsor(accountId: string, id: string) {
  try {
    const rows = await getDb()
      .delete(sponsors)
      .where(and(eq(sponsors.id, id), eq(sponsors.accountId, accountId)))
      .returning({ id: sponsors.id });
    if (rows.length === 0) throw new HttpError(404, "Sponsor not found.");
  } catch (error) {
    if (isStillReferenced(error)) throw new HttpError(409, "This sponsor still has ads. Archive or move them first.");
    throw error;
  }
}
