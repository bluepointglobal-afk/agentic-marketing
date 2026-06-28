import { BrandModel, toBrand } from "@pipeline/shared/models";
import type { Brand } from "@pipeline/shared";
import { ensureDb, json, badRequest, serverError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/brands — list all brands for the dashboard. */
export async function GET(): Promise<Response> {
  try {
    await ensureDb();
    const docs = await BrandModel.find().sort({ createdAt: 1 }).lean();
    return json(docs.map((d) => toBrand(d as never)));
  } catch (err) {
    console.error("GET /api/brands failed", err);
    return serverError();
  }
}

const IMAGE_MODELS = ["gpt-image-2", "nano-banana"];
const CADENCES = ["manual", "daily", "weekly"];
const PUBLISH_TARGETS = ["draft", "blotato", "cms"];

/** POST /api/brands — create a brand from the onboarding wizard payload. */
export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as Partial<Brand>;

    if (!body.id || typeof body.id !== "string") return badRequest("Missing brand id");
    if (!body.name || typeof body.name !== "string") return badRequest("Missing brand name");
    if (body.imageModel && !IMAGE_MODELS.includes(body.imageModel))
      return badRequest("Invalid imageModel");
    if (body.cadence && !CADENCES.includes(body.cadence)) return badRequest("Invalid cadence");
    if (body.publishTarget && !PUBLISH_TARGETS.includes(body.publishTarget))
      return badRequest("Invalid publishTarget");

    await ensureDb();

    // Upsert keyed on the cockpit-generated slug id.
    const doc = await BrandModel.findByIdAndUpdate(
      body.id,
      {
        _id: body.id,
        name: body.name,
        audience: body.audience ?? "",
        positioning: body.positioning ?? "",
        voice: body.voice ?? "",
        dos: body.dos ?? "",
        nevers: body.nevers ?? "",
        channels: body.channels ?? [],
        keywords: body.keywords ?? [],
        imageModel: body.imageModel ?? "gpt-image-2",
        cadence: body.cadence ?? "weekly",
        publishTarget: body.publishTarget ?? "draft",
        gateThreshold: body.gateThreshold ?? 85,
        blotatoAccounts: body.blotatoAccounts ?? {},
        // Never trust client-sent run history; runs are server-owned.
        $setOnInsert: { runs: [] },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();

    return json(toBrand(doc as never), 201);
  } catch (err) {
    console.error("POST /api/brands failed", err);
    return serverError();
  }
}
