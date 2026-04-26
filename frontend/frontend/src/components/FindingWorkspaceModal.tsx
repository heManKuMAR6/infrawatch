import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { FindingRowDetail, type PendingSeek } from "@/components/FindingRowDetail";

type Row = Record<string, unknown>;

function num(v: unknown, d = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : d;
}

// ─── Design tokens (must match CSS vars for SVG fill/stroke) ───────────────
const RISK_COLOR: Record<string, string> = {
  CRITICAL: "#fb7185",
  HIGH:     "#fbbf24",
  MEDIUM:   "#f97316",
  LOW:      "#4ade80",
};
const RISK_BG: Record<string, string> = {
  CRITICAL: "rgba(251,113,133,0.07)",
  HIGH:     "rgba(251,191,36,0.07)",
  MEDIUM:   "rgba(249,115,22,0.07)",
  LOW:      "rgba(74,222,128,0.07)",
};
const RISK_BORDER: Record<string, string> = {
  CRITICAL: "rgba(251,113,133,0.22)",
  HIGH:     "rgba(251,191,36,0.22)",
  MEDIUM:   "rgba(249,115,22,0.22)",
  LOW:      "rgba(74,222,128,0.22)",
};

function riskKey(row: Row): string {
  const rl = String(row.risk_level ?? "").toUpperCase();
  if (RISK_COLOR[rl]) return rl;
  const sv = String(row.severity ?? "").toUpperCase();
  return RISK_COLOR[sv] ? sv : "LOW";
}

// ─── Arc gauge helpers ───────────────────────────────────────────────────────
function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const rad = (d: number) => (d * Math.PI) / 180;
  const x1 = cx + r * Math.cos(rad(startDeg));
  const y1 = cy + r * Math.sin(rad(startDeg));
  const x2 = cx + r * Math.cos(rad(endDeg));
  const y2 = cy + r * Math.sin(rad(endDeg));
  const span = Math.abs(endDeg - startDeg);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${span > 180 ? 1 : 0} 0 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

