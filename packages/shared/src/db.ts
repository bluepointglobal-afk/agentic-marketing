import mongoose from "mongoose";

/**
 * Mongoose connection with a global cache.
 *
 * Both the Next.js server (which hot-reloads in dev and may run multiple
 * lambda-like invocations) and the long-lived worker call this. The cache
 * prevents opening a new pool on every call / every reload.
 */

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

const globalForMongoose = globalThis as unknown as {
  __mongooseCache?: MongooseCache;
};

const cache: MongooseCache =
  globalForMongoose.__mongooseCache ?? { conn: null, promise: null };
globalForMongoose.__mongooseCache = cache;

export async function connectMongo(uri?: string): Promise<typeof mongoose> {
  const mongoUri =
    uri ?? process.env.MONGODB_URI ?? "mongodb://localhost:27017/agentic_marketing";

  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    mongoose.set("strictQuery", true);
    cache.promise = mongoose.connect(mongoUri, {
      // Atlas-friendly pool + reliability options. The pool is shared across
      // the process (app server or worker).
      serverSelectionTimeoutMS: 10_000,
      maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE ?? "10"),
      minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE ?? "0"),
      retryWrites: true,
      appName: process.env.MONGO_APP_NAME ?? "agentic-marketing",
    });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}

export { mongoose };
