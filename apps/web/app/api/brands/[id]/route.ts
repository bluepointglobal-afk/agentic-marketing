import { BrandModel, toBrand } from "@pipeline/shared/models";
import { ensureDb, json, notFound, serverError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/brands/:id — single brand (used to refresh run history). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    await ensureDb();
    const doc = await BrandModel.findById(id).lean();
    if (!doc) return notFound("Brand not found");
    return json(toBrand(doc as never));
  } catch (err) {
    console.error("GET /api/brands/:id failed", err);
    return serverError();
  }
}
