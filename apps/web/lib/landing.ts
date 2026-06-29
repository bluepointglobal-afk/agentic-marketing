import { connectMongo } from "@pipeline/shared/db";
import { RunModel } from "@pipeline/shared/models";
import type { LandingVariations } from "@pipeline/shared";

/** Latest approved (published) landing payload for a brand. */
export interface LandingPayload {
  brandId: string;
  runId: string;
  updatedAt: string;
  landing: LandingVariations;
}

/**
 * Read the most recent published run that carries a landing layout. This is the
 * "latest approved" landing for the brand — the gate + approval gate it.
 */
export async function getLatestLanding(brandId: string): Promise<LandingPayload | null> {
  await connectMongo(process.env.MONGODB_URI);
  const doc = await RunModel.findOne({
    brandId,
    status: "published",
    "draft.landingVariations": { $ne: null },
  })
    .sort({ updatedAt: -1 })
    .lean();

  const landing = (doc?.draft as { landingVariations?: LandingVariations } | undefined)
    ?.landingVariations;
  if (!doc || !landing) return null;

  return {
    brandId,
    runId: String(doc._id),
    updatedAt: (doc as { updatedAt?: Date }).updatedAt?.toISOString?.() ?? "",
    landing,
  };
}
