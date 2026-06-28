import { RunModel, toRun, appendRunSummary } from "@pipeline/shared/models";
import { ensureDb, json, notFound, badRequest, serverError } from "@/lib/api";
import { isValidObjectId } from "mongoose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/runs/:id/reject — operator rejects the gated draft.
 * Ends the run, nothing publishes. Replaces the cockpit reject() simulation.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    if (!isValidObjectId(id)) return notFound("Run not found");

    await ensureDb();
    const run = await RunModel.findById(id);
    if (!run) return notFound("Run not found");
    if (run.status !== "awaiting_approval")
      return badRequest(`Run is not awaiting approval (status: ${run.status})`);

    run.status = "rejected";
    run.outcome = "rejected";
    run.set(
      "stages",
      run.stages.map((s) =>
        s.id === "gate"
          ? { id: s.id, status: "rejected" }
          : { id: s.id, status: s.status },
      ),
    );
    await run.save();

    await appendRunSummary(run.brandId, {
      id: id,
      at: Date.now(),
      outcome: "rejected",
      title: run.draft?.title ?? "Untitled draft",
    });

    return json(toRun(run.toObject() as never));
  } catch (err) {
    console.error("POST /api/runs/:id/reject failed", err);
    return serverError();
  }
}
