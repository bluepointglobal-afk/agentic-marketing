import { RunModel } from "@pipeline/shared/models";
import type { Brand, MetricItem, PublishedPost } from "@pipeline/shared";
import type { MetricsProvider, MetricsSummary } from "./types.js";
import type { Logger } from "../logger.js";

/**
 * Blotato social-analytics provider. For each post this brand published in the
 * lookback window, query GET /v2/posts/{id}/analytics and aggregate real
 * engagement (impressions, likes, link clicks, hook conversion) back into the
 * KPI loop — keywords that drove engagement become "lean into", weak hooks
 * become "refresh".
 *
 * Response shapes vary by platform; field extraction is defensive.
 */

const BLOTATO_BASE = "https://backend.blotato.com";
const MAX_RUNS = 20;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

interface PostMetrics {
  impressions: number;
  likes: number;
  linkClicks: number;
}

async function fetchPostAnalytics(
  postId: string,
  apiKey: string,
  log: Logger,
): Promise<PostMetrics | null> {
  try {
    const res = await fetch(
      `${BLOTATO_BASE}/v2/posts/${encodeURIComponent(postId)}/analytics`,
      { headers: { "blotato-api-key": apiKey, "content-type": "application/json" } },
    );
    if (!res.ok) {
      log.warn({ postId, status: res.status }, "blotato analytics fetch failed");
      return null;
    }
    const raw = (await res.json()) as Record<string, unknown>;
    // Analytics may be nested under analytics/metrics/data or returned flat.
    const m = (raw.analytics ?? raw.metrics ?? raw.data ?? raw) as Record<string, unknown>;
    return {
      impressions: num(m.impressions ?? m.views ?? m.reach ?? m.plays),
      likes: num(m.likes ?? m.reactions ?? m.favorites),
      linkClicks: num(m.linkClicks ?? m.link_clicks ?? m.clicks ?? m.urlClicks),
    };
  } catch (err) {
    log.warn({ postId, err: String(err) }, "blotato analytics error");
    return null;
  }
}

export const blotatoProvider: MetricsProvider = {
  name: "blotato",
  isConfigured: () => Boolean(process.env.BLOTATO_API_KEY),

  async fetch(brand: Brand, sinceDays: number, log: Logger): Promise<MetricsSummary | null> {
    const apiKey = process.env.BLOTATO_API_KEY;
    if (!apiKey) return null;

    const since = new Date(Date.now() - sinceDays * 86_400_000);
    const runs = await RunModel.find({
      brandId: brand.id,
      "published.0": { $exists: true },
      createdAt: { $gte: since },
    })
      .sort({ createdAt: -1 })
      .limit(MAX_RUNS)
      .lean();
    if (!runs.length) return null;

    let posts = 0;
    let impressions = 0;
    let likes = 0;
    let linkClicks = 0;
    const perKeyword = new Map<string, number>(); // keyword → engagement
    const items: MetricItem[] = [];
    const hooks: { hook: string; conversion: number }[] = [];

    for (const run of runs) {
      const draft = run.draft as { title?: string; keywords?: string[] } | null;
      const published = (run.published ?? []) as PublishedPost[];
      for (const p of published) {
        if (!p.postId) continue;
        const m = await fetchPostAnalytics(p.postId, apiKey, log);
        if (!m) continue;

        posts += 1;
        impressions += m.impressions;
        likes += m.likes;
        linkClicks += m.linkClicks;
        const engagement = m.likes + m.linkClicks;
        const conversion = m.impressions > 0 ? m.linkClicks / m.impressions : 0;

        items.push({
          term: draft?.title ?? p.platform,
          impressions: m.impressions,
          likes: m.likes,
          linkClicks: m.linkClicks,
          engagement,
          hookConversion: conversion,
        });
        if (draft?.title) hooks.push({ hook: draft.title, conversion });
        for (const kw of draft?.keywords ?? []) {
          perKeyword.set(kw, (perKeyword.get(kw) ?? 0) + engagement);
        }
      }
    }

    if (posts === 0) return null;

    const doubleDown = [...perKeyword.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([k]) => k);
    const refresh = [...hooks]
      .sort((a, b) => a.conversion - b.conversion)
      .slice(0, 4)
      .map((h) => h.hook);
    const topHooks = [...hooks].sort((a, b) => b.conversion - a.conversion).slice(0, 5);

    const notes =
      `Blotato last ${sinceDays}d: ${posts} posts, ${impressions} impressions, ` +
      `${likes} likes, ${linkClicks} link clicks. ` +
      (doubleDown.length ? `Top-engaging keywords: ${doubleDown.slice(0, 5).join(", ")}.` : "");

    log.info({ posts, impressions, likes, linkClicks }, "blotato metrics");
    return {
      source: "blotato",
      topQueries: items.slice(0, 25),
      doubleDown,
      refresh,
      notes,
      engagement: { posts, impressions, likes, linkClicks, topHooks },
    };
  },
};
