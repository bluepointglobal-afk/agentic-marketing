import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Options } from "@anthropic-ai/claude-agent-sdk";
import { buildAgents } from "./agents.js";
import { kimiVariantServer, KIMI_VARIANT_TOOL } from "../mcp/openrouter.js";
import type { Logger } from "../logger.js";

/**
 * Run one pipeline stage as a delegated Agent SDK query.
 *
 * Each stage is its own query() call that delegates to a single named subagent
 * via the Agent tool, then returns strict JSON. Running stages independently
 * (rather than one long free-running orchestration) gives us per-stage cost,
 * per-stage persistence, a clean pause at the gate, and idempotent resume.
 */

const ORCHESTRATOR_SYSTEM =
  "You orchestrate a brand content pipeline. For each task you are given, " +
  "delegate the work to the specified subagent using the Agent tool, then " +
  "return that subagent's result. Always end your turn by emitting a single " +
  "JSON object and nothing else — no prose, no markdown fences.";

export interface StageRunResult<T> {
  data: T;
  costUsd: number;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  // Strip ```json fences if present.
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  try {
    return JSON.parse(unfenced);
  } catch {
    // Fall back to the first balanced {...} block.
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(unfenced.slice(start, end + 1));
    }
    throw new Error("agent did not return parseable JSON");
  }
}

export async function runAgentStage<T>(params: {
  agentName: string;
  instruction: string;
  schemaHint: string;
  log: Logger;
}): Promise<StageRunResult<T>> {
  const { agentName, instruction, schemaHint, log } = params;

  const prompt =
    `${instruction}\n\n` +
    `Delegate this to the \`${agentName}\` subagent via the Agent tool. ` +
    `When it returns, reply with ONLY a single JSON object of the form ` +
    `${schemaHint}.`;

  const options: Options = {
    agents: buildAgents(),
    // Agent (subagent delegation) + the subagents' own tools must be allowed
    // so nothing pauses for a permission prompt in this headless worker.
    allowedTools: ["Agent", "WebSearch", "WebFetch", KIMI_VARIANT_TOOL],
    mcpServers: { openrouter: kimiVariantServer },
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    // SDK isolation: do not read ~/.claude or project settings.
    settingSources: [],
    systemPrompt: ORCHESTRATOR_SYSTEM,
    model: "sonnet",
    maxTurns: 24,
    stderr: (d) => log.debug({ stderr: d.slice(0, 500) }, "sdk stderr"),
  };

  let costUsd = 0;
  let finalText = "";

  for await (const message of query({ prompt, options })) {
    if (message.type === "result") {
      costUsd = message.total_cost_usd ?? 0;
      if (message.subtype === "success") {
        finalText = message.result;
      } else {
        throw new Error(`agent run failed: ${message.subtype}`);
      }
    }
  }

  log.info({ agentName, costUsd }, "agent stage complete");
  const data = extractJson(finalText) as T;
  return { data, costUsd };
}
