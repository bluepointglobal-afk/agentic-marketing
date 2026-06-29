import type { Brand, Draft } from "@pipeline/shared";
import { isStorageConfigured, putObject, makeKey } from "@pipeline/shared/storage";
import { config } from "../config.js";
import type { Logger } from "../logger.js";
import { runAgentStage } from "./sdk.js";
import { BRAND_WRITER, brandVoiceBlock } from "./agents.js";
import { generateImage } from "./image.js";
import type { PipelineContext, CreateData, StageOutput } from "./stages.js";

/**
 * CREATE stage — the omnichannel generator (Wave 3).
 *
 * One agent pass produces a single unified bundle locked to the brand voice:
 *   • the social post (title/meta/body/keywords)
 *   • landingVariations (a conversion landing page layout)
 *   • emailSequence (a 3-part nurture sequence)
 * all anchored to the doubleDown keywords surfaced by the MEASURE stage.
 *
 * Then it generates the creative, composites the brand logo, and uploads to
 * object storage (Wave 1) — storing the absolute URL on the draft.
 */

const isStub = (): boolean => config.pipelineDriver === "stub";
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Exact shape requested from the agent (the unified omnichannel payload). */
const BUNDLE_SCHEMA =
  '{"title": string, "meta": string, "body": string, "keywords": string[], ' +
  '"landingVariations": {"headline": string, "subheadline": string, ' +
  '"heroCta": string, "features": [{"title": string, "body": string}], ' +
  '"seoTitle": string, "seoDescription": string, "optimizedKeywords": string[]}, ' +
  '"emailSequence": {"email1": {"subject": string, "body": string}, ' +
  '"email2": {"subject": string, "body": string}, ' +
  '"email3": {"subject": string, "body": string}}}';

export async function runCreate(
  brand: Brand,
  ctx: PipelineContext,
  log: Logger,
): Promise<StageOutput<CreateData>> {
  const doubleDown = ctx.measure?.kpis?.doubleDown ?? [];

  if (isStub()) {
    await delay(950);
    const seed = brand.keywords[0] ?? "your topic";
    const optimizedKeywords = doubleDown.length
      ? doubleDown.slice(0, 6)
      : ctx.brief?.targetKeywords ?? brand.keywords.slice(0, 5);
    const draft: Omit<Draft, "score"> = {
      title: ctx.brief?.title ?? `How to approach ${seed}`,
      meta: `A practical, in-voice guide for ${brand.audience.toLowerCase()}.`,
      body:
        "Opening that lands the angle (stub driver — set PIPELINE_DRIVER=agent " +
        "for the real omnichannel bundle).",
      keywords: ctx.brief?.targetKeywords ?? brand.keywords.slice(0, 3),
      landingVariations: {
        headline: ctx.brief?.title ?? `How to approach ${seed}`,
        subheadline: `A clear next step for ${brand.audience}.`,
        heroCta: "Get started",
        features: [
          { title: "Why it matters", body: "Stub feature copy." },
          { title: "How it works", body: "Stub feature copy." },
          { title: "What you get", body: "Stub feature copy." },
        ],
        seoTitle: ctx.brief?.title ?? `How to approach ${seed}`,
        seoDescription: `A practical, in-voice guide for ${brand.audience.toLowerCase()}.`,
        optimizedKeywords,
      },
      emailSequence: {
        email1: { subject: `Welcome — ${seed}`, body: "Email 1 (stub): hook + value." },
        email2: { subject: "One more thing", body: "Email 2 (stub): proof + next step." },
        email3: { subject: "Last call", body: "Email 3 (stub): clear CTA." },
      },
    };
    return { data: { draft, imageUrl: null }, costUsd: 0 };
  }

  const anchor = doubleDown.length
    ? `\nAnchor ALL copy (social, landing, emails) around these proven high-performing keywords: ${doubleDown.join(", ")}.\n`
    : "";

  const instruction =
    `${brandVoiceBlock(brand)}\n\n` +
    `Brief: ${JSON.stringify(ctx.brief ?? {})}\n` +
    `SEO findings: ${JSON.stringify(ctx.seo ?? {})}\n` +
    anchor +
    "\nProduce ONE unified omnichannel content bundle, locked to the brand voice:\n" +
    "1. Social post — title, meta (<=160 chars), body (markdown), keywords.\n" +
    "2. landingVariations — a conversion landing page layout for this audience.\n" +
    "3. emailSequence — a 3-part onboarding/nurture sequence (email1, email2, email3).\n" +
    "Keep one clear next step throughout. No hype, no overpromising.";

  const { data, costUsd } = await runAgentStage<Omit<Draft, "score">>({
    agentName: BRAND_WRITER,
    instruction,
    schemaHint: BUNDLE_SCHEMA,
    log,
  });

  // Creative → logo composite → object-storage URL (unchanged from Wave 1).
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

    let finalBuffer = img.buffer;
    if (finalBuffer && brand.assets?.logoUrl) {
      const { compositeLogo } = await import("./compositing.js");
      finalBuffer = await compositeLogo(
        finalBuffer,
        brand.assets.logoUrl,
        brand.assets.logoPosition ?? "bottom-right",
        log,
      );
    }
    if (finalBuffer) {
      imageUrl = isStorageConfigured()
        ? await putObject(makeKey("generated", "image/png"), finalBuffer, "image/png")
        : `data:image/png;base64,${finalBuffer.toString("base64")}`;
    }
  } catch (err) {
    log.error({ err }, "image generation failed; continuing without image");
  }

  return { data: { draft: data, imageUrl }, costUsd };
}
