import crypto from "node:crypto";
import type { Brand, MetricItem } from "@pipeline/shared";
import type { MetricsProvider, MetricsSummary } from "./types.js";
import type { Logger } from "../logger.js";

/**
 * Google Search Console provider. Real SEO/blog performance: top queries,
 * clicks, impressions, CTR, position. Lean into queries that convert clicks;
 * "refresh" high-impression / low-CTR queries (the opportunity gaps).
 *
 * Auth: a Google service account (GSC_CLIENT_EMAIL + GSC_PRIVATE_KEY) granted
 * read access to the property. brand.siteUrl is the GSC property
 * (e.g. "https://example.com/" or "sc-domain:example.com").
 *
 * Untestable without creds here; fails gracefully (returns null) on any error.
 */

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

async function getAccessToken(): Promise<string> {
  const email = process.env.GSC_CLIENT_EMAIL as string;
  const key = (process.env.GSC_PRIVATE_KEY as string).replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);

  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: email,
      scope: "https://www.googleapis.com/auth/webmasters.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claim}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(key);
  const jwt = `${unsigned}.${b64url(signature)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`GSC token ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export const gscProvider: MetricsProvider = {
  name: "gsc",
  isConfigured: (brand: Brand) =>
    Boolean(process.env.GSC_CLIENT_EMAIL && process.env.GSC_PRIVATE_KEY && brand.siteUrl),

  async fetch(brand: Brand, sinceDays: number, log: Logger): Promise<MetricsSummary | null> {
    try {
      const token = await getAccessToken();
      const end = new Date();
      const start = new Date(Date.now() - sinceDays * 86_400_000);
      const site = encodeURIComponent(brand.siteUrl as string);

      const res = await fetch(
        `https://searchconsole.googleapis.com/webmasters/v3/sites/${site}/searchAnalytics/query`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({
            startDate: ymd(start),
            endDate: ymd(end),
            dimensions: ["query"],
            rowLimit: 25,
          }),
        },
      );
      if (!res.ok) throw new Error(`GSC query ${res.status}: ${(await res.text()).slice(0, 200)}`);

      const data = (await res.json()) as {
        rows?: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>;
      };
      const rows = data.rows ?? [];
      if (!rows.length) return null;

      const topQueries: MetricItem[] = rows.map((r) => ({
        term: r.keys[0] ?? "",
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
      }));

      // Lean into queries already winning clicks.
      const doubleDown = [...topQueries]
        .filter((q) => (q.clicks ?? 0) > 0)
        .sort((a, b) => (b.clicks ?? 0) - (a.clicks ?? 0))
        .slice(0, 8)
        .map((q) => q.term);

      // Opportunity gaps: high impressions but low CTR → refresh/optimize.
      const refresh = [...topQueries]
        .filter((q) => (q.impressions ?? 0) >= 50 && (q.ctr ?? 1) < 0.02)
        .slice(0, 6)
        .map((q) => q.term);

      const notes =
        `GSC last ${sinceDays}d: ${rows.length} queries. ` +
        (doubleDown.length ? `Winning: ${doubleDown.slice(0, 5).join(", ")}. ` : "") +
        (refresh.length ? `Low-CTR opportunities: ${refresh.join(", ")}.` : "");

      log.info({ queries: rows.length }, "gsc metrics");
      return { source: "gsc", topQueries, doubleDown, refresh, notes };
    } catch (err) {
      log.warn({ err: String(err) }, "gsc metrics unavailable; skipping");
      return null;
    }
  },
};
