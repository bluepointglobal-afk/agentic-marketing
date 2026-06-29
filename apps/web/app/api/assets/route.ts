import { uploadAsset } from "@pipeline/shared/assets";
import { json, badRequest, serverError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

/** POST /api/assets — multipart upload of a brand asset (logo/image). → { url } */
export async function POST(req: Request): Promise<Response> {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") return badRequest("No file provided");
    if (file.type && !ALLOWED.includes(file.type))
      return badRequest(`Unsupported type: ${file.type}`);
    if (file.size > MAX_BYTES) return badRequest("File too large (max 8MB)");

    const buffer = Buffer.from(await file.arrayBuffer());
    const id = await uploadAsset(
      buffer,
      file.name || "asset",
      file.type || "application/octet-stream",
    );
    return json({ url: `/api/assets/${id}` }, 201);
  } catch (err) {
    console.error("POST /api/assets failed", err);
    return serverError();
  }
}
