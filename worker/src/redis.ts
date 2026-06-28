import IORedis from "ioredis";
import { config } from "./config.js";

/**
 * Shared ioredis connection for BullMQ. BullMQ requires
 * `maxRetriesPerRequest: null` on the connection it owns.
 */
export function createRedisConnection(): IORedis {
  return new IORedis(config.redisUrl, {
    maxRetriesPerRequest: null,
  });
}
