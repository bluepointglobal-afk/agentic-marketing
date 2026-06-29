import type { Brand, Draft, BrandKpis } from "@pipeline/shared";
import { BrandModel } from "@pipeline/shared/models";
import { config } from "../config.js";
import type { Logger } from "../logger.js";
import { gatherKpis } from "../metrics/index.js";
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
  kpis: BrandKpis;
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
 * Gather performance KPIs from every configured metrics provider (internal run
 * history always; GSC when creds + siteUrl are set), persist the snapshot on the
 * brand, and hand the insights to seo/brief. This is the feedback half of the
 * closed loop: each cycle leans into what performed and refreshes what didn't.
 */
export async function runMeasure(
  brand: Brand,
  log: Logger,
): Promise<StageOutput<MeasureData>> {
  if (isStub()) await delay(700);

  const kpis = await gatherKpis(brand, log);
  // Persist the snapshot so the cockpit can show it and the next run can read it.
  await BrandModel.updateOne({ _id: brand.id }, { $set: { kpis } });
  log.info(
    { sources: kpis.sources, doubleDown: kpis.doubleDown.length, refresh: kpis.refresh.length },
    "measure: KPIs gathered",
  );

  return {
    data: {
      note: kpis.summary,
      metrics: { channels: brand.channels, seedKeywords: brand.keywords },
      kpis,
    },
    costUsd: 0,
  };
}

/** Format prior-performance KPIs as guidance injected into seo/brief prompts. */
function kpiGuidance(ctx: PipelineContext): string {
  const k = ctx.measure?.kpis;
  if (!k) return "";
  const parts: string[] = [];
  if (k.doubleDown.length) parts.push(`Lean into (these performed): ${k.doubleDown.join(", ")}.`);
  if (k.refresh.length) parts.push(`Refresh / don't repeat: ${k.refresh.join(", ")}.`);
  if (k.topQueries.length) {
    const top = k.topQueries.slice(0, 8).map((q) => q.term).filter(Boolean).join(", ");
    if (top) parts.push(`Top measured queries: ${top}.`);
  }
  if (k.summary) parts.push(k.summary);
  return parts.length ? `\nPrior performance (close the loop):\n${parts.join("\n")}\n` : "";
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
    kpiGuidance(ctx) +
    "\nFind the search intent, the single winning angle, and 5–8 target keywords. " +
    "Prioritise the keywords that performed; refresh rather than repeat what didn't.";

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
    `SEO findings: ${JSON.stringify(ctx.seo ?? {})}\n` +
    kpiGuidance(ctx) +
    "\nSynthesize a content brief the writer can execute without guessing. " +
    "Reflect the prior-performance guidance in the angle and must-hit points.";

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
    const palette = brand.assets?.palette?.length
      ? ` Brand colours: ${brand.assets.palette.join(", ")}.`
      : "";
    const imagePrompt =
      `Brand creative for "${data.title}". ${brand.positioning}. ` +
      `Audience: ${brand.audience}. Style: on-brand, clean.${palette}`;
    const img = await generateImage(brand, imagePrompt, log);
    imageUrl = img.url;

    // Composite the brand logo onto the creative when both are available.
    if (img.buffer && brand.assets?.logoUrl) {
      const { compositeLogo } = await import("./compositing.js");
      const final = await compositeLogo(
        img.buffer,
        brand.assets.logoUrl,
        brand.assets.logoPosition ?? "bottom-right",
        log,
      );
      imageUrl = `data:image/png;base64,${final.toString("base64")}`;
    }
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
