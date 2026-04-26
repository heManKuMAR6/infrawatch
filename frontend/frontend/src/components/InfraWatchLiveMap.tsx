import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";

// ── 29-point closed patrol loop around TX-447 [lon, lat] ─────────────────────
// Indices 25-28 from the original 33-point route removed (far-south detour)
const ROUTE: [number, number][] = [
  [-90.1876, 38.6089], [-90.1862, 38.6094], [-90.1848, 38.6100],
  [-90.1835, 38.6103], [-90.1821, 38.6108], [-90.1790, 38.6120],
  [-90.1743, 38.6134], [-90.1780, 38.6155], [-90.1820, 38.6180],
  [-90.2050, 38.6198], [-90.2150, 38.6210], [-90.2200, 38.6220],
  [-90.2118, 38.6241], [-90.2200, 38.6280], [-90.2380, 38.6334],
  [-90.2456, 38.6334], [-90.2341, 38.6378], [-90.2200, 38.6350],
  [-90.2100, 38.6340], [-90.2000, 38.6340], [-90.1900, 38.6380],
  [-90.1780, 38.6420], [-90.1654, 38.6445], [-90.1590, 38.6470],
  [-90.1532, 38.6489], [-90.2300, 38.6100],
  [-90.2123, 38.6023], [-90.2000, 38.6050], [-90.1876, 38.6089],
];

// 0-based chunk_index → route waypoint (chunk 0→[0], 1→[3], 2→[6], …, 9→[27])
function chunkToRouteIdx(ci: number): number {
  return Math.min(ci * 3, ROUTE.length - 1);
}

const RISK_COLORS: Record<string, string> = {
  CRITICAL: "#FF3B30",
  HIGH:     "#FF9500",
  MEDIUM:   "#FFD60A",
  LOW:      "#30D158",
};

const RISK_SIZES: Record<string, number> = {
  CRITICAL: 14,
  HIGH:     11,
  MEDIUM:   9,
  LOW:      7,
};

export type LiveFinding = {
  finding_id: string;
  chunk_index: number; // 0-based, derived from finding_id by caller
  lat: number;
  lon: number;
  risk_level: string;
  anomaly_type: string;
  composite_risk_score: number;
  timestamp_video: string;
};

// ── Animation types ───────────────────────────────────────────────────────────

type FindingEntry = {
  id: string;
  routeIdx: number;
  color: string;
  shadowBase: string;
  dotEl: HTMLElement;
  ringEl: HTMLElement | null;
  marker: maplibregl.Marker;
};

type AnimState = {
  rafId: number;
  frameCount: number;
  animStartTs: number | null; // null = not yet started
  lastRoutePos: number;       // last computed floating route position (0..28)
};

const LOOP_DURATION_MS = 360000; // 6 minutes = one full inspection loop
const TRAIL_MAX_PTS    = 400;
const TRAIL_UPD_FRAMES = 3;

// ── Component ─────────────────────────────────────────────────────────────────