// ─── Risk Score Gauge ────────────────────────────────────────────────────────
function RiskScoreCard({ row }: { row: Row }) {
  const score = num(row.composite_risk_score, Math.round(num(row.quantum_risk_index) * 100));
  const risk  = riskKey(row);
  const color = RISK_COLOR[risk];
  const anomalyType = String(row.marengo_top_match ?? row.anomaly_type ?? "").replace(/_/g, " ");

  const CX = 80, CY = 80, R = 58;
  const START = 135, SWEEP = 270;
  const bgPath   = arcPath(CX, CY, R, START, START + SWEEP);
  const pct      = Math.min(1, Math.max(0, score / 100));
  const fillSpan = pct * SWEEP;
  const fillEnd  = START + fillSpan;
  const showFill = pct > 0.005;

  // Tick marks at 0 %, 50 %, 100 %
  const ticks = [0, 0.5, 1].map((t) => {
    const deg = START + t * SWEEP;
    const rad = (deg * Math.PI) / 180;
    const inner = R - 7, outer = R + 2;
    return {
      x1: (CX + inner * Math.cos(rad)).toFixed(2),
      y1: (CY + inner * Math.sin(rad)).toFixed(2),
      x2: (CX + outer * Math.cos(rad)).toFixed(2),
      y2: (CY + outer * Math.sin(rad)).toFixed(2),
    };
  });

  return (
    <div
      style={{
        background: RISK_BG[risk],
        border: `1px solid ${RISK_BORDER[risk]}`,
        borderRadius: 10,
        padding: "14px 14px 12px",
      }}
    >
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.13em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 10 }}>
        Composite Risk Score
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {/* Arc gauge */}
        <svg viewBox="0 0 160 130" style={{ width: 118, flexShrink: 0 }} aria-hidden>
          {/* Background track */}
          <path d={bgPath} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={10} strokeLinecap="round" />
          {/* Fill arc */}
          {showFill && (
            <path
              d={arcPath(CX, CY, R, START, fillEnd)}
              fill="none"
              stroke={color}
              strokeWidth={10}
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 7px ${color}88)` }}
            />
          )}
          {/* Tick marks */}
          {ticks.map((t, i) => (
            <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
          ))}
          {/* Center score */}
          <text x={CX} y={CY - 6} textAnchor="middle"
            style={{ fontSize: 32, fontWeight: 700, fill: color, fontFamily: "var(--font-mono, monospace)" }}>
            {Math.round(score)}
          </text>
          <text x={CX} y={CY + 14} textAnchor="middle"
            style={{ fontSize: 11, fill: "var(--text-muted, #8b9cb3)", fontFamily: "var(--font-mono, monospace)" }}>
            / 100
          </text>
          {/* Scale labels */}
          <text x={28} y={120} textAnchor="middle"
            style={{ fontSize: 8, fill: "var(--text-muted, #8b9cb3)", fontFamily: "var(--font-mono, monospace)" }}>0</text>
          <text x={133} y={120} textAnchor="middle"
            style={{ fontSize: 8, fill: "var(--text-muted, #8b9cb3)", fontFamily: "var(--font-mono, monospace)" }}>100</text>
        </svg>

        {/* Right info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: "inline-flex", alignItems: "center",
            fontSize: 11, fontWeight: 800, color,
            letterSpacing: "0.12em", textTransform: "uppercase",
            border: `1px solid ${color}44`, background: `${color}18`,
            borderRadius: 5, padding: "4px 9px", marginBottom: 8,
          }}>
            {risk === "CRITICAL" && <span style={{ marginRight: 5, fontSize: 10 }}>●</span>}
            {risk}
          </div>

          {anomalyType && (
            <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.45, fontWeight: 500, marginBottom: 6 }}>
              {anomalyType}
            </div>
          )}

          {Boolean(row.timestamp_video) && (
            <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginBottom: 3 }}>
              {String(row.timestamp_video)}
            </div>
          )}

          <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            {num(row.lat).toFixed(4)}, {num(row.lon).toFixed(4)}
          </div>
        </div>
      </div>

      {/* Score band bar */}
      <div style={{ marginTop: 12 }}>
        <div style={{ position: "relative", height: 4, borderRadius: 4, background: "rgba(255,255,255,0.07)" }}>
          <div style={{
            position: "absolute", left: 0, top: 0, height: "100%",
            width: `${pct * 100}%`, borderRadius: 4,
            background: `linear-gradient(90deg, #4ade80 0%, #fbbf24 50%, #fb7185 100%)`,
          }} />
          {/* Threshold markers */}
          {[40, 65, 83].map((th) => (
            <div key={th} style={{
              position: "absolute", top: -2, left: `${th}%`,
              width: 1, height: 8, background: "rgba(255,255,255,0.25)",
            }} />
          ))}
          {/* Pointer */}
          <div style={{
            position: "absolute", top: -3, left: `${pct * 100}%`,
            transform: "translateX(-50%)",
            width: 8, height: 8, borderRadius: "50%",
            background: color, boxShadow: `0 0 6px ${color}`,
            border: "1px solid var(--bg-base)",
          }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          {["LOW", "MED", "HIGH", "CRIT"].map((l) => (
            <span key={l} style={{ fontSize: 8, color: "var(--text-muted)", fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}>{l}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Sensor Card ─────────────────────────────────────────────────────────────
type SensorData = { methane_ppm?: unknown; temp_differential_c?: unknown; pressure_psi?: unknown };

function MiniBar({ label, value, unit, pct, color, warn, threshold }: {
  label: string; value: string; unit: string; pct: number; color: string; warn: boolean; threshold: string;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{label}</span>
        <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 600, color }}>
          {value}
          <span style={{ fontSize: 9, color: "var(--text-muted)", fontWeight: 400, marginLeft: 2 }}>{unit}</span>
          {warn && <span style={{ marginLeft: 4, fontSize: 11 }}>⚠</span>}
        </span>
      </div>
      <div style={{ position: "relative", background: "rgba(255,255,255,0.07)", borderRadius: 3, height: 4 }}>
        <div style={{
          height: 4, borderRadius: 3,
          width: `${Math.min(100, Math.max(0, pct))}%`,
          background: color,
          boxShadow: warn ? `0 0 6px ${color}` : "none",
          transition: "width .3s ease",
        }} />
      </div>
      <div style={{ fontSize: 8, color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
        {threshold}
      </div>
    </div>
  );
}

function SensorCard({ sensor }: { sensor: SensorData }) {
  const methane  = num(sensor.methane_ppm, 1.8);
  const temp     = num(sensor.temp_differential_c, 1.5);
  const pressure = num(sensor.pressure_psi, 855);

  const mColor = methane  > 8   ? "#fb7185" : methane  > 4   ? "#fbbf24" : "#4ade80";
  const tColor = temp     > 10  ? "#fb7185" : temp     > 5   ? "#fbbf24" : "#4ade80";
  const pColor = pressure < 830 ? "#fb7185" : pressure < 840 ? "#fbbf24" : "#4ade80";

  const anyAlert = methane > 4 || temp > 5 || pressure < 840;

  return (
    <div style={{
      background: "var(--bg-elevated)",
      border: `1px solid ${anyAlert ? "rgba(251,191,36,0.18)" : "var(--border)"}`,
      borderRadius: 10, padding: "12px 14px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "var(--text-muted)", textTransform: "uppercase" }}>
          Sensor telemetry
        </span>
        <span style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}>
          PHMSA · NERC
        </span>
      </div>
      <MiniBar label="Methane"     value={methane.toFixed(2)}        unit="ppm" pct={(methane / 12) * 100}            color={mColor} warn={methane > 4}    threshold="Alert >4 ppm · Critical >8 ppm" />
      <MiniBar label="Temp Δ"      value={`+${temp.toFixed(1)}`}     unit="°C"  pct={(temp / 20) * 100}               color={tColor} warn={temp > 5}       threshold="Alert >5°C · Critical >10°C" />
      <MiniBar label="Pressure"    value={pressure.toFixed(0)}       unit="PSI" pct={((pressure - 810) / 60) * 100}  color={pColor} warn={pressure < 840}  threshold="Alert <840 PSI · Critical <830 PSI" />
    </div>
  );
}

// ─── Site Conditions ─────────────────────────────────────────────────────────
function ConditionBadge({ icon, label, active, detail }: {
  icon: string; label: string; active: boolean; detail?: string;
}) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "9px 6px", borderRadius: 8, textAlign: "center",
      background: active ? "rgba(251,191,36,0.08)" : "rgba(255,255,255,0.03)",
      border: `1px solid ${active ? "rgba(251,191,36,0.22)" : "rgba(255,255,255,0.07)"}`,
    }}>
      <span style={{ fontSize: 20, lineHeight: 1, marginBottom: 5 }}>{icon}</span>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: active ? "#fbbf24" : "var(--text-muted)" }}>
        {label}
      </span>
      <span style={{ fontSize: 9, color: active ? "#fbbf24" : "var(--text-muted)", marginTop: 2, lineHeight: 1.3 }}>
        {active ? (detail ?? "detected") : "clear"}
      </span>
    </div>
  );
}

