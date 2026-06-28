import { BrandModel, toBrand } from "@pipeline/shared/models";
import type { Brand } from "@pipeline/shared";
import { ensureDb, json, badRequest, notFound, serverError } from "@/lib/api";

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

// Fields the cockpit may edit on an existing brand.
const EDITABLE = [
  "name",
  "audience",
  "positioning",
  "voice",
  "dos",
  "nevers",
  "channels",
  "keywords",
  "imageModel",
  "cadence",
  "publishTarget",
  "gateThreshold",
  "blotatoAccounts",
] as const;

/** PUT /api/brands/:id — update brand settings (channels, publish target, Blotato account ids, …). */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const body = (await req.json()) as Partial<Brand>;

    const update: Record<string, unknown> = {};
    for (const key of EDITABLE) {
      if (key in body && body[key] !== undefined) update[key] = body[key];
    }
    if (Object.keys(update).length === 0) return badRequest("No editable fields provided");

    await ensureDb();
    const doc = await BrandModel.findByIdAndUpdate(id, update, { new: true }).lean();
    if (!doc) return notFound("Brand not found");
    return json(toBrand(doc as never));
  } catch (err) {
    console.error("PUT /api/brands/:id failed", err);
    return serverError();
  }
}
