import type { Brand, Draft } from "@pipeline/shared";
import type { Logger } from "../logger.js";

/**
 * Publish an approved draft to brand.publishTarget:
 *  - "draft"   → store only, push nowhere                    [WIRED]
 *  - "blotato" → social scheduler via Blotato API            [scaffolded]
 *  - "cms"     → site / headless CMS via a generic REST POST [scaffolded]
 */

export interface PublishResult {
  /** Human label of where it went (audit trail + cockpit copy). */
  target: string;
}

export async function publishContent(
  brand: Brand,
  draft: Draft,
  imageUrl: string | null,
  log: Logger,
): Promise<PublishResult> {
  switch (brand.publishTarget) {
    case "draft":
      // Nothing leaves the system; the draft is already persisted on the run.
      log.info("publish target=draft — held as draft, nothing pushed");
      return { target: "drafts" };

    case "blotato":
      return publishToBlotato(brand, draft, imageUrl, log);

    case "cms":
      return publishToCms(brand, draft, imageUrl, log);

    default:
      log.warn({ target: brand.publishTarget }, "unknown publish target; holding as draft");
      return { target: "drafts" };
  }
}

/**
 * ── Blotato (social scheduling) ──
 * Minimal POST scaffold; confirm the exact endpoint/payload against the Blotato
 * API for your account before relying on it in production.
 */
async function publishToBlotato(
  brand: Brand,
  draft: Draft,
  imageUrl: string | null,
  log: Logger,
): Promise<PublishResult> {
  const apiKey = process.env.BLOTATO_API_KEY;
  if (!apiKey) throw new Error("BLOTATO_API_KEY not set");

  const res = await fetch("https://backend.blotato.com/v2/posts", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      channels: brand.channels,
      title: draft.title,
      body: draft.body,
      media: imageUrl ? [imageUrl] : [],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`blotato ${res.status}: ${body.slice(0, 300)}`);
  }
  log.info("published to Blotato");
  return { target: "Blotato" };
}

/**
 * ── Generic CMS ──
 * POSTs the draft to CMS_API_URL with a bearer token. Adapt the payload to your
 * CMS (WordPress, Sanity, Contentful, etc.).
 */
async function publishToCms(
  _brand: Brand,
  draft: Draft,
  imageUrl: string | null,
  log: Logger,
): Promise<PublishResult> {
  const url = process.env.CMS_API_URL;
  const token = process.env.CMS_API_TOKEN;
  if (!url) throw new Error("CMS_API_URL not set");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      title: draft.title,
      meta: draft.meta,
      body: draft.body,
      keywords: draft.keywords,
      image: imageUrl,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`cms ${res.status}: ${body.slice(0, 300)}`);
  }
  log.info("published to CMS");
  return { target: "site / CMS" };
}
