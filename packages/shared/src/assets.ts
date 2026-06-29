import { connectMongo, mongoose } from "./db";

/**
 * Brand asset storage on GridFS (self-contained — no external bucket).
 * The web app uploads/serves; the worker reads logo bytes for compositing.
 */

const BUCKET = "assets";

async function getBucket() {
  await connectMongo();
  const db = mongoose.connection.db;
  if (!db) throw new Error("Mongo not connected");
  return new mongoose.mongo.GridFSBucket(db, { bucketName: BUCKET });
}

export async function uploadAsset(
  buffer: Buffer,
  filename: string,
  contentType: string,
): Promise<string> {
  const bucket = await getBucket();
  return await new Promise<string>((resolve, reject) => {
    const stream = bucket.openUploadStream(filename, {
      contentType,
      metadata: { contentType },
    });
    stream.on("error", reject);
    stream.on("finish", () => resolve(String(stream.id)));
    stream.end(buffer);
  });
}

export interface AssetData {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

export async function readAssetById(id: string): Promise<AssetData | null> {
  const bucket = await getBucket();
  let oid: InstanceType<typeof mongoose.Types.ObjectId>;
  try {
    oid = new mongoose.Types.ObjectId(id);
  } catch {
    return null;
  }
  const files = await bucket.find({ _id: oid }).toArray();
  const file = files[0] as { contentType?: string; filename?: string; metadata?: { contentType?: string } } | undefined;
  if (!file) return null;

  const chunks: Buffer[] = [];
  return await new Promise<AssetData>((resolve, reject) => {
    bucket
      .openDownloadStream(oid)
      .on("data", (c: Buffer) => chunks.push(c))
      .on("error", reject)
      .on("end", () =>
        resolve({
          buffer: Buffer.concat(chunks),
          contentType: file.contentType ?? file.metadata?.contentType ?? "application/octet-stream",
          filename: file.filename ?? "asset",
        }),
      );
  });
}

/** Extract a GridFS id from an asset URL like "/api/assets/<id>". */
export function assetIdFromUrl(url: string): string | null {
  const m = url.match(/\/api\/assets\/([a-f0-9]{24})/i);
  return m ? (m[1] ?? null) : null;
}

/** Load asset bytes from an app asset URL (GridFS) or an external http(s) URL. */
export async function loadAssetBuffer(url: string): Promise<Buffer | null> {
  const id = assetIdFromUrl(url);
  if (id) {
    const a = await readAssetById(id);
    return a?.buffer ?? null;
  }
  if (/^https?:\/\//.test(url)) {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  }
  return null;
}