function SiteConditionsCard({ row }: { row: Row }) {
  const pr = row.pegasus_report as Record<string, unknown> | undefined;
  const pd = pr?.people_detected as Record<string, unknown> | undefined;
  const wd = pr?.wildlife_detected as Record<string, unknown> | undefined;

  const peoplePresent  = Boolean(pd?.present ?? row.people_present);
  const peopleCount    = num(pd?.count);
  const peopleActivity = String(pd?.activity ?? "").trim();
  const wildPresent    = Boolean(wd?.present ?? row.animals_present);
  const wildTypes      = String(wd?.types ?? "").trim();
  const vehiclePresent = Boolean(pr?.vehicles_present);
  const environment    = String(pr?.environment ?? "").trim();

  const peopleDetail = peoplePresent
    ? [peopleCount > 0 ? `${peopleCount} person${peopleCount !== 1 ? "s" : ""}` : "", peopleActivity].filter(Boolean).join(" · ") || undefined
    : undefined;
  const wildDetail = wildPresent && wildTypes && wildTypes !== "none" ? wildTypes : undefined;

  return (
    <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 10 }}>
        Site conditions
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: environment ? 10 : 0 }}>
        <ConditionBadge icon="👤" label="People"   active={peoplePresent} detail={peopleDetail} />
        <ConditionBadge icon="🦌" label="Wildlife" active={wildPresent}   detail={wildDetail} />
        <ConditionBadge icon="🚗" label="Vehicles" active={vehiclePresent} />
      </div>
      {environment && (
        <div style={{
          fontSize: 11, color: "var(--text-muted)",
          borderTop: "1px solid var(--border)",
          paddingTop: 8, lineHeight: 1.4,
        }}>
          <span style={{ fontWeight: 700, color: "var(--text)", marginRight: 5 }}>Env:</span>
          {environment}
        </div>
      )}
    </div>
  );
}