export function InfraWatchLiveMap({
  streaming,
  findings,
}: {
  streaming: boolean;
  findings: LiveFinding[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<maplibregl.Map | null>(null);
  const droneRef     = useRef<maplibregl.Marker | null>(null);
  const entriesRef   = useRef<FindingEntry[]>([]);
  const passedRef    = useRef<Set<string>>(new Set());
  const trailRef     = useRef<[number, number][]>([ROUTE[0], ROUTE[0]]);

  const animRef = useRef<AnimState>({
    rafId: 0,
    frameCount: 0,
    animStartTs: null,
    lastRoutePos: 0,
  });

  // ── Mount: create map, layers, drone, start rAF loop ─────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    if (!document.getElementById("iw-anim-style")) {
      const s = document.createElement("style");
      s.id = "iw-anim-style";
      s.textContent = [
        "@keyframes droneRing{0%{transform:scale(1);opacity:.85}100%{transform:scale(2.6);opacity:0}}",
        "@keyframes critPulse{0%,100%{opacity:.9;transform:scale(1)}50%{opacity:.15;transform:scale(1.6)}}",
      ].join("");
      document.head.appendChild(s);
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: [-90.2, 38.627],
      zoom: 11.5,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;

    map.on("load", () => {
      // Route ghost line
      map.addSource("route", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: ROUTE } },
      });
      map.addLayer({
        id: "route-glow",
        type: "line",
        source: "route",
        paint: { "line-color": "#22d3ee", "line-width": 12, "line-opacity": 0.06 },
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#22d3ee", "line-width": 1.5, "line-opacity": 0.3, "line-dasharray": [5, 4] },
      });

      // Fading trail (lineMetrics required for line-gradient)
      map.addSource("trail", {
        type: "geojson",
        lineMetrics: true,
        data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [ROUTE[0], ROUTE[0]] } },
      });
      map.addLayer({
        id: "trail-line",
        type: "line",
        source: "trail",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-width": 3,
          "line-gradient": [
            "interpolate", ["linear"], ["line-progress"],
            0,    "rgba(0,200,255,0)",
            0.45, "rgba(0,200,255,0.3)",
            0.8,  "rgba(0,200,255,0.75)",
            1,    "rgba(0,200,255,1)",
          ] as maplibregl.ExpressionSpecification,
        },
      });

      // Drone marker — SVG quad-rotor with double pulse rings
      const droneEl = document.createElement("div");
      droneEl.style.cssText =
        "position:relative;width:48px;height:48px;display:flex;align-items:center;justify-content:center";
      droneEl.innerHTML = `
        <div style="position:absolute;width:52px;height:52px;border-radius:50%;
          border:2px solid rgba(0,200,255,0.75);
          animation:droneRing 2s ease-out infinite;pointer-events:none"></div>
        <div style="position:absolute;width:40px;height:40px;border-radius:50%;
          border:1.5px solid rgba(0,200,255,0.45);
          animation:droneRing 2s ease-out infinite 0.65s;pointer-events:none"></div>
        <svg width="32" height="32" viewBox="0 0 32 32"
          style="position:relative;z-index:1;filter:drop-shadow(0 0 7px #00C8FF) drop-shadow(0 0 3px #00C8FF)">
          <circle cx="16" cy="16" r="6" fill="#00C8FF" stroke="white" stroke-width="2"/>
          <line x1="16" y1="16" x2="4"  y2="4"  stroke="#00C8FF" stroke-width="2"/>
          <circle cx="4"  cy="4"  r="3" fill="#00C8FF" opacity="0.8"/>
          <line x1="16" y1="16" x2="28" y2="4"  stroke="#00C8FF" stroke-width="2"/>
          <circle cx="28" cy="4"  r="3" fill="#00C8FF" opacity="0.8"/>
          <line x1="16" y1="16" x2="4"  y2="28" stroke="#00C8FF" stroke-width="2"/>
          <circle cx="4"  cy="28" r="3" fill="#00C8FF" opacity="0.8"/>
          <line x1="16" y1="16" x2="28" y2="28" stroke="#00C8FF" stroke-width="2"/>
          <circle cx="28" cy="28" r="3" fill="#00C8FF" opacity="0.8"/>
        </svg>`;

      droneRef.current = new maplibregl.Marker({ element: droneEl, anchor: "center" })
        .setLngLat(ROUTE[0])
        .addTo(map);

      // ── rAF animation loop ───────────────────────────────────────────────
      const anim = animRef.current;

      const tick = (now: number) => {
        const drone = droneRef.current;
        const m     = mapRef.current;
        if (!drone || !m) return;

        let lngLat: [number, number] = ROUTE[0];

        if (anim.animStartTs !== null) {
          const elapsed  = now - anim.animStartTs;
          const fraction = Math.min(elapsed / LOOP_DURATION_MS, 1.0);
          const routePos = fraction * (ROUTE.length - 1); // 0..28
          anim.lastRoutePos = routePos;

          const segIdx = Math.min(Math.floor(routePos), ROUTE.length - 2);
          const interp = routePos - Math.floor(routePos);
          const p0 = ROUTE[segIdx];
          const p1 = ROUTE[segIdx + 1];
          lngLat = [p0[0] + (p1[0] - p0[0]) * interp, p0[1] + (p1[1] - p0[1]) * interp];
        }

        drone.setLngLat(lngLat);

        // Grow trail every N frames
        anim.frameCount++;
        if (anim.frameCount % TRAIL_UPD_FRAMES === 0) {
          const trail = trailRef.current;
          trail.push(lngLat);
          if (trail.length > TRAIL_MAX_PTS) trail.splice(0, trail.length - TRAIL_MAX_PTS);
          const src = m.getSource("trail") as maplibregl.GeoJSONSource | undefined;
          if (src && trail.length >= 2) {
            src.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: trail } });
          }
        }

        // Finding passage: highlight when drone crosses a finding's route waypoint
        const currentRouteIdx = Math.floor(anim.lastRoutePos);
        for (const entry of entriesRef.current) {
          if (!passedRef.current.has(entry.id) && currentRouteIdx >= entry.routeIdx) {
            passedRef.current.add(entry.id);
            entry.dotEl.style.boxShadow = `0 0 28px ${entry.color}, 0 0 10px white`;
            entry.dotEl.style.transform = "scale(1.5)";
            if (entry.ringEl) entry.ringEl.style.animationDuration = "0.45s";
            setTimeout(() => {
              entry.dotEl.style.boxShadow = entry.shadowBase;
              entry.dotEl.style.transform = "";
              if (entry.ringEl) entry.ringEl.style.animationDuration = "1.6s";
            }, 3000);
          }
        }

        anim.rafId = requestAnimationFrame(tick);
      };

      anim.rafId = requestAnimationFrame(tick);
    });

    return () => {
      cancelAnimationFrame(animRef.current.rafId);
      entriesRef.current.forEach((e) => e.marker.remove());
      entriesRef.current = [];
      passedRef.current.clear();
      trailRef.current = [ROUTE[0], ROUTE[0]];
      droneRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ── streaming → start clock-based loop ───────────────────────────────────
  useEffect(() => {
    const anim = animRef.current;
    if (streaming) {
      anim.animStartTs  = performance.now();
      anim.lastRoutePos = 0;
      trailRef.current  = [ROUTE[0], ROUTE[0]];
      passedRef.current.clear();
      // Clear finding entries so they re-register passage triggers on restart
      entriesRef.current.forEach((e) => e.marker.remove());
      entriesRef.current = [];
    }
  }, [streaming]);

  // ── New findings → place markers snapped to route ────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const addMarkers = () => {
      const existing = entriesRef.current.length;
      findings.slice(existing).forEach((f) => {
        const risk     = (f.risk_level ?? "LOW").toUpperCase();
        const color    = RISK_COLORS[risk] ?? "#30D158";
        const size     = RISK_SIZES[risk] ?? 7;
        const isCrit   = risk === "CRITICAL";
        const routeIdx = chunkToRouteIdx(f.chunk_index);
        const snapped  = ROUTE[routeIdx];

        const wrap = document.createElement("div");
        wrap.style.cssText =
          "position:relative;display:flex;align-items:center;justify-content:center;cursor:pointer";
        wrap.style.width  = `${size + 24}px`;
        wrap.style.height = `${size + 24}px`;

        let ringEl: HTMLElement | null = null;
        if (isCrit) {
          ringEl = document.createElement("div");
          ringEl.style.cssText = [
            `width:${size + 16}px`, `height:${size + 16}px`,
            "border-radius:50%",
            `border:2.5px solid ${color}`,
            "position:absolute",
            "animation:critPulse 1.6s ease-in-out infinite",
            "pointer-events:none",
          ].join(";");
          wrap.appendChild(ringEl);
        }

        const shadowBase = `0 0 ${isCrit ? 18 : 8}px ${color}`;
        const dotEl = document.createElement("div");
        dotEl.style.cssText = [
          `width:${size}px`, `height:${size}px`,
          "border-radius:50%",
          `background:${color}`,
          `border:${isCrit ? "2.5" : "1.5"}px solid rgba(255,255,255,${isCrit ? "0.95" : "0.8"})`,
          `box-shadow:${shadowBase}`,
          "position:relative",
          "transition:box-shadow .25s, transform .25s",
        ].join(";");
        wrap.appendChild(dotEl);

        const marker = new maplibregl.Marker({ element: wrap, anchor: "center" })
          .setLngLat(snapped)
          .setPopup(
            new maplibregl.Popup({ maxWidth: "220px", closeButton: false }).setHTML(`
              <div style="font-family:system-ui;font-size:12px;line-height:1.6;padding:2px 0">
                <strong style="color:${color}">${f.risk_level}</strong>
                &nbsp;—&nbsp;${(f.anomaly_type ?? "").replace(/_/g, " ")}<br>
                Score: <strong>${f.composite_risk_score}/100</strong><br>
                <span style="color:#888">${f.timestamp_video}</span>
              </div>`),
          )
          .addTo(map);

        entriesRef.current.push({ id: f.finding_id, routeIdx, color, shadowBase, dotEl, ringEl, marker });
      });
    };

    if (map.loaded()) addMarkers();
    else map.once("load", addMarkers);
  }, [findings]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
