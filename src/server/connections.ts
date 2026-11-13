import { and, asc, eq, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { adAccounts, clientApps, connectionFests, connections } from "@/db/schema";
import { decrypt, encrypt, signState, verifyState } from "@/lib/crypto";
import { getEnv } from "@/lib/env";
import { FestieError, exchangeCode, fetchConnection, revokeRemote, type RemoteConnection } from "./festie-client";
import { HttpError, pgCode } from "./http";

export const FESTIE_KEY = "festie";

/** Where festie sends the browser back. Must equal the callback registered in festie Control. */
export function callbackUrl(): string {
  const base = getEnv().BETTER_AUTH_URL;
  if (!base) throw new HttpError(503, "BETTER_AUTH_URL is not set.");
  return `${base.replace(/\/$/, "")}/api/festie/callback`;
}

/** The festie app row, kept in step with the environment (one app for now). */
export async function ensureFestieApp() {
  const env = getEnv();
  if (!env.FESTIE_ADMIN_URL || !env.FESTIE_API_URL || !env.FESTIE_CLIENT_ID || !env.FESTIE_CLIENT_SECRET) {
    throw new HttpError(503, "Festie is not configured.");
  }
  const values = {
    name: "Festie",
    adminUrl: env.FESTIE_ADMIN_URL.replace(/\/$/, ""),
    apiUrl: env.FESTIE_API_URL.replace(/\/$/, ""),
    clientId: env.FESTIE_CLIENT_ID,
    clientSecretEnc: encrypt(env.FESTIE_CLIENT_SECRET),
    updatedAt: new Date(),
  };
  const [row] = await getDb()
    .insert(clientApps)
    .values({ key: FESTIE_KEY, ...values })
    .onConflictDoUpdate({ target: clientApps.key, set: values })
    .returning();
  return { ...row!, clientSecret: env.FESTIE_CLIENT_SECRET };
}

async function ownedAccount(ownerId: string, accountId: string) {
  const [group] = await getDb()
    .select()
    .from(adAccounts)
    .where(and(eq(adAccounts.id, accountId), eq(adAccounts.ownerId, ownerId)));
  if (!group) throw new HttpError(404, "Ad account not found.");
  return group;
}

export async function getConnection(ownerId: string, accountId: string) {
  const db = getDb();
  const [connection] = await db
    .select()
    .from(connections)
    .where(and(eq(connections.accountId, accountId), eq(connections.ownerId, ownerId)));
  if (!connection) return null;
  const fests = await db
    .select()
    .from(connectionFests)
    .where(eq(connectionFests.connectionId, connection.id))
    .orderBy(asc(connectionFests.name));
  return { connection, fests };
}

/** URL of festie's consent page for this account. */
export async function startConnect(ownerId: string, accountId: string): Promise<string> {
  const group = await ownedAccount(ownerId, accountId);
  if (group.status === "ARCHIVED") throw new HttpError(409, "This ad account is archived.");
  const existing = await getConnection(ownerId, accountId);
  if (existing?.connection.status === "ACTIVE") throw new HttpError(409, "This account is already connected.");
  const app = await ensureFestieApp();
  const url = new URL(`${app.adminUrl}/apps/connect`);
  url.searchParams.set("client_id", app.clientId);
  url.searchParams.set("redirect_uri", callbackUrl());
  url.searchParams.set("state", signState({ accountId, ownerId }));
  url.searchParams.set("external_ref", accountId);
  url.searchParams.set("external_name", group.name);
  return url.toString();
}

async function saveFests(connectionId: string, remote: RemoteConnection) {
  const db = getDb();
  const rows = remote.subFests.map((f) => ({
    connectionId,
    subFestId: f.id,
    name: f.name,
    slug: f.slug ?? null,
    timeZone: f.timeZone ?? null,
  }));
  // One atomic batch: the fest list is never half replaced.
  const clear = db.delete(connectionFests).where(eq(connectionFests.connectionId, connectionId));
  if (rows.length === 0) await clear;
  else await db.batch([clear, db.insert(connectionFests).values(rows)]);
}

/** Finishes the round trip: exchange the code, read the festival, save the connection. Returns the account id. */
export async function completeConnect(ownerId: string, code: string, stateValue: string | null): Promise<string> {
  const state = verifyState(stateValue);
  if (!state) throw new HttpError(400, "The connect link expired. Start again.");
  if (state.ownerId !== ownerId) throw new HttpError(403, "This connect link belongs to another account.");
  const group = await ownedAccount(ownerId, state.accountId);

  const app = await ensureFestieApp();
  let token;
  let remote: RemoteConnection;
  try {
    token = await exchangeCode(app, code, callbackUrl());
    remote = await fetchConnection(app, token.accessToken);
  } catch (error) {
    if (error instanceof FestieError) throw new HttpError(error.kind === "unavailable" ? 502 : 400, error.message);
    throw error;
  }
  const festival = remote.festival!;

  const db = getDb();
  // One ad account per festival, whoever owns it. The other owner's account is not named.
  const [clash] = await db
    .select({ id: connections.accountId, ownerId: connections.ownerId, name: adAccounts.name })
    .from(connections)
    .innerJoin(adAccounts, eq(adAccounts.id, connections.accountId))
    .where(and(eq(connections.festivalId, festival.id), eq(connections.status, "ACTIVE"), ne(connections.accountId, group.id)));
  if (clash) {
    throw new HttpError(
      409,
      clash.ownerId === ownerId
        ? `"${festival.name}" is already connected to your account "${clash.name}". Disconnect it there first.`
        : `"${festival.name}" is already connected to another ad account. A festival can have only one.`,
    );
  }

  const values = {
    clientAppId: app.id,
    festivalId: festival.id,
    festivalName: festival.name,
    tokenEnc: encrypt(token.accessToken),
    status: "ACTIVE" as const,
    connectedAt: new Date(),
    revokedAt: null,
    lastCheckedAt: new Date(),
  };
  try {
    const [row] = await db
      .insert(connections)
      .values({ accountId: group.id, ownerId, ...values })
      .onConflictDoUpdate({ target: connections.accountId, set: values })
      .returning({ id: connections.id });
    await saveFests(row!.id, remote);
  } catch (error) {
    if (pgCode(error) === "23505") throw new HttpError(409, `"${festival.name}" is already connected to another ad account. A festival can have only one.`);
    throw error;
  }
  return group.id;
}

async function appFor(connection: { clientAppId: string }) {
  const [app] = await getDb().select().from(clientApps).where(eq(clientApps.id, connection.clientAppId));
  if (!app) throw new HttpError(500, "Client app is missing.");
  return app;
}

/** Re-reads festival and fests from festie. A 401 marks the connection revoked. */
export async function refreshConnection(ownerId: string, accountId: string) {
  const found = await getConnection(ownerId, accountId);
  if (!found) throw new HttpError(404, "This account is not connected.");
  const { connection } = found;
  if (connection.status === "REVOKED") return found;
  const app = await appFor(connection);
  const db = getDb();
  try {
    const remote = await fetchConnection(app, decrypt(connection.tokenEnc));
    await db
      .update(connections)
      .set({ festivalName: remote.festival!.name, lastCheckedAt: new Date() })
      .where(eq(connections.id, connection.id));
    await saveFests(connection.id, remote);
  } catch (error) {
    if (error instanceof FestieError && error.kind === "revoked") {
      await db
        .update(connections)
        .set({ status: "REVOKED", revokedAt: new Date(), lastCheckedAt: new Date() })
        .where(eq(connections.id, connection.id));
    } else if (error instanceof FestieError) {
      throw new HttpError(502, error.message);
    } else {
      throw error;
    }
  }
  return (await getConnection(ownerId, accountId))!;
}

/** The engine disconnects: festie is told (best effort) and the record is revoked. */
export async function disconnect(ownerId: string, accountId: string) {
  const found = await getConnection(ownerId, accountId);
  if (!found) throw new HttpError(404, "This account is not connected.");
  const { connection } = found;
  if (connection.status === "ACTIVE") {
    const app = await appFor(connection);
    await revokeRemote(app, decrypt(connection.tokenEnc));
    await getDb()
      .update(connections)
      .set({ status: "REVOKED", revokedAt: new Date() })
      .where(eq(connections.id, connection.id));
  }
  return (await getConnection(ownerId, accountId))!;
}

/** Ad accounts with the state of their connection, for the account picker. */
export async function listAccountsWithConnection(ownerId: string) {
  const rows = await getDb()
    .select({
      id: adAccounts.id,
      name: adAccounts.name,
      status: adAccounts.status,
      connectionStatus: connections.status,
      festivalName: connections.festivalName,
      activeAds: sql<number>`(select count(*)::int from ads where ads.group_id = ${adAccounts.id} and ads.status = 'ACTIVE')`,
    })
    .from(adAccounts)
    .leftJoin(connections, eq(connections.accountId, adAccounts.id))
    .where(eq(adAccounts.ownerId, ownerId))
    .orderBy(asc(adAccounts.name));
  return rows;
}
