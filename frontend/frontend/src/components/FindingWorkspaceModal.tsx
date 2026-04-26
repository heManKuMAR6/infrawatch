import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { FindingRowDetail, type PendingSeek } from "@/components/FindingRowDetail";

type Row = Record<string, unknown>;

function num(v: unknown, d = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : d;
}

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
      { label: "Visual", v: v },
      { label: "Posture", v: crit },
      { label: "Hazards", v: hz },
      { label: "Grid σ", v: grid },
    ];
  }, [row]);

  const cx = 90;
  const cy = 88;
  const r = 62;
  const n = axes.length;
  const points = axes
    .map((a, i) => {
      const ang = (-Math.PI / 2 + (i * 2 * Math.PI) / n) as number;
      const rr = r * a.v;
      return `${cx + rr * Math.cos(ang)},${cy + rr * Math.sin(ang)}`;
    })
    .join(" ");

  const ring = axes
    .map((_, i) => {
      const ang = (-Math.PI / 2 + (i * 2 * Math.PI) / n) as number;
      const x = cx + r * Math.cos(ang);
      const y = cy + r * Math.sin(ang);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="soc-ws-radar">
      <div className="soc-chart-title">Asset signal radar</div>
      <div className="soc-chart-sub">Normalized fusion view</div>
      <svg viewBox="0 0 180 176" className="soc-radar-svg" aria-hidden>
        <polygon points={ring} fill="none" stroke="var(--border-strong)" strokeWidth="1" opacity={0.85} />
        {[0.35, 0.65, 1].map((sc) => (
          <polygon
            key={sc}
            points={axes
              .map((_, i) => {
                const ang = (-Math.PI / 2 + (i * 2 * Math.PI) / n) as number;
                const rr = r * sc;
                return `${cx + rr * Math.cos(ang)},${cy + rr * Math.sin(ang)}`;
              })
              .join(" ")}
            fill="none"
            stroke="var(--border)"
            strokeWidth="0.5"
            opacity={0.5}
          />
        ))}
        {axes.map((a, i) => {
          const ang = (-Math.PI / 2 + (i * 2 * Math.PI) / n) as number;
          const x = cx + r * Math.cos(ang);
          const y = cy + r * Math.sin(ang);
          return (
            <g key={a.label}>
              <line x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border)" strokeWidth="0.5" opacity={0.6} />
              <text
                x={cx + (r + 14) * Math.cos(ang)}
                y={cy + (r + 14) * Math.sin(ang)}
                textAnchor="middle"
                dominantBaseline="middle"
                className="soc-radar-axis-label"
              >
                {a.label}
              </text>
            </g>
          );
        })}
        <polygon points={points} fill="rgba(56, 189, 248, 0.22)" stroke="var(--accent)" strokeWidth="1.5" />
      </svg>
      <ul className="soc-ws-metric-list">
        {axes.map((a) => (
          <li key={a.label}>
            <span className="soc-ws-metric-name">{a.label}</span>
            <span className="soc-ws-metric-bar-wrap" aria-hidden>
              <span className="soc-ws-metric-bar-fill" style={{ width: `${Math.round(a.v * 100)}%` }} />
            </span>
            <span className="soc-mono soc-ws-metric-pct">{(a.v * 100).toFixed(0)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || !row || !rowId) return null;

  const title = String(row.asset_name ?? rowId);
  const sev = String(row.severity ?? "—").toUpperCase();
  const queries = row.marengo_queries;
  const qList = Array.isArray(queries) ? queries.map(String) : [];
  const eia = row.eia_fuel_context != null ? String(row.eia_fuel_context) : null;

  const tree = (
    <div className="soc-ws-overlay" role="dialog" aria-modal="true" aria-labelledby="soc-ws-title">
      <button type="button" className="soc-ws-backdrop" aria-label="Close workspace" onClick={onClose} />
      <div className="soc-ws-panel soc-ws-panel--fullscreen">
        <header className="soc-ws-header">
          <div>
            <div className="soc-ws-kicker">Finding workspace</div>
            <h2 id="soc-ws-title" className="soc-ws-title">
              {title}
            </h2>
            <div className="soc-ws-meta">
              <span className={`soc-ws-sev ${sev === "CRITICAL" ? "soc-ws-sev--crit" : ""}`}>{sev}</span>
              <span className="soc-mono">ID {rowId}</span>
              <span className="soc-mono">
                {num(row.lat).toFixed(4)}, {num(row.lon).toFixed(4)}
              </span>
              {row.video_file ? <span className="soc-mono">CLIP {String(row.video_file)}</span> : null}
            </div>
          </div>
          <button ref={closeRef} type="button" className="soc-ws-close soc-btn-outline" onClick={onClose}>
            Close · Esc
          </button>
        </header>

        <div className="soc-ws-body">
          <section className="soc-ws-main">
            <FindingRowDetail variant="workspace" row={row} rowId={rowId} pendingSeek={pendingSeek} onConsumedSeek={onConsumedSeek} />
          </section>
          <aside className="soc-ws-aside">
            <AssetRadar row={row} />
            <div className="soc-ws-card">
              <div className="soc-chart-title">Model-predicted focus</div>
              <div className="soc-ws-priors-sub">Pegasus hazards + primary visual match (from bundle)</div>
              {qList.length ? (
                <div className="soc-ws-chips">
                  {qList.map((q) => (
                    <span key={q} className="soc-ws-chip">
                      {q}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="soc-ws-muted">No model-derived focus terms on this row.</p>
              )}
            </div>
            {eia ? (
              <div className="soc-ws-card">
                <div className="soc-chart-title">EIA / market context</div>
                <p className="soc-ws-eia">{eia}</p>
              </div>
            ) : null}
            <div className="soc-ws-card">
              <div className="soc-chart-title">Operator notes</div>
              <p className="soc-ws-muted">
                {
                  "Use timeline bands and chips to scrub evidence. Focus terms come from Pegasus outputs and the row's primary visual match, not from a hand-authored probe list."
                }
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );

  return createPortal(tree, document.body);
}
