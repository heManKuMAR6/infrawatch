/** Mirrors backend `video_intel.build_prediction_segments` for client-side SOC timeline. */

export type SegmentKind = "primary" | "evidence" | "hazard";

export type TimelineSegment = {
  start: number;
  end: number;
  label: string;
  kind: SegmentKind;
};

function num(v: unknown, d = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : d;
}

function evidenceTimestampsSec(row: Record<string, unknown>): number[] {
  const pr = row.pegasus_report as Record<string, unknown> | undefined;
  const existing = pr?.evidence_timestamps_sec;
  if (Array.isArray(existing) && existing.length) {
    return existing.map((t) => Number(t)).filter((n) => Number.isFinite(n));
  }
  const ts = num(row.timestamp_start_sec);
  const te = num(row.timestamp_end_sec);
  if (te > ts) {
    return [
      Math.round((ts + (te - ts) * 0.22) * 10) / 10,
      Math.round((ts + (te - ts) * 0.52) * 10) / 10,
      Math.round((ts + (te - ts) * 0.78) * 10) / 10,
    ];
  }
  return [1.0, 3.0, 5.0];
}

export function buildPredictionSegments(row: Record<string, unknown>): TimelineSegment[] {
  const peg = (row.pegasus_report as Record<string, unknown>) || {};
  const ts = num(row.timestamp_start_sec);
  let te = num(row.timestamp_end_sec);
  if (te <= ts) te = ts + 2.0;
  const top = String(row.marengo_top_match || "Model finding");
  const segs: TimelineSegment[] = [{ start: ts, end: te, label: top, kind: "primary" }];
  for (const t of evidenceTimestampsSec(row)) {
    const lo = Math.max(0.0, t - 0.85);
    const hi = t + 0.85;
    segs.push({ start: lo, end: hi, label: "Evidence highlight", kind: "evidence" });
  }
  const hazards = Array.isArray(peg.hazards) ? peg.hazards : [];
  const span = Math.max(te - ts, 0.25);
  hazards.slice(0, 5).forEach((hz: unknown, i: number) => {
    const frac = (i + 1) / (hazards.length + 1);
    const mid = ts + frac * span;
    segs.push({
      start: mid - 0.4,
      end: mid + 0.4,
      label: String(hz).slice(0, 48), // keep aligned with backend `video_intel` labels
      kind: "hazard",
    });
  });
  return segs;
}

export function timelineAxisDuration(row: Record<string, unknown>, segments: TimelineSegment[]): number {
  const ends = segments.map((s) => s.end).concat([num(row.timestamp_end_sec)]);
  const pegEnd = ends.length ? Math.max(...ends) : 1.0;
  return Math.max(1.0, pegEnd + 0.5);
}

export function segmentSeekTime(s: TimelineSegment): number {
  const mid = (s.start + s.end) / 2;
  return Math.max(0, mid);
}

/** First hazard segment whose label matches (exact). */
export function seekTimeForHazardLabel(row: Record<string, unknown>, hazardLabel: string): number | null {
  const segs = buildPredictionSegments(row);
  const short = hazardLabel.slice(0, 48);
  const hit = segs.find((s) => s.kind === "hazard" && (s.label === short || s.label === hazardLabel));
  return hit ? segmentSeekTime(hit) : null;
}

export function seekTimePrimaryMid(row: Record<string, unknown>): number {
  const ts = num(row.timestamp_start_sec);
  const te = num(row.timestamp_end_sec);
  if (te > ts) return (ts + te) / 2;
  return ts + 1;
}

export type BinKind = "idle" | SegmentKind;

export type TimelineBin = {
  bin: number;
  start: number;
  end: number;
  mid: number;
  kind: BinKind;
  label: string;
  intensity: number;
};

function kindPriority(k: SegmentKind): number {
  if (k === "hazard") return 3;
  if (k === "evidence") return 2;
  return 1;
}

/** Fixed-width bins for SOC heat grid: dominant segment wins by kind priority, then overlap length. */
export function buildTimelineBins(segments: TimelineSegment[], effDur: number, binCount: number): TimelineBin[] {
  if (!(effDur > 0) || binCount < 1) return [];
  const d = effDur / binCount;
  const bins: TimelineBin[] = [];
  for (let i = 0; i < binCount; i++) {
    const start = i * d;
    const end = Math.min(effDur, (i + 1) * d);
    const overlaps = segments.filter((s) => !(s.end <= start || s.start >= end));
    let best: TimelineSegment | null = null;
    let bestP = 0;
    let bestOverlap = 0;
    for (const s of overlaps) {
      const p = kindPriority(s.kind);
      const lo = Math.max(start, s.start);
      const hi = Math.min(end, s.end);
      const ov = Math.max(0, hi - lo);
      if (p > bestP || (p === bestP && ov > bestOverlap)) {
        bestP = p;
        bestOverlap = ov;
        best = s;
      }
    }
    const kind: BinKind = best ? best.kind : "idle";
    const label = best ? best.label : "";
    const hz = overlaps.filter((s) => s.kind === "hazard").length;
    const ev = overlaps.filter((s) => s.kind === "evidence").length;
    const prim = overlaps.some((s) => s.kind === "primary");
    let intensity = hz * 0.38 + ev * 0.26;
    if (prim) intensity += 0.14;
    intensity = Math.min(1, intensity);
    if (kind === "idle") intensity = 0.07;
    else if (intensity < 0.2) intensity = 0.22;
    bins.push({ bin: i, start, end, mid: (start + end) / 2, kind, label, intensity });
  }
  return bins;
}

export function binIndexForTime(time: number, effDur: number, binCount: number): number {
  if (!(effDur > 0) || binCount < 1) return 0;
  return Math.min(binCount - 1, Math.max(0, Math.floor((Math.max(0, time) / effDur) * binCount)));
}
