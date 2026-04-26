import { useMemo } from "react";

type Row = Record<string, unknown>;

function num(v: unknown, d = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : d;
}

function shortLabel(s: string, max = 14): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Stacked horizontal bar: severity mix across fleet */
function SeverityMixChart({ crit, maint, other }: { crit: number; maint: number; other: number }) {
  const t = Math.max(1, crit + maint + other);
  const wC = (crit / t) * 100;
  const wM = (maint / t) * 100;
  const wO = (other / t) * 100;
  return (
    <div className="soc-chart soc-chart--severity">
      <div className="soc-chart-title">Severity mix</div>
      <div className="soc-chart-sub">Fleet distribution · {t} assets</div>
      <div className="soc-severity-stack" role="img" aria-label={`Critical ${crit}, maintenance ${maint}, other ${other}`}>
        {wC > 0 ? <span className="soc-severity-stack__crit" style={{ width: `${wC}%` }} title={`Critical ${crit}`} /> : null}
        {wM > 0 ? <span className="soc-severity-stack__maint" style={{ width: `${wM}%` }} title={`Maintenance ${maint}`} /> : null}
        {wO > 0 ? <span className="soc-severity-stack__other" style={{ width: `${wO}%` }} title={`Other ${other}`} /> : null}
      </div>
      <ul className="soc-chart-legend">
        <li>
          <span className="soc-dot soc-dot--crit" /> Critical <strong>{crit}</strong>
        </li>
        <li>
          <span className="soc-dot soc-dot--maint" /> Maintenance <strong>{maint}</strong>
        </li>
        <li>
          <span className="soc-dot soc-dot--other" /> Other <strong>{other}</strong>
        </li>
      </ul>
    </div>
  );
}

/** Top N assets by blended risk (visual + quantum) */
function TopRiskBars({ rows }: { rows: Row[] }) {
  const items = useMemo(() => {
    const scored = rows.map((r) => {
      const id = String(r.id ?? r.asset_name);
      const label = String(r.asset_name ?? id);
      const fusion = (num(r.visual_damage_score) + num(r.quantum_risk_index)) / 2;
      return { id, label, fusion };
    });
    scored.sort((a, b) => b.fusion - a.fusion);
    return scored.slice(0, 8);
  }, [rows]);
  const max = Math.max(0.08, ...items.map((i) => i.fusion));
  return (
    <div className="soc-chart">
      <div className="soc-chart-title">Top risk (fusion)</div>
      <div className="soc-chart-sub">Visual + quantum blend · top 8</div>
      <div className="soc-hbar-list">
        {items.map((it) => (
          <div key={it.id} className="soc-hbar-row">
            <span className="soc-hbar-label" title={it.label}>
              {shortLabel(it.label, 18)}
            </span>
            <div className="soc-hbar-track">
              <span className="soc-hbar-fill" style={{ width: `${(it.fusion / max) * 100}%` }} />
            </div>
            <span className="soc-hbar-val soc-mono">{(it.fusion * 100).toFixed(0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Dual metric trend across roster order */
function FleetTrendChart({ rows }: { rows: Row[] }) {
  const { ptsQ, ptsV, w, h } = useMemo(() => {
    const w = 420;
    const h = 140;
    const pad = 28;
    const innerW = w - pad * 2;
    const innerH = h - pad * 2;
    const n = Math.max(1, rows.length - 1);
    const q = rows.map((r) => num(r.quantum_risk_index));
    const v = rows.map((r) => num(r.visual_damage_score));
    const maxQ = Math.max(0.05, ...q);
    const maxV = Math.max(0.05, ...v);
    const toX = (i: number) => pad + (i / n) * innerW;
    const toYq = (val: number) => pad + innerH - (val / maxQ) * innerH;
    const toYv = (val: number) => pad + innerH - (val / maxV) * innerH;
    const ptsQ = q.map((val, i) => `${toX(i).toFixed(1)},${toYq(val).toFixed(1)}`).join(" ");
    const ptsV = v.map((val, i) => `${toX(i).toFixed(1)},${toYv(val).toFixed(1)}`).join(" ");
    return { ptsQ, ptsV, w, h };
  }, [rows]);
  return (
    <div className="soc-chart">
      <div className="soc-chart-title">Fleet trend</div>
      <div className="soc-chart-sub">Quantum index vs visual damage · roster order</div>
      <svg className="soc-line-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
        <rect x="0" y="0" width={w} height={h} fill="transparent" />
        <polyline fill="none" stroke="rgba(56, 189, 248, 0.9)" strokeWidth="2" points={ptsQ} />
        <polyline fill="none" stroke="rgba(251, 191, 36, 0.95)" strokeWidth="2" points={ptsV} />
      </svg>
      <div className="soc-chart-legend soc-chart-legend--inline">
        <span>
          <span className="soc-line-key soc-line-key--q" /> Quantum
        </span>
        <span>
          <span className="soc-line-key soc-line-key--v" /> Visual
        </span>
      </div>
    </div>
  );
}

/** Count Marengo top-match labels */
function MarengoVolumeChart({ rows }: { rows: Row[] }) {
  const buckets = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const t = String(r.marengo_top_match || "").trim();
      if (!t) continue;
      m.set(t, (m.get(t) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [rows]);
  const max = Math.max(1, ...buckets.map(([, c]) => c));
  const vbH = 160;
  const barW = 36;
  const gap = 14;
  const chartW = Math.max(280, buckets.length * (barW + gap) + 24);
  return (
    <div className="soc-chart">
      <div className="soc-chart-title">Marengo match volume</div>
      <div className="soc-chart-sub">Top labels in bundle</div>
      <svg className="soc-vbar-svg" viewBox={`0 0 ${chartW} ${vbH}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
        {buckets.map(([label, c], i) => {
          const x = 20 + i * (barW + gap);
          const bh = (c / max) * (vbH - 48);
          const y = vbH - 32 - bh;
          return (
            <g key={label}>
              <rect x={x} y={y} width={barW} height={bh} rx={4} className="soc-vbar-rect" />
              <text x={x + barW / 2} y={vbH - 12} textAnchor="middle" className="soc-vbar-label">
                {shortLabel(label, 10)}
              </text>
              <text x={x + barW / 2} y={y - 6} textAnchor="middle" className="soc-vbar-count">
                {c}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function DashboardCharts({ rows }: { rows: Row[] }) {
  const { crit, maint, other } = useMemo(() => {
    let c = 0;
    let m = 0;
    let o = 0;
    for (const r of rows) {
      const s = String(r.severity ?? "").toLowerCase();
      if (s === "critical") c += 1;
      else if (s === "maintenance" || s === "maint") m += 1;
      else o += 1;
    }
    return { crit: c, maint: m, other: o };
  }, [rows]);

  if (!rows.length) return null;

  return (
    <div className="soc-charts-grid">
      <SeverityMixChart crit={crit} maint={maint} other={other} />
      <TopRiskBars rows={rows} />
      <FleetTrendChart rows={rows} />
      <MarengoVolumeChart rows={rows} />
    </div>
  );
}
