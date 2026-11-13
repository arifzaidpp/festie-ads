import { randomUUID } from "node:crypto";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { and, eq } from "drizzle-orm";
import { imageSize } from "image-size";
import { getDb } from "@/db";
import { assets } from "@/db/schema";
import { getEnv } from "@/lib/env";
import { MEDIA_LIMITS, type MediaType } from "@/lib/placements";
import { HttpError } from "./http";

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "video/mp4": "mp4",
};

/** Kind and extension for an allowed upload, or a message. Pure, so it is unit tested. */
export function validateUpload(input: { contentType: string; bytes: number }):
  | { ok: true; kind: MediaType; ext: string }
  | { ok: false; error: string } {
  const kind: MediaType | null = (MEDIA_LIMITS.IMAGE.mimes as readonly string[]).includes(input.contentType)
    ? "IMAGE"
    : (MEDIA_LIMITS.VIDEO.mimes as readonly string[]).includes(input.contentType)
      ? "VIDEO"
      : null;
  if (!kind) return { ok: false, error: "Only PNG, JPEG, WebP images and MP4 videos are allowed." };
  const max = MEDIA_LIMITS[kind].maxBytes;
  if (input.bytes > max) {
    return { ok: false, error: `Too large: ${kind === "IMAGE" ? "images" : "videos"} are limited to ${max / 1024 / 1024} MB.` };
  }
  return { ok: true, kind, ext: EXTENSIONS[input.contentType]! };
}

function storage() {
  const env = getEnv();
  const { S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET, S3_PUBLIC_BASE_URL } = env;
  if (!S3_ENDPOINT || !S3_REGION || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY || !S3_BUCKET || !S3_PUBLIC_BASE_URL) {
    throw new HttpError(503, "Media storage is not configured.");
  }
  const client = new S3Client({
    region: S3_REGION,
    endpoint: S3_ENDPOINT,
    credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
  });
  return { client, bucket: S3_BUCKET };
}

/** Every object of an owner lives under this prefix. */
export function ownerPrefix(ownerId: string): string {
  return `${getEnv().S3_KEY_PREFIX}${ownerId}/`;
}

export function assetUrl(key: string): string | null {
  const base = getEnv().S3_PUBLIC_BASE_URL;
  return base ? `${base.replace(/\/$/, "")}/${key}` : null;
}

export async function createPresign(ownerId: string, input: { filename: string; contentType: string; bytes: number }) {
  const check = validateUpload(input);
  if (!check.ok) throw new HttpError(422, check.error);
  const { client, bucket } = storage();
  const key = `${ownerPrefix(ownerId)}${randomUUID()}.${check.ext}`;
  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: input.contentType, ContentLength: input.bytes }),
    { expiresIn: 600 },
  );
  return { key, kind: check.kind, uploadUrl, headers: { "Content-Type": input.contentType } };
}

export async function completeUpload(
  ownerId: string,
  input: { key: string; width: number; height: number; durationMs?: number | null },
) {
  if (!input.key.startsWith(ownerPrefix(ownerId))) throw new HttpError(403, "Not your upload.");
  const db = getDb();
  const [existing] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.storageKey, input.key), eq(assets.ownerId, ownerId)));
  if (existing) return { ...existing, url: assetUrl(existing.storageKey) };

  const { client, bucket } = storage();
  let head;
  try {
    head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: input.key }));
  } catch {
    throw new HttpError(422, "Upload not found. Upload the file first.");
  }
  const contentType = head.ContentType ?? "";
  const bytes = head.ContentLength ?? 0;
  const check = validateUpload({ contentType, bytes });
  if (!check.ok) throw new HttpError(422, check.error);

  let { width, height } = input;
  if (check.kind === "IMAGE") {
    // Do not trust the browser for images: read the real size from the stored file.
    const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: input.key }));
    const buffer = Buffer.from(await object.Body!.transformToByteArray());
    const size = imageSize(buffer);
    if (!size.width || !size.height) throw new HttpError(422, "Could not read the image size.");
    width = size.width;
    height = size.height;
  } else if (!input.durationMs || input.durationMs > MEDIA_LIMITS.VIDEO.maxDurationMs) {
    throw new HttpError(422, `Videos can be at most ${MEDIA_LIMITS.VIDEO.maxDurationMs / 1000} seconds.`);
  }

  const [row] = await db
    .insert(assets)
    .values({
      ownerId,
      kind: check.kind,
      storageKey: input.key,
      mime: contentType,
      bytes,
      width,
      height,
      durationMs: check.kind === "VIDEO" ? input.durationMs! : null,
    })
    .returning();
  return { ...row!, url: assetUrl(row!.storageKey) };
}

/** An asset of this owner, or null. Used for the file an ad was edited from. */
export async function getSourceAsset(ownerId: string, id: string | null) {
  if (!id) return null;
  const [row] = await getDb()
    .select()
    .from(assets)
    .where(and(eq(assets.id, id), eq(assets.ownerId, ownerId)));
  return row ?? null;
}

/**
 * The stored file as a stream, so the editor can load an earlier upload without bucket CORS
 * (a canvas may only draw an image it fetched from its own origin or with CORS headers).
 */
export async function readAssetObject(ownerId: string, id: string) {
  const asset = await getSourceAsset(ownerId, id);
  if (!asset) throw new HttpError(404, "Media not found.");
  const { client, bucket } = storage();
  const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: asset.storageKey }));
  if (!object.Body) throw new HttpError(404, "Media not found.");
  return { stream: object.Body.transformToWebStream(), contentType: asset.mime, bytes: asset.bytes };
}
