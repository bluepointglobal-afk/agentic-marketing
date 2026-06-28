import type { Brand, Draft } from "@pipeline/shared";
import { config } from "../config.js";
import type { Logger } from "../logger.js";
import { runAgentStage } from "./sdk.js";
import {
  SEO_RESEARCHER,
  BRIEF_WRITER,
  BRAND_WRITER,
  BRAND_QA,
  brandVoiceBlock,
} from "./agents.js";
import { generateImage } from "./image.js";

/* ───────────────────────── stage output types ───────────────────────── */

export interface MeasureData {
  note: string;
  metrics: Record<string, unknown>;
}
export interface SeoData {
  intent: string;
  angle: string;
  keywords: string[];
}
export interface BriefData {
  title: string;
  angle: string;
  outline: string[];
  targetKeywords: string[];
  notes: string;
}
export interface CreateData {
  draft: Omit<Draft, "score">;
  imageUrl: string | null;
}
export interface GateData {
  score: number;
  reasons: string;
}

export interface PipelineContext {
  measure?: MeasureData;
  seo?: SeoData;
  brief?: BriefData;
  create?: CreateData;
}

export interface StageOutput<T> {
  data: T;
  costUsd: number;
}

const isStub = (): boolean => config.pipelineDriver === "stub";

/** Timed no-op used by the stub driver so the cockpit rail animates for real. */
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/* ───────────────────────── measure ───────────────────────── */
/**
 * No agent: real GSC/GA4/social metrics integration is pending. For now this
 * emits a placeholder metrics object that downstream stages can reference.
 * (Swap point: pull GSC + GA4 + social numbers here.)
 */
export async function runMeasure(
  brand: Brand,
  log: Logger,
): Promise<StageOutput<MeasureData>> {
  await delay(isStub() ? 700 : 0);
  log.info("measure: metrics integration pending (placeholder)");
  return {
    data: {
      note: "Metrics integration pending (GSC/GA4/social).",
      metrics: { channels: brand.channels, seedKeywords: brand.keywords },
    },
    costUsd: 0,
  };
}

/* ───────────────────────── seo ───────────────────────── */
export async function runSeo(
  brand: Brand,
  ctx: PipelineContext,
  log: Logger,
): Promise<StageOutput<SeoData>> {
  if (isStub()) {
    await delay(900);
    const seed = brand.keywords[0] ?? "your topic";
    return {
      data: {
        intent: `Informational — parents searching "${seed}".`,
        angle: `A practical, in-voice guide to ${seed}.`,
        keywords: brand.keywords.length
          ? brand.keywords.slice(0, 6)
          : [seed, `${seed} guide`, `${seed} tips`],
      },
      costUsd: 0,
    };
  }

  const instruction =
    `${brandVoiceBlock(brand)}\n\n` +
    `Seed topics/keywords: ${brand.keywords.join(", ") || "(none provided)"}\n` +
    `Metrics context: ${JSON.stringify(ctx.measure?.metrics ?? {})}\n\n` +
    "Find the search intent, the single winning angle, and 5–8 target keywords.";

  return runAgentStage<SeoData>({
    agentName: SEO_RESEARCHER,
    instruction,
    schemaHint: '{"intent": string, "angle": string, "keywords": string[]}',
    log,
  });
}

/* ───────────────────────── brief ───────────────────────── */
export async function runBrief(
  brand: Brand,
  ctx: PipelineContext,
  log: Logger,
): Promise<StageOutput<BriefData>> {
  if (isStub()) {
    await delay(900);
    const seed = brand.keywords[0] ?? "your topic";
    return {
      data: {
        title: `How to approach ${seed}`,
        angle: ctx.seo?.angle ?? `A practical guide to ${seed}.`,
        outline: ["Hook", "What to do", "Why it works", "Close"],
        targetKeywords: ctx.seo?.keywords ?? brand.keywords.slice(0, 3),
        notes: "Keep it warm, concrete, and short. No hype.",
      },
      costUsd: 0,
    };
  }

  const instruction =
    `${brandVoiceBlock(brand)}\n\n` +
    `Metrics: ${JSON.stringify(ctx.measure?.metrics ?? {})}\n` +
    `SEO findings: ${JSON.stringify(ctx.seo ?? {})}\n\n` +
    "Synthesize a content brief the writer can execute without guessing.";

  return runAgentStage<BriefData>({
    agentName: BRIEF_WRITER,
    instruction,
    schemaHint:
      '{"title": string, "angle": string, "outline": string[], "targetKeywords": string[], "notes": string}',
    log,
  });
}

/* ───────────────────────── create ───────────────────────── */
export async function runCreate(
  brand: Brand,
  ctx: PipelineContext,
  log: Logger,
): Promise<StageOutput<CreateData>> {
  if (isStub()) {
    await delay(950);
    const seed = brand.keywords[0] ?? "your topic";
    const draft: Omit<Draft, "score"> = {
      title: ctx.brief?.title ?? `How to approach ${seed}`,
      meta: `A practical, in-voice guide for ${brand.audience.toLowerCase()}.`,
      body:
        `Opening that lands the angle, written in ${brand.name}'s voice — ` +
        "warm, specific, and shaped around the search intent the SEO stage " +
        "surfaced. (Stub driver output; set PIPELINE_DRIVER=agent for the real writer.)",
      keywords: ctx.brief?.targetKeywords ?? brand.keywords.slice(0, 3),
    };
    return { data: { draft, imageUrl: null }, costUsd: 0 };
  }

  const instruction =
    `${brandVoiceBlock(brand)}\n\n` +
    `Brief: ${JSON.stringify(ctx.brief ?? {})}\n\n` +
    "Write the hero draft from this brief, locked to the brand voice.";

  const { data, costUsd } = await runAgentStage<Omit<Draft, "score">>({
    agentName: BRAND_WRITER,
    instruction,
    schemaHint:
      '{"title": string, "meta": string, "body": string, "keywords": string[]}',
    log,
  });

  // Generate the creative for the post (provider per brand.imageModel).
  let imageUrl: string | null = null;
  try {
    const imagePrompt =
      `Brand creative for "${data.title}". ${brand.positioning}. ` +
      `Audience: ${brand.audience}. Style: on-brand, clean.`;
    const img = await generateImage(brand, imagePrompt, log);
    imageUrl = img.url;
  } catch (err) {
    // Image failure must not fail the whole run.
    log.error({ err }, "image generation failed; continuing without image");
  }

  return { data: { draft: data, imageUrl }, costUsd };
}

/* ───────────────────────── gate (brand-qa) ───────────────────────── */
export async function runGate(
  brand: Brand,
  draft: Omit<Draft, "score">,
  log: Logger,
): Promise<StageOutput<GateData>> {
  if (isStub()) {
    await delay(800);
    // Stub passes the gate so the approval flow is exercised end-to-end.
    return {
      data: { score: Math.max(brand.gateThreshold, 88), reasons: "Stub score." },
      costUsd: 0,
    };
  }

  const instruction =
    `${brandVoiceBlock(brand)}\n\n` +
    `Draft to score:\nTitle: ${draft.title}\nMeta: ${draft.meta}\n\n${draft.body}\n\n` +
    `Score 0–100 for brand-voice fit. The publish gate is ${brand.gateThreshold}.`;

  return runAgentStage<GateData>({
    agentName: BRAND_QA,
    instruction,
    schemaHint: '{"score": number, "reasons": string}',
    log,
  });
}
