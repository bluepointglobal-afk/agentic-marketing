import { headers } from "next/headers";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { LandingVariations } from "@pipeline/shared";

// Render at request time so it always reflects the latest approved landing.
export const dynamic = "force-dynamic";

interface LandingResponse {
  brandId: string;
  runId: string;
  updatedAt: string;
  landing: LandingVariations;
}

/**
 * Hydrate from the cached /api/landing/:brandId endpoint. `cache()` dedupes the
 * fetch between generateMetadata and the page render in one request.
 */
const fetchLanding = cache(async (brandId: string): Promise<LandingResponse | null> => {
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.includes("localhost") ? "http" : "https");
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || (host ? `${proto}://${host}` : "");
  if (!base) return null;
  try {
    const res = await fetch(`${base}/api/landing/${brandId}`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return (await res.json()) as LandingResponse;
  } catch {
    return null;
  }
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ brandId: string }>;
}): Promise<Metadata> {
  const { brandId } = await params;
  const data = await fetchLanding(brandId);
  const l = data?.landing;
  if (!l) return { title: "Landing page" };
  return {
    title: l.seoTitle,
    description: l.seoDescription,
    keywords: l.optimizedKeywords,
    openGraph: { title: l.seoTitle, description: l.seoDescription },
  };
}

export default async function LandingPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  const data = await fetchLanding(brandId);
  if (!data?.landing) notFound();
  const l = data.landing;

  return (
    <main style={S.page}>
      <section style={S.hero}>
        <h1 style={S.headline}>{l.headline}</h1>
        <p style={S.subhead}>{l.subheadline}</p>
        <a href="#cta" style={S.cta}>
          {l.heroCta}
        </a>
      </section>

      <section style={S.features}>
        {l.features.map((f, i) => (
          <div key={i} style={S.feature}>
            <h3 style={S.featureTitle}>{f.title}</h3>
            <p style={S.featureBody}>{f.body}</p>
          </div>
        ))}
      </section>

      <section id="cta" style={S.ctaBlock}>
        <a href="#" style={S.cta}>
          {l.heroCta}
        </a>
      </section>
    </main>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: { fontFamily: "Inter, system-ui, sans-serif", color: "#1A241F", background: "#F6F3EC", minHeight: "100vh" },
  hero: { maxWidth: 820, margin: "0 auto", padding: "96px 24px 56px", textAlign: "center" },
  headline: { fontSize: 44, lineHeight: 1.1, margin: "0 0 16px", letterSpacing: "-0.02em" },
  subhead: { fontSize: 19, color: "#4A5650", margin: "0 0 28px", lineHeight: 1.5 },
  cta: {
    display: "inline-block", background: "#1D7A5E", color: "#fff", padding: "13px 26px",
    borderRadius: 10, textDecoration: "none", fontWeight: 600, fontSize: 16,
  },
  features: {
    maxWidth: 1000, margin: "0 auto", padding: "24px", display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20,
  },
  feature: { background: "#fff", border: "1px solid #E5E0D4", borderRadius: 14, padding: 22 },
  featureTitle: { fontSize: 18, margin: "0 0 8px" },
  featureBody: { fontSize: 14.5, color: "#4A5650", lineHeight: 1.6, margin: 0 },
  ctaBlock: { textAlign: "center", padding: "48px 24px 88px" },
};
