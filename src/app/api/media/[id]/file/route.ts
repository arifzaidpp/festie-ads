import { getSession } from "@/lib/session";
import { HttpError } from "@/server/http";
import { readAssetObject } from "@/server/media";

export const dynamic = "force-dynamic";

/** Streams one of the signed-in owner's uploads (the editor draws it on a canvas). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) throw new HttpError(401, "Sign in required.");
    const { id } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "Media not found.");
    const file = await readAssetObject(session.user.id, id);
    return new Response(file.stream, {
      headers: { "Content-Type": file.contentType, "Content-Length": String(file.bytes), "Cache-Control": "private, max-age=300" },
    });
  } catch (error) {
    if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
    console.error(error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
