import { getLatestLanding } from "@/lib/landing";

export const runtime = "nodejs";

/**
 * GET /api/landing/:brandId — the latest approved landing payload for a brand.
 * Cached at the edge/CDN via Cache-Control so the public landing page is fast.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ brandId: string }> },
): Promise<Response> {
  try {
    const { brandId } = await params;
    const payload = await getLatestLanding(brandId);

    if (!payload) {
      return new Response(
        JSON.stringify({ error: "No published landing for this brand yet" }),
        {
          status: 404,
          headers: {
            "content-type": "application/json",
            "cache-control": "public, s-maxage=30",
          },
        },
      );
    }

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "content-type": "application/json",
        // Fast: served from CDN cache for 60s, stale-while-revalidate 5m.
        "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (err) {
    console.error("GET /api/landing/:brandId failed", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
