import type { Brand, Draft, FunnelOutput, LandingPage, FunnelEmail } from "@pipeline/shared";
import { config } from "../config.js";
import type { Logger } from "../logger.js";
import { runAgentStage } from "./sdk.js";
import { FUNNEL_ARCHITECT, brandVoiceBlock } from "./agents.js";

/**
 * Post-publish funnel: turn the published post into a landing page + nurture
 * email sequence, then push it via a pluggable connector. Generic by design —
 * "store" needs nothing, "webhook" posts to any URL (Zapier/Make/n8n), "kartra"
 * is a scaffolded connector. Extends the loop into conversion + nurture.
 */

interface FunnelGen {
  landingPage: LandingPage;
  emails: FunnelEmail[];
}

const isStub = (): boolean => config.pipelineDriver === "stub";

async function generate(
  brand: Brand,
  draft: Draft,
  log: Logger,
): Promise<{ data: FunnelGen; costUsd: number }> {
  if (isStub()) {
    return {
      data: {
        landingPage: {
          headline: draft.title,
          subhead: `A clear next step for ${brand.audience}.`,
          sections: [
            { heading: "The problem", body: "Stub landing copy — the real funnel-architect agent writes this." },
            { heading: "What you get", body: "Stub benefit copy in the brand voice." },
          ],
          cta: "Get started",
        },
        emails: [
          { subject: draft.title, body: "Email 1 (stub) — hook + value." },
          { subject: "One more thing", body: "Email 2 (stub) — proof + next step." },
          { subject: "Last call", body: "Email 3 (stub) — clear CTA." },
        ],
      },
      costUsd: 0,
    };
  }

  const instruction =
    `${brandVoiceBlock(brand)}\n\n` +
    `Published post:\nTitle: ${draft.title}\nMeta: ${draft.meta}\n\n${draft.body}\n\n` +
    "Design the landing page + nurture email sequence for this audience.";

  return runAgentStage<FunnelGen>({
    agentName: FUNNEL_ARCHITECT,
    instruction,
    schemaHint:
      '{"landingPage": {"headline": string, "subhead": string, "sections": [{"heading": string, "body": string}], "cta": string}, "emails": [{"subject": string, "body": string}]}',
    log,
  });
}

async function push(brand: Brand, gen: FunnelGen, log: Logger): Promise<string> {
  const provider = brand.funnel?.provider ?? "store";

  if (provider === "webhook") {
    const url = process.env.FUNNEL_WEBHOOK_URL;
    if (!url) {
      log.warn("FUNNEL_WEBHOOK_URL not set; storing funnel instead");
      return "stored";
    }
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brand: brand.name, ...gen }),
      });
      if (!res.ok) throw new Error(`webhook ${res.status}`);
      log.info("funnel pushed to webhook");
      return "webhook";
    } catch (err) {
      log.error({ err }, "funnel webhook failed; storing instead");
      return "stored";
    }
  }

  if (provider === "kartra") {
    return pushKartra(brand, gen, log);
  }

  // "store": nothing external — the copy is persisted on the run for review.
  return "stored";
}

/**
 * ── Kartra connector (scaffold) ──
 * Kartra's API is form-encoded and sequence-id dependent, and landing pages
 * aren't creatable via API. The realistic integration pushes the email sequence
 * to a Kartra sequence and stores the landing copy. Wire the exact sequence ids
 * for your account here; falls back to "stored" until then.
 */
async function pushKartra(_brand: Brand, _gen: FunnelGen, log: Logger): Promise<string> {
  const ok =
    process.env.KARTRA_APP_ID && process.env.KARTRA_API_KEY && process.env.KARTRA_API_PASSWORD;
  if (!ok) {
    log.warn("Kartra creds missing; storing funnel instead");
    return "stored";
  }
  log.warn("Kartra connector is a scaffold; storing funnel copy (wire sequence ids to enable)");
  return "stored";
}

export async function runFunnel(
  brand: Brand,
  draft: Draft,
  log: Logger,
): Promise<{ output: FunnelOutput; costUsd: number }> {
  const { data, costUsd } = await generate(brand, draft, log);
  const pushedTo = await push(brand, data, log);
  return {
    output: { landingPage: data.landingPage, emails: data.emails, pushedTo },
    costUsd,
  };
}
