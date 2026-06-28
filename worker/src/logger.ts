import pino from "pino";
import { config } from "./config.js";

/**
 * Structured root logger. Per-run and per-stage loggers are derived via
 * `.child({ runId, brandId, stage })` so every line is queryable.
 */
export const logger = pino({
  level: config.logLevel,
  base: { service: "pipeline-worker" },
});

export type Logger = typeof logger;
