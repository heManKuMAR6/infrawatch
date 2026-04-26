import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { API_BASE } from "@/api";

// ── 33-point closed patrol loop around TX-447 [lon, lat] ─────────────────────
const ROUTE: [number, number][] = [
  [-90.1876, 38.6089], [-90.1862, 38.6094], [-90.1848, 38.6100],
  [-90.1835, 38.6103], [-90.1821, 38.6108], [-90.1790, 38.6120],
  [-90.1743, 38.6134], [-90.1780, 38.6155], [-90.1820, 38.6180],
  [-90.2050, 38.6198], [-90.2150, 38.6210], [-90.2200, 38.6220],
  [-90.2118, 38.6241], [-90.2200, 38.6280], [-90.2380, 38.6334],
  [-90.2456, 38.6334], [-90.2341, 38.6378], [-90.2200, 38.6350],
  [-90.2100, 38.6340], [-90.2000, 38.6340], [-90.1900, 38.6380],
  [-90.1780, 38.6420], [-90.1654, 38.6445], [-90.1590, 38.6470],
  [-90.1532, 38.6489], [-90.2400, 38.6512], [-90.2789, 38.6512],
  [-90.2700, 38.6400], [-90.2500, 38.6200], [-90.2300, 38.6100],
  [-90.2123, 38.6023], [-90.2000, 38.6050], [-90.1876, 38.6089],
];

// Snap a GPS coordinate to the nearest ROUTE waypoint index
function nearestRouteIdx(lat: number, lon: number): number {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < ROUTE.length; i++) {
    const d = (ROUTE[i][1] - lat) ** 2 + (ROUTE[i][0] - lon) ** 2;
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  return bestIdx;
}

// Map chunk_index (1-based, 1-12) → route waypoint index (0-32)
// Allows reaching ROUTE[32] so the drone completes the full closed loop
function chunkToRouteIdx(chunkIndex: number): number {
  return Math.min(Math.floor((chunkIndex * 32) / 11), ROUTE.length - 1);
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
  chunk_index: number; // 1-based, derived from finding_id by caller
  lat: number;
  lon: number;
  risk_level: string;
  anomaly_type: string;
  composite_risk_score: number;
  timestamp_video: string;
};

export type LiveDronePos = {
  lat: number;
  lon: number;
  chunk_index: number; // 1-based, from SSE position event
};

// ── Animation types ───────────────────────────────────────────────────────────

type FindingEntry = {
  id: string;
  routeIdx: number;
  color: string;
  shadowBase: string;
  dotEl: HTMLElement;
  marker: maplibregl.Marker;
};

type AnimState = {
  rafId: number;
  frameCount: number;
  currentSeg: number; // which segment the drone is animating FROM
  targetIdx: number;  // destination route index
  segStartTs: number; // performance.now() when current segment started
  moving: boolean;
};

const SEG_DURATION_MS  = 1200; // 1.2 s per waypoint segment — keeps pace with speed=1 SSE
const TRAIL_MAX_PTS    = 400;
const TRAIL_UPD_FRAMES = 3;