// ─── Regulatory Violations ───────────────────────────────────────────────────
function ViolationsCard({ violations }: { violations: string[] }) {
  if (!violations.length) return null;
  return (
    <div style={{
      background: "rgba(251,113,133,0.06)",
      border: "1px solid rgba(251,113,133,0.22)",
      borderLeft: "3px solid #fb7185",
      borderRadius: "0 8px 8px 0",
      padding: "11px 13px",
    }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: "#fb7185", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
        ⚠ Regulatory Violations
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {violations.map((v, i) => (
          <li key={i} style={{
            display: "flex", gap: 6,
            fontSize: 11, color: "#fb7185",
            fontFamily: "var(--font-mono)",
            lineHeight: 1.45,
            marginBottom: i < violations.length - 1 ? 5 : 0,
          }}>
            <span style={{ flexShrink: 0, opacity: 0.6 }}>›</span>
            <span>{v}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Recommended Action ───────────────────────────────────────────────────────
function ActionCard({ action }: { action: string }) {
  return (
    <div style={{
      background: "rgba(34,211,238,0.05)",
      border: "1px solid rgba(34,211,238,0.18)",
      borderLeft: "3px solid #22d3ee",
      borderRadius: "0 8px 8px 0",
      padding: "11px 13px",
    }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: "var(--accent)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
        Recommended action
      </div>
      <p style={{ margin: 0, fontSize: 12, color: "var(--text)", lineHeight: 1.55 }}>{action}</p>
    </div>
  );
}

// ─── Asset Radar ─────────────────────────────────────────────────────────────
function AssetRadar({ row }: { row: Row }) {
  const axes = useMemo(() => {
    const q = Math.min(1, Math.max(0, num(row.quantum_risk_index)));
    const v = Math.min(1, Math.max(0, num(row.visual_damage_score)));
    const crit = String(row.severity).toLowerCase() === "critical" ? 1 : 0.35;
    const hz = (() => {
      const pr = row.pegasus_report as Record<string, unknown> | undefined;
      const h = pr?.hazards;
      if (!Array.isArray(h)) return 0.2;
      return Math.min(1, h.length / 4);
    })();
    const rawGrid = num(row.grid_stress_score);
    const grid = rawGrid > 0 ? Math.min(1, rawGrid) : 0.42;
    return [
      { label: "Quantum", v: q },
      { label: "Visual",  v: v },
      { label: "Posture", v: crit },
      { label: "Hazards", v: hz },
      { label: "Grid σ",  v: grid },
    ];
  }, [row]);

  const cx = 90, cy = 88, r = 62, n = axes.length;

  const pts = (scale: number) =>
    axes.map((a, i) => {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const rr = r * scale * a.v;
      return `${(cx + rr * Math.cos(ang)).toFixed(2)},${(cy + rr * Math.sin(ang)).toFixed(2)}`;
    }).join(" ");

  const ring = axes.map((_, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return `${(cx + r * Math.cos(ang)).toFixed(2)},${(cy + r * Math.sin(ang)).toFixed(2)}`;
  }).join(" ");

  return (
    <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 2 }}>
        Signal radar
      </div>
      <div style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 8 }}>Normalized fusion view</div>

      <svg viewBox="0 0 180 176" style={{ width: "100%", maxWidth: 220, height: "auto", display: "block", margin: "0 auto" }} aria-hidden>
        <polygon points={ring} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
        {[0.35, 0.65, 1].map((sc) => {
          const scaledRing = axes.map((_, i) => {
            const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
            return `${(cx + r * sc * Math.cos(ang)).toFixed(2)},${(cy + r * sc * Math.sin(ang)).toFixed(2)}`;
          }).join(" ");
          return <polygon key={sc} points={scaledRing} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="0.5" />;
        })}
        {axes.map((a, i) => {
          const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
          const x = cx + r * Math.cos(ang), y = cy + r * Math.sin(ang);
          return (
            <g key={a.label}>
              <line x1={cx} y1={cy} x2={x.toFixed(2)} y2={y.toFixed(2)} stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
              <text x={(cx + (r + 14) * Math.cos(ang)).toFixed(2)} y={(cy + (r + 14) * Math.sin(ang)).toFixed(2)}
                textAnchor="middle" dominantBaseline="middle"
                style={{ fontSize: 7, fontWeight: 700, fill: "var(--text-muted, #8b9cb3)", fontFamily: "var(--font-mono, monospace)" }}>
                {a.label}
              </text>
            </g>
          );
        })}
        <polygon points={pts(1)} fill="rgba(34,211,238,0.14)" stroke="#22d3ee" strokeWidth="1.5" />
      </svg>

      <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none" }}>
        {axes.map((a) => (
          <li key={a.label} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
            <span style={{ fontSize: 10, color: "var(--text-muted)", width: 54, flexShrink: 0 }}>{a.label}</span>
            <div style={{ flex: 1, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.round(a.v * 100)}%`, background: "#22d3ee", borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--text-muted)", width: 28, textAlign: "right" }}>
              {Math.round(a.v * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────
type Props = {
  open: boolean;
  row: Row | null;
  rowId: string | null;
  pendingSeek: PendingSeek;
  onConsumedSeek: () => void;
  onClose: () => void;
};

export function FindingWorkspaceModal({ open, row, rowId, pendingSeek, onConsumedSeek, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open, onClose]);

  if (!open || !row || !rowId) return null;

  const title       = String(row.asset_name ?? rowId);
  const sev         = String(row.severity ?? "—").toUpperCase();
  const risk        = riskKey(row);
  const color       = RISK_COLOR[risk];
  const violations  = Array.isArray(row.regulatory_violations) ? row.regulatory_violations.map(String).filter(Boolean) : [];
  const pr          = row.pegasus_report as Record<string, unknown> | undefined;
  const actionRaw   = String(pr?.recommended_action ?? row.recommended_action ?? "").trim();
  const sensor      = (row.sensor ?? {}) as SensorData;
  const qList       = Array.isArray(row.marengo_queries) ? row.marengo_queries.map(String) : [];

  const tree = (
    <div className="soc-ws-overlay" role="dialog" aria-modal="true" aria-labelledby="soc-ws-title">
      <button type="button" className="soc-ws-backdrop" aria-label="Close workspace" onClick={onClose} />
      <div className="soc-ws-panel soc-ws-panel--fullscreen">

        {/* Header */}
        <header className="soc-ws-header">
          <div>
            <div className="soc-ws-kicker">Finding workspace</div>
            <h2 id="soc-ws-title" className="soc-ws-title">{title}</h2>
            <div className="soc-ws-meta">
              <span className={`soc-ws-sev ${sev === "CRITICAL" ? "soc-ws-sev--crit" : ""}`}
                style={{ color }}>
                {sev}
              </span>
              <span className="soc-mono">ID {rowId}</span>
              <span className="soc-mono">{num(row.lat).toFixed(4)}, {num(row.lon).toFixed(4)}</span>
              {row.video_file ? <span className="soc-mono">CLIP {String(row.video_file)}</span> : null}
              {row.timestamp_video ? <span className="soc-mono">{String(row.timestamp_video)}</span> : null}
            </div>
          </div>
          <button ref={closeRef} type="button" className="soc-ws-close soc-btn-outline" onClick={onClose}>
            Close · Esc
          </button>
        </header>

        {/* Body */}
        <div className="soc-ws-body">
          <section className="soc-ws-main">
            <FindingRowDetail
              variant="workspace"
              row={row}
              rowId={rowId}
              pendingSeek={pendingSeek}
              onConsumedSeek={onConsumedSeek}
            />
          </section>

          {/* ── Summary Aside ── */}
          <aside className="soc-ws-aside">

            {/* 1. Risk gauge */}
            <RiskScoreCard row={row} />

            {/* 2. Sensor telemetry */}
            <SensorCard sensor={sensor} />

            {/* 3. Site conditions */}
            <SiteConditionsCard row={row} />

            {/* 4. Regulatory violations */}
            {violations.length > 0 && <ViolationsCard violations={violations} />}

            {/* 5. Recommended action */}
            {actionRaw && <ActionCard action={actionRaw} />}

            {/* 6. Radar */}
            <AssetRadar row={row} />

            {/* 7. Model focus chips (if available) */}
            {qList.length > 0 && (
              <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>
                  Model focus
                </div>
                <div style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 8 }}>Pegasus hazards · primary visual match</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {qList.map((q) => (
                    <span key={q} className="soc-ws-chip">{q}</span>
                  ))}
                </div>
              </div>
            )}

          </aside>
        </div>
      </div>
    </div>
  );

  return createPortal(tree, document.body);
}
