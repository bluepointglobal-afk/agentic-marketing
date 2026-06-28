"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  LayoutDashboard, Plus, Sparkles, Search, PenTool, ShieldCheck, Send,
  Play, Check, X, ChevronRight, ChevronLeft, Clock, Hash, Globe, Mail,
  Instagram, Twitter, FileText, BarChart3, Image as ImageIcon, Loader2,
  CircleCheck, CircleX, Megaphone, Music2,
} from "lucide-react";
import {
  apiListBrands, apiCreateBrand, apiGetBrand, apiUpdateBrand,
  apiStartRun, apiGetRun, apiApprove, apiReject, mapRun,
} from "./api-client";

// Cockpit channel -> Blotato platform key (blog/email aren't Blotato platforms).
const BLOTATO_PLATFORM = { instagram: "instagram", x: "twitter", tiktok: "tiktok" };

/*
 * Brand pipeline cockpit — front end only.
 * Run execution is simulated in the browser so you can see the whole flow.
 * Swap the marked TODO blocks for real calls to your backend run-service
 * (POST /api/runs to enqueue, GET /api/runs/:id to poll, POST /api/runs/:id/approve).
 */

const THEME = {
  ink: "#14201C", paper: "#F6F3EC", surface: "#FFFFFF",
  accent: "#1D7A5E", accentSoft: "#E3F0EA", sand: "#C9A86A",
  text: "#1A241F", muted: "#6C766F", line: "#E5E0D4",
  amber: "#B8841F", red: "#B4453A",
};

const CHANNELS = [
  { id: "blog", label: "Blog", icon: Globe },
  { id: "instagram", label: "Instagram", icon: Instagram },
  { id: "x", label: "X", icon: Twitter },
  { id: "tiktok", label: "TikTok", icon: Music2 },
  { id: "email", label: "Email", icon: Mail },
];

const STAGES = [
  { id: "measure", label: "Measure", sub: "GSC · GA4 · social", icon: BarChart3 },
  { id: "seo", label: "Analyze & keywords", sub: "DataForSEO", icon: Search },
  { id: "brief", label: "Brief + brand voice", sub: "Claude", icon: Sparkles },
  { id: "create", label: "Create copy + creative", sub: "Kimi + image API", icon: PenTool },
  { id: "gate", label: "Brand-voice gate", sub: "blocks publish", icon: ShieldCheck },
  { id: "publish", label: "Publish", sub: "Blotato · site", icon: Send },
];

// The demo "NoorStudio" brand now lives server-side (see scripts/seed.ts);
// the cockpit loads all brands from GET /api/brands on mount.

