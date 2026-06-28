import type { Brand, Draft, ChannelId } from "@pipeline/shared";
import type { Logger } from "../logger.js";

/**
 * Publish an approved draft to brand.publishTarget:
 *  - "draft"   → store only, push nowhere                    [WIRED]
 *  - "blotato" → social scheduler via the Blotato API        [WIRED]
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

/* ───────────────────────── Blotato ───────────────────────── */

const BLOTATO_BASE = "https://backend.blotato.com";

/** Our channels → Blotato platform names. blog/email aren't Blotato platforms. */
const BLOTATO_PLATFORM: Partial<Record<ChannelId, string>> = {
  instagram: "instagram",
  x: "twitter",
  tiktok: "tiktok",
};

/** Env var holding the connected Blotato account id, per platform. */
const ACCOUNT_ENV: Record<string, string> = {
  instagram: "BLOTATO_INSTAGRAM_ACCOUNT_ID",
  twitter: "BLOTATO_TWITTER_ACCOUNT_ID",
  tiktok: "BLOTATO_TIKTOK_ACCOUNT_ID",
};

function blotatoHeaders(apiKey: string): Record<string, string> {
  return { "blotato-api-key": apiKey, "content-type": "application/json" };
}

/** Build a social caption from the draft (title + meta + a few hashtags). */
function buildCaption(draft: Draft): string {
  const tags = draft.keywords
    .slice(0, 5)
    .map((k) => "#" + k.replace(/[^a-zA-Z0-9]+/g, ""))
    .filter((t) => t.length > 1)
    .join(" ");
  return `${draft.title}\n\n${draft.meta}${tags ? `\n\n${tags}` : ""}`;
}

/** Per-platform target object. TikTok needs the full required field set. */
function buildTarget(platform: string): Record<string, unknown> {
  if (platform === "tiktok") {
    return {
      targetType: "tiktok",
      // SELF_ONLY keeps test posts private to the account owner. Override with
      // BLOTATO_TIKTOK_PRIVACY=PUBLIC_TO_EVERYONE when you're ready to go live.
      privacyLevel: process.env.BLOTATO_TIKTOK_PRIVACY ?? "SELF_ONLY",
      disabledComments: false,
      disabledDuet: false,
      disabledStitch: false,
      isBrandedContent: false,
      isYourBrand: false,
      isAiGenerated: true, // honest AI disclosure for TikTok
    };
  }
  return { targetType: platform };
}

/** Re-host an image (data URL or public URL) on Blotato; returns hosted URL. */
async function uploadMedia(
  imageUrl: string | null,
  apiKey: string,
  log: Logger,
): Promise<string | null> {
  if (!imageUrl) return null;
  try {
    const res = await fetch(`${BLOTATO_BASE}/v2/media`, {
      method: "POST",
      headers: blotatoHeaders(apiKey),
      body: JSON.stringify({ url: imageUrl }),
    });
    if (!res.ok) {
      log.error({ status: res.status, body: (await res.text()).slice(0, 200) }, "blotato media upload failed");
      return null;
    }
    const data = (await res.json()) as { url?: string };
    return data.url ?? null;
  } catch (err) {
    log.error({ err }, "blotato media upload threw");
    return null;
  }
}

async function publishToBlotato(
  brand: Brand,
  draft: Draft,
  imageUrl: string | null,
  log: Logger,
): Promise<PublishResult> {
  const apiKey = process.env.BLOTATO_API_KEY;
  if (!apiKey) throw new Error("BLOTATO_API_KEY not set");

  const hosted = await uploadMedia(imageUrl, apiKey, log);
  const mediaUrls = hosted ? [hosted] : [];
  const text = buildCaption(draft);

  // Unique Blotato platforms from the brand's channels.
  const platforms = [
    ...new Set(
      brand.channels
        .map((c) => BLOTATO_PLATFORM[c])
        .filter((p): p is string => Boolean(p)),
    ),
  ];

  if (platforms.length === 0) {
    throw new Error(
      "Blotato: none of the brand's channels map to a Blotato platform (need instagram, x, or tiktok)",
    );
  }

  const posted: string[] = [];
  const skipped: string[] = [];

  for (const platform of platforms) {
    // Per-brand account id wins; env var is a fallback for single-account setups.
    const accountId =
      brand.blotatoAccounts?.[platform] ?? process.env[ACCOUNT_ENV[platform] ?? ""];
    if (!accountId) {
      log.warn({ platform, env: ACCOUNT_ENV[platform] }, "no Blotato account id; skipping platform");
      skipped.push(platform);
      continue;
    }
    // TikTok is media-only — skip if we have no image to post.
    if (platform === "tiktok" && mediaUrls.length === 0) {
      log.warn("tiktok requires media but none available (set OPENAI_API_KEY for images); skipping");
      skipped.push("tiktok");
      continue;
    }

    const body = {
      post: {
        accountId,
        content: { text, mediaUrls, platform },
        target: buildTarget(platform),
      },
    };

    const res = await fetch(`${BLOTATO_BASE}/v2/posts`, {
      method: "POST",
      headers: blotatoHeaders(apiKey),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = (await res.text()).slice(0, 400);
      throw new Error(`Blotato ${platform} post failed (${res.status}): ${errText}`);
    }
    log.info({ platform, accountId }, "posted to Blotato");
    posted.push(platform);
  }

  if (posted.length === 0) {
    throw new Error(
      `Blotato: nothing posted (skipped: ${skipped.join(", ") || "none"}). ` +
        "Check account-id env vars and that an image was generated for TikTok.",
    );
  }

  return { target: `Blotato (${posted.join(", ")})` };
}

/* ───────────────────────── Generic CMS ───────────────────────── */

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
