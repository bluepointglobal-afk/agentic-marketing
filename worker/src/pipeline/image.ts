import type { Brand } from "@pipeline/shared";
import type { Logger } from "../logger.js";

/**
 * Single image entry point with a provider switch on brand.imageModel:
 *  - "gpt-image-2"  → GPT Image 2 (text-on-image / brand creatives)  [WIRED]
 *  - "nano-banana"  → Gemini image (consistent characters)           [TODO]
 *
 * Returns a reference string stored on the draft (hosted URL or data URL).
 */

export interface GeneratedImage {
  provider: Brand["imageModel"];
  /** Hosted URL or data URL. null if generation was skipped/unconfigured. */
  url: string | null;
  /** Raw PNG bytes when available (used for logo compositing). */
  buffer: Buffer | null;
}

export async function generateImage(
  brand: Brand,
  prompt: string,
  log: Logger,
): Promise<GeneratedImage> {
  switch (brand.imageModel) {
    case "gpt-image-2":
      return generateGptImage2(prompt, log);
    case "nano-banana":
      return generateNanoBanana(prompt, log);
    default:
      log.warn({ imageModel: brand.imageModel }, "unknown image model; skipping");
      return { provider: brand.imageModel, url: null, buffer: null };
  }
}

/** GPT Image 2 via the OpenAI Images API. */
async function generateGptImage2(
  prompt: string,
  log: Logger,
): Promise<GeneratedImage> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    log.warn("OPENAI_API_KEY not set; skipping image generation");
    return { provider: "gpt-image-2", url: null, buffer: null };
  }

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-2",
      prompt,
      size: "1024x1024",
      n: 1,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`gpt-image-2 ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    data?: Array<{ url?: string; b64_json?: string }>;
  };
  const item = data.data?.[0];
  if (item?.b64_json) {
    return {
      provider: "gpt-image-2",
      url: `data:image/png;base64,${item.b64_json}`,
      buffer: Buffer.from(item.b64_json, "base64"),
    };
  }
  if (item?.url) return { provider: "gpt-image-2", url: item.url, buffer: null };
  return { provider: "gpt-image-2", url: null, buffer: null };
}

/**
 * ── TODO: Nano Banana (Gemini image) ──
 * Wire the Gemini image API (gemini-2.x image / "nano banana") here for brands
 * that need consistent characters. Uses GEMINI_API_KEY. Left as a stub so the
 * provider switch is complete; gpt-image-2 is the wired provider for now.
 */
async function generateNanoBanana(
  _prompt: string,
  log: Logger,
): Promise<GeneratedImage> {
  log.warn("nano-banana provider not yet wired; skipping image generation");
  return { provider: "nano-banana", url: null, buffer: null };
}
