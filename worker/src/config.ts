/**
 * Worker configuration, read once from the environment.
 * All secrets/keys live here (server-side only) — never shipped to the client.
 */
import "./env.js"; // load repo-root .env before reading any var

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function requireKey(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export type PipelineDriver = "agent" | "stub";

export const config = {
  mongoUri: optional("MONGODB_URI", "mongodb://localhost:27017/agentic_marketing"),
  redisUrl: optional("REDIS_URL", "redis://localhost:6379"),
  queueName: optional("RUN_QUEUE_NAME", "brand-runs"),
  concurrency: Number(optional("WORKER_CONCURRENCY", "2")),
  logLevel: optional("LOG_LEVEL", "info"),

  /**
   * "agent" runs the real Claude Agent SDK pipeline (requires ANTHROPIC_API_KEY).
   * "stub" runs timed no-op stages — lets the cockpit rail animate from real
   * worker state with zero API keys (the step-3 milestone / offline demo).
   */
  pipelineDriver: (optional("PIPELINE_DRIVER", "agent") as PipelineDriver),

  /** Whether the cron scheduler is active in this worker instance. */
  schedulerEnabled: optional("SCHEDULER_ENABLED", "true") === "true",

  // ── keys, required lazily only when actually used ──
  anthropicApiKey: () => requireKey("ANTHROPIC_API_KEY"),
  openaiApiKey: () => requireKey("OPENAI_API_KEY"),
  geminiApiKey: () => requireKey("GEMINI_API_KEY"),
  openrouterApiKey: () => requireKey("OPENROUTER_API_KEY"),
  blotatoApiKey: () => requireKey("BLOTATO_API_KEY"),
  // Raw (possibly empty) accessors for optional integrations.
  raw: process.env,
};

export type Config = typeof config;
