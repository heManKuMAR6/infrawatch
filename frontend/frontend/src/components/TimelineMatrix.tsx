import { useMemo, type MouseEvent } from "react";
import type { TimelineBin } from "@/lib/timelineSegments";
import { binIndexForTime } from "@/lib/timelineSegments";

type Props = {
  bins: TimelineBin[];
  effDur: number;
  playheadTime: number;
  selectedBin: number | null;
  onSelectBin: (index: number, seekTo: number) => void;
  onScrub: (e: MouseEvent<HTMLDivElement>) => void;
};

export function TimelineMatrix({ bins, effDur, playheadTime, selectedBin, onSelectBin, onScrub }: Props) {
  const liveBin = useMemo(() => binIndexForTime(playheadTime, effDur, bins.length), [playheadTime, effDur, bins.length]);
  const playheadPct = effDur > 0 ? Math.min(100, Math.max(0, (playheadTime / effDur) * 100)) : 0;

  return (
    <div className="soc-tl-matrix">
      <div className="soc-tl-matrix-head">
        <span className="soc-tl-matrix-title">Hazard / evidence field</span>
        <span className="soc-tl-matrix-meta soc-mono">
          {bins.length} bins · {effDur.toFixed(2)}s axis
        </span>
      </div>

      <div className="soc-tl-heat" aria-hidden>
        {bins.map((b) => (
          <div
            key={`h-${b.bin}`}
            className={`soc-tl-heat-cell soc-tl-heat-cell--${b.kind}`}
            style={{ height: `${10 + b.intensity * 34}px` }}
          />
        ))}
      </div>

      <div className="soc-tl-grid-wrap">
        <div
          className="soc-tl-grid"
          role="grid"
          aria-label="Time bins; click a cell to seek and highlight"
          style={{ gridTemplateColumns: `repeat(${bins.length}, minmax(0, 1fr))` }}
        >
          {bins.map((b) => {
            const isSel = selectedBin === b.bin;
            const isLive = liveBin === b.bin && !isSel;
            return (
              <button
                key={`c-${b.bin}`}
                type="button"
                className={`soc-tl-cell soc-tl-cell--${b.kind}${isSel ? " soc-tl-cell--selected" : ""}${isLive ? " soc-tl-cell--live" : ""}`}
                title={`${b.start.toFixed(2)}–${b.end.toFixed(2)}s${b.label ? ` · ${b.label}` : ""}`}
                onClick={() => onSelectBin(b.bin, b.mid)}
              />
            );
          })}
        </div>

        <div className="soc-tl-scrub" onClick={onScrub}>
          <div className="soc-tl-scrub-track" />
          <div className="soc-tl-scrub-progress" style={{ width: `${playheadPct}%` }} />
          <div className="soc-tl-scrub-playhead" style={{ left: `${playheadPct}%` }} />
        </div>
      </div>

      <div className="soc-timeline-axis soc-timeline-axis--matrix">
        <span>0s</span>
        <span>{(effDur / 2).toFixed(1)}s</span>
        <span>{effDur.toFixed(1)}s</span>
      </div>
    </div>
  );
}
