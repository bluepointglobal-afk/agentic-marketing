import { BrandModel, RunModel, toRun } from "@pipeline/shared/models";
import { STAGE_IDS } from "@pipeline/shared";
import { getRunQueue } from "@pipeline/shared/queue";
import { ensureDb, json, badRequest, notFound, serverError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/runs { brandId } — create a run and enqueue it.
 * Replaces the cockpit's startRun() simulation.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as { brandId?: string };
    if (!body.brandId) return badRequest("Missing brandId");

    await ensureDb();

    const brand = await BrandModel.findById(body.brandId).lean();
    if (!brand) return notFound("Brand not found");

    const run = await RunModel.create({
      brandId: body.brandId,
      status: "queued",
      stages: STAGE_IDS.map((id) => ({ id, status: "queued" })),
      draft: null,
      outcome: null,
      costUsd: null,
    });

    const runId = String(run._id);
    await getRunQueue().add(
      "execute",
      { runId, brandId: body.brandId },
      // Idempotency: one active job per run id.
      { jobId: runId },
    );

    return json({ runId, run: toRun(run.toObject() as never) }, 201);
  } catch (err) {
    console.error("POST /api/runs failed", err);
    return serverError();
  }
}
