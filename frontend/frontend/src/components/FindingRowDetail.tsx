import React, { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { API_BASE } from "@/api";
import { TimelineMatrix } from "@/components/TimelineMatrix";
import {
  binIndexForTime,
  buildPredictionSegments,
  buildTimelineBins,
  segmentSeekTime,
  timelineAxisDuration,
  type TimelineSegment,
} from "@/lib/timelineSegments";

type Row = Record<string, unknown>;

const WORKSPACE_GRID_BINS = 40;

function num(v: unknown, d = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : d;
}

function formatT(sec: number): string {
  if (!Number.isFinite(sec)) return "—";
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  if (m <= 0) return `${r.toFixed(1)}s`;
  return `${m}m ${r.toFixed(0)}s`;
}

function activeSegmentIndex(segments: TimelineSegment[], t: number): number {
  let best = -1;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (t >= s.start - 0.02 && t <= s.end + 0.02) best = i;
  }
  return best;
}

type PegasusReport = {
  anomaly_type?: string;
  severity?: string;
  hazards?: string[];
  description?: string;
  people_detected?: { present: boolean; count: number; activity: string };
  wildlife_detected?: { present: boolean; types: string };
  vehicles_present?: boolean;
  environment?: string;
  recommended_action?: string;
};

const SEV_COLOR: Record<string, string> = {
  critical: "#FF3B30", high: "#FF9500", medium: "#FFD60A", low: "#30D158",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "var(--text-muted)", marginBottom: 3, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

function PegasusReportPanel({ report }: { report: PegasusReport | undefined }) {
  if (!report) return <p style={{ color: "var(--text-muted)", fontSize: 12 }}>No Pegasus report attached.</p>;

  const sev = (report.severity ?? "").toLowerCase();
  const sevColor = SEV_COLOR[sev] ?? "var(--text-muted)";

  return (
    <details className="soc-finding-json-details" open>
      <summary>Pegasus structured report</summary>
      <div style={{ padding: "12px 0 4px" }}>
        {report.anomaly_type && (
          <Field label="Anomaly type">
            <span style={{ fontWeight: 600 }}>{report.anomaly_type}</span>
            {report.severity && (
              <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: sevColor, textTransform: "uppercase" }}>
                {report.severity}
              </span>
            )}
          </Field>
        )}

        {report.description && (
          <Field label="Description">{report.description}</Field>
        )}

        {Array.isArray(report.hazards) && report.hazards.length > 0 && (
          <Field label="Regulatory hazards">
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {report.hazards.map((h, i) => (
                <li key={i} style={{ color: "#FF3B30", fontWeight: 600, fontSize: 12 }}>{h}</li>
              ))}
            </ul>
          </Field>
        )}

        {report.people_detected && (
          <Field label="People detected">
            {report.people_detected.present ? (
              <span>
                <span style={{ color: "#FF9500", fontWeight: 600 }}>Yes</span>
                {report.people_detected.count > 0 && ` · ${report.people_detected.count} person${report.people_detected.count !== 1 ? "s" : ""}`}
                {report.people_detected.activity && ` · ${report.people_detected.activity}`}
              </span>
            ) : (
              <span style={{ color: "var(--text-muted)" }}>None detected</span>
            )}
          </Field>
        )}

        {report.wildlife_detected && (
          <Field label="Wildlife detected">
            {report.wildlife_detected.present ? (
              <span style={{ color: "#FFD60A", fontWeight: 600 }}>
                Yes{report.wildlife_detected.types && report.wildlife_detected.types !== "none" ? ` · ${report.wildlife_detected.types}` : ""}
              </span>
            ) : (
              <span style={{ color: "var(--text-muted)" }}>None detected</span>
            )}
          </Field>
        )}

        {report.vehicles_present !== undefined && (
          <Field label="Vehicles">
            {report.vehicles_present
              ? <span style={{ color: "#FF9500", fontWeight: 600 }}>Present</span>
              : <span style={{ color: "var(--text-muted)" }}>None detected</span>}
          </Field>
        )}

        {report.environment && (
          <Field label="Environment">{report.environment}</Field>
        )}

        {report.recommended_action && (
          <Field label="Recommended action">
            <span style={{ color: "var(--accent)", fontWeight: 500 }}>{report.recommended_action}</span>
          </Field>
        )}
      </div>
    </details>
  );
}

export type PendingSeek = { rowId: string; time: number } | null;

type Props = {
  row: Row;
  rowId: string;
  pendingSeek: PendingSeek;
  onConsumedSeek: () => void;
  /** Larger video + matrix timeline for fullscreen workspace */
  variant?: "default" | "workspace";
};

