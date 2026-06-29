import { readAssetById } from "@pipeline/shared/assets";
import { ensureDb, notFound, serverError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/assets/:id — stream a stored asset from GridFS. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    await ensureDb();
    const asset = await readAssetById(id);
    if (!asset) return notFound("Asset not found");
    return new Response(new Uint8Array(asset.buffer), {
      headers: {
        "content-type": asset.contentType,
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    console.error("GET /api/assets/:id failed", err);
    return serverError();
  }
}
