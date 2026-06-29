import { RunModel } from "@pipeline/shared/models";
import type { MetricsProvider, MetricsSummary } from "./types.js";

/**
 * Always-available provider that derives a performance signal from our own run
 * history: which keywords have successfully shipped (passed the gate + were
 * published) vs. which titles were used recently (avoid repeating). This closes
 * the loop with zero external setup; GSC/Blotato add real engagement on top.
 */
export const internalHistoryProvider: MetricsProvider = {
  name: "internal-history",
  isConfigured: () => true,

  async fetch(brand, _sinceDays, log): Promise<MetricsSummary | null> {
    const runs = await RunModel.find({ brandId: brand.id })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();
    if (!runs.length) return null;

    const published = runs.filter((r) => r.status === "published");
    const rejected = runs.filter(
      (r) => r.status === "rejected" || r.outcome === "rejected",
    );

    // Keywords from drafts that actually shipped → lean into these.
    const shippedKw = new Map<string, number>();
    const recentTitles: string[] = [];
    for (const r of runs) {
      const draft = r.draft as { title?: string; keywords?: string[] } | null;
      if (draft?.title) recentTitles.push(draft.title);
    }
    for (const r of published) {
      const draft = r.draft as { keywords?: string[] } | null;
      (draft?.keywords ?? []).forEach((k) => shippedKw.set(k, (shippedKw.get(k) ?? 0) + 1));
    }

    const doubleDown = [...shippedKw.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([k]) => k);
    const refresh = recentTitles.slice(0, 6);

    const notes =
      `From ${runs.length} prior runs: ${published.length} published, ${rejected.length} rejected. ` +
      (doubleDown.length ? `Keywords that shipped: ${doubleDown.join(", ")}. ` : "") +
      (refresh.length ? "Avoid repeating the most recent titles." : "");

    log.info({ published: published.length, rejected: rejected.length }, "internal-history metrics");
    return { source: "internal-history", topQueries: [], doubleDown, refresh, notes };
  },
};
