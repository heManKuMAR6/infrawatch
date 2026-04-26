import { useEffect, useMemo, useState } from "react";
import { TopBar } from "@/components/TopBar";

// ─── Types ────────────────────────────────────────────────────────────────────
type ChunkRow = {
  chunk_id: string;
  timestamp_video: string;
  original_video: string;
  anomaly_detected: boolean;
  risk_level: string;
  composite_risk_score: number;
  lat: number | null;
  lon: number | null;
};

type SensorReading = {
  methane_ppm: number;
  temp_differential_c: number;
  pressure_psi: number;
};

type FindingRow = {
  finding_id: string;
  timestamp_video: string;
  timestamp_start_sec: number;
  lat: number;
  lon: number;
  anomaly_type: string;
  risk_level: string;
  composite_risk_score: number;
  regulatory_violations: string[];
  people_present: boolean;
  animals_present: boolean;
  vehicles_present: boolean;
  sensor: SensorReading;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const RISK_COLOR: Record<string, string> = {
  CRITICAL: "#fb7185",
  HIGH:     "#fbbf24",
  MEDIUM:   "#f97316",
  LOW:      "#4ade80",
};

function num(v: unknown, d = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : d;
}

// ─── Shared UI ────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color }: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div style={{
      background: "var(--bg-elevated)", border: "1px solid var(--border-strong)",
      borderRadius: 10, padding: "14px 16px",
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", color: "var(--text-muted)", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "var(--font-mono)", color: color ?? "var(--text)", lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{sub}</div>}
    </div>
  );
}

