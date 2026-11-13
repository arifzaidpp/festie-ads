import { disconnect, refreshConnection } from "@/server/connections";
import { route } from "@/server/http";

type P = { id: string };

function view(found: Awaited<ReturnType<typeof refreshConnection>>) {
  const { connection, fests } = found;
  return {
    connection: {
      status: connection.status,
      festivalId: connection.festivalId,
      festivalName: connection.festivalName,
      connectedAt: connection.connectedAt,
      revokedAt: connection.revokedAt,
      lastCheckedAt: connection.lastCheckedAt,
    },
    fests: fests.map((f) => ({ id: f.subFestId, name: f.name })),
  };
}

/** Re-reads festival and fests from festie; marks the connection revoked if festie says so. */
export const POST = route<P>(async ({ ownerId, params }) => view(await refreshConnection(ownerId, params.id)));

export const DELETE = route<P>(async ({ ownerId, params }) => view(await disconnect(ownerId, params.id)));
