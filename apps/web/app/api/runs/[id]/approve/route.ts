import { RunModel, toRun } from "@pipeline/shared/models";
import { getRunQueue } from "@pipeline/shared/queue";
import { ensureDb, json, notFound, badRequest, serverError } from "@/lib/api";
import { isValidObjectId } from "mongoose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/runs/:id/approve — operator approves the gated draft.
 * Flips the run back to running and enqueues a resume job so the worker
 * runs the publish stage. Replaces the cockpit approve() simulation.
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

    run.status = "running";
    // Move the gate stage to done and publish to running for the live rail.
    run.set(
      "stages",
      run.stages.map((s) =>
        s.id === "gate"
          ? { id: s.id, status: "done" }
          : s.id === "publish"
            ? { id: s.id, status: "running" }
            : { id: s.id, status: s.status },
      ),
    );
    await run.save();

    await getRunQueue().add(
      "resume",
      { runId: id, brandId: run.brandId, resumeFrom: "publish" },
      { jobId: `${id}:publish` },
    );

    return json(toRun(run.toObject() as never));
  } catch (err) {
    console.error("POST /api/runs/:id/approve failed", err);
    return serverError();
  }
}
