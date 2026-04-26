import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "@/api";
import { DashboardCharts } from "@/components/DashboardCharts";
import { FindingWorkspaceModal } from "@/components/FindingWorkspaceModal";
import type { PendingSeek } from "@/components/FindingRowDetail";
import { MapView, type MapPoint } from "@/components/MapView";
import { TopBar } from "@/components/TopBar";
import { useBundle } from "@/context/BundleContext";
import { seekTimeForHazardLabel, seekTimePrimaryMid } from "@/lib/timelineSegments";
import { useTheme } from "@/theme/ThemeContext";

type Row = Record<string, unknown>;

function num(v: unknown, d = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : d;
}

function postureFor(kpis: { crit: number; stress: number; rows: number }): "nominal" | "elevated" | "alert" {
  if (!kpis.rows) return "nominal";
  if (kpis.crit > 0 || kpis.stress >= 0.78) return "alert";
  if (kpis.stress >= 0.48) return "elevated";
  return "nominal";
}

export function DashboardPage() {
  const { theme } = useTheme();
  const { bundle, setBundle } = useBundle();
  const [busy, setBusy] = useState<"mock" | "export" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [workspaceRowId, setWorkspaceRowId] = useState<string | null>(null);
  const [pendingSeek, setPendingSeek] = useState<PendingSeek>(null);

  const rows = useMemo(() => {
    if (!bundle || !Array.isArray(bundle.anomalies)) return [] as Row[];
    return bundle.anomalies as Row[];
  }, [bundle]);

  const consumeSeek = useCallback(() => setPendingSeek(null), []);

  const closeWorkspace = useCallback(() => {
    setWorkspaceRowId(null);
    setPendingSeek(null);
  }, []);

  const jumpToHazard = useCallback(
    (hazardLabel: string) => {
      for (const r of rows) {
        const hz = (r.pegasus_report as Record<string, unknown> | undefined)?.hazards;
        if (!Array.isArray(hz) || !hz.some((h) => String(h) === hazardLabel)) continue;
        const id = String(r.id ?? r.asset_name);
        const st = seekTimeForHazardLabel(r, hazardLabel);
        setWorkspaceRowId(id);
        setPendingSeek({ rowId: id, time: st ?? seekTimePrimaryMid(r) });
        return;
      }
    },
    [rows],
  );

  const jumpToMarengoMatch = useCallback(
    (label: string) => {
      for (const r of rows) {
        if (String(r.marengo_top_match ?? "") !== label) continue;
        const id = String(r.id ?? r.asset_name);
        setWorkspaceRowId(id);
        setPendingSeek({ rowId: id, time: seekTimePrimaryMid(r) });
        return;
      }
    },
    [rows],
  );

  const mapPoints: MapPoint[] = useMemo(
    () =>
      rows.map((r) => ({
        lon: num(r.lon, -90),
        lat: num(r.lat, 38),
        label: String(r.asset_name ?? "Asset"),
        critical: String(r.severity) === "critical",
        risk_level: String(r.risk_level ?? r.severity ?? "LOW").toUpperCase(),
      })),
    [rows],
  );

  const kpis = useMemo(() => {
    if (!rows.length)
      return { stress: 0, crit: 0, maint: 0, qri: 0, vd: 0, threat: 0, fusion: 0 };
    const stress = rows.reduce((s, r) => s + num(r.grid_stress_score), 0) / rows.length;
    const crit = rows.filter((r) => String(r.severity) === "critical").length;
    const qri = rows.reduce((s, r) => s + num(r.quantum_risk_index), 0) / rows.length;
    const vd = rows.reduce((s, r) => s + num(r.visual_damage_score), 0) / rows.length;
    const threat = Math.round((crit / rows.length) * 100 + stress * 35);
    const fusion = Math.round(((qri + vd) / 2) * 100);
    return { stress, crit, maint: rows.length - crit, qri, vd, threat, fusion };
  }, [rows]);

  const posture = postureFor({ crit: kpis.crit, stress: kpis.stress, rows: rows.length });

  const grid = bundle?.grid as Record<string, unknown> | undefined;
  const snap = grid?.snapshot as Record<string, unknown> | undefined;
  const stressHint = snap != null ? num(snap.stress_score, num(grid?.stress_score)) : num(grid?.stress_score);

  const pipe = bundle?.vision_pipeline as Record<string, unknown> | undefined;
  const pegasusItems = useMemo(() => (Array.isArray(pipe?.pegasus) ? (pipe!.pegasus as unknown[]) : []), [pipe]);
  const pegasusErrors = useMemo(
    () => pegasusItems.filter((p) => typeof p === "object" && p !== null && "error" in (p as object)).length,
    [pegasusItems],
  );
  const pegasusOk = pegasusItems.length - pegasusErrors;
  const marengoJobs = Array.isArray(pipe?.marengo_index_jobs) ? (pipe!.marengo_index_jobs as unknown[]).length : 0;
  const marengoErr = typeof pipe?.marengo_index_jobs_error === "string";

  const hazardRank = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const pr = r.pegasus_report as Record<string, unknown> | undefined;
      const hz = pr?.hazards;
      if (!Array.isArray(hz)) continue;
      for (const h of hz) {
        const k = String(h);
        m.set(k, (m.get(k) ?? 0) + 1);
      }
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [rows]);

  const topMatches = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const t = String(r.marengo_top_match || "");
      if (!t) continue;
      m.set(t, (m.get(t) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [rows]);

  const qd = bundle?.quantum_debug as Record<string, unknown> | undefined;

  const tickerText = useMemo(() => {
    const p = posture.toUpperCase();
    const hz = hazardRank[0]?.[0]?.slice(0, 42) ?? "—";
    return [
      `OPERATIONAL POSTURE ${p}`,
      `Assets ${rows.length} · Critical ${kpis.crit} · Grid stress ${kpis.stress.toFixed(2)}`,
      `Top hazard theme: ${hz}`,
      `Quantum blend avg ${kpis.qri.toFixed(2)} · Visual risk avg ${(kpis.vd * 100).toFixed(0)}%`,
      pegasusItems.length ? `Vision jobs Pegasus ${pegasusOk}/${pegasusItems.length} OK` : "Vision pipeline: load demo or live bundle",
      marengoJobs ? `Marengo async jobs queued: ${marengoJobs}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }, [posture, rows.length, kpis, hazardRank, pegasusItems.length, pegasusOk, marengoJobs]);

  const loadInfraWatch = useCallback(async () => {
    setErr(null);
    setBusy("mock");
    try {
      const resp = await fetch(`${API_BASE}/findings`);
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json() as { findings: Record<string, unknown>[]; total: number; critical: number };
      const anomalies = data.findings.map((f) => ({
        id: f.finding_id,
        asset_name: f.finding_id,
        video_file: f.video_file ?? f.finding_id,
        timestamp_start_sec: f.timestamp_start_sec ?? 0,
        timestamp_end_sec: f.timestamp_end_sec ?? 30,
        severity: String(f.risk_level).toLowerCase() === "critical" ? "critical" : String(f.risk_level).toLowerCase(),
        quantum_risk_index: num(f.composite_risk_score) / 100,
        visual_damage_score: num(f.composite_risk_score) / 100,
        marengo_top_match: String(f.anomaly_type ?? "").replace(/_/g, " "),
        lat: f.lat,
        lon: f.lon,
        timestamp_video: f.timestamp_video,
        regulatory_violations: f.regulatory_violations,
        pegasus_report: {
          anomaly_type: String(f.anomaly_type ?? "").replace(/[|_]/g, (c) => c === "|" ? " + " : " "),
          severity: f.severity,
          hazards: Array.isArray(f.regulatory_violations) && (f.regulatory_violations as unknown[]).length
            ? f.regulatory_violations
            : [String(f.anomaly_type ?? "").replace(/_/g, " ")],
          description: f.description,
          people_detected: {
            present: Boolean(f.people_present),
            count: Number(f.people_count ?? 0),
            activity: String(f.people_activity ?? ""),
          },
          wildlife_detected: {
            present: Boolean(f.animals_present),
            types: String(f.animal_types ?? "none"),
          },
          vehicles_present: Boolean(f.vehicles_present),
          environment: String(f.environment ?? ""),
          recommended_action: String(f.recommended_action ?? ""),
        },
        sensor: f.sensor,
        people_present: f.people_present,
        animals_present: f.animals_present,
      }));
      setBundle({
        anomalies,
        grid: {
          stress_score: anomalies.length
            ? anomalies.reduce((s, a) => s + num(a.quantum_risk_index), 0) / anomalies.length
            : 0,
          source: "InfraWatch · TX-447 St. Louis",
        },
        vision_pipeline: {
          pegasus: anomalies.map((a) => ({ asset: a.asset_name, ok: true })),
          marengo_index_jobs: [],
        },
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [setBundle]);

  const exportGeoJSON = useCallback(() => {
    if (!rows.length) return;
    const features = rows.map((r) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [num(r.lon, -90), num(r.lat, 38)],
      },
      properties: {
        id: r.id ?? r.asset_name,
        asset_name: r.asset_name,
        risk_level: r.risk_level ?? String(r.severity ?? "").toUpperCase(),
        severity: r.severity,
        composite_risk_score: r.composite_risk_score ?? Math.round(num(r.quantum_risk_index) * 100),
        anomaly_type: r.marengo_top_match,
        timestamp_video: r.timestamp_video,
        regulatory_violations: r.regulatory_violations ?? [],
        recommended_action: (r.pegasus_report as Record<string, unknown> | undefined)?.recommended_action ?? "",
        people_present: r.people_present ?? false,
        animals_present: r.animals_present ?? false,
      },
    }));
    const geojson = { type: "FeatureCollection", features };
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/geo+json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "infrawatch-findings.geojson";
    a.click();
    URL.revokeObjectURL(a.href);
  }, [rows]);

  const kpiDefs = useMemo(
    () => [
      { label: "Grid stress (avg)", value: kpis.stress.toFixed(2), bar: Math.min(100, kpis.stress * 100) },
      { label: "Critical flags", value: String(kpis.crit), bar: rows.length ? (kpis.crit / rows.length) * 100 : 0 },
      { label: "Maintenance queue", value: String(kpis.maint), bar: rows.length ? (kpis.maint / rows.length) * 100 : 0 },
      { label: "Quantum blend", value: kpis.qri.toFixed(2), bar: kpis.qri * 100 },
      { label: "Visual damage", value: `${(kpis.vd * 100).toFixed(0)}%`, bar: kpis.vd * 100 },
      { label: "Threat index", value: String(kpis.threat), bar: Math.min(100, kpis.threat) },
    ],
    [kpis, rows.length],
  );

  const postureClass = posture === "alert" ? "soc-posture--alert" : posture === "elevated" ? "soc-posture--elevated" : "soc-posture--nominal";

  const workspaceRow = useMemo(
    () => (workspaceRowId ? rows.find((r) => String(r.id ?? r.asset_name) === workspaceRowId) ?? null : null),
    [rows, workspaceRowId],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <TopBar
        title="Command center"
        subtitle="Unified grid, quantum fusion, and multimodal vision — operator-grade situational awareness."
        extra={
          rows.length ? (
            <span className="soc-live-pill" title="Bundle loaded into console">
              BUNDLE LIVE
            </span>
          ) : null
        }
      />

      {rows.length ? (
        <div className="soc-ticker">
          <span className="soc-ticker-label">SITREP</span>
          <div className="soc-ticker-marquee">
            <div className="soc-ticker-inner">
              <span>{tickerText} · </span>
              <span>{tickerText} · </span>
            </div>
          </div>
        </div>
      ) : null}

      <div className="soc-page">
        {err ? <div className="soc-alert soc-alert--err">{err}</div> : null}

        <div className="soc-strip">
          <span className={`soc-posture ${postureClass}`}>Posture · {posture}</span>
          <span className="soc-strip-meta">
            <strong>{rows.length}</strong> surface assets · Grid snapshot{" "}
            <span className="soc-mono">{stressHint.toFixed(3)}</span>
            {snap?.period != null ? (
              <>
                {" "}
                · ISO period <span className="soc-mono">{String(snap.period)}</span>
              </>
            ) : null}
          </span>
          <div style={{ marginLeft: "auto", display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button type="button" className="soc-btn-primary" onClick={loadInfraWatch} disabled={busy !== null}>
              {busy === "mock" ? "Loading…" : "Load InfraWatch data"}
            </button>
            <button type="button" className="soc-btn-outline" onClick={loadInfraWatch} disabled={busy !== null}>
              Demo dataset
            </button>
            <button type="button" className="soc-btn-outline" onClick={exportGeoJSON} disabled={!rows.length}>
              Export GeoJSON
            </button>
          </div>
        </div>

        {!rows.length ? (
          <div className="soc-empty">
            <h2>Awaiting operational bundle</h2>
            <p style={{ margin: "0 auto", maxWidth: 520 }}>
              Ingest a <strong>demo dataset</strong> for instant KPIs and map, or open{" "}
              <Link to={{ pathname: "/", search: "?panel=analysis" }}>Live analysis</Link> /{" "}
              <Link to={{ pathname: "/", search: "?panel=stream" }}>SSE stream</Link> against Bedrock with your existing{" "}
              <code className="mono">.env</code>.
            </p>
            <div style={{ marginTop: "1.25rem", display: "flex", gap: 10, justifyContent: "center" }}>
              <button type="button" className="soc-btn-primary" onClick={loadInfraWatch} disabled={busy !== null}>
                {busy === "mock" ? "Loading…" : "Load InfraWatch data"}
              </button>
              <button type="button" className="soc-btn-outline" onClick={loadInfraWatch} disabled={busy !== null}>
                Demo dataset
              </button>
            </div>
          </div>
        ) : (
          <>
            <section className="soc-hero" aria-label="Primary operational view">
              <div className="soc-hero-split">
                <div className="soc-hero-card soc-hero-card--map">
                  <header className="soc-hero-head">
                    <p className="soc-hero-kicker">Live picture</p>
                    <h2 className="soc-hero-title">Geospatial picture</h2>
                    <p className="soc-hero-lead">
                      <span className="soc-hero-stat">{rows.length}</span> surface assets on map · bundle coordinates
                    </p>
                  </header>
                  <div className="soc-map-frame soc-map-frame--hero">
                    <div className="soc-map-chrome">
                      <span className="soc-map-chip soc-map-chip--hero">LAYER · ASSETS</span>
                      <span className="soc-map-chip soc-map-chip--hero">SRC · BUNDLE</span>
                      <span className="soc-map-chip soc-map-chip--hero">{rows.length} PINS</span>
                    </div>
                    <MapView points={mapPoints} theme={theme} height={540} />
                  </div>
                </div>

                <div className="soc-hero-card soc-hero-card--roster">
                  <header className="soc-hero-head">
                    <p className="soc-hero-kicker">Actionable queue</p>
                    <h2 className="soc-hero-title">Findings roster</h2>
                    <p className="soc-hero-lead">
                      Row opens <strong>fullscreen workspace</strong> · hazard / Marengo shortcuts sit below in Intel
                    </p>
                  </header>
                  <p className="soc-roster-hint soc-roster-hint--hero">
                    Click a row for evidence, clip, matrix timeline, and JSON. Click the same row again to close. Use Intel highlights in the lower deck to jump with playhead alignment.
                  </p>
                  <div className="soc-table-wrap soc-table-wrap--hero">
                    <table className="soc-table soc-table--hero">
                      <thead>
                        <tr>
                          <th className="soc-th-chev" aria-hidden />
                          <th>Asset</th>
                          <th>Severity</th>
                          <th>QRI</th>
                          <th>Visual</th>
                          <th>Match</th>
                          <th>Geo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => {
                          const id = String(r.id ?? r.asset_name);
                          const sev = String(r.severity ?? "");
                          const open = workspaceRowId === id;
                          return (
                            <tr
                              key={id}
                              className={open ? "soc-table-row--open" : undefined}
                              onClick={() => {
                                if (open) closeWorkspace();
                                else setWorkspaceRowId(id);
                              }}
                              style={{ cursor: "pointer" }}
                            >
                              <td className="soc-td-chev" aria-hidden>
                                <span className={`soc-row-chevron${open ? " soc-row-chevron--open" : ""}`} />
                              </td>
                              <td>
                                <span className={`soc-sev-dot ${sev === "critical" ? "soc-sev-dot--crit" : "soc-sev-dot--maint"}`} />
                                <strong>{String(r.asset_name)}</strong>
                              </td>
                              <td className="soc-td-sev">{sev}</td>
                              <td className="soc-mono">{num(r.quantum_risk_index).toFixed(2)}</td>
                              <td className="soc-mono">{(num(r.visual_damage_score) * 100).toFixed(0)}%</td>
                              <td className="soc-td-match">{String(r.marengo_top_match ?? "—")}</td>
                              <td className="soc-mono soc-td-geo">
                                {num(r.lat).toFixed(3)},{num(r.lon).toFixed(3)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </section>

            <section className="soc-command-deck" aria-label="Supporting analytics">
              <div className="soc-deck-divider">
                <span className="soc-deck-kicker">Context &amp; analytics</span>
                <span className="soc-deck-line" aria-hidden />
              </div>

              <div className="soc-kpi-grid soc-kpi-grid--deck">
                {kpiDefs.map((m) => (
                  <div key={m.label} className="soc-kpi">
                    <div className="soc-kpi-label">{m.label}</div>
                    <div className="soc-kpi-value">{m.value}</div>
                    <div className="soc-kpi-bar">
                      <span style={{ width: `${m.bar}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="soc-charts-deck">
                <DashboardCharts rows={rows} />
              </div>

              <div className="soc-grid-3 soc-grid-3--deck">
                <div className="soc-panel soc-panel--deck">
                  <div className="soc-panel-head">
                    <span className="soc-panel-title">Grid &amp; markets</span>
                    <span className="soc-panel-tag">MISO / EIA</span>
                  </div>
                  <div className="soc-panel-body">
                    <ul>
                      <li>
                        Stress score <span className="soc-mono">{stressHint.toFixed(3)}</span>
                      </li>
                      {snap?.respondent != null ? (
                        <li>
                          Respondent <span className="soc-mono">{String(snap.respondent)}</span>
                        </li>
                      ) : null}
                      {grid?.source != null ? (
                        <li>
                          Source <span className="soc-mono">{String(grid.source)}</span>
                        </li>
                      ) : null}
                      <li>Correlate elevated stress with critical vision flags in the findings table.</li>
                    </ul>
                  </div>
                </div>
                <div className="soc-panel soc-panel--deck">
                  <div className="soc-panel-head">
                    <span className="soc-panel-title">Fusion &amp; quantum</span>
                    <span className="soc-panel-tag">Qiskit</span>
                  </div>
                  <div className="soc-panel-body">
                    <ul>
                      <li>
                        Mean quantum risk index <span className="soc-mono">{kpis.qri.toFixed(3)}</span>
                      </li>
                      <li>IBM channel: {qd?.ibm != null ? <span className="soc-mono">configured probe</span> : "optional — set IBM_QUANTUM_TOKEN"}</li>
                      <li>Use quantum blend as tie-breaker when visual scores cluster.</li>
                    </ul>
                  </div>
                </div>
                <div className="soc-panel soc-panel--deck">
                  <div className="soc-panel-head">
                    <span className="soc-panel-title">Vision pipeline</span>
                    <span className="soc-panel-tag">Bedrock</span>
                  </div>
                  <div className="soc-panel-body">
                    <ul>
                      <li>
                        Pegasus runs: <strong>{pegasusOk}</strong> ok / {pegasusItems.length} total
                        {pegasusErrors ? (
                          <span style={{ color: "var(--critical)" }}>
                            {" "}
                            · {pegasusErrors} error(s)
                          </span>
                        ) : null}
                      </li>
                      <li>Marengo async jobs: {marengoJobs || "—"}</li>
                      {marengoErr ? (
                        <li style={{ color: "var(--warn)" }}>Marengo async: {String(pipe?.marengo_index_jobs_error).slice(0, 120)}</li>
                      ) : null}
                      <li>Cross-check hazard chips with map clusters before dispatch.</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="soc-panel soc-panel--deck soc-panel--intel-wide">
                <div className="soc-panel-head">
                  <span className="soc-panel-title">Intel highlights</span>
                  <span className="soc-panel-tag">AUTO</span>
                </div>
                <div className="soc-panel-body soc-panel-body--intel" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div>
                    <strong className="soc-intel-col-title">Hazard lexicon</strong>
                    <ul>
                      {hazardRank.length ? (
                        hazardRank.map(([h, c]) => (
                          <li key={h}>
                            <button type="button" className="soc-intel-hit" onClick={() => jumpToHazard(h)} title="Open first finding with this hazard and jump video to aligned time">
                              <span className="soc-mono">{c}×</span> {h.length > 72 ? `${h.slice(0, 72)}…` : h}
                            </button>
                          </li>
                        ))
                      ) : (
                        <li>No structured hazards in bundle.</li>
                      )}
                    </ul>
                  </div>
                  <div>
                    <strong className="soc-intel-col-title">Marengo anchors</strong>
                    <ul>
                      {topMatches.length ? (
                        topMatches.map(([t, c]) => (
                          <li key={t}>
                            <button type="button" className="soc-intel-hit" onClick={() => jumpToMarengoMatch(t)} title="Open first finding with this Marengo top match and center the clip window">
                              <span className="soc-mono">{c}×</span> {t}
                            </button>
                          </li>
                        ))
                      ) : (
                        <li>—</li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            </section>

            <FindingWorkspaceModal
              open={workspaceRowId !== null && workspaceRow != null}
              row={workspaceRow}
              rowId={workspaceRowId}
              pendingSeek={pendingSeek}
              onConsumedSeek={consumeSeek}
              onClose={closeWorkspace}
            />
          </>
        )}
      </div>
    </div>
  );
}
