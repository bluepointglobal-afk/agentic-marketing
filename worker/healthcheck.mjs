// Docker HEALTHCHECK for the worker container.
//
// Two independent liveness signals — both must pass:
//   1. Redis (Upstash) is reachable  → the worker can receive/ack jobs.
//   2. The heartbeat file is fresh    → the worker event loop isn't stalled
//      mid multi-agent run (the process writes it every 15s).
//
// Exit 0 = healthy, 1 = unhealthy (Docker/Coolify restarts on repeated failures).
import IORedis from "ioredis";
import { readFileSync } from "node:fs";

const HEARTBEAT_FILE = process.env.WORKER_HEARTBEAT_FILE ?? "/tmp/worker-heartbeat";
const HEARTBEAT_MAX_AGE_MS = Number(process.env.WORKER_HEARTBEAT_MAX_AGE_MS ?? "90000");

function fail(reason) {
  console.error(`unhealthy: ${reason}`);
  process.exit(1);
}

// 1. Heartbeat freshness.
try {
  const stamp = Number(readFileSync(HEARTBEAT_FILE, "utf8").trim());
  const age = Date.now() - stamp;
  if (!Number.isFinite(stamp) || age > HEARTBEAT_MAX_AGE_MS) {
    fail(`stale heartbeat (${age}ms old)`);
  }
} catch {
  fail("no heartbeat file (worker not started?)");
}

// 2. Redis reachability.
const url = process.env.REDIS_URL ?? "redis://localhost:6379";
const redis = new IORedis(url, {
  maxRetriesPerRequest: 1,
  connectTimeout: 5000,
  lazyConnect: true,
});

try {
  await redis.connect();
  const pong = await redis.ping();
  await redis.quit();
  if (pong !== "PONG") fail(`unexpected redis reply: ${pong}`);
  process.exit(0);
} catch (err) {
  fail(`redis unreachable: ${String(err)}`);
}
