import { useCallback, useEffect, useRef, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { InfraWatchLiveMap, type LiveDronePos, type LiveFinding } from "@/components/InfraWatchLiveMap";

type SensorData = {
  methane_ppm: number;
  temp_differential_c: number;
  pressure_psi: number;
};

const RISK = {
  CRITICAL: { color: "#fb7185", bg: "rgba(251,113,133,0.08)", border: "rgba(251,113,133,0.22)" },
  HIGH:     { color: "#fbbf24", bg: "rgba(251,191,36,0.08)",  border: "rgba(251,191,36,0.22)" },
  MEDIUM:   { color: "#f97316", bg: "rgba(249,115,22,0.08)",  border: "rgba(249,115,22,0.22)" },
  LOW:      { color: "#4ade80", bg: "rgba(74,222,128,0.08)",  border: "rgba(74,222,128,0.22)" },
} as const;

function SensorBar({
  label, unit, value, pct, color, threshold, warn,
}: {
  label: string; unit: string; value: string;
  pct: number; color: string; threshold: string; warn?: boolean;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}</span>
        <span style={{ fontSize: 13, fontFamily: "var(--font-mono)", fontWeight: 600, color }}>
          {value}{" "}
          <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 400 }}>{unit}</span>
          {warn && <span style={{ marginLeft: 5, fontSize: 12 }}>⚠</span>}
        </span>
      </div>
      <div style={{ position: "relative", background: "var(--border)", borderRadius: 4, height: 4 }}>
        <div
          style={{
            height: 4, borderRadius: 4,
            width: `${Math.min(Math.max(pct, 0), 100)}%`,
            background: color,
            transition: "width .5s ease, background .3s",
            boxShadow: warn ? `0 0 8px ${color}` : "none",
          }}
        />
      </div>
      <div style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginTop: 3 }}>
        {threshold}
      </div>
    </div>
  );
}

type Props = { embedded?: boolean };

