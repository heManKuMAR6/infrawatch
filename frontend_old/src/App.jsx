import { useState, useEffect, useRef, useCallback } from "react"
import { MapContainer, TileLayer, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

const API = "http://localhost:8000"

const ROUTE = [
  [38.6089, -90.1876],[38.6094, -90.1862],[38.6100, -90.1848],
  [38.6103, -90.1835],[38.6108, -90.1821],[38.6120, -90.1790],
  [38.6134, -90.1743],[38.6155, -90.1780],[38.6180, -90.1820],
  [38.6198, -90.2050],[38.6210, -90.2150],[38.6220, -90.2200],
  [38.6241, -90.2118],[38.6280, -90.2200],[38.6334, -90.2380],
  [38.6334, -90.2456],[38.6378, -90.2341],[38.6350, -90.2200],
  [38.6340, -90.2100],[38.6340, -90.2000],[38.6380, -90.1900],
  [38.6420, -90.1780],[38.6445, -90.1654],[38.6470, -90.1590],
  [38.6489, -90.1532],[38.6512, -90.2400],[38.6512, -90.2789],
  [38.6400, -90.2700],[38.6200, -90.2500],[38.6100, -90.2300],
  [38.6023, -90.2123],[38.6050, -90.2000],[38.6089, -90.1876],
]

const RISK_CONFIG = {
  CRITICAL: { color: "#FF3B30", glow: "#FF3B3088", size: 16, pulse: true },
  HIGH:     { color: "#FF9500", glow: "#FF950088", size: 13, pulse: true },
  MEDIUM:   { color: "#FFD60A", glow: "#FFD60A88", size: 10, pulse: false },
  LOW:      { color: "#30D158", glow: "#30D15888", size:  8, pulse: false },
}

function lerp(a, b, t) { return a + (b - a) * t }
function lerpLatLng(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)] }

function getClosestRoutePoint(lat, lon) {
  let best = 0, bestDist = Infinity
  ROUTE.forEach(([rlat, rlon], i) => {
    const d = Math.hypot(rlat - lat, rlon - lon)
    if (d < bestDist) { bestDist = d; best = i }
  })
  return best
}

