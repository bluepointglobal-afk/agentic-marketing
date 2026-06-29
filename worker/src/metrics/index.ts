import type { Brand, BrandKpis, MetricItem } from "@pipeline/shared";
import type { Logger } from "../logger.js";
import type { MetricsProvider, MetricsSummary } from "./types.js";
import { internalHistoryProvider } from "./internalHistory.js";
import { gscProvider } from "./gsc.js";

/**
 * Registered metrics providers, in priority order. Add Blotato analytics / GA4
 * here later — the measure stage merges whatever is configured.
 */
const PROVIDERS: MetricsProvider[] = [internalHistoryProvider, gscProvider];

const LOOKBACK_DAYS = 28;

/** Run all configured providers and merge into a single KPI snapshot. */
export async function gatherKpis(brand: Brand, log: Logger): Promise<BrandKpis> {
  const summaries: MetricsSummary[] = [];
  for (const p of PROVIDERS) {
    if (!p.isConfigured(brand)) continue;
    try {
      const s = await p.fetch(brand, LOOKBACK_DAYS, log);
      if (s) summaries.push(s);
    } catch (err) {
      log.warn({ provider: p.name, err: String(err) }, "metrics provider failed");
    }
  }

  const sources = summaries.map((s) => s.source);
  const doubleDown = dedupe(summaries.flatMap((s) => s.doubleDown)).slice(0, 10);
  const refresh = dedupe(summaries.flatMap((s) => s.refresh)).slice(0, 10);
  const topQueries: MetricItem[] = summaries.flatMap((s) => s.topQueries).slice(0, 25);
  const summary =
    summaries.map((s) => s.notes).filter(Boolean).join(" ") ||
    "No prior performance yet — first run for this brand.";

  return {
    updatedAt: new Date().toISOString(),
    sources,
    doubleDown,
    refresh,
    topQueries,
    summary,
  };
}

function dedupe(items: string[]): string[] {
  return [...new Set(items.map((s) => s.trim()).filter(Boolean))];
}
