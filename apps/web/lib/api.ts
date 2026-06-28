import { connectMongo } from "@pipeline/shared/db";

/**
 * Ensure the Mongoose connection is open before a route handler touches the DB.
 * Cached inside connectMongo, so this is cheap to call per request.
 */
export async function ensureDb(): Promise<void> {
  await connectMongo(process.env.MONGODB_URI);
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function badRequest(message: string): Response {
  return json({ error: message }, 400);
}

export function notFound(message = "Not found"): Response {
  return json({ error: message }, 404);
}

export function serverError(message = "Internal error"): Response {
  return json({ error: message }, 500);
}