function MapController({ dronePos, findings, routeProgress }) {
  const map = useMap()
  const droneRef = useRef(null)
  const trailRef = useRef([])
  const findingMarkersRef = useRef([])
  const routeRef = useRef(null)
  const prevDronePos = useRef(null)
  const animFrameRef = useRef(null)

  useEffect(() => {
    // Draw route
    if (!routeRef.current) {
      routeRef.current = L.polyline(ROUTE, {
        color: "#1C6EF2",
        weight: 2.5,
        opacity: 0.35,
        dashArray: "8 6",
        lineCap: "round"
      }).addTo(map)
    }

    // Drone icon
    const droneIconHtml = `
      <div style="position:relative;width:28px;height:28px">
        <div style="position:absolute;inset:0;border-radius:50%;background:rgba(28,110,242,0.15);animation:droneRing 1.5s ease-out infinite"></div>
        <div style="position:absolute;inset:4px;border-radius:50%;background:#1C6EF2;border:2px solid white;box-shadow:0 2px 12px rgba(28,110,242,0.6)"></div>
        <div style="position:absolute;inset:9px;border-radius:50%;background:white;opacity:0.9"></div>
      </div>`

    if (!droneRef.current) {
      const icon = L.divIcon({ html: droneIconHtml, iconSize: [28, 28], iconAnchor: [14, 14], className: "" })
      droneRef.current = L.marker(ROUTE[0], { icon, zIndexOffset: 1000 }).addTo(map)
    }
  }, [map])

  // Smooth drone animation
  useEffect(() => {
    if (!dronePos || !droneRef.current) return

    const target = [dronePos.lat, dronePos.lon]
    const current = prevDronePos.current || target
    prevDronePos.current = target

    let start = null
    const duration = 1800

    function animate(ts) {
      if (!start) start = ts
      const t = Math.min((ts - start) / duration, 1)
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
      const pos = lerpLatLng(current, target, ease)
      droneRef.current?.setLatLng(pos)

      // Update trail
      trailRef.current.push(pos)
      if (trailRef.current.length > 40) trailRef.current.shift()

      if (t < 1) animFrameRef.current = requestAnimationFrame(animate)
    }

    cancelAnimationFrame(animFrameRef.current)
    animFrameRef.current = requestAnimationFrame(animate)
  }, [dronePos])

  // Add finding markers with animation
  useEffect(() => {
    if (!findings.length) {
      findingMarkersRef.current.forEach(m => map.removeLayer(m))
      findingMarkersRef.current = []
      return
    }

    const existing = findingMarkersRef.current.length
    findings.slice(existing).forEach(f => {
      const cfg = RISK_CONFIG[f.risk_level] || RISK_CONFIG.LOW
      const s = cfg.size
      const pulseHtml = cfg.pulse ? `
        <div style="position:absolute;inset:-6px;border-radius:50%;
          border:2px solid ${cfg.color};opacity:0.6;
          animation:findingPulse 2s ease-out infinite"></div>` : ""

      const html = `
        <div style="position:relative;width:${s*2}px;height:${s*2}px;cursor:pointer">
          ${pulseHtml}
          <div style="position:absolute;inset:0;border-radius:50%;
            background:${cfg.color};
            box-shadow:0 0 ${s}px ${cfg.glow}, 0 2px 8px rgba(0,0,0,0.3);
            border:2px solid rgba(255,255,255,0.8);
            animation:findingAppear 0.4s cubic-bezier(0.34,1.56,0.64,1)"></div>
        </div>`

      const icon = L.divIcon({ html, iconSize: [s*2, s*2], iconAnchor: [s, s], className: "" })
      const marker = L.marker([f.lat, f.lon], { icon })
        .addTo(map)
        .bindPopup(`
          <div style="font-family:system-ui;min-width:200px">
            <div style="font-weight:600;color:${cfg.color};font-size:13px;margin-bottom:6px">
              ${f.risk_level} — ${f.anomaly_type?.replace(/_/g, " ").toUpperCase()}
            </div>
            <div style="font-size:12px;color:#333;line-height:1.5">
              <b>Score:</b> ${f.composite_risk_score}/100<br>
              <b>Methane:</b> ${f.sensor?.methane_ppm?.toFixed(2)} ppm<br>
              <b>Temp:</b> +${f.sensor?.temp_differential_c?.toFixed(1)}°C<br>
              <b>Time:</b> ${f.timestamp_video}
            </div>
            ${f.regulatory_violations?.length ? `
              <div style="margin-top:6px;padding:4px 6px;background:#FFEBEB;border-radius:4px;font-size:11px;color:#C0392B">
                ⚠️ ${f.regulatory_violations[0]}
              </div>` : ""}
          </div>
        `, { maxWidth: 240 })
      findingMarkersRef.current.push(marker)
    })
  }, [findings, map])

  return null
}

