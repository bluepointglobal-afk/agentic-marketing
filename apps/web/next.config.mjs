import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Load the single repo-root .env so the API routes share the same config as
// the worker (MONGODB_URI, REDIS_URL, etc.).
const here = dirname(fileURLToPath(import.meta.url)); // apps/web
loadEnv({ path: resolve(here, "../../.env") });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Compile the shared TS source package directly (no prebuild step).
  transpilePackages: ["@pipeline/shared"],
  // Mongoose/bullmq are server-only; keep them external to the server bundle.
  serverExternalPackages: ["mongoose", "bullmq", "ioredis"],
};

export default nextConfig;
