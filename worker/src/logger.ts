import pino, { type Logger as PinoLogger } from "pino";
import { config } from "./config.js";

/**
 * Structured root logger. Per-run and per-stage loggers are derived via
 * `.child({ runId, brandId, stage })` so every line is queryable.
 */
export const logger = pino({
  level: config.logLevel,
  base: { service: "pipeline-worker" },
});

// Single Logger type across modules. Use pino's own alias rather than
// ReturnType<typeof logger.child> — the latter instantiates pino's generic to
// its `string` constraint and clashes with the `never` inferred at call sites.
export type Logger = PinoLogger;
