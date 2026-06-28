/**
 * Canonical domain types — derived field-for-field from BrandPipeline.jsx.
 * The cockpit is the contract: do not rename or add fields here without a
 * matching change in the front end.
 */

/** Channel ids — from CHANNELS in the cockpit. */
export type ChannelId = "blog" | "instagram" | "x" | "email";

/** Image provider — from the onboarding "Image model" segmented control. */
export type ImageModel = "gpt-image-2" | "nano-banana";

/** Run cadence — from the onboarding "Run cadence" control. */
export type Cadence = "manual" | "daily" | "weekly";

/** Publish target — from the onboarding "Publish target" control. */
export type PublishTarget = "draft" | "blotato" | "cms";

/** Terminal outcome of a run — from the cockpit outcome card / run history. */
export type RunOutcome = "published" | "rejected";

/**
 * Pipeline stages, in order. Matches STAGES in the cockpit exactly.
 * `gate` produces the draft and pauses for human approval before `publish`.
 */
export type StageId = "measure" | "seo" | "brief" | "create" | "gate" | "publish";

/**
 * Per-stage status. The cockpit renders: queued | running | done | review | rejected
 * ("idle" is a UI-only state when no run exists, never persisted).
 */
export type StageStatus = "queued" | "running" | "done" | "review" | "rejected";

/**
 * Overall run lifecycle status (server-side). The cockpit derives its view
 * from stage statuses + draft presence; these map onto that:
 *  - queued/running drive the animated rail
 *  - awaiting_approval shows the gate card (draft + score)
 *  - published/rejected/errored are terminal
 */
export type RunStatus =
  | "queued"
  | "running"
  | "awaiting_approval"
  | "published"
  | "rejected"
  | "errored";

/** Draft produced at the gate — shape matches run.draft in the cockpit. */
export interface Draft {
  title: string;
  meta: string;
  body: string;
  keywords: string[];
  score: number;
}

/** A single stage's live status within a run, for the cockpit rail. */
export interface RunStage {
  id: StageId;
  status: StageStatus;
}

/**
 * Brand — exactly the cockpit's brand fields (seedBrand / onboarding draft).
 * `id` is a slug; `runs` is a denormalized history list the dashboard reads.
 */
export interface Brand {
  id: string;
  name: string;
  audience: string;
  positioning: string;
  voice: string;
  dos: string;
  nevers: string;
  channels: ChannelId[];
  keywords: string[];
  imageModel: ImageModel;
  cadence: Cadence;
  publishTarget: PublishTarget;
  gateThreshold: number;
  /** Lightweight run summaries for the dashboard / history card. */
  runs: RunSummary[];
  createdAt?: string;
  updatedAt?: string;
}

/** Run summary as embedded in brand.runs — matches the cockpit history rows. */
export interface RunSummary {
  id: string;
  /** Epoch millis, as the cockpit uses (relTime expects ms). */
  at: number;
  outcome: RunOutcome;
  title: string;
}

/** Full run document the cockpit polls via GET /api/runs/:id. */
export interface Run {
  id: string;
  brandId: string;
  status: RunStatus;
  stages: RunStage[];
  draft: Draft | null;
  outcome: RunOutcome | null;
  costUsd: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Stage order + display metadata, mirrored from STAGES in the cockpit. */
export const STAGES: ReadonlyArray<{ id: StageId; label: string }> = [
  { id: "measure", label: "Measure" },
  { id: "seo", label: "Analyze & keywords" },
  { id: "brief", label: "Brief + brand voice" },
  { id: "create", label: "Create copy + creative" },
  { id: "gate", label: "Brand-voice gate" },
  { id: "publish", label: "Publish" },
];

/** Just the ordered ids, the worker's source of truth for progression. */
export const STAGE_IDS: StageId[] = STAGES.map((s) => s.id);
