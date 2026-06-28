import { RunModel, toRun } from "@pipeline/shared/models";
import { ensureDb, json, notFound, serverError } from "@/lib/api";
import { isValidObjectId } from "mongoose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/runs/:id — current status + stage statuses + draft, for polling. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    if (!isValidObjectId(id)) return notFound("Run not found");

    await ensureDb();
    const doc = await RunModel.findById(id).lean();
    if (!doc) return notFound("Run not found");

    return json(toRun(doc as never));
  } catch (err) {
    console.error("GET /api/runs/:id failed", err);
    return serverError();
  }
}
