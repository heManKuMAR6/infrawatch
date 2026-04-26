import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { ThemeId } from "@/theme/ThemeContext";

export type MapPoint = {
  lon: number;
  lat: number;
  label: string;
  critical?: boolean;
  risk_level?: string;
};

const darkStyle = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const lightStyle = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

export function MapView({
  points,
  theme,
  height = 440,
}: {
  points: MapPoint[];
  theme: ThemeId;
  /** Map container height in px */
  height?: number;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!el.current) return;

    const center: [number, number] =
      points.length > 0
        ? [points.reduce((s, p) => s + p.lon, 0) / points.length, points.reduce((s, p) => s + p.lat, 0) / points.length]
        : [-90.18, 38.63];

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = new maplibregl.Map({
      container: el.current,
      style: theme === "dark" ? darkStyle : lightStyle,
      center: [center[0], center[1]],
      zoom: points.length ? 8.5 : 4,
      pitch: 38,
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    mapRef.current = map;

    // Inject CRITICAL pulse keyframe once
    if (!document.getElementById("iw-mapview-style")) {
      const s = document.createElement("style");
      s.id = "iw-mapview-style";
      s.textContent = "@keyframes iwPulse{0%,100%{opacity:.9}50%{opacity:.25}}";
      document.head.appendChild(s);
    }

    const addLayers = () => {
      const feats = points.map((p) => ({
        type: "Feature" as const,
        properties: {
          label: p.label,
          risk: (p.risk_level ?? (p.critical ? "CRITICAL" : "HIGH")).toUpperCase(),
        },
        geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] },
      }));
      const geo = { type: "FeatureCollection" as const, features: feats };
      if (map.getSource("assets")) {
        (map.getSource("assets") as maplibregl.GeoJSONSource).setData(geo);
        return;
      }
      map.addSource("assets", { type: "geojson", data: geo });

      const riskColor = [
        "match", ["get", "risk"],
        "CRITICAL", "#FF3B30",
        "HIGH",     "#FF9500",
        "MEDIUM",   "#FFD60A",
        "LOW",      "#30D158",
        "#30D158",
      ] as maplibregl.ExpressionSpecification;

      const riskRadius = [
        "match", ["get", "risk"],
        "CRITICAL", 14,
        "HIGH",     11,
        "MEDIUM",   9,
        "LOW",      7,
        7,
      ] as maplibregl.ExpressionSpecification;

      // Pulsing outer glow — larger and brighter for CRITICAL
      map.addLayer({
        id: "assets-glow",
        type: "circle",
        source: "assets",
        paint: {
          "circle-radius": ["match", ["get", "risk"], "CRITICAL", 28, "HIGH", 20, 14],
          "circle-color": riskColor,
          "circle-opacity": ["match", ["get", "risk"], "CRITICAL", 0.22, 0.12],
          "circle-blur": 0.6,
        },
      });
      map.addLayer({
        id: "assets-dot",
        type: "circle",
        source: "assets",
        paint: {
          "circle-radius": riskRadius,
          "circle-color": riskColor,
          "circle-stroke-width": ["match", ["get", "risk"], "CRITICAL", 2.5, 1.5],
          "circle-stroke-color": "rgba(255,255,255,0.92)",
        },
      });

      // DOM-based pulse ring overlay only for CRITICAL markers
      points.filter((p) => (p.risk_level ?? (p.critical ? "CRITICAL" : "")).toUpperCase() === "CRITICAL")
        .forEach((p) => {
          const ring = document.createElement("div");
          ring.style.cssText = [
            "width:34px", "height:34px", "border-radius:50%",
            "border:2.5px solid #FF3B30",
            "animation:iwPulse 1.6s ease-in-out infinite",
            "pointer-events:none",
          ].join(";");
          new maplibregl.Marker({ element: ring, anchor: "center" })
            .setLngLat([p.lon, p.lat])
            .addTo(map);
        });
    };

    map.on("load", addLayers);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [points, theme, height]);

  return (
    <div
      ref={el}
      style={{
        width: "100%",
        height,
        borderRadius: "var(--radius)",
        overflow: "hidden",
      }}
    />
  );
}
