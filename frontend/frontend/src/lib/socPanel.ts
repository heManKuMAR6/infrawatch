export type SocPanel = "analysis" | "stream" | "connectivity";

const ALLOWED = new Set<SocPanel>(["analysis", "stream", "connectivity"]);

export function parseSocPanel(raw: string | null): SocPanel | null {
  if (!raw) return null;
  const v = raw.toLowerCase().trim();
  if (ALLOWED.has(v as SocPanel)) return v as SocPanel;
  return null;
}

export function socPanelTitle(p: SocPanel): string {
  switch (p) {
    case "analysis":
      return "Live analysis — ingest";
    case "stream":
      return "Live SSE telemetry";
    case "connectivity":
      return "Pipeline analytics";
    default:
      return "";
  }
}

export function socPanelSubtitle(p: SocPanel): string {
  switch (p) {
    case "analysis":
      return "Operator workflow: stage clips, constrain breadth, execute Bedrock + grid fusion.";
    case "stream":
      return "Chunked fusion stream: 30s segments, Marengo + Pegasus, composite findings, closing report.";
    case "connectivity":
      return "TX-447 St. Louis corridor · 12 segments · Pegasus 1.2 + Marengo 3.0 · AWS Bedrock";
    default:
      return "";
  }
}