function Card({ title, tag, sub, children }: {
  title: string; tag?: string; sub?: string; children: React.ReactNode;
}) {
  return (
    <div style={{
      background: "var(--bg-elevated)", border: "1px solid var(--border-strong)",
      borderRadius: 10, padding: "16px 18px",
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", letterSpacing: "0.02em" }}>{title}</div>
          {sub && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
        </div>
        {tag && <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--text-muted)", letterSpacing: "0.08em", flexShrink: 0 }}>{tag}</span>}
      </div>
      {children}
    </div>
  );
}

// ─── Risk Timeline Bar Chart ──────────────────────────────────────────────────
function TimelineChart({ chunks }: { chunks: ChunkRow[] }) {
  const W = 560, H = 130;
  const ML = 30, MR = 8, MT = 10, MB = 26;
  const plotW = W - ML - MR, plotH = H - MT - MB;
  const n = chunks.length;
  const slotW = plotW / n;
  const barW = Math.round(slotW * 0.6);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} aria-label="Risk score timeline">
      {/* Y grid + labels */}
      {[0, 25, 50, 75, 100].map((v) => {
        const y = MT + plotH - (v / 100) * plotH;
        return (
          <g key={v}>
            <line x1={ML} y1={y} x2={ML + plotW} y2={y} stroke="rgba(255,255,255,0.045)" strokeWidth={v === 0 ? 0.8 : 0.4} />
            <text x={ML - 4} y={y + 3} textAnchor="end"
              style={{ fontSize: 6, fill: "rgba(139,156,179,0.8)", fontFamily: "monospace" }}>{v}</text>
          </g>
        );
      })}

      {/* Threshold line at 65 (HIGH) and 83 (CRITICAL) */}
      {[{ v: 65, label: "HIGH" }, { v: 83, label: "CRIT" }].map(({ v, label }) => {
        const y = MT + plotH - (v / 100) * plotH;
        return (
          <g key={label}>
            <line x1={ML} y1={y} x2={ML + plotW} y2={y}
              stroke={v >= 83 ? "rgba(251,113,133,0.3)" : "rgba(251,191,36,0.3)"}
              strokeWidth="0.6" strokeDasharray="3,3" />
            <text x={ML + plotW + 2} y={y + 3}
              style={{ fontSize: 5.5, fill: v >= 83 ? "#fb7185" : "#fbbf24", fontFamily: "monospace" }}>{label}</text>
          </g>
        );
      })}

      {/* Bars */}
      {chunks.map((c, i) => {
        const x = ML + i * slotW + (slotW - barW) / 2;
        const score = c.composite_risk_score;
        const barH = Math.max(score > 0 ? 2 : 0, (score / 100) * plotH);
        const y = MT + plotH - barH;
        const color = RISK_COLOR[c.risk_level] ?? "#4ade80";
        return (
          <g key={c.chunk_id}>
            {/* Slot background */}
            <rect x={x} y={MT} width={barW} height={plotH} fill="rgba(255,255,255,0.018)" rx={2} />
            {/* Score bar */}
            {score > 0 && (
              <rect x={x} y={y} width={barW} height={barH} fill={color} opacity={0.88} rx={2}
                style={{ filter: `drop-shadow(0 0 4px ${color}66)` }} />
            )}
            {/* Zero-score tick */}
            {score === 0 && (
              <rect x={x} y={MT + plotH - 2} width={barW} height={2} fill="rgba(74,222,128,0.25)" rx={1} />
            )}
            {/* Timestamp label */}
            <text x={x + barW / 2} y={MT + plotH + 10} textAnchor="middle"
              style={{ fontSize: 5.5, fill: "rgba(139,156,179,0.7)", fontFamily: "monospace" }}>
              {c.timestamp_video}
            </text>
            {/* Anomaly dot above bar */}
            {c.anomaly_detected && score > 0 && (
              <circle cx={x + barW / 2} cy={y - 3} r={2} fill={color} />
            )}
          </g>
        );
      })}

      {/* X axis */}
      <line x1={ML} y1={MT + plotH} x2={ML + plotW} y2={MT + plotH} stroke="rgba(255,255,255,0.1)" strokeWidth="0.8" />
    </svg>
  );
}

// ─── Risk Distribution Bars ───────────────────────────────────────────────────
function RiskDistribution({ findings }: { findings: FindingRow[] }) {
  const counts = useMemo(() => {
    const m: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    findings.forEach((f) => { m[f.risk_level] = (m[f.risk_level] ?? 0) + 1; });
    return m;
  }, [findings]);

  const total = findings.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((lv) => {
        const count = counts[lv] ?? 0;
        const pct = total > 0 ? (count / total) * 100 : 0;
        const color = RISK_COLOR[lv];
        return (
          <div key={lv}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: "0.08em" }}>{lv}</span>
              <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                {count}<span style={{ opacity: 0.45 }}> / {total}</span>
                <span style={{ marginLeft: 6, color: count > 0 ? color : "var(--text-muted)" }}>
                  {pct.toFixed(0)}%
                </span>
              </span>
            </div>
            <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 4, height: 7, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${pct}%`, background: color, borderRadius: 4,
                boxShadow: count > 0 ? `0 0 8px ${color}55` : "none",
                transition: "width .6s ease",
              }} />
            </div>
          </div>
        );
      })}

      {/* Mini stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 4, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
        {[
          { label: "Avg score", value: total > 0 ? Math.round(findings.reduce((s, f) => s + f.composite_risk_score, 0) / total) : 0, color: "#fb7185" },
          { label: "Max score", value: findings.reduce((m, f) => Math.max(m, f.composite_risk_score), 0), color: "#fb7185" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--font-mono)", color }}>{value}</div>
            <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sensor Sparkline ─────────────────────────────────────────────────────────
function SensorSparkline({ data, label, unit, color, alertLine, critLine, minVal, maxVal, invertAlert = false }: {
  data: number[]; label: string; unit: string; color: string;
  alertLine?: number; critLine?: number;
  minVal: number; maxVal: number;
  invertAlert?: boolean; // true = lower is worse (pressure)
}) {
  const gradId = `grad-${label.replace(/\s/g, "")}`;
  if (!data.length) return null;

  const W = 200, H = 72, PAD = 6;
  const plotW = W - PAD * 2, plotH = H - PAD * 2 - 16;

  const xScale = (i: number) => PAD + (data.length > 1 ? (i / (data.length - 1)) * plotW : plotW / 2);
  const yScale = (v: number) => PAD + plotH - Math.min(1, Math.max(0, (v - minVal) / (maxVal - minVal))) * plotH;

  const pts = data.map((v, i) => `${xScale(i).toFixed(1)},${yScale(v).toFixed(1)}`).join(" ");
  const areaPts = `${PAD},${PAD + plotH} ${pts} ${xScale(data.length - 1).toFixed(1)},${PAD + plotH}`;

  const currentVal = data[data.length - 1];
  const isAlert = invertAlert
    ? (alertLine !== undefined && currentVal < alertLine)
    : (alertLine !== undefined && currentVal > alertLine);
  const isCrit = invertAlert
    ? (critLine !== undefined && currentVal < critLine)
    : (critLine !== undefined && currentVal > critLine);

  const displayColor = isCrit ? "#fb7185" : isAlert ? "#fbbf24" : color;

  return (
    <div style={{
      background: isCrit ? "rgba(251,113,133,0.06)" : isAlert ? "rgba(251,191,36,0.05)" : "rgba(255,255,255,0.02)",
      border: `1px solid ${isCrit ? "rgba(251,113,133,0.22)" : isAlert ? "rgba(251,191,36,0.18)" : "rgba(255,255,255,0.08)"}`,
      borderRadius: 9, padding: "10px 12px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          {label}
        </span>
        <span style={{ fontSize: 15, fontFamily: "var(--font-mono)", fontWeight: 700, color: displayColor }}>
          {currentVal.toFixed(label === "Pressure" ? 0 : 1)}
          <span style={{ fontSize: 9, fontWeight: 400, color: "var(--text-muted)", marginLeft: 2 }}>{unit}</span>
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 72, display: "block" }} aria-hidden>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={displayColor} stopOpacity="0.32" />
            <stop offset="100%" stopColor={displayColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Alert threshold lines */}
        {alertLine !== undefined && (() => {
          const y = yScale(alertLine);
          if (y < PAD || y > PAD + plotH) return null;
          return <line x1={PAD} y1={y} x2={PAD + plotW} y2={y} stroke="#fbbf24" strokeWidth="0.6" strokeDasharray="3,3" opacity="0.7" />;
        })()}
        {critLine !== undefined && (() => {
          const y = yScale(critLine);
          if (y < PAD || y > PAD + plotH) return null;
          return <line x1={PAD} y1={y} x2={PAD + plotW} y2={y} stroke="#fb7185" strokeWidth="0.6" strokeDasharray="3,3" opacity="0.7" />;
        })()}

        {/* Area fill */}
        {data.length > 1 && <polygon points={areaPts} fill={`url(#${gradId})`} />}

        {/* Line */}
        <polyline points={pts} fill="none" stroke={displayColor} strokeWidth="1.8"
          strokeLinejoin="round" strokeLinecap="round" />

        {/* Data point dots */}
        {data.map((v, i) => (
          <circle key={i} cx={xScale(i)} cy={yScale(v)} r={2.2}
            fill={displayColor} stroke="var(--bg-elevated, #0a0b10)" strokeWidth="1" />
        ))}
      </svg>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{ fontSize: 8, color: "var(--text-muted)", fontFamily: "monospace" }}>
          {invertAlert ? `Alert <${alertLine} · Crit <${critLine}` : `Alert >${alertLine} · Crit >${critLine}`}
        </span>
        {(isAlert || isCrit) && (
          <span style={{ fontSize: 8, color: displayColor, fontFamily: "monospace" }}>
            ⚠ {isCrit ? "CRITICAL" : "ALERT"}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Anomaly Type Chart ───────────────────────────────────────────────────────
function AnomalyTypeChart({ findings }: { findings: FindingRow[] }) {
  const data = useMemo(() => {
    const m = new Map<string, number>();
    findings.forEach((f) => {
      (f.anomaly_type ?? "").split("|").map((t) => t.replace(/_/g, " ").trim()).filter(Boolean)
        .forEach((t) => m.set(t, (m.get(t) ?? 0) + 1));
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [findings]);

  const max = data[0]?.[1] ?? 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {data.map(([type, count]) => (
        <div key={type}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: "var(--text)", textTransform: "capitalize" }}>{type}</span>
            <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{count}×</span>
          </div>
          <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 3, height: 5 }}>
            <div style={{
              height: "100%", borderRadius: 3, width: `${(count / max) * 100}%`,
              background: "linear-gradient(90deg, var(--accent), #a78bfa)",
              boxShadow: "0 0 6px rgba(34,211,238,0.35)",
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Regulatory Violations ────────────────────────────────────────────────────
function ViolationsBreakdown({ findings }: { findings: FindingRow[] }) {
  const data = useMemo(() => {
    const m = new Map<string, number>();
    findings.forEach((f) => {
      (f.regulatory_violations ?? []).forEach((v) => m.set(v, (m.get(v) ?? 0) + 1));
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [findings]);

  if (!data.length) return <p style={{ color: "var(--text-muted)", fontSize: 12 }}>No violations recorded.</p>;
  const max = data[0][1];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {data.map(([v, count]) => (
        <div key={v}>
          <div style={{ display: "flex", gap: 8, marginBottom: 3 }}>
            <span style={{ flex: 1, fontSize: 10, color: "#fb7185", fontFamily: "var(--font-mono)", lineHeight: 1.4 }}>{v}</span>
            <span style={{ flexShrink: 0, fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
              {count} finding{count !== 1 ? "s" : ""}
            </span>
          </div>
          <div style={{ background: "rgba(251,113,133,0.08)", borderRadius: 3, height: 4 }}>
            <div style={{
              height: "100%", width: `${(count / max) * 100}%`,
              background: "#fb7185", borderRadius: 3, opacity: 0.65,
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Site Presence ────────────────────────────────────────────────────────────
function PresenceMatrix({ findings }: { findings: FindingRow[] }) {
  const total = findings.length;
  const items = [
    { label: "People on site",    count: findings.filter((f) => f.people_present).length,   icon: "👤", color: "#fbbf24" },
    { label: "Wildlife detected", count: findings.filter((f) => f.animals_present).length,  icon: "🦌", color: "#4ade80" },
    { label: "Vehicles present",  count: findings.filter((f) => f.vehicles_present).length, icon: "🚗", color: "#60a5fa" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item) => (
        <div key={item.label} style={{
          display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
          borderRadius: 8,
          background: item.count > 0 ? `${item.color}0e` : "rgba(255,255,255,0.02)",
          border: `1px solid ${item.count > 0 ? `${item.color}28` : "rgba(255,255,255,0.07)"}`,
        }}>
          <span style={{ fontSize: 20 }}>{item.icon}</span>
          <span style={{ flex: 1, fontSize: 11, color: item.count > 0 ? "var(--text)" : "var(--text-muted)" }}>{item.label}</span>
          <span style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--font-mono)", color: item.count > 0 ? item.color : "var(--text-muted)" }}>
            {item.count}
          </span>
          <span style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>/ {total}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Segment Heatmap ──────────────────────────────────────────────────────────
function SegmentHeatmap({ chunks }: { chunks: ChunkRow[] }) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {chunks.map((c, i) => {
        const color = RISK_COLOR[c.risk_level] ?? "#4ade80";
        const score = c.composite_risk_score;
        return (
          <div key={c.chunk_id} title={`${c.chunk_id} · ${c.risk_level} · ${score}/100 · ${c.timestamp_video}`}
            style={{
              width: 36, height: 36, borderRadius: 6,
              background: c.anomaly_detected ? `${color}22` : "rgba(255,255,255,0.03)",
              border: `1px solid ${c.anomaly_detected ? `${color}55` : "rgba(255,255,255,0.08)"}`,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              cursor: "default",
              boxShadow: c.anomaly_detected ? `0 0 8px ${color}33` : "none",
            }}>
            <span style={{ fontSize: 8, fontFamily: "monospace", color: c.anomaly_detected ? color : "var(--text-muted)", fontWeight: 700 }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <span style={{ fontSize: 7, fontFamily: "monospace", color: c.anomaly_detected ? color : "rgba(139,156,179,0.4)" }}>
              {score > 0 ? score : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Findings Detail Table ────────────────────────────────────────────────────
function FindingsTable({ findings }: { findings: FindingRow[] }) {
  const cols = ["Segment", "Time", "Risk", "Score", "Anomaly type", "CH₄ ppm", "Temp Δ °C", "PSI", "GPS"];
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {cols.map((h) => (
              <th key={h} style={{
                padding: "6px 10px", textAlign: "left", fontSize: 9, fontWeight: 700,
                letterSpacing: "0.08em", color: "var(--text-muted)", textTransform: "uppercase",
                borderBottom: "1px solid var(--border-strong)", whiteSpace: "nowrap",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {findings.map((f) => {
            const color = RISK_COLOR[f.risk_level] ?? "#4ade80";
            const m = num(f.sensor?.methane_ppm);
            const t = num(f.sensor?.temp_differential_c);
            const p = num(f.sensor?.pressure_psi, 855);
            const mWarn = m > 8, tWarn = t > 10, pWarn = p < 830;
            return (
              <tr key={f.finding_id}
                style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", transition: "background .15s" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.025)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <td style={{ padding: "8px 10px", fontFamily: "var(--font-mono)", color: "var(--text-muted)", fontSize: 10, whiteSpace: "nowrap" }}>
                  {f.finding_id}
                </td>
                <td style={{ padding: "8px 10px", fontFamily: "var(--font-mono)", color: "var(--text-muted)", fontSize: 10, whiteSpace: "nowrap" }}>
                  {f.timestamp_video}
                </td>
                <td style={{ padding: "8px 10px" }}>
                  <span style={{
                    fontSize: 9, fontWeight: 800, color, letterSpacing: "0.08em",
                    background: `${color}15`, border: `1px solid ${color}33`,
                    borderRadius: 4, padding: "2px 6px",
                  }}>{f.risk_level}</span>
                </td>
                <td style={{ padding: "8px 10px", fontFamily: "var(--font-mono)", color, fontWeight: 700, fontSize: 12 }}>
                  {f.composite_risk_score}
                </td>
                <td style={{ padding: "8px 10px", color: "var(--text)", fontSize: 11, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {(f.anomaly_type ?? "").replace(/[|_]/g, (c) => c === "|" ? " + " : " ")}
                </td>
                <td style={{ padding: "8px 10px", fontFamily: "var(--font-mono)", fontSize: 10, color: mWarn ? "#fb7185" : "var(--text-muted)", fontWeight: mWarn ? 700 : 400 }}>
                  {m.toFixed(1)}{mWarn ? " ⚠" : ""}
                </td>
                <td style={{ padding: "8px 10px", fontFamily: "var(--font-mono)", fontSize: 10, color: tWarn ? "#fb7185" : "var(--text-muted)", fontWeight: tWarn ? 700 : 400 }}>
                  +{t.toFixed(1)}{tWarn ? " ⚠" : ""}
                </td>
                <td style={{ padding: "8px 10px", fontFamily: "var(--font-mono)", fontSize: 10, color: pWarn ? "#fb7185" : "var(--text-muted)", fontWeight: pWarn ? 700 : 400 }}>
                  {p.toFixed(0)}{pWarn ? " ⚠" : ""}
                </td>
                <td style={{ padding: "8px 10px", fontFamily: "var(--font-mono)", color: "var(--text-muted)", fontSize: 10, whiteSpace: "nowrap" }}>
                  {f.lat.toFixed(4)}, {f.lon.toFixed(4)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
type Props = { embedded?: boolean };

export function ConnectivityPage({ embedded = false }: Props) {
  const [chunks, setChunks] = useState<ChunkRow[] | null>(null);
  const [findings, setFindings] = useState<FindingRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/chunks").then((r) => (r.ok ? r.json() : Promise.reject(r.statusText))),
      fetch("/findings").then((r) => (r.ok ? r.json() : Promise.reject(r.statusText))),
    ])
      .then(([cd, fd]) => {
        if (cancelled) return;
        setChunks(cd.chunks ?? []);
        setFindings(fd.findings ?? []);
      })
      .catch((e) => { if (!cancelled) setErr(String(e)); });
    return () => { cancelled = true; };
  }, []);

  const kpis = useMemo(() => {
    if (!chunks || !findings) return null;
    const anomaly = chunks.filter((c) => c.anomaly_detected);
    const avgScore = anomaly.length
      ? Math.round(anomaly.reduce((s, c) => s + c.composite_risk_score, 0) / anomaly.length)
      : 0;
    return {
      totalChunks: chunks.length,
      totalFindings: findings.length,
      critical: findings.filter((f) => f.risk_level === "CRITICAL").length,
      high: findings.filter((f) => f.risk_level === "HIGH").length,
      anomalyRate: chunks.length ? Math.round((anomaly.length / chunks.length) * 100) : 0,
      avgScore,
      peopleCount: findings.filter((f) => f.people_present).length,
    };
  }, [chunks, findings]);

  const sensorSeries = useMemo(() => {
    if (!findings) return { methane: [], temp: [], pressure: [] };
    const sorted = [...findings].sort((a, b) => a.timestamp_start_sec - b.timestamp_start_sec);
    return {
      methane:  sorted.map((f) => num(f.sensor?.methane_ppm, 1.8)),
      temp:     sorted.map((f) => num(f.sensor?.temp_differential_c, 1.5)),
      pressure: sorted.map((f) => num(f.sensor?.pressure_psi, 855)),
    };
  }, [findings]);

  const loading = !chunks || !findings;

  return (
    <div className={embedded ? "soc-embedded-root" : undefined}
      style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {!embedded && (
        <TopBar
          title="Pipeline analytics"
          subtitle="TX-447 St. Louis corridor · TwelveLabs Pegasus 1.2 + Marengo 3.0 · 12 segments · AWS Bedrock"
        />
      )}

      <div className={`soc-page${embedded ? " soc-page--embedded" : ""}`}>
        {err && <div className="soc-alert soc-alert--err">{err}</div>}

        {loading && !err && (
          <p style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
            Loading pipeline data…
          </p>
        )}

        {kpis && chunks && findings && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* ── KPI row ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
              <KpiCard label="Segments scanned"    value={kpis.totalChunks}   sub="8m 34s inspection" />
              <KpiCard label="Anomalies detected"  value={kpis.totalFindings} sub={`${kpis.anomalyRate}% of segments`} color="var(--warn)" />
              <KpiCard label="Critical"            value={kpis.critical}      sub="score ≥ 83"         color="var(--critical)" />
              <KpiCard label="High severity"       value={kpis.high}          sub="score ≥ 65"         color="#fbbf24" />
              <KpiCard label="Avg risk score"      value={kpis.avgScore}      sub="anomalous segments" color={kpis.avgScore >= 83 ? "var(--critical)" : "#fbbf24"} />
              <KpiCard label="People on site"      value={kpis.peopleCount}   sub={`of ${kpis.totalFindings} findings`} color="#60a5fa" />
            </div>

            {/* ── Timeline + Distribution ── */}
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2.2fr) minmax(0,1fr)", gap: 12 }}>
              <Card title="Risk score timeline" tag="ALL 12 SEGMENTS"
                sub="Composite risk score per 30-second chunk — dots mark detected anomalies">
                <TimelineChart chunks={chunks} />
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                  {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((lv) => (
                    <span key={lv} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, color: "var(--text-muted)" }}>
                      <span style={{ width: 9, height: 9, borderRadius: 2, background: RISK_COLOR[lv], display: "inline-block" }} />
                      {lv}
                    </span>
                  ))}
                </div>
              </Card>

              <Card title="Risk distribution" tag="7 ANOMALIES"
                sub="Breakdown by classification — score ≥ 83 CRITICAL, ≥ 65 HIGH">
                <RiskDistribution findings={findings} />
              </Card>
            </div>

            {/* ── Sensor sparklines ── */}
            <Card title="Sensor telemetry" tag="ACROSS 7 FINDINGS · SORTED BY TIME"
              sub="Real-time readings at each anomaly — dashed lines show PHMSA/NERC alert and critical thresholds">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                <SensorSparkline
                  data={sensorSeries.methane} label="Methane" unit="ppm" color="#22d3ee"
                  alertLine={4} critLine={8} minVal={0} maxVal={12}
                />
                <SensorSparkline
                  data={sensorSeries.temp} label="Temp Δ" unit="°C" color="#f97316"
                  alertLine={5} critLine={10} minVal={0} maxVal={20}
                />
                <SensorSparkline
                  data={sensorSeries.pressure} label="Pressure" unit="PSI" color="#a78bfa"
                  alertLine={840} critLine={830} minVal={810} maxVal={870} invertAlert
                />
              </div>
            </Card>

            {/* ── Anomaly types + Presence + Violations ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              <Card title="Anomaly type breakdown" tag="MARENGO + PEGASUS">
                <AnomalyTypeChart findings={findings} />
              </Card>
              <Card title="Field presence" tag="SITE CONDITIONS">
                <PresenceMatrix findings={findings} />
              </Card>
              <Card title="Regulatory violations" tag="PHMSA · NERC">
                <ViolationsBreakdown findings={findings} />
              </Card>
            </div>

            {/* ── Segment heatmap ── */}
            <Card title="Segment heatmap" tag="12 CHUNKS · HOVER FOR DETAIL"
              sub="Each cell is a 30-second segment — number is chunk index, value is risk score">
              <SegmentHeatmap chunks={chunks} />
            </Card>

            {/* ── Full findings table ── */}
            <Card title="Findings matrix" tag={`${findings.length} RECORDS · SORTED BY RISK SCORE`}
              sub="Full sensor readings and classification for all detected anomalies — ⚠ marks regulatory threshold exceedances">
              <FindingsTable findings={findings} />
            </Card>

            {/* ── Footer ── */}
            <div style={{
              display: "flex", justifyContent: "space-between",
              fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)", paddingTop: 4,
            }}>
              <span>TwelveLabs Pegasus 1.2 · Marengo 3.0 · TX-447 St. Louis · 8m 34s</span>
              <span>AWS Bedrock · PHMSA Part 192/195 · NERC FAC-003</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
