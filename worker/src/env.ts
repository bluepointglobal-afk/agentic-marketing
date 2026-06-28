import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Load the repo-root .env no matter where the worker is launched from
 * (worker/ cwd during `npm run -w worker`, or repo root). Imported first by
 * config.ts so every other module sees the vars. The app (Next) loads the same
 * root .env via next.config.mjs.
 */
const here = dirname(fileURLToPath(import.meta.url)); // .../worker/src
loadEnv({ path: resolve(here, "../../.env") }); // repo-root .env
loadEnv(); // also pick up a local ./.env if one exists