export function StreamPage({ embedded = false }: Props) {
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState("Ready to inspect TX-447");
  const [progress, setProgress] = useState(0);
  const [dronePos, setDronePos] = useState<LiveDronePos | null>(null);
  const [sensor, setSensor] = useState<SensorData>({
    methane_ppm: 1.82,
    temp_differential_c: 1.5,
    pressure_psi: 855,
  });
  const [findings, setFindings] = useState<LiveFinding[]>([]);
  const [summary, setSummary] = useState<{ total_findings: number; critical_count: number } | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const stop = useCallback(() => {
    esRef.current?.close();
    setStreaming(false);
    setStatus("Inspection stopped");
  }, []);

  const start = useCallback(() => {
    esRef.current?.close();
    setFindings([]);
    setProgress(0);
    setSummary(null);
    setDronePos(null);
    setStatus("Initializing inspection…");
    setStreaming(true);

    const es = new EventSource("/stream?speed=1");
    esRef.current = es;

    es.addEventListener("start", (e) => {
      const d = JSON.parse(e.data) as { total_chunks: number };
      setStatus(`Processing ${d.total_chunks} chunks · TX-447 St. Louis corridor`);
    });

    es.addEventListener("position", (e) => {
      const d = JSON.parse(e.data) as { lat: number; lon: number; chunk_index: number };
      setDronePos({ lat: d.lat, lon: d.lon, chunk_index: d.chunk_index });
    });

    es.addEventListener("sensor", (e) => {
      setSensor(JSON.parse(e.data) as SensorData);
    });

    es.addEventListener("chunk_status", (e) => {
      const d = JSON.parse(e.data) as {
        chunk_index: number; chunk_total: number;
        progress_pct: number; timestamp_video: string;
      };
      setProgress(d.progress_pct);
      setStatus(`Analyzing chunk ${d.chunk_index}/${d.chunk_total} — ${d.timestamp_video}`);
    });

    es.addEventListener("finding", (e) => {
      const d = JSON.parse(e.data) as Omit<LiveFinding, "chunk_index">;
      // Derive 1-based chunk_index from finding_id ("chunk_0000"→1, "chunk_0030"→2, …)
      const startSec = parseInt(d.finding_id.replace("chunk_", ""), 10) || 0;
      const chunk_index = startSec / 30 + 1;
      setFindings((prev) =>
        [...prev, { ...d, chunk_index }].sort((a, b) => b.composite_risk_score - a.composite_risk_score),
      );
    });

    es.addEventListener("complete", (e) => {
      const d = JSON.parse(e.data) as { total_findings: number; critical_count: number };
      setSummary({ total_findings: d.total_findings, critical_count: d.critical_count });
      setStatus(`Complete — ${d.total_findings} anomalies, ${d.critical_count} critical`);
      setStreaming(false);
      es.close();
    });

    es.onerror = () => {
      setStatus("Stream ended");
      setStreaming(false);
      es.close();
    };
  }, []);

  useEffect(() => () => esRef.current?.close(), []);

  const methaneHigh = sensor.methane_ppm > 8;
  const methaneWarn = sensor.methane_ppm > 4;
  const tempHigh = sensor.temp_differential_c > 10;
  const tempWarn = sensor.temp_differential_c > 5;
  const pressureLow = sensor.pressure_psi < 830;
  const pressureWarn = sensor.pressure_psi < 840;

  const criticalCount = findings.filter((f) => f.risk_level === "CRITICAL").length;
  const highCount = findings.filter((f) => f.risk_level === "HIGH").length;
  const mediumCount = findings.filter((f) => f.risk_level === "MEDIUM").length;

  return (
    <div
      className={embedded ? "soc-embedded-root" : undefined}
      style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
    >
      {!embedded && (
        <TopBar
          title="Live inspection stream"
          subtitle="InfraWatch · TwelveLabs Pegasus 1.2 + Marengo 3.0 · AWS Bedrock · TX-447 pipeline"
        />
      )}

      <div
        className={`soc-page${embedded ? " soc-page--embedded" : ""}`}
        style={{ flex: 1, display: "flex", gap: 16, overflow: "hidden" }}
      >
        {/* ── Left: map + progress ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
          {/* Control bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              type="button"
              className={streaming ? "soc-btn-outline" : "soc-btn-primary"}
              style={{ flexShrink: 0 }}
              onClick={streaming ? stop : start}
            >
              {streaming ? "⏹ Stop" : "▶ Start Inspection"}
            </button>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                {streaming && (
                  <span style={{ color: "var(--accent)", fontSize: 10, lineHeight: 1 }}>●</span>
                )}
                <span
                  style={{
                    fontSize: 11, color: "var(--text-muted)",
                    fontFamily: "var(--font-mono)", whiteSpace: "nowrap",
                    overflow: "hidden", textOverflow: "ellipsis",
                  }}
                >
                  {status}
                </span>
                <span
                  style={{
                    marginLeft: "auto", fontSize: 11,
                    color: "var(--text-muted)", fontFamily: "var(--font-mono)", flexShrink: 0,
                  }}
                >
                  {progress.toFixed(0)}%
                </span>
              </div>
              <div style={{ background: "var(--border)", borderRadius: 3, height: 3 }}>
                <div
                  style={{
                    height: 3, borderRadius: 3,
                    width: `${progress}%`,
                    background: "linear-gradient(90deg, var(--accent), #60a5fa)",
                    transition: "width .8s cubic-bezier(.4,0,.2,1)",
                    boxShadow: progress > 0 ? "0 0 8px var(--accent)" : "none",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Live map */}
          <div
            style={{
              flex: 1, minHeight: 300, borderRadius: "var(--radius)",
              overflow: "hidden", background: "var(--bg-surface)",
            }}
          >
            <InfraWatchLiveMap dronePos={dronePos} findings={findings} streaming={streaming} />
          </div>

          {/* Completion banner */}
          {summary && (
            <div className="soc-alert soc-alert--ok">
              Inspection complete — <strong>{summary.total_findings}</strong> anomalies detected,{" "}
              <strong>{summary.critical_count}</strong> critical
            </div>
          )}
        </div>

        {/* ── Right: sensors + findings ── */}
        <div
          style={{
            width: 292, flexShrink: 0, display: "flex",
            flexDirection: "column", gap: 12, overflowY: "auto",
          }}
        >
          {/* Stat pills */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
            {[
              { label: "TOTAL",    value: findings.length, color: "var(--text)" },
              { label: "CRITICAL", value: criticalCount,   color: "var(--critical)" },
              { label: "HIGH",     value: highCount,       color: "var(--warn)" },
              { label: "MEDIUM",   value: mediumCount,     color: "#f97316" },
            ].map(({ label, value, color }) => (
              <div key={label} className="soc-kpi" style={{ textAlign: "center", padding: "10px 4px" }}>
                <div className="soc-kpi-value" style={{ color, fontSize: 20, transition: "color .3s" }}>
                  {value}
                </div>
                <div className="soc-kpi-label" style={{ fontSize: 8, letterSpacing: "0.06em" }}>
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* Sensor gauges */}
          <div className="soc-panel" style={{ padding: "14px 16px" }}>
            <div className="soc-panel-head" style={{ marginBottom: 14 }}>
              <span className="soc-panel-title">Live sensors</span>
              <span className="soc-panel-tag">PHMSA · NERC</span>
            </div>
            <SensorBar
              label="Methane"
              unit="ppm"
              value={sensor.methane_ppm.toFixed(2)}
              pct={(sensor.methane_ppm / 12) * 100}
              color={methaneHigh ? "var(--critical)" : methaneWarn ? "var(--warn)" : "var(--accent)"}
              threshold="Alert >4.0 ppm · Critical >8.0 ppm (PHMSA §192)"
              warn={methaneHigh || methaneWarn}
            />
            <SensorBar
              label="Temp differential"
              unit="°C"
              value={`+${sensor.temp_differential_c.toFixed(1)}`}
              pct={(sensor.temp_differential_c / 20) * 100}
              color={tempHigh ? "var(--critical)" : tempWarn ? "var(--warn)" : "var(--accent)"}
              threshold="Alert >5.0°C · Critical >10.0°C (NERC FAC-003)"
              warn={tempHigh || tempWarn}
            />
            <SensorBar
              label="Pipeline pressure"
              unit="PSI"
              value={sensor.pressure_psi.toFixed(0)}
              pct={((sensor.pressure_psi - 810) / (870 - 810)) * 100}
              color={pressureLow ? "var(--critical)" : pressureWarn ? "var(--warn)" : "var(--accent)"}
              threshold="Alert <840 PSI · Critical <830 PSI (PHMSA §195)"
              warn={pressureLow || pressureWarn}
            />
          </div>

          {/* Anomaly log */}
          <div className="soc-panel" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 160 }}>
            <div className="soc-panel-head">
              <span className="soc-panel-title">Anomaly log</span>
              <span className="soc-panel-tag">{findings.length} findings</span>
            </div>
            <div className="soc-panel-body" style={{ flex: 1, overflowY: "auto" }}>
              {findings.length === 0 ? (
                <div className="soc-empty" style={{ border: "none", padding: "1.5rem 0" }}>
                  <p style={{ margin: 0 }}>
                    {streaming ? "Scanning for anomalies…" : "Start inspection to detect anomalies."}
                  </p>
                </div>
              ) : (
                findings.map((f) => {
                  const cfg = RISK[f.risk_level as keyof typeof RISK] ?? RISK.LOW;
                  return (
                    <div
                      key={f.finding_id}
                      style={{
                        marginBottom: 8, padding: "10px 12px",
                        borderRadius: "var(--radius-sm)",
                        border: `1px solid ${cfg.border}`,
                        background: cfg.bg,
                      }}
                    >
                      <div
                        style={{
                          display: "flex", justifyContent: "space-between",
                          alignItems: "center", marginBottom: 4,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span
                            style={{
                              display: "inline-block", width: 7, height: 7,
                              borderRadius: "50%", background: cfg.color,
                              boxShadow: `0 0 5px ${cfg.color}`,
                            }}
                          />
                          <span
                            style={{
                              fontSize: 11, fontWeight: 700, color: cfg.color,
                              fontFamily: "var(--font-mono)",
                            }}
                          >
                            {f.risk_level}
                          </span>
                        </div>
                        <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                          {f.timestamp_video}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text)", marginBottom: 3 }}>
                        {(f.anomaly_type ?? "").replace(/_/g, " ")}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                        Score {f.composite_risk_score}/100
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)",
              display: "flex", justifyContent: "space-between", paddingTop: 4,
            }}
          >
            <span>TwelveLabs Pegasus 1.2 · Marengo 3.0</span>
            <span>AWS Bedrock</span>
          </div>
        </div>
      </div>
    </div>
  );
}