export default function App() {
  const [findings, setFindings] = useState([])
  const [dronePos, setDronePos] = useState(null)
  const [sensor, setSensor] = useState({ methane_ppm: 1.82, temp_differential_c: 1.5, pressure_psi: 855 })
  const [status, setStatus] = useState("Ready to inspect")
  const [progress, setProgress] = useState(0)
  const [currentChunk, setCurrentChunk] = useState(null)
  const [streaming, setStreaming] = useState(false)
  const [routeProgress, setRouteProgress] = useState(0)
  const eventSource = useRef(null)

  function startStream() {
    if (eventSource.current) eventSource.current.close()
    setFindings([])
    setProgress(0)
    setStatus("Initializing inspection...")
    setStreaming(true)

    const es = new EventSource(`${API}/stream?speed=2`)
    eventSource.current = es

    es.addEventListener("start", e => {
      const d = JSON.parse(e.data)
      setStatus(`Processing ${d.total_chunks} chunks across 11.3 min flight`)
    })
    es.addEventListener("position", e => {
      const d = JSON.parse(e.data)
      setDronePos(d)
      setRouteProgress(d.chunk_index)
    })
    es.addEventListener("sensor", e => setSensor(JSON.parse(e.data)))
    es.addEventListener("chunk_status", e => {
      const d = JSON.parse(e.data)
      setProgress(d.progress_pct)
      setCurrentChunk(d)
      setStatus(`Analyzing: ${d.original_video?.replace(".mp4", "")} — ${d.timestamp_video}`)
    })
    es.addEventListener("finding", e => {
      const d = JSON.parse(e.data)
      setFindings(prev => [...prev, d].sort((a, b) => b.composite_risk_score - a.composite_risk_score))
    })
    es.addEventListener("complete", e => {
      const d = JSON.parse(e.data)
      setStatus(`Inspection complete — ${d.total_findings} anomalies, ${d.critical_count} critical`)
      setStreaming(false)
      es.close()
    })
    es.onerror = () => { setStatus("Stream ended"); setStreaming(false); es.close() }
  }

  function stopStream() {
    eventSource.current?.close()
    setStreaming(false)
    setStatus("Inspection stopped")
  }

  const critical = findings.filter(f => f.risk_level === "CRITICAL").length
  const methaneHigh = sensor.methane_ppm > 8
  const methaneWarn = sensor.methane_ppm > 4
  const tempHigh = sensor.temp_differential_c > 10
  const pressureLow = sensor.pressure_psi < 830

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0A0E1A; color: #E8EAF0; font-family: 'Syne', sans-serif; }
        @keyframes droneRing { 0%{transform:scale(1);opacity:.6} 100%{transform:scale(2.5);opacity:0} }
        @keyframes findingPulse { 0%{transform:scale(1);opacity:.8} 100%{transform:scale(2.2);opacity:0} }
        @keyframes findingAppear { 0%{transform:scale(0);opacity:0} 100%{transform:scale(1);opacity:1} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes slideIn { from{transform:translateX(20px);opacity:0} to{transform:translateX(0);opacity:1} }
        @keyframes scanLine { 0%{top:0} 100%{top:100%} }
        .finding-item { animation: slideIn 0.4s cubic-bezier(0.34,1.56,0.64,1); }
        .leaflet-container { background: #1a2035 !important; }
        .leaflet-popup-content-wrapper { background: rgba(10,14,26,0.95) !important; border: 1px solid rgba(255,255,255,0.1) !important; border-radius: 10px !important; backdrop-filter: blur(20px); }
        .leaflet-popup-content { color: #E8EAF0 !important; }
        .leaflet-popup-tip { background: rgba(10,14,26,0.95) !important; }
        .leaflet-control-zoom a { background: rgba(10,14,26,0.9) !important; color: #E8EAF0 !important; border-color: rgba(255,255,255,0.1) !important; }
      `}</style>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", height: "100vh", overflow: "hidden" }}>

        {/* MAP SIDE */}
        <div style={{ position: "relative" }}>
          <MapContainer
            center={[38.627, -90.200]}
            zoom={12}
            style={{ width: "100%", height: "100%" }}
            scrollWheelZoom={true}
            zoomControl={true}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution="© OpenStreetMap © CARTO"
            />
            <MapController dronePos={dronePos} findings={findings} routeProgress={routeProgress} />
          </MapContainer>

          {/* Map overlays */}
          <div style={{
            position: "absolute", top: 16, left: 16, zIndex: 1000,
            background: "rgba(10,14,26,0.85)", backdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12,
            padding: "12px 16px"
          }}>
            <div style={{ fontSize: 11, color: "#666", fontFamily: "DM Mono", letterSpacing: 2, marginBottom: 4 }}>PIPELINE SEGMENT</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>TX-447 — St. Louis Region</div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>NGA Campus Corridor · 11.3 min flight</div>
          </div>

          {/* Progress bar */}
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 1000,
            background: "rgba(10,14,26,0.9)", backdropFilter: "blur(20px)",
            borderTop: "1px solid rgba(255,255,255,0.06)", padding: "12px 20px"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontFamily: "DM Mono", color: "#666" }}>
                {streaming && <span style={{ color: "#1C6EF2", animation: "pulse 1s infinite", marginRight: 8 }}>●</span>}
                {status}
              </span>
              <span style={{ fontSize: 11, fontFamily: "DM Mono", color: "#444" }}>{progress.toFixed(0)}%</span>
            </div>
            <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 4, height: 3 }}>
              <div style={{
                background: "linear-gradient(90deg, #1C6EF2, #00C8FF)",
                height: 3, borderRadius: 4,
                width: `${progress}%`,
                transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)",
                boxShadow: "0 0 12px #1C6EF2"
              }} />
            </div>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div style={{
          background: "#0D1220",
          borderLeft: "1px solid rgba(255,255,255,0.06)",
          display: "flex", flexDirection: "column",
          overflow: "hidden"
        }}>

          {/* Header */}
          <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <div style={{ fontSize: 20 }}>🛢️</div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.5 }}>InfraWatch</div>
                <div style={{ fontSize: 10, color: "#666", fontFamily: "DM Mono", letterSpacing: 1 }}>LIVE INSPECTION SYSTEM</div>
              </div>
            </div>
            <button
              onClick={streaming ? stopStream : startStream}
              style={{
                width: "100%", marginTop: 12,
                padding: "11px 0", borderRadius: 10, border: "none",
                cursor: "pointer", fontFamily: "Syne", fontWeight: 600,
                fontSize: 13, letterSpacing: 0.5,
                background: streaming
                  ? "linear-gradient(135deg, #C0392B, #E74C3C)"
                  : "linear-gradient(135deg, #1C6EF2, #0A84FF)",
                color: "white",
                boxShadow: streaming ? "0 4px 20px rgba(231,76,60,0.4)" : "0 4px 20px rgba(28,110,242,0.4)",
                transition: "all 0.3s"
              }}
            >
              {streaming ? "⏹  Stop Inspection" : "▶  Start Inspection"}
            </button>
          </div>

          {/* Sensor gauges */}
          <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: 10, color: "#555", fontFamily: "DM Mono", letterSpacing: 2, marginBottom: 12 }}>LIVE SENSORS</div>
            <SensorGauge
              label="Methane" unit="ppm"
              value={sensor.methane_ppm?.toFixed(2)}
              max={12} current={sensor.methane_ppm}
              alert={methaneHigh} warn={methaneWarn}
              threshold={4.0} thresholdLabel="PHMSA alert: 4.0"
            />
            <SensorGauge
              label="Temp Differential" unit="°C"
              value={`+${sensor.temp_differential_c?.toFixed(1)}`}
              max={20} current={sensor.temp_differential_c}
              alert={tempHigh} warn={!tempHigh && sensor.temp_differential_c > 5}
              threshold={5} thresholdLabel="NERC alert: 5.0"
            />
            <SensorGauge
              label="Pressure" unit="PSI"
              value={sensor.pressure_psi?.toFixed(0)}
              max={870} current={sensor.pressure_psi}
              invert min={810}
              alert={pressureLow} warn={!pressureLow && sensor.pressure_psi < 845}
              threshold={840} thresholdLabel="PHMSA alert: 840"
            />
          </div>

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: "rgba(255,255,255,0.04)" }}>
            {[
              { label: "Total", value: findings.length, color: "#E8EAF0" },
              { label: "Critical", value: critical, color: "#FF3B30" },
              { label: "Medium", value: findings.filter(f => f.risk_level === "MEDIUM").length, color: "#FFD60A" },
              { label: "Low", value: findings.filter(f => f.risk_level === "LOW").length, color: "#30D158" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: "#0D1220", padding: "14px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color, transition: "all 0.3s" }}>{value}</div>
                <div style={{ fontSize: 10, color: "#555", fontFamily: "DM Mono", marginTop: 2 }}>{label.toUpperCase()}</div>
              </div>
            ))}
          </div>

          {/* Findings list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
            <div style={{ fontSize: 10, color: "#555", fontFamily: "DM Mono", letterSpacing: 2, marginBottom: 12 }}>ANOMALY LOG</div>
            {findings.length === 0 && (
              <div style={{ color: "#444", fontSize: 12, textAlign: "center", paddingTop: 20, fontFamily: "DM Mono" }}>
                — awaiting inspection —
              </div>
            )}
            {findings.map((f, i) => {
              const cfg = RISK_CONFIG[f.risk_level] || RISK_CONFIG.LOW
              return (
                <div key={i} className="finding-item" style={{
                  marginBottom: 8, padding: "10px 12px",
                  borderRadius: 10, border: `1px solid ${cfg.color}30`,
                  background: `${cfg.color}10`,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.color, boxShadow: `0 0 6px ${cfg.color}` }} />
                      <span style={{ fontSize: 11, fontWeight: 600, color: cfg.color, fontFamily: "DM Mono" }}>
                        {f.risk_level}
                      </span>
                    </div>
                    <span style={{ fontSize: 10, color: "#555", fontFamily: "DM Mono" }}>{f.timestamp_video}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#AAB0C0", marginBottom: 3 }}>
                    {f.anomaly_type?.replace(/_/g, " ")}
                  </div>
                  <div style={{ fontSize: 10, color: "#666", lineHeight: 1.4 }}>
                    {f.description?.slice(0, 90)}...
                  </div>
                  {f.regulatory_violations?.length > 0 && (
                    <div style={{ marginTop: 6, fontSize: 10, color: "#FF3B30", fontFamily: "DM Mono" }}>
                      ⚠ {f.regulatory_violations[0]?.slice(0, 50)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "10px 20px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            fontSize: 10, color: "#444", fontFamily: "DM Mono",
            display: "flex", justifyContent: "space-between"
          }}>
            <span>TwelveLabs Pegasus 1.2 · Marengo 3.0</span>
            <span>AWS Bedrock</span>
          </div>
        </div>
      </div>
    </>
  )
}

function SensorGauge({ label, unit, value, max, min = 0, current, alert, warn, threshold, thresholdLabel, invert }) {
  const pct = invert
    ? ((current - min) / (max - min)) * 100
    : (current / max) * 100
  const color = alert ? "#FF3B30" : warn ? "#FF9500" : "#1C6EF2"
  const thresholdPct = invert
    ? ((threshold - min) / (max - min)) * 100
    : (threshold / max) * 100

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: "#888" }}>{label}</span>
        <span style={{ fontSize: 13, fontFamily: "DM Mono", fontWeight: 500, color }}>
          {value} <span style={{ fontSize: 10, color: "#555" }}>{unit}</span>
          {alert && <span style={{ marginLeft: 4, animation: "pulse 0.8s infinite" }}>🔴</span>}
          {warn && !alert && <span style={{ marginLeft: 4 }}>🟡</span>}
        </span>
      </div>
      <div style={{ position: "relative", background: "rgba(255,255,255,0.06)", borderRadius: 4, height: 4 }}>
        <div style={{
          height: 4, borderRadius: 4,
          width: `${Math.min(Math.max(pct, 0), 100)}%`,
          background: alert
            ? "linear-gradient(90deg, #FF3B30, #FF6B6B)"
            : warn
            ? "linear-gradient(90deg, #FF9500, #FFB84D)"
            : "linear-gradient(90deg, #1C6EF2, #00C8FF)",
          transition: "width 0.6s ease, background 0.3s",
          boxShadow: `0 0 8px ${color}66`
        }} />
        <div style={{
          position: "absolute", top: -2, bottom: -2,
          left: `${thresholdPct}%`,
          width: 1, background: "#FF9500", opacity: 0.6
        }} />
      </div>
      <div style={{ fontSize: 9, color: "#444", fontFamily: "DM Mono", marginTop: 3 }}>{thresholdLabel}</div>
    </div>
  )
}
