// Mongoose is CJS; its named exports aren't reliably detected by Node's ESM
// loader (e.g. `models`). Default-import then destructure the values.
import mongoose from "mongoose";
import type { Model, InferSchemaType } from "mongoose";
const { Schema, model, models } = mongoose;
import type {
  Brand,
  Run,
  RunStatus,
  StageStatus,
  StageId,
  ImageModel,
  Cadence,
  PublishTarget,
  RunOutcome,
} from "./types";
import { STAGE_IDS } from "./types";

/* ───────────────────────── Brand ───────────────────────── */

const RunSummarySchema = new Schema(
  {
    id: { type: String, required: true },
    at: { type: Number, required: true }, // epoch ms, matches cockpit relTime()
    outcome: { type: String, enum: ["published", "rejected"], required: true },
    title: { type: String, required: true },
  },
  { _id: false },
);

const BrandSchema = new Schema(
  {
    // The cockpit-generated slug id is the primary key.
    _id: { type: String, required: true },
    name: { type: String, required: true },
    audience: { type: String, default: "" },
    positioning: { type: String, default: "" },
    voice: { type: String, default: "" },
    dos: { type: String, default: "" },
    nevers: { type: String, default: "" },
    channels: { type: [String], default: [] },
    keywords: { type: [String], default: [] },
    imageModel: {
      type: String,
      enum: ["gpt-image-2", "nano-banana"],
      default: "gpt-image-2",
    },
    cadence: {
      type: String,
      enum: ["manual", "daily", "weekly"],
      default: "weekly",
    },
    publishTarget: {
      type: String,
      enum: ["draft", "blotato", "cms"],
      default: "draft",
    },
    gateThreshold: { type: Number, default: 85 },
    // Long-form brand DNA injected into agent prompts.
    brandDna: { type: String, default: "" },
    // Brand assets (logo/wordmark/palette/refs) used during generation.
    assets: { type: Schema.Types.Mixed, default: {} },
    // Brand site for GSC metrics matching.
    siteUrl: { type: String, default: "" },
    // Latest KPI snapshot from the measure stage (server-owned).
    kpis: { type: Schema.Types.Mixed, default: null },
    // Post-publish funnel config (landing + email sequence).
    funnel: { type: Schema.Types.Mixed, default: {} },
    // Blotato account ids keyed by platform (tiktok/instagram/twitter/facebook).
    blotatoAccounts: { type: Schema.Types.Mixed, default: {} },
    runs: { type: [RunSummarySchema], default: [] },
  },
  { timestamps: true, _id: false },
);

/* ───────────────────────── Run ───────────────────────── */

const RunStageSchema = new Schema(
  {
    id: { type: String, enum: STAGE_IDS, required: true },
    status: {
      type: String,
      enum: ["queued", "running", "done", "review", "rejected"],
      required: true,
    },
  },
  { _id: false },
);

const DraftSchema = new Schema(
  {
    title: { type: String, default: "" },
    meta: { type: String, default: "" },
    body: { type: String, default: "" },
    keywords: { type: [String], default: [] },
    score: { type: Number, default: 0 },
    // Optional artifacts produced by later stages (not rendered by the
    // cockpit gate card but persisted for publish + auditing).
    imageUrl: { type: String, default: null },
    variants: { type: Schema.Types.Mixed, default: null },
  },
  { _id: false },
);

const PublishedPostSchema = new Schema(
  {
    platform: { type: String, required: true },
    postId: { type: String, required: true },
    url: { type: String, default: null },
  },
  { _id: false },
);

const RunSchema = new Schema(
  {
    brandId: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: [
        "queued",
        "running",
        "awaiting_approval",
        "published",
        "rejected",
        "errored",
      ],
      default: "queued",
      index: true,
    },
    stages: {
      type: [RunStageSchema],
      default: () => STAGE_IDS.map((id) => ({ id, status: "queued" })),
    },
    draft: { type: DraftSchema, default: null },
    // Per-stage outputs (seo, brief, measure...) persisted for idempotent
    // resume after a mid-pipeline retry. Not surfaced to the cockpit.
    context: { type: Schema.Types.Mixed, default: {} },
    outcome: {
      type: String,
      enum: ["published", "rejected", null],
      default: null,
    },
    costUsd: { type: Number, default: null },
    // Where publish sent the content (audit trail).
    publishedTo: { type: String, default: null },
    // Live posts created at publish — analytics keys for the measure stage.
    published: { type: [PublishedPostSchema], default: [] },
    // Funnel collateral generated after publish (landing + emails).
    funnel: { type: Schema.Types.Mixed, default: null },
    error: { type: String, default: null },
  },
  { timestamps: true },
);

