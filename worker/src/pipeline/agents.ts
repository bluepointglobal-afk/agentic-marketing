import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { Brand } from "@pipeline/shared";

/**
 * The four pipeline subagents, passed to query() via the `agents` option.
 * Each stage delegates to exactly one of these through the Agent tool.
 *
 * Voice is injected per-run (it's brand-specific), so the static `prompt` here
 * holds the role + the strict output contract; brand voice is appended at call
 * time in stages.ts.
 */

export const SEO_RESEARCHER = "seo-researcher";
export const BRIEF_WRITER = "brief-writer";
export const BRAND_WRITER = "brand-writer";
export const BRAND_QA = "brand-qa";

export function buildAgents(): Record<string, AgentDefinition> {
  return {
    [SEO_RESEARCHER]: {
      description:
        "Finds search intent, the winning angle, and target keywords for a topic.",
      // ── SWAP POINT: first iteration uses the SDK's built-in web search.
      // Later, swap these for a DataForSEO MCP server + Google Search Console
      // MCP (add them to mcpServers and list their tool names here).
      tools: ["WebSearch", "WebFetch"],
      model: "sonnet",
      prompt:
        "You are an SEO researcher. Given a brand and seed topics, use web " +
        "search to determine the dominant search intent, the single winning " +
        "angle to take, and 5–8 high-value target keywords. Prefer keywords " +
        "with clear intent over raw volume. Be concrete and current. When done, " +
        "return ONLY a JSON object: " +
        '{"intent": string, "angle": string, "keywords": string[]}.',
    },

    [BRIEF_WRITER]: {
      description:
        "Synthesizes metrics + SEO into a content brief, enforcing brand voice.",
      // The judgment step — no web tools, pure synthesis.
      tools: [],
      model: "opus",
      prompt:
        "You are a senior content strategist. Synthesize the provided metrics " +
        "and SEO findings into a tight content brief that a writer can execute " +
        "without guessing. Enforce the brand voice throughout. Decide the " +
        "headline, the angle, the must-hit points, and the target keywords. " +
        "Return ONLY a JSON object: " +
        '{"title": string, "angle": string, "outline": string[], ' +
        '"targetKeywords": string[], "notes": string}.',
    },

    [BRAND_WRITER]: {
      description:
        "Drafts the post from the brief, locked to the brand voice. Hero draft.",
      // Hero draft on sonnet. The brand-writer MAY route bulk variants
      // (captions/meta/alt text) to Kimi via the mcp__openrouter__kimi_variant
      // tool, which is added at call time in stages.ts (the swap point).
      tools: ["mcp__openrouter__kimi_variant"],
      model: "sonnet",
      prompt:
        "You are the brand's writer. Write the hero draft from the brief, " +
        "locked to the brand voice — every sentence must sound like the brand. " +
        "You may use the kimi_variant tool for bulk lower-stakes copy (meta " +
        "description, alt text), but the body is yours. Return ONLY a JSON " +
        'object: {"title": string, "meta": string, "body": string, ' +
        '"keywords": string[]}. `meta` is a <=160 char meta description. ' +
        "`body` is the full post in markdown.",
    },

    [BRAND_QA]: {
      description:
        "Scores a draft against the brand voice, returns a 0–100 score.",
      tools: [],
      model: "opus",
      prompt:
        "You are the brand-voice gatekeeper. Score how well the draft matches " +
        "the brand's voice, dos, and nevers on a 0–100 scale. Be strict: a 100 " +
        "is flawless on-voice; deduct for any hype, jargon, off-tone phrasing, " +
        "or violated nevers. Return ONLY a JSON object: " +
        '{"score": number, "reasons": string}.',
    },
  };
}

/** Compact brand voice block injected into every stage prompt. */
export function brandVoiceBlock(brand: Brand): string {
  return [
    `Brand: ${brand.name}`,
    `Audience: ${brand.audience}`,
    `Positioning: ${brand.positioning}`,
    `Voice: ${brand.voice}`,
    `Lean into: ${brand.dos}`,
    `Never: ${brand.nevers}`,
  ].join("\n");
}
