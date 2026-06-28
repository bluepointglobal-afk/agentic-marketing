// Thin client for the cockpit. Replaces the in-browser simulation in
// BrandPipeline.jsx with real calls to the run-service API.

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "";

// Canonical stage order — must match STAGES in BrandPipeline.jsx and STAGE_IDS
// in @pipeline/shared. Used to align the server's stages[] to the rail.
const STAGE_ORDER = ["measure", "seo", "brief", "create", "gate", "publish"];

async function req(path, options) {
  const res = await fetch(BASE + path, {
    headers: { "content-type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json()).error || "";
    } catch {
      /* ignore */
    }
    throw new Error(`${res.status} ${detail}`.trim());
  }
  return res.status === 204 ? null : res.json();
}

/* ── brands ── */
export const apiListBrands = () => req("/api/brands");
export const apiGetBrand = (id) => req(`/api/brands/${id}`);
export const apiCreateBrand = (brand) =>
  req("/api/brands", { method: "POST", body: JSON.stringify(brand) });
export const apiUpdateBrand = (id, patch) =>
  req(`/api/brands/${id}`, { method: "PUT", body: JSON.stringify(patch) });

/* ── runs ── */
export const apiStartRun = (brandId) =>
  req("/api/runs", { method: "POST", body: JSON.stringify({ brandId }) });
export const apiGetRun = (runId) => req(`/api/runs/${runId}`);
export const apiApprove = (runId) =>
  req(`/api/runs/${runId}/approve`, { method: "POST" });
export const apiReject = (runId) =>
  req(`/api/runs/${runId}/reject`, { method: "POST" });

/**
 * Map a server Run document to the cockpit's in-memory run shape:
 * { stageStatus[], current, draft, awaiting, done, outcome }.
 */
export function mapRun(sr) {
  const stageStatus = STAGE_ORDER.map((id) => {
    const found = (sr.stages || []).find((x) => x.id === id);
    return found ? found.status : "queued";
  });
  const done = ["published", "rejected", "errored"].includes(sr.status);
  const awaiting = sr.status === "awaiting_approval";
  const current = stageStatus.findIndex((st) => st === "running");
  const outcome =
    sr.status === "published" ? "published" : done ? "rejected" : null;
  return { stageStatus, current, draft: sr.draft || null, awaiting, done, outcome };
}