export type BrandDoc = InferSchemaType<typeof BrandSchema> & { _id: string };
export type RunDoc = InferSchemaType<typeof RunSchema> & { _id: unknown };

// `models.X` guard avoids OverwriteModelError on Next hot reload.
export const BrandModel: Model<BrandDoc> =
  (models.Brand as Model<BrandDoc>) ?? model<BrandDoc>("Brand", BrandSchema);

export const RunModel: Model<RunDoc> =
  (models.Run as Model<RunDoc>) ?? model<RunDoc>("Run", RunSchema);

/* ───────────────────────── mappers (doc → domain) ───────────────────────── */

export function toBrand(doc: BrandDoc & Record<string, unknown>): Brand {
  return {
    id: doc._id,
    name: doc.name,
    audience: doc.audience ?? "",
    positioning: doc.positioning ?? "",
    voice: doc.voice ?? "",
    dos: doc.dos ?? "",
    nevers: doc.nevers ?? "",
    channels: (doc.channels ?? []) as Brand["channels"],
    keywords: doc.keywords ?? [],
    imageModel: doc.imageModel as ImageModel,
    cadence: doc.cadence as Cadence,
    publishTarget: doc.publishTarget as PublishTarget,
    gateThreshold: doc.gateThreshold,
    brandDna: (doc as { brandDna?: string }).brandDna ?? "",
    assets: (doc as { assets?: Brand["assets"] }).assets ?? {},
    siteUrl: (doc as { siteUrl?: string }).siteUrl ?? "",
    kpis: (doc as { kpis?: Brand["kpis"] }).kpis ?? undefined,
    funnel: (doc as { funnel?: Brand["funnel"] }).funnel ?? {},
    blotatoAccounts:
      (doc as { blotatoAccounts?: Record<string, string> }).blotatoAccounts ?? {},
    runs: (doc.runs ?? []).map((r) => ({
      id: r.id,
      at: r.at,
      outcome: r.outcome as RunOutcome,
      title: r.title,
    })),
    createdAt: (doc as { createdAt?: Date }).createdAt?.toISOString(),
    updatedAt: (doc as { updatedAt?: Date }).updatedAt?.toISOString(),
  };
}

/** Append a run summary to a brand's history (server-owned, used on terminal runs). */
export async function appendRunSummary(
  brandId: string,
  summary: { id: string; at: number; outcome: RunOutcome; title: string },
): Promise<void> {
  await BrandModel.updateOne({ _id: brandId }, { $push: { runs: summary } });
}

export function toRun(doc: RunDoc & Record<string, unknown>): Run {
  const draft = doc.draft
    ? {
        title: doc.draft.title ?? "",
        meta: doc.draft.meta ?? "",
        body: doc.draft.body ?? "",
        keywords: doc.draft.keywords ?? [],
        score: doc.draft.score ?? 0,
        imageUrl: (doc.draft as { imageUrl?: string | null }).imageUrl ?? null,
      }
    : null;

  return {
    id: String(doc._id),
    brandId: doc.brandId,
    status: doc.status as RunStatus,
    stages: (doc.stages ?? []).map((s) => ({
      id: s.id as StageId,
      status: s.status as StageStatus,
    })),
    draft,
    outcome: (doc.outcome ?? null) as RunOutcome | null,
    costUsd: doc.costUsd ?? null,
    published: (doc as { published?: Run["published"] }).published ?? [],
    funnel: (doc as { funnel?: Run["funnel"] }).funnel ?? null,
    createdAt: (doc as { createdAt?: Date }).createdAt?.toISOString() ?? "",
    updatedAt: (doc as { updatedAt?: Date }).updatedAt?.toISOString() ?? "",
  };
}