// Cubic ease-in-out
function cubicEase(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function InfraWatchLiveMap({
  dronePos,
  findings,
  streaming,
}: {
  dronePos: LiveDronePos | null;
  findings: LiveFinding[];
  streaming: boolean;
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
    currentSeg: 0,
    targetIdx: 0,
    segStartTs: 0,
    moving: false,
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

        // Compute drone position along route
        let lngLat: [number, number] = ROUTE[Math.min(anim.currentSeg, ROUTE.length - 1)];

        if (anim.moving && anim.currentSeg < anim.targetIdx) {
          const elapsed = now - anim.segStartTs;
          const t = Math.min(elapsed / SEG_DURATION_MS, 1);
          const frac = cubicEase(t);

          const p0 = ROUTE[anim.currentSeg];
          const p1 = ROUTE[Math.min(anim.currentSeg + 1, ROUTE.length - 1)];
          lngLat = [p0[0] + (p1[0] - p0[0]) * frac, p0[1] + (p1[1] - p0[1]) * frac];

          if (t >= 1) {
            anim.currentSeg = Math.min(anim.currentSeg + 1, ROUTE.length - 1);
            anim.segStartTs = now;
            if (anim.currentSeg >= anim.targetIdx) anim.moving = false;
          }
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

        // Finding passage: trigger highlight when drone reaches the finding's route waypoint
        for (const entry of entriesRef.current) {
          if (!passedRef.current.has(entry.id) && anim.currentSeg >= entry.routeIdx) {
            passedRef.current.add(entry.id);
            entry.dotEl.style.boxShadow = `0 0 28px ${entry.color}, 0 0 10px white`;
            entry.dotEl.style.transform = "scale(1.5)";
            setTimeout(() => {
              entry.dotEl.style.boxShadow = entry.shadowBase;
              entry.dotEl.style.transform = "";
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

  // ── Inspection complete → finish the loop ────────────────────────────────
  useEffect(() => {
    if (!streaming) {
      const anim = animRef.current;
      // If drone hasn't reached the end yet, let it finish the remaining segments
      if (anim.currentSeg < ROUTE.length - 1) {
        anim.targetIdx = ROUTE.length - 1;
        if (!anim.moving) {
          anim.moving = true;
          anim.segStartTs = performance.now();
        }
      }
    }
  }, [streaming]);

  // ── dronePos null → new inspection starting, reset drone home ────────────
  useEffect(() => {
    if (!dronePos) {
      const anim = animRef.current;
      anim.currentSeg  = 0;
      anim.targetIdx   = 0;
      anim.moving      = false;
      trailRef.current = [ROUTE[0], ROUTE[0]];
      passedRef.current.clear();
      if (droneRef.current) droneRef.current.setLngLat(ROUTE[0]);
    }
  }, [dronePos]);

  // ── New dronePos → update animation target ────────────────────────────────
  useEffect(() => {
    if (!dronePos) return;
    const anim = animRef.current;
    const targetIdx = chunkToRouteIdx(dronePos.chunk_index);

    if (targetIdx <= anim.currentSeg) return; // never go backward

    anim.targetIdx = targetIdx;
    if (!anim.moving) {
      anim.moving = true;
      anim.segStartTs = performance.now();
    }
  }, [dronePos]);

  // ── New findings → place markers snapped to route ─────────────────────────
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
        // Snap to nearest route waypoint using actual GPS — guaranteed on-path
        const routeIdx = nearestRouteIdx(f.lat, f.lon);
        const snapped  = ROUTE[routeIdx];

        const shadowBase = `0 0 ${isCrit ? 16 : 7}px ${color}`;
        const dotEl = document.createElement("div");
        dotEl.style.cssText = [
          `width:${size}px`, `height:${size}px`,
          "border-radius:50%",
          `background:${color}`,
          `border:2px solid rgba(255,255,255,0.9)`,
          `box-shadow:${shadowBase}`,
          "cursor:pointer",
          "transition:box-shadow .25s, transform .25s",
        ].join(";");

        // ── Popup with lazy-loaded video clip ───────────────────────────────
        const popupEl = document.createElement("div");
        popupEl.style.cssText = "font-family:system-ui;font-size:12px;line-height:1.55;padding:2px 0;min-width:220px";

        const metaEl = document.createElement("div");
        metaEl.innerHTML = [
          `<strong style="color:${color}">${f.risk_level}</strong>`,
          `&nbsp;—&nbsp;${(f.anomaly_type ?? "").replace(/_/g, " ")}<br>`,
          `Score: <strong>${f.composite_risk_score}/100</strong>`,
          `&nbsp;·&nbsp;<span style="color:#888">${f.timestamp_video}</span>`,
        ].join("");
        popupEl.appendChild(metaEl);

        const thumbEl = document.createElement("div");
        thumbEl.style.cssText = [
          "margin-top:8px", "border-radius:5px", "overflow:hidden",
          "background:#0d0d0d", "aspect-ratio:16/9",
          "display:flex", "align-items:center", "justify-content:center",
        ].join(";");
        thumbEl.innerHTML = '<span style="color:#444;font-size:10px;font-family:monospace">loading clip…</span>';
        popupEl.appendChild(thumbEl);

        const popup = new maplibregl.Popup({ maxWidth: "270px", closeButton: true, offset: 14 });
        popup.setDOMContent(popupEl);

        let clipFetched = false;
        popup.on("open", () => {
          if (clipFetched) return;
          clipFetched = true;
          fetch(`${API_BASE}/api/clip/file/${encodeURIComponent(f.finding_id)}`)
            .then((r) => (r.ok ? (r.json() as Promise<{ url: string; start: number; end: number }>) : Promise.reject(r.status)))
            .then((d) => {
              const video = document.createElement("video");
              video.style.cssText = "width:100%;display:block;border-radius:4px";
              video.muted = true;
              video.playsInline = true;
              video.loop = true;
              video.src = d.url;
              video.currentTime = d.start + 2;
              video.addEventListener("canplay", () => void video.play(), { once: true });
              thumbEl.innerHTML = "";
              thumbEl.style.aspectRatio = "16/9";
              thumbEl.appendChild(video);
            })
            .catch(() => {
              thumbEl.innerHTML = '<span style="color:#444;font-size:10px;font-family:monospace">clip unavailable</span>';
            });
        });

        const marker = new maplibregl.Marker({ element: dotEl, anchor: "center" })
          .setLngLat(snapped)
          .setPopup(popup)
          .addTo(map);

        entriesRef.current.push({ id: f.finding_id, routeIdx, color, shadowBase, dotEl, marker });
      });
    };

    if (map.loaded()) addMarkers();
    else map.once("load", addMarkers);
  }, [findings]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