export default function BrandPipeline() {
  const [brands, setBrands] = useState([]);
  const [view, setView] = useState("dashboard"); // dashboard | onboarding | brand
  const [selectedId, setSelectedId] = useState(null);

  // Load brands from the server on mount.
  useEffect(() => {
    apiListBrands().then(setBrands).catch(() => {});
  }, []);

  const selected = brands.find((b) => b.id === selectedId);

  const openBrand = (id) => { setSelectedId(id); setView("brand"); };
  // Persist the brand server-side, then select it. Falls back to local-only
  // if the API is unreachable so the wizard still completes.
  const addBrand = async (b) => {
    let saved = b;
    try { saved = await apiCreateBrand(b); } catch { /* offline fallback */ }
    setBrands((prev) => {
      const i = prev.findIndex((x) => x.id === saved.id);
      if (i >= 0) { const c = [...prev]; c[i] = saved; return c; }
      return [...prev, saved];
    });
    setSelectedId(saved.id);
    setView("brand");
  };
  const updateBrand = (id, patch) =>
    setBrands((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  return (
    <div className="bp">
      <Style />
      <aside className="sidebar">
        <div className="brandmark">
          <span className="mark"><Megaphone size={18} /></span>
          <div>
            <div className="mark-title">Pipeline</div>
            <div className="mark-sub">brand studio</div>
          </div>
        </div>
        <nav className="nav">
          <button className={`nav-item ${view === "dashboard" ? "active" : ""}`} onClick={() => setView("dashboard")}>
            <LayoutDashboard size={17} /> Brands
          </button>
          <button className="nav-item" onClick={() => setView("onboarding")}>
            <Plus size={17} /> New brand
          </button>
        </nav>
        <div className="side-foot">
          <div className="side-foot-line">{brands.length} brand{brands.length !== 1 ? "s" : ""}</div>
          <div className="side-foot-line muted">runs server-side</div>
        </div>
      </aside>

      <main className="main">
        {view === "dashboard" && (
          <Dashboard brands={brands} onOpen={openBrand} onNew={() => setView("onboarding")} />
        )}
        {view === "onboarding" && (
          <Onboarding onCancel={() => setView("dashboard")} onCreate={addBrand} />
        )}
        {view === "brand" && selected && (
          <BrandConsole brand={selected} onBack={() => setView("dashboard")} onLog={updateBrand} />
        )}
      </main>
    </div>
  );
}

/* ───────────────────────── Dashboard ───────────────────────── */

function Dashboard({ brands, onOpen, onNew }) {
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="display">Your brands</h1>
          <p className="lede">Each brand runs its own content pipeline on a schedule.</p>
        </div>
        <button className="btn btn-primary" onClick={onNew}><Plus size={16} /> New brand</button>
      </header>

      {brands.length === 0 ? (
        <div className="empty">
          <Sparkles size={22} />
          <p>No brands yet. Onboard one to start its pipeline.</p>
          <button className="btn btn-primary" onClick={onNew}><Plus size={16} /> New brand</button>
        </div>
      ) : (
        <div className="grid">
          {brands.map((b) => (
            <button key={b.id} className="brand-card" onClick={() => onOpen(b.id)}>
              <div className="brand-card-top">
                <span className="avatar">{b.name.slice(0, 1)}</span>
                <span className={`badge cadence-${b.cadence}`}><Clock size={12} /> {b.cadence}</span>
              </div>
              <h3 className="brand-name">{b.name}</h3>
              <p className="brand-pos">{b.positioning}</p>
              <div className="chip-row">
                {b.channels.map((c) => {
                  const ch = CHANNELS.find((x) => x.id === c);
                  const Icon = ch?.icon || Globe;
                  return <span key={c} className="chip-mini"><Icon size={12} /> {ch?.label}</span>;
                })}
              </div>
              <div className="brand-card-foot">
                <span className="muted">
                  {b.runs.length ? `last run ${relTime(b.runs[b.runs.length - 1].at)}` : "no runs yet"}
                </span>
                <ChevronRight size={16} />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Onboarding wizard ───────────────────────── */

const STEPS = ["Identity", "Voice", "Targets", "Cadence"];

function Onboarding({ onCancel, onCreate }) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState({
    name: "", audience: "", positioning: "",
    voice: "", dos: "", nevers: "",
    channels: [], keywords: [], imageModel: "gpt-image-2",
    cadence: "weekly", publishTarget: "draft", gateThreshold: 85,
  });
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const canNext = [
    draft.name.trim() && draft.audience.trim(),
    draft.voice.trim(),
    draft.channels.length > 0,
    true,
  ][step];

  const finish = () => {
    onCreate({ ...draft, id: slug(draft.name) + "-" + Math.random().toString(36).slice(2, 6), runs: [] });
  };

  return (
    <div className="page narrow">
      <header className="page-head">
        <div>
          <h1 className="display">Onboard a brand</h1>
          <p className="lede">Four steps. This becomes the input to every run.</p>
        </div>
        <button className="btn btn-ghost" onClick={onCancel}><X size={16} /> Cancel</button>
      </header>

      <div className="steprail">
        {STEPS.map((s, i) => (
          <div key={s} className={`steprail-item ${i === step ? "current" : ""} ${i < step ? "done" : ""}`}>
            <span className="steprail-dot">{i < step ? <Check size={13} /> : i + 1}</span>
            <span className="steprail-label">{s}</span>
          </div>
        ))}
      </div>

      <div className="card wizard">
        {step === 0 && (
          <>
            <Field label="Brand name" hint="What you call it internally.">
              <input className="input" value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="NikahPlus" />
            </Field>
            <Field label="Audience" hint="Who you're writing for.">
              <input className="input" value={draft.audience} onChange={(e) => set({ audience: e.target.value })} placeholder="Muslim singles seeking marriage" />
            </Field>
            <Field label="Positioning" hint="One line on what the brand is.">
              <input className="input" value={draft.positioning} onChange={(e) => set({ positioning: e.target.value })} placeholder="A respectful, faith-first path to marriage" />
            </Field>
          </>
        )}

        {step === 1 && (
          <>
            <Field label="Voice" hint="How it should sound. The writer agent is locked to this.">
              <textarea className="textarea" rows={4} value={draft.voice} onChange={(e) => set({ voice: e.target.value })} placeholder="Warm, direct, respectful. Plain language, no clichés…" />
            </Field>
            <div className="two-col">
              <Field label="Lean into">
                <input className="input" value={draft.dos} onChange={(e) => set({ dos: e.target.value })} placeholder="warmth, specificity" />
              </Field>
              <Field label="Never">
                <input className="input" value={draft.nevers} onChange={(e) => set({ nevers: e.target.value })} placeholder="hype, jargon" />
              </Field>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <Field label="Channels" hint="Where finished content gets published.">
              <div className="chip-row">
                {CHANNELS.map((c) => {
                  const on = draft.channels.includes(c.id);
                  const Icon = c.icon;
                  return (
                    <button key={c.id} className={`chip ${on ? "chip-active" : ""}`}
                      onClick={() => set({ channels: on ? draft.channels.filter((x) => x !== c.id) : [...draft.channels, c.id] })}>
                      <Icon size={14} /> {c.label}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="Seed topics & keywords" hint="Press Enter to add. The SEO agent expands these.">
              <TagInput tags={draft.keywords} onChange={(keywords) => set({ keywords })} />
            </Field>
            <Field label="Image model" hint="GPT Image 2 for text-on-image; Nano Banana for consistent characters.">
              <div className="seg">
                <button className={`seg-btn ${draft.imageModel === "gpt-image-2" ? "on" : ""}`} onClick={() => set({ imageModel: "gpt-image-2" })}>
                  <ImageIcon size={14} /> GPT Image 2
                </button>
                <button className={`seg-btn ${draft.imageModel === "nano-banana" ? "on" : ""}`} onClick={() => set({ imageModel: "nano-banana" })}>
                  <ImageIcon size={14} /> Nano Banana
                </button>
              </div>
            </Field>
          </>
        )}

        {step === 3 && (
          <>
            <Field label="Run cadence" hint="How often the pipeline fires on the server.">
              <div className="seg">
                {["manual", "daily", "weekly"].map((c) => (
                  <button key={c} className={`seg-btn ${draft.cadence === c ? "on" : ""}`} onClick={() => set({ cadence: c })}>{c}</button>
                ))}
              </div>
            </Field>
            <Field label="Publish target" hint="Where the worker sends approved content.">
              <div className="seg">
                {[["draft", "Hold as draft"], ["blotato", "Blotato"], ["cms", "Site / CMS"]].map(([v, l]) => (
                  <button key={v} className={`seg-btn ${draft.publishTarget === v ? "on" : ""}`} onClick={() => set({ publishTarget: v })}>{l}</button>
                ))}
              </div>
            </Field>
            <Field label={`Brand-voice gate: ${draft.gateThreshold}`} hint="Minimum score before a draft can publish.">
              <input type="range" min={60} max={100} value={draft.gateThreshold} onChange={(e) => set({ gateThreshold: Number(e.target.value) })} className="range" />
            </Field>
            <div className="review">
              <span className="review-tag">{draft.name || "Untitled"}</span>
              <span className="muted">{draft.channels.length} channel{draft.channels.length !== 1 ? "s" : ""} · {draft.cadence} · gate {draft.gateThreshold}</span>
            </div>
          </>
        )}

        <div className="wizard-foot">
          <button className="btn btn-ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            <ChevronLeft size={16} /> Back
          </button>
          {step < STEPS.length - 1 ? (
            <button className="btn btn-primary" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
              Continue <ChevronRight size={16} />
            </button>
          ) : (
            <button className="btn btn-primary" onClick={finish}>
              <Check size={16} /> Create brand
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Brand console + run ───────────────────────── */

function BrandConsole({ brand, onBack, onLog }) {
  const [run, setRun] = useState(null); // {stageStatus[], current, draft, awaiting, done, outcome}
  const [runId, setRunId] = useState(null);
  const [editing, setEditing] = useState(false);
  const pollRef = useRef(null);

  // Poll GET /api/runs/:id while a run is active and map it onto the rail.
  // Replaces the simulated stage progression. Server state drives the UI.
  useEffect(() => {
    if (!runId) return undefined;
    let stopped = false;

    const tick = async () => {
      try {
        const sr = await apiGetRun(runId);
        if (stopped) return;
        const mapped = mapRun(sr);
        setRun(mapped);
        if (mapped.done) {
          clearInterval(pollRef.current);
          // The server owns run history; refresh it for the history card.
          try {
            const fresh = await apiGetBrand(brand.id);
            if (!stopped && fresh) onLog(brand.id, { runs: fresh.runs });
          } catch { /* keep last-known history */ }
        }
      } catch { /* transient; keep polling */ }
    };

    tick();
    pollRef.current = setInterval(tick, 1500);
    return () => { stopped = true; clearInterval(pollRef.current); };
  }, [runId, brand.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const startRun = async () => {
    // POST /api/runs { brandId } to enqueue, then poll GET /api/runs/:id (effect above).
    setRun({ stageStatus: STAGES.map(() => "queued"), current: -1, draft: null, awaiting: false, done: false, outcome: null });
    try {
      const { runId: id } = await apiStartRun(brand.id);
      setRunId(id);
    } catch {
      setRun({ stageStatus: STAGES.map(() => "queued"), current: -1, draft: null, awaiting: false, done: true, outcome: "rejected" });
    }
  };

  const approve = async () => {
    // POST /api/runs/:id/approve → worker resumes and publishes; polling reflects it.
    setRun((r) => (r ? { ...r, awaiting: false } : r));
    try { await apiApprove(runId); } catch { /* poll will resurface state */ }
  };

  const reject = async () => {
    // POST /api/runs/:id/reject → run ends, nothing publishes.
    setRun((r) => (r ? { ...r, awaiting: false } : r));
    try { await apiReject(runId); } catch { /* poll will resurface state */ }
  };

  const running = run && !run.done;

  if (editing) {
    return (
      <BrandEditor
        brand={brand}
        onCancel={() => setEditing(false)}
        onSaved={(updated) => { onLog(brand.id, updated); setEditing(false); }}
      />
    );
  }

  return (
    <div className="page">
      <button className="back" onClick={onBack}><ChevronLeft size={16} /> All brands</button>
      <header className="page-head">
        <div>
          <h1 className="display">{brand.name}</h1>
          <p className="lede">{brand.positioning}</p>
        </div>
        <div className="head-actions">
          <button className="btn btn-ghost" disabled={running} onClick={() => setEditing(true)}>
            <PenTool size={15} /> Edit
          </button>
          <button className="btn btn-primary" disabled={running} onClick={startRun}>
            {running ? <><Loader2 size={16} className="spin" /> Running</> : <><Play size={16} /> Run pipeline</>}
          </button>
        </div>
      </header>

      <div className="console">
        <section className="rail-wrap card">
          <div className="card-label">Pipeline {run ? "" : "· idle"}</div>
          <div className="rail">
            {STAGES.map((s, i) => {
              const st = run ? run.stageStatus[i] : "idle";
              const Icon = s.icon;
              return (
                <div key={s.id} className={`stage stage-${st}`}>
                  <span className="stage-dot">
                    {st === "done" ? <Check size={14} />
                      : st === "running" ? <Loader2 size={14} className="spin" />
                      : st === "review" ? <ShieldCheck size={14} />
                      : st === "rejected" ? <X size={14} />
                      : <Icon size={14} />}
                  </span>
                  <div className="stage-body">
                    <div className="stage-label">{s.label}</div>
                    <div className="stage-sub">{s.sub}</div>
                  </div>
                  <span className="stage-state">{st !== "idle" && st !== "queued" ? st : ""}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="side">
          {run?.awaiting && run.draft ? (
            <div className="card draft">
              <div className="card-label gate"><ShieldCheck size={14} /> Brand-voice gate · {brand.name}</div>
              <div className="score-row">
                <span className="score">{run.draft.score}</span>
                <span className="muted">/ {brand.gateThreshold} required</span>
              </div>
              <h3 className="draft-title">{run.draft.title}</h3>
              <p className="draft-meta"><FileText size={12} /> {run.draft.meta}</p>
              {run.draft.imageUrl && (
                <img className="draft-image" src={run.draft.imageUrl} alt={run.draft.title} />
              )}
              <p className="draft-body">{run.draft.body}</p>
              <div className="chip-row">
                {run.draft.keywords.map((k) => <span key={k} className="chip-mini"><Hash size={11} /> {k}</span>)}
              </div>
              <div className="draft-actions">
                <button className="btn btn-ghost danger" onClick={reject}><CircleX size={16} /> Reject</button>
                <button className="btn btn-primary" onClick={approve}><CircleCheck size={16} /> Approve &amp; publish</button>
              </div>
            </div>
          ) : run?.done ? (
            <div className={`card outcome ${run.outcome}`}>
              {run.outcome === "published"
                ? <><CircleCheck size={26} /><h3>Published</h3><p className="muted">The worker pushed to {publishLabel(brand.publishTarget)}.</p></>
                : <><CircleX size={26} /><h3>Held at the gate</h3><p className="muted">Below brand-voice threshold. Nothing was published.</p></>}
            </div>
          ) : running ? (
            <div className="card waiting">
              <Loader2 size={22} className="spin" />
              <p className="muted">Working through the pipeline…</p>
            </div>
          ) : (
            <div className="card config">
              <div className="card-label">Configuration</div>
              <ConfigRow k="Audience" v={brand.audience} />
              <ConfigRow k="Cadence" v={brand.cadence} />
              <ConfigRow k="Channels" v={brand.channels.join(", ")} />
              <ConfigRow k="Images" v={brand.imageModel === "gpt-image-2" ? "GPT Image 2" : "Nano Banana"} />
              <ConfigRow k="Publish" v={publishLabel(brand.publishTarget)} />
              <ConfigRow k="Voice gate" v={`${brand.gateThreshold} min`} />
            </div>
          )}

          <div className="card history">
            <div className="card-label">Run history</div>
            {brand.runs.length === 0 ? (
              <p className="muted small">No runs yet.</p>
            ) : (
              [...brand.runs].reverse().map((r) => (
                <div key={r.id} className="hist-row">
                  <span className={`dot ${r.outcome}`} />
                  <span className="hist-title">{r.title}</span>
                  <span className="muted small">{relTime(r.at)}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ───────────────────────── small pieces ───────────────────────── */

function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {hint && <span className="field-hint">{hint}</span>}
      {children}
    </label>
  );
}

function ConfigRow({ k, v }) {
  return (
    <div className="cfg-row">
      <span className="muted small">{k}</span>
      <span className="cfg-v">{v}</span>
    </div>
  );
}

// Full brand editor — all fields that feed every run, incl. cadence + Blotato ids.
function BrandEditor({ brand, onCancel, onSaved }) {
  const [d, setD] = useState({
    name: brand.name || "",
    audience: brand.audience || "",
    positioning: brand.positioning || "",
    voice: brand.voice || "",
    dos: brand.dos || "",
    nevers: brand.nevers || "",
    channels: brand.channels || [],
    keywords: brand.keywords || [],
    imageModel: brand.imageModel || "gpt-image-2",
    cadence: brand.cadence || "weekly",
    publishTarget: brand.publishTarget || "draft",
    gateThreshold: brand.gateThreshold ?? 85,
    blotatoAccounts: brand.blotatoAccounts || {},
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (patch) => setD((s) => ({ ...s, ...patch }));
  const toggleChannel = (id) =>
    set({ channels: d.channels.includes(id) ? d.channels.filter((c) => c !== id) : [...d.channels, id] });
  const setAccount = (platform, val) =>
    set({ blotatoAccounts: { ...d.blotatoAccounts, [platform]: val } });

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const updated = await apiUpdateBrand(brand.id, d);
      onSaved(updated);
    } catch (e) {
      setError("Could not save. Check the server and try again.");
      setSaving(false);
    }
  };

  const blotatoChannels = d.channels.filter((c) => BLOTATO_PLATFORM[c]);

  return (
    <div className="page narrow">
      <button className="back" onClick={onCancel}><ChevronLeft size={16} /> Back to {brand.name}</button>
      <header className="page-head">
        <div>
          <h1 className="display">Edit {brand.name}</h1>
          <p className="lede">These settings are the input to every run.</p>
        </div>
      </header>

      <div className="card wizard">
        <Field label="Brand name">
          <input className="input" value={d.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Audience">
          <input className="input" value={d.audience} onChange={(e) => set({ audience: e.target.value })} />
        </Field>
        <Field label="Positioning">
          <input className="input" value={d.positioning} onChange={(e) => set({ positioning: e.target.value })} />
        </Field>
        <Field label="Voice" hint="The writer and QA agents are locked to this on every run.">
          <textarea className="textarea" rows={4} value={d.voice} onChange={(e) => set({ voice: e.target.value })} />
        </Field>
        <div className="two-col">
          <Field label="Lean into">
            <input className="input" value={d.dos} onChange={(e) => set({ dos: e.target.value })} />
          </Field>
          <Field label="Never">
            <input className="input" value={d.nevers} onChange={(e) => set({ nevers: e.target.value })} />
          </Field>
        </div>

        <Field label="Channels" hint="Where finished content publishes.">
          <div className="chip-row">
            {CHANNELS.map((c) => {
              const on = d.channels.includes(c.id);
              const Icon = c.icon;
              return (
                <button key={c.id} className={`chip ${on ? "chip-active" : ""}`} onClick={() => toggleChannel(c.id)}>
                  <Icon size={14} /> {c.label}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Topics & keywords" hint="Press Enter to add. The SEO agent expands these.">
          <TagInput tags={d.keywords} onChange={(keywords) => set({ keywords })} />
        </Field>

        <Field label="Run cadence" hint="How often the server fires this pipeline automatically. 'manual' = only on-demand runs.">
          <div className="seg">
            {["manual", "daily", "weekly"].map((c) => (
              <button key={c} className={`seg-btn ${d.cadence === c ? "on" : ""}`} onClick={() => set({ cadence: c })}>{c}</button>
            ))}
          </div>
        </Field>

        <Field label="Publish target" hint="Where the worker sends approved content.">
          <div className="seg">
            {[["draft", "Hold as draft"], ["blotato", "Blotato"], ["cms", "Site / CMS"]].map(([v, l]) => (
              <button key={v} className={`seg-btn ${d.publishTarget === v ? "on" : ""}`} onClick={() => set({ publishTarget: v })}>{l}</button>
            ))}
          </div>
        </Field>

        {d.publishTarget === "blotato" && (
          <Field label="Blotato account IDs" hint="One connected-account id per social channel.">
            {blotatoChannels.length === 0 ? (
              <p className="muted small">Select Instagram, X, or TikTok above to add account IDs.</p>
            ) : (
              blotatoChannels.map((c) => {
                const platform = BLOTATO_PLATFORM[c];
                const ch = CHANNELS.find((x) => x.id === c);
                const Icon = ch?.icon || Globe;
                return (
                  <div key={c} className="acct-row">
                    <span className="acct-label"><Icon size={13} /> {ch?.label}</span>
                    <input className="input acct-input" placeholder="account ID"
                      value={d.blotatoAccounts[platform] || ""}
                      onChange={(e) => setAccount(platform, e.target.value)} />
                  </div>
                );
              })
            )}
          </Field>
        )}

        <Field label={`Brand-voice gate: ${d.gateThreshold}`} hint="Minimum score before a draft can publish.">
          <input type="range" min={60} max={100} value={d.gateThreshold}
            onChange={(e) => set({ gateThreshold: Number(e.target.value) })} className="range" />
        </Field>

        {error && <p className="muted small" style={{ color: THEME.red }}>{error}</p>}

        <div className="wizard-foot">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" disabled={saving || !d.name.trim()} onClick={save}>
            {saving ? "Saving…" : <><Check size={16} /> Save changes</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function TagInput({ tags, onChange }) {
  const [val, setVal] = useState("");
  const add = () => {
    const t = val.trim();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setVal("");
  };
  return (
    <div className="taginput">
      {tags.map((t) => (
        <span key={t} className="chip-mini removable" onClick={() => onChange(tags.filter((x) => x !== t))}>
          {t} <X size={11} />
        </span>
      ))}
      <input
        className="tag-field" value={val} placeholder="add topic…"
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
      />
    </div>
  );
}

/* ───────────────────────── helpers ───────────────────────── */

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "brand";
const publishLabel = (t) => ({ draft: "drafts", blotato: "Blotato", cms: "site / CMS" }[t] || t);

function relTime(ts) {
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 60) return "just now";
  if (d < 3600) return Math.floor(d / 60) + "m ago";
  if (d < 86400) return Math.floor(d / 3600) + "h ago";
  return Math.floor(d / 86400) + "d ago";
}

/* ───────────────────────── styles ───────────────────────── */

function Style() {
  return (
    <style>{`
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;450;500&display=swap');
.bp { --ink:${THEME.ink}; --paper:${THEME.paper}; --surf:${THEME.surface}; --accent:${THEME.accent};
  --accent-soft:${THEME.accentSoft}; --sand:${THEME.sand}; --text:${THEME.text}; --muted:${THEME.muted};
  --line:${THEME.line}; --amber:${THEME.amber}; --red:${THEME.red};
  display:flex; min-height:640px; font-family:'Inter',system-ui,sans-serif; color:var(--text);
  background:var(--paper); border-radius:14px; overflow:hidden; }
.display { font-family:'Fraunces',serif; font-weight:500; letter-spacing:-.01em; }
* { box-sizing:border-box; }
.muted { color:var(--muted); }
.small { font-size:12.5px; }

.sidebar { width:228px; flex-shrink:0; background:var(--ink); color:#D9E3DD; padding:22px 16px;
  display:flex; flex-direction:column; gap:26px; }
.brandmark { display:flex; align-items:center; gap:11px; }
.mark { width:38px; height:38px; border-radius:10px; background:var(--accent); color:#fff;
  display:flex; align-items:center; justify-content:center; }
.mark-title { font-family:'Fraunces',serif; font-size:18px; color:#fff; line-height:1; }
.mark-sub { font-size:11.5px; color:#7E9389; margin-top:3px; letter-spacing:.04em; text-transform:uppercase; }
.nav { display:flex; flex-direction:column; gap:4px; }
.nav-item { display:flex; align-items:center; gap:10px; padding:10px 12px; border:none; cursor:pointer;
  background:transparent; color:#AEC0B8; border-radius:9px; font-size:14px; font-family:inherit; text-align:left; }
.nav-item:hover { background:rgba(255,255,255,.05); color:#E6EFEA; }
.nav-item.active { background:rgba(29,122,94,.22); color:#fff; }
.side-foot { margin-top:auto; font-size:12px; color:#6E8278; }
.side-foot-line { line-height:1.7; }

.main { flex:1; overflow:auto; }
.page { max-width:1000px; margin:0 auto; padding:34px 38px 60px; }
.page.narrow { max-width:680px; }
.page-head { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom:26px; }
.head-actions { display:flex; gap:9px; align-items:center; }
.display { font-size:30px; margin:0; }
.lede { color:var(--muted); margin:7px 0 0; font-size:14.5px; }
.back { background:none; border:none; cursor:pointer; color:var(--muted); display:flex; align-items:center;
  gap:5px; font-size:13.5px; font-family:inherit; padding:0; margin-bottom:14px; }
.back:hover { color:var(--accent); }

.btn { display:inline-flex; align-items:center; gap:7px; padding:10px 15px; border-radius:9px; cursor:pointer;
  font-family:inherit; font-size:14px; font-weight:500; border:1px solid transparent; transition:.15s; }
.btn:disabled { opacity:.45; cursor:not-allowed; }
.btn-primary { background:var(--accent); color:#fff; }
.btn-primary:not(:disabled):hover { background:#176046; }
.btn-ghost { background:transparent; border-color:var(--line); color:var(--text); }
.btn-ghost:hover { background:#EFEBE0; }
.btn-ghost.danger { color:var(--red); border-color:#E4C9C5; }
.btn-ghost.danger:hover { background:#F8EDEB; }

.grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(270px,1fr)); gap:16px; }
.brand-card { text-align:left; background:var(--surf); border:1px solid var(--line); border-radius:13px;
  padding:18px; cursor:pointer; display:flex; flex-direction:column; gap:11px; font-family:inherit; transition:.15s; }
.brand-card:hover { border-color:var(--sand); transform:translateY(-2px); }
.brand-card-top { display:flex; justify-content:space-between; align-items:center; }
.avatar { width:36px; height:36px; border-radius:9px; background:var(--accent-soft); color:var(--accent);
  font-family:'Fraunces',serif; font-size:18px; display:flex; align-items:center; justify-content:center; }
.brand-name { font-family:'Fraunces',serif; font-size:19px; font-weight:500; margin:0; }
.brand-pos { color:var(--muted); font-size:13px; margin:0; line-height:1.5; }
.brand-card-foot { display:flex; justify-content:space-between; align-items:center; margin-top:4px;
  padding-top:11px; border-top:1px solid var(--line); color:var(--muted); }

.badge { display:inline-flex; align-items:center; gap:4px; font-size:11.5px; padding:4px 9px; border-radius:20px;
  background:#EFEBE0; color:var(--muted); text-transform:capitalize; }
.cadence-weekly { background:var(--accent-soft); color:var(--accent); }
.cadence-daily { background:#F4ECD8; color:var(--amber); }

.chip-row { display:flex; flex-wrap:wrap; gap:7px; }
.chip-mini { display:inline-flex; align-items:center; gap:4px; font-size:12px; padding:4px 9px; border-radius:7px;
  background:#EFEBE0; color:var(--muted); }
.chip-mini.removable { cursor:pointer; }
.chip-mini.removable:hover { background:#E6DECB; color:var(--text); }
.chip { display:inline-flex; align-items:center; gap:6px; padding:8px 13px; border-radius:9px; cursor:pointer;
  border:1px solid var(--line); background:var(--surf); font-family:inherit; font-size:13.5px; color:var(--text); }
.chip-active { background:var(--accent-soft); border-color:var(--accent); color:var(--accent); }

.empty { text-align:center; padding:70px 20px; color:var(--muted); display:flex; flex-direction:column;
  align-items:center; gap:14px; border:1px dashed var(--line); border-radius:14px; background:var(--surf); }

.steprail { display:flex; gap:6px; margin-bottom:18px; }
.steprail-item { flex:1; display:flex; align-items:center; gap:8px; padding:9px 11px; border-radius:9px;
  background:var(--surf); border:1px solid var(--line); font-size:13px; color:var(--muted); }
.steprail-item.current { border-color:var(--accent); color:var(--accent); }
.steprail-item.done { color:var(--text); }
.steprail-dot { width:21px; height:21px; border-radius:50%; background:#EFEBE0; display:flex; align-items:center;
  justify-content:center; font-size:12px; }
.steprail-item.current .steprail-dot { background:var(--accent); color:#fff; }
.steprail-item.done .steprail-dot { background:var(--sand); color:#fff; }

.card { background:var(--surf); border:1px solid var(--line); border-radius:13px; padding:20px; }
.card-label { font-size:11.5px; text-transform:uppercase; letter-spacing:.07em; color:var(--muted);
  margin-bottom:14px; display:flex; align-items:center; gap:6px; }
.card-label.gate { color:var(--accent); }

.wizard { display:flex; flex-direction:column; gap:18px; }
.field { display:flex; flex-direction:column; gap:5px; }
.field-label { font-size:13.5px; font-weight:500; }
.field-hint { font-size:12px; color:var(--muted); margin-bottom:3px; }
.input, .textarea { font-family:inherit; font-size:14px; padding:10px 12px; border:1px solid var(--line);
  border-radius:9px; background:#FCFBF7; color:var(--text); width:100%; }
.input:focus, .textarea:focus { outline:none; border-color:var(--accent); background:#fff; }
.textarea { resize:vertical; line-height:1.55; }
.two-col { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
.seg { display:inline-flex; gap:6px; flex-wrap:wrap; }
.seg-btn { padding:8px 14px; border-radius:9px; border:1px solid var(--line); background:var(--surf);
  cursor:pointer; font-family:inherit; font-size:13.5px; color:var(--muted); text-transform:capitalize;
  display:inline-flex; align-items:center; gap:6px; }
.seg-btn.on { background:var(--accent-soft); border-color:var(--accent); color:var(--accent); }
.range { width:100%; accent-color:var(--accent); }
.taginput { display:flex; flex-wrap:wrap; gap:7px; padding:8px; border:1px solid var(--line); border-radius:9px;
  background:#FCFBF7; align-items:center; }
.tag-field { border:none; background:transparent; outline:none; font-family:inherit; font-size:13.5px; flex:1; min-width:120px; padding:4px; }
.review { display:flex; align-items:center; gap:10px; padding:13px; background:var(--accent-soft); border-radius:9px; }
.review-tag { font-family:'Fraunces',serif; font-size:15px; color:var(--accent); }
.wizard-foot { display:flex; justify-content:space-between; margin-top:4px; padding-top:16px; border-top:1px solid var(--line); }

.console { display:grid; grid-template-columns:1.15fr 1fr; gap:18px; align-items:start; }
.rail { display:flex; flex-direction:column; }
.stage { display:flex; align-items:center; gap:13px; padding:13px 6px; position:relative; }
.stage:not(:last-child)::after { content:''; position:absolute; left:21px; top:42px; bottom:-6px; width:2px; background:var(--line); }
.stage-dot { width:30px; height:30px; border-radius:50%; flex-shrink:0; display:flex; align-items:center;
  justify-content:center; background:#EFEBE0; color:var(--muted); z-index:1; border:2px solid var(--surf); }
.stage-body { flex:1; }
.stage-label { font-size:14px; font-weight:500; }
.stage-sub { font-size:12px; color:var(--muted); }
.stage-state { font-size:11.5px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); }
.stage-running .stage-dot { background:var(--accent); color:#fff; }
.stage-running .stage-state { color:var(--accent); }
.stage-done .stage-dot { background:var(--accent); color:#fff; }
.stage-review .stage-dot { background:var(--sand); color:#fff; }
.stage-review .stage-state { color:var(--sand); }
.stage-rejected .stage-dot { background:var(--red); color:#fff; }
.stage-rejected .stage-state { color:var(--red); }

.side { display:flex; flex-direction:column; gap:16px; }
.cfg-row { display:flex; justify-content:space-between; gap:12px; padding:8px 0; border-bottom:1px solid var(--line); }
.cfg-row:last-child { border-bottom:none; }
.cfg-v { font-size:13.5px; text-align:right; text-transform:capitalize; }
.acct-row { display:flex; align-items:center; gap:10px; margin-top:8px; }
.acct-label { display:inline-flex; align-items:center; gap:5px; font-size:13px; width:96px; flex-shrink:0; color:var(--text); }
.acct-input { flex:1; padding:7px 10px; font-size:13px; }
.save-btn { margin-top:14px; width:100%; justify-content:center; }
.draft .score-row { display:flex; align-items:baseline; gap:7px; margin-bottom:10px; }
.score { font-family:'Fraunces',serif; font-size:34px; color:var(--accent); line-height:1; }
.draft-title { font-family:'Fraunces',serif; font-size:18px; margin:0 0 6px; font-weight:500; }
.draft-meta { display:flex; align-items:center; gap:5px; font-size:12.5px; color:var(--muted); margin:0 0 11px; }
.draft-image { width:100%; border-radius:9px; border:1px solid var(--line); margin:0 0 12px; display:block; }
.draft-body { font-size:13.5px; line-height:1.6; color:#384640; margin:0 0 13px; }
.draft-actions { display:flex; gap:9px; margin-top:16px; }
.draft-actions .btn { flex:1; justify-content:center; }
.outcome { text-align:center; padding:34px 20px; display:flex; flex-direction:column; align-items:center; gap:8px; }
.outcome h3 { font-family:'Fraunces',serif; margin:4px 0 0; font-size:20px; font-weight:500; }
.outcome.published { color:var(--accent); }
.outcome.rejected { color:var(--red); }
.waiting { text-align:center; padding:40px 20px; color:var(--accent); display:flex; flex-direction:column; align-items:center; gap:12px; }
.hist-row { display:flex; align-items:center; gap:9px; padding:8px 0; border-bottom:1px solid var(--line); }
.hist-row:last-child { border-bottom:none; }
.hist-title { flex:1; font-size:13px; }
.dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
.dot.published { background:var(--accent); }
.dot.rejected { background:var(--red); }
.spin { animation:bp-spin 1s linear infinite; }
@keyframes bp-spin { to { transform:rotate(360deg); } }

@media (max-width:760px) {
  .console { grid-template-columns:1fr; }
  .bp { flex-direction:column; }
  .sidebar { width:100%; flex-direction:row; align-items:center; gap:16px; padding:14px 16px; }
  .nav { flex-direction:row; } .side-foot { display:none; }
}
    `}</style>
  );
}