export function FindingRowDetail({ row, rowId, pendingSeek, onConsumedSeek, variant = "default" }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [selectedBin, setSelectedBin] = useState<number | null>(null);
  const [clipInfo, setClipInfo] = useState<{ url: string; start: number; end: number } | null>(null);
  const [clipLoading, setClipLoading] = useState(false);

  const segments = useMemo(() => buildPredictionSegments(row), [row]);
  const axisDur = useMemo(() => timelineAxisDuration(row, segments), [row, segments]);
  const ts = num(row.timestamp_start_sec);
  const te = num(row.timestamp_end_sec);
  const effDur = dur > 0.1 ? Math.max(axisDur, dur) : axisDur;

  const bins = useMemo(
    () => (variant === "workspace" ? buildTimelineBins(segments, effDur, WORKSPACE_GRID_BINS) : []),
    [variant, segments, effDur],
  );

  useEffect(() => {
    setSelectedBin(null);
  }, [rowId]);

  const videoName = row.video_file ? String(row.video_file) : null;

  useEffect(() => {
    if (!videoName) { setClipInfo(null); return; }
    setClipInfo(null);
    setClipLoading(true);
    fetch(`${API_BASE}/api/clip/file/${encodeURIComponent(videoName)}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.statusText))
      .then((d: { url: string; start: number; end: number }) => setClipInfo(d))
      .catch(() => setClipInfo(null))
      .finally(() => setClipLoading(false));
  }, [videoName]);

  useEffect(() => {
    if (!pendingSeek || pendingSeek.rowId !== rowId) return;
    const el = videoRef.current;
    const cap = el && el.duration > 0.1 ? el.duration : effDur;
    if (el) {
      el.currentTime = Math.min(Math.max(0, pendingSeek.time), Math.max(cap - 0.05, 0));
      setT(el.currentTime);
    }
    if (variant === "workspace" && bins.length) {
      setSelectedBin(binIndexForTime(pendingSeek.time, effDur, bins.length));
    }
    onConsumedSeek();
  }, [pendingSeek, rowId, onConsumedSeek, effDur, variant, bins.length]);

  const clipInfoRef = useRef(clipInfo);
  useEffect(() => { clipInfoRef.current = clipInfo; }, [clipInfo]);

  const onTimeUpdate = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    setT(el.currentTime);
    const info = clipInfoRef.current;
    if (info && el.currentTime >= info.end) {
      // Loop back to clip start instead of stopping
      el.currentTime = info.start;
      void el.play();
    }
  }, []);

  const onLoadedMeta = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    setDur(el.duration);
    setT(el.currentTime);
  }, []);

  const seek = useCallback(
    (sec: number) => {
      const el = videoRef.current;
      if (!el) return;
      const end = el.duration > 0.1 ? el.duration : effDur;
      el.currentTime = Math.min(Math.max(0, sec), Math.max(end - 0.05, 0));
      setT(el.currentTime);
    },
    [effDur],
  );

  const onTrackClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      seek(x * effDur);
    },
    [effDur, seek],
  );

  const onMatrixScrub = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      onTrackClick(e);
    },
    [onTrackClick],
  );

  const onSelectBin = useCallback(
    (index: number, seekTo: number) => {
      setSelectedBin(index);
      seek(seekTo);
    },
    [seek],
  );

  const activeIdx = useMemo(() => activeSegmentIndex(segments, t), [segments, t]);
  const playheadPct = Math.min(100, Math.max(0, (t / effDur) * 100));

  const rootClass = variant === "workspace" ? "soc-finding-detail soc-finding-detail--workspace" : "soc-finding-detail";

  const inspectBin = selectedBin != null && bins[selectedBin] ? bins[selectedBin] : null;

  return (
    <div className={rootClass} onClick={(e) => e.stopPropagation()}>
      <div className="soc-finding-detail-head">
        <div>
          <span className="soc-finding-detail-label">Clip window</span>
          <span className="soc-mono">
            {formatT(clipInfo ? clipInfo.start : ts)} → {formatT(clipInfo ? clipInfo.end : (te > ts ? te : ts + 2))}
          </span>
        </div>
        <div className="soc-finding-detail-head-right">
          <span className="soc-finding-detail-label">Playhead</span>
          <span className="soc-mono soc-finding-playhead-readout">{formatT(t)}</span>
          {dur > 0.1 ? (
            <span className="soc-finding-detail-meta"> / {formatT(dur)} media</span>
          ) : (
            <span className="soc-finding-detail-meta"> · axis {effDur.toFixed(1)}s</span>
          )}
        </div>
      </div>

      {variant === "workspace" && bins.length ? (
        <>
          <TimelineMatrix
            bins={bins}
            effDur={effDur}
            playheadTime={t}
            selectedBin={selectedBin}
            onSelectBin={onSelectBin}
            onScrub={onMatrixScrub}
          />
          {inspectBin ? (
            <div className="soc-tl-inspect" role="status" aria-live="polite">
              <div className="soc-tl-inspect-row">
                <span className="soc-tl-inspect-k">BIN {inspectBin.bin + 1}</span>
                <span className="soc-tl-inspect-kind soc-tl-inspect-kind--tag">{inspectBin.kind}</span>
              </div>
              <div className="soc-tl-inspect-row soc-mono">
                {inspectBin.start.toFixed(2)}s → {inspectBin.end.toFixed(2)}s · seek {inspectBin.mid.toFixed(2)}s
              </div>
              <div className="soc-tl-inspect-body">{inspectBin.label || "Quiescent / no fused label in this slice."}</div>
            </div>
          ) : (
            <p className="soc-tl-inspect-hint">Select a time cell below the heat strip to lock highlight and show fused text.</p>
          )}
          <details className="soc-tl-advanced">
            <summary>Segment list (advanced)</summary>
            <div className="soc-timeline-chips">
              {segments.map((s, i) => (
                <button
                  key={`chip-${i}`}
                  type="button"
                  className={`soc-timeline-chip soc-timeline-chip--${s.kind}${i === activeIdx ? " soc-timeline-chip--active" : ""}`}
                  onClick={() => {
                    setSelectedBin(binIndexForTime(segmentSeekTime(s), effDur, bins.length));
                    seek(segmentSeekTime(s));
                  }}
                >
                  <span className="soc-timeline-chip-kind">{s.kind}</span>
                  <span className="soc-timeline-chip-label">{s.label}</span>
                  <span className="soc-timeline-chip-t soc-mono">
                    {s.start.toFixed(1)}–{s.end.toFixed(1)}s
                  </span>
                </button>
              ))}
            </div>
          </details>
        </>
      ) : (
        <>
          <div className="soc-timeline-wrap" title="Click the bar to scrub. Click a band or chip to jump to that highlight.">
            <div className="soc-timeline-rail" onClick={onTrackClick}>
              {segments.map((s, i) => {
                const left = (s.start / effDur) * 100;
                const width = Math.max(0.35, ((s.end - s.start) / effDur) * 100);
                const kind = s.kind;
                const active = i === activeIdx;
                return (
                  <button
                    key={`${kind}-${i}-${s.label.slice(0, 12)}`}
                    type="button"
                    className={`soc-timeline-seg soc-timeline-seg--${kind}${active ? " soc-timeline-seg--active" : ""}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={`${s.label} (${s.start.toFixed(1)}s–${s.end.toFixed(1)}s)`}
                    onClick={(e) => {
                      e.stopPropagation();
                      seek(segmentSeekTime(s));
                    }}
                  />
                );
              })}
              <div className="soc-timeline-playhead" style={{ left: `${playheadPct}%` }} aria-hidden />
            </div>
            <div className="soc-timeline-axis">
              <span>0</span>
              <span>{(effDur / 2).toFixed(0)}s</span>
              <span>{effDur.toFixed(0)}s</span>
            </div>
          </div>

          <div className="soc-timeline-chips">
            {segments.map((s, i) => (
              <button
                key={`chip-${i}`}
                type="button"
                className={`soc-timeline-chip soc-timeline-chip--${s.kind}${i === activeIdx ? " soc-timeline-chip--active" : ""}`}
                onClick={() => seek(segmentSeekTime(s))}
              >
                <span className="soc-timeline-chip-kind">{s.kind}</span>
                <span className="soc-timeline-chip-label">{s.label}</span>
                <span className="soc-timeline-chip-t soc-mono">
                  {s.start.toFixed(1)}–{s.end.toFixed(1)}s
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="soc-finding-detail-grid">
        <div className="soc-finding-video-col">
          {clipInfo ? (
            <video
              key={clipInfo.url}
              ref={videoRef}
              src={clipInfo.url}
              controls
              autoPlay
              muted
              playsInline
              className="soc-finding-video"
              onTimeUpdate={onTimeUpdate}
              onLoadedMetadata={onLoadedMeta}
              onPlay={onTimeUpdate}
            />
          ) : clipLoading ? (
            <div className="soc-finding-video-placeholder">Loading clip…</div>
          ) : videoName ? (
            <div className="soc-finding-video-placeholder">Clip unavailable — backend unreachable.</div>
          ) : (
            <div className="soc-finding-video-placeholder">No clip attached — timeline still maps to model window.</div>
          )}
        </div>
        <div className="soc-finding-json-col">
          <PegasusReportPanel report={row.pegasus_report as PegasusReport | undefined} />
        </div>
      </div>

      {row.finding_rationale ? <div className="soc-detail soc-detail--inline">{String(row.finding_rationale)}</div> : null}
    </div>
  );
}
