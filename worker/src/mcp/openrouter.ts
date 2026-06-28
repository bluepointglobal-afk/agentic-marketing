import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { logger } from "../logger.js";

/**
 * ── SWAP POINT: bulk variants via Kimi K2.6 on OpenRouter ──
 *
 * Wraps an OpenRouter chat completion as an in-process MCP tool. The hero draft
 * stays on the brand-writer's own model (sonnet); this routes *bulk* lower-stakes
 * copy — captions, meta descriptions, alt text, headline alternates — to the
 * cheaper Kimi model. Made available to the brand-writer agent during `create`.
 *
 * To swap models/providers later, change OPENROUTER_KIMI_MODEL or replace the
 * fetch below; the tool contract the agent sees stays identical.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const KIMI_MODEL = process.env.OPENROUTER_KIMI_MODEL ?? "moonshotai/kimi-k2-0905";

export const kimiVariantServer = createSdkMcpServer({
  name: "openrouter",
  version: "0.1.0",
  tools: [
    tool(
      "kimi_variant",
      "Generate bulk, lower-stakes brand copy (captions, meta descriptions, " +
        "alt text, headline alternates) via Kimi K2.6 on OpenRouter. Use this " +
        "for high-volume variants; keep the hero draft on your own model.",
      {
        kind: z
          .enum(["caption", "meta", "alt_text", "headline"])
          .describe("Which kind of bulk copy to produce"),
        brief: z
          .string()
          .describe("The brand voice + content context to write from"),
        count: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe("How many variants to return (default 3)"),
      },
      async (args) => {
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
          return {
            content: [
              {
                type: "text",
                text:
                  "OPENROUTER_API_KEY is not configured; bulk-variant routing " +
                  "is disabled. Write the variants yourself instead.",
              },
            ],
            isError: true,
          };
        }

        const count = args.count ?? 3;
        const sys =
          "You are a precise brand copywriter. Output only the requested " +
          "variants, one per line, no numbering or commentary.";
        const user = `Produce ${count} ${args.kind} variant(s).\n\n${args.brief}`;

        try {
          const res = await fetch(OPENROUTER_URL, {
            method: "POST",
            headers: {
              authorization: `Bearer ${apiKey}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model: KIMI_MODEL,
              messages: [
                { role: "system", content: sys },
                { role: "user", content: user },
              ],
              temperature: 0.7,
            }),
          });
          if (!res.ok) {
            const body = await res.text();
            throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 300)}`);
          }
          const data = (await res.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          const text = data.choices?.[0]?.message?.content ?? "";
          return { content: [{ type: "text", text }] };
        } catch (err) {
          logger.error({ err }, "kimi_variant failed");
          return {
            content: [
              { type: "text", text: `kimi_variant error: ${String(err)}` },
            ],
            isError: true,
          };
        }
      },
    ),
  ],
});

/** Tool name the agent must be allowed to call. */
export const KIMI_VARIANT_TOOL = "mcp__openrouter__kimi_variant";
