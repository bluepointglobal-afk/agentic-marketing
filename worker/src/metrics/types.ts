import type { Brand, MetricItem } from "@pipeline/shared";
import type { Logger } from "../logger.js";

/**
 * Pluggable performance-metrics providers. The measure stage runs every
 * configured provider, merges their output, and feeds it back into the
 * pipeline — this is what closes the loop.
 */

export interface MetricsSummary {
  /** Provider name (e.g. "internal-history", "gsc", "blotato"). */
  source: string;
  /** Top measured queries/terms, best-first. */
  topQueries: MetricItem[];
  /** Keywords/topics that performed → lean into these. */
  doubleDown: string[];
  /** Topics that underperformed or were over-used → refresh these. */
  refresh: string[];
  /** Short agent-readable insight from this source. */
  notes: string;
  /** Aggregate social engagement (Blotato). Merged into BrandKpis.engagement. */
  engagement?: {
    posts: number;
    impressions: number;
    likes: number;
    linkClicks: number;
    topHooks: { hook: string; conversion: number }[];
  };
}

export interface MetricsProvider {
  name: string;
  /** Whether this provider has what it needs (creds, site, etc.). */
  isConfigured(brand: Brand): boolean;
  /** Fetch a summary for the brand over the last `sinceDays`. null = no data. */
  fetch(brand: Brand, sinceDays: number, log: Logger): Promise<MetricsSummary | null>;
}
