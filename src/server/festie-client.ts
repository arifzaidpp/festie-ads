import { z } from "zod";

/** Why a festie call failed, in terms the engine acts on. */
export class FestieError extends Error {
  constructor(
    public kind: "revoked" | "invalid_grant" | "unavailable" | "bad_response",
    message: string,
  ) {
    super(message);
  }
}

export interface FestieEndpoints {
  apiUrl: string;
}

const TIMEOUT_MS = 8000;

async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new FestieError("unavailable", "Festie did not respond.");
  }
}

const tokenSchema = z.object({
  access_token: z.string().min(1),
  festival_id: z.string().min(1),
  sub_fest_ids: z.array(z.string()).default([]),
  external_ref: z.string().optional(),
});

export type TokenResult = { accessToken: string; festivalId: string; subFestIds: string[]; externalRef: string | undefined };

/** Server to server code exchange (festie `POST /apps/oauth/token`). */
export async function exchangeCode(
  app: FestieEndpoints & { clientId: string; clientSecret: string },
  code: string,
  redirectUri: string,
): Promise<TokenResult> {
  const response = await send(`${app.apiUrl}/apps/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: app.clientId,
      client_secret: app.clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (response.status === 400 || response.status === 401) {
    throw new FestieError("invalid_grant", "Festie rejected the connection code. Try connecting again.");
  }
  if (!response.ok) throw new FestieError("unavailable", `Festie returned ${response.status}.`);
  const parsed = tokenSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new FestieError("bad_response", "Unexpected answer from festie.");
  return {
    accessToken: parsed.data.access_token,
    festivalId: parsed.data.festival_id,
    subFestIds: parsed.data.sub_fest_ids,
    externalRef: parsed.data.external_ref,
  };
}

const connectionSchema = z.object({
  festival: z.object({ id: z.string(), name: z.string() }).passthrough().nullable(),
  subFests: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string().nullish(),
      timeZone: z.string().nullish(),
    }),
  ),
});

export type RemoteConnection = z.infer<typeof connectionSchema>;

/** The festival and fests behind a token (festie `GET /app-api/v1/connection`). 401 means revoked. */
export async function fetchConnection(app: FestieEndpoints, token: string): Promise<RemoteConnection> {
  const response = await send(`${app.apiUrl}/app-api/v1/connection`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401 || response.status === 403) {
    throw new FestieError("revoked", "Festie says this connection was revoked.");
  }
  if (!response.ok) throw new FestieError("unavailable", `Festie returned ${response.status}.`);
  const parsed = connectionSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success || !parsed.data.festival) throw new FestieError("bad_response", "Unexpected answer from festie.");
  return parsed.data;
}

/** Tells festie to revoke the connection. Best effort: the local record is revoked either way. */
export async function revokeRemote(app: FestieEndpoints, token: string): Promise<boolean> {
  try {
    const response = await send(`${app.apiUrl}/app-api/v1/connection`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.ok || response.status === 401;
  } catch {
    return false;
  }
}
