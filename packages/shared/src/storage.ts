import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";

/**
 * S3-compatible object storage for media (Cloudflare R2 / Vultr Object Storage).
 * Generated + uploaded assets go here and we persist the ABSOLUTE URL on the
 * run/brand — keeping large binaries out of MongoDB. When unset, callers fall
 * back to GridFS for local dev (see assets.ts).
 */

let client: S3Client | null = null;

export function isStorageConfigured(): boolean {
  return Boolean(
    process.env.S3_BUCKET &&
      process.env.S3_ENDPOINT &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY,
  );
}

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      region: process.env.S3_REGION ?? "auto",
      endpoint: process.env.S3_ENDPOINT,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY as string,
      },
      // R2 / Vultr are happiest with path-style addressing.
      forcePathStyle: true,
    });
  }
  return client;
}

function publicUrl(key: string): string {
  const base = process.env.S3_PUBLIC_BASE_URL
    ? process.env.S3_PUBLIC_BASE_URL
    : `${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET}`;
  return `${base.replace(/\/+$/, "")}/${key}`;
}

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

/** A unique object key under a prefix, e.g. "generated/<uuid>.png". */
export function makeKey(prefix: string, contentType: string, filename?: string): string {
  const ext = EXT[contentType] ?? filename?.split(".").pop() ?? "bin";
  return `${prefix}/${randomUUID()}.${ext}`;
}

/** Upload bytes and return the absolute public URL. Throws if not configured. */
export async function putObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  if (!isStorageConfigured()) throw new Error("S3 storage not configured");
  await getClient().send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return publicUrl(key);
}
