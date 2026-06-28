/**
 * Worker configuration, read once from the environment.
 * All secrets/keys live here (server-side only) — never shipped to the client.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const config = {
  mongoUri: optional("MONGODB_URI", "mongodb://localhost:27017/agentic_marketing"),
  redisUrl: optional("REDIS_URL", "redis://localhost:6379"),
  queueName: optional("RUN_QUEUE_NAME", "brand-runs"),
  concurrency: Number(optional("WORKER_CONCURRENCY", "2")),
  logLevel: optional("LOG_LEVEL", "info"),
  // Lazily required only when the Agent SDK actually runs (step 4+).
  anthropicApiKey: () => required("ANTHROPIC_API_KEY"),
};

export type Config = typeof config;
