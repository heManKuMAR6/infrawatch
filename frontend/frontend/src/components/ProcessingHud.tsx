import { useEffect, useMemo, useState } from "react";
import { useProcessing } from "@/context/ProcessingContext";

function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, "0");
  return `${m}:${ss}`;
}

function fmtEta(ms: number | null): string {
  if (ms == null) return "ETA —";
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, "0");
  return `ETA ${m}:${ss}`;
}

export function ProcessingHud() {
  const { state } = useProcessing();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (!state.active) return;
    const t = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [state.active]);

  const progress = useMemo(() => {
    if (!state.active) return 0;
    if (!state.chunkTotal || !state.chunkIndex) return 0.22;
    return Math.min(1, Math.max(0.02, state.chunkIndex / state.chunkTotal));
  }, [state.active, state.chunkIndex, state.chunkTotal]);

  if (!state.active) return null;

  const elapsedMs = nowMs - state.startedAtMs;
  const chunkTxt =
    state.chunkIndex && state.chunkTotal ? `chunk ${state.chunkIndex}/${state.chunkTotal}` : state.chunkTotal ? `chunk 0/${state.chunkTotal}` : "chunk —";
  const etaOverallMs = (() => {
    if (!state.chunkTotal || !state.chunkIndex || state.chunkIndex <= 0) return null;
    const frac = Math.min(1, Math.max(0.0001, state.chunkIndex / state.chunkTotal));
    const estTotal = elapsedMs / frac;
    return Math.max(0, Math.round(estTotal - elapsedMs));
  })();
  const curStepElapsedMs = state.stepStartedAtMs ? Math.max(0, nowMs - state.stepStartedAtMs) : null;
  const curStepEtaMs = state.stepName ? state.stepAvgMs[state.stepName]?.avgMs ?? null : null;
  const curStepEtaRemainMs = curStepEtaMs != null && curStepElapsedMs != null ? Math.max(0, Math.round(curStepEtaMs - curStepElapsedMs)) : null;

  return (
    <div className={`soc-proc-hud ${pinned ? "soc-proc-hud--pinned" : ""}`}>
      <button
        type="button"
        className="soc-proc-hud-core"
        title={pinned ? "Hide details" : "Show details"}
        onClick={() => setPinned((v) => !v)}
      >
        <span className="soc-proc-liquid" aria-hidden style={{ ["--p" as never]: progress }} />
        <span className="soc-proc-dot" aria-hidden />
      </button>

      <div className="soc-proc-hud-pop" role="status" aria-live="polite">
        <div className="soc-proc-hud-title">{state.title}</div>
        <div className="soc-proc-hud-meta">
          <span className="soc-mono">{fmtElapsed(elapsedMs)}</span>
          <span className="soc-proc-sep">·</span>
          <span className="soc-mono">{chunkTxt}</span>
          <span className="soc-proc-sep">·</span>
          <span className="soc-mono">{fmtEta(etaOverallMs)}</span>
        </div>
        <div className="soc-proc-hud-bar" aria-hidden>
          <span className="soc-proc-hud-bar-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        {state.detail ? <div className="soc-proc-hud-detail">{state.detail}</div> : null}
        {state.stepName ? (
          <div className="soc-proc-hud-steps">
            <div className="soc-proc-hud-step">
              <span className="soc-proc-step-name">{state.stepName}</span>
              <span className="soc-mono">{fmtElapsed(curStepElapsedMs ?? 0)}</span>
              <span className="soc-mono">{fmtEta(curStepEtaRemainMs)}</span>
            </div>
          </div>
        ) : null}
        {state.stepHistory.length ? (
          <div className="soc-proc-hud-steps">
            {state.stepHistory.slice(0, 4).map((s) => (
              <div key={`${s.name}-${s.elapsedMs}`} className={`soc-proc-hud-step soc-proc-hud-step--${s.outcome}`}>
                <span className="soc-proc-step-name">{s.name}</span>
                <span className="soc-mono">{fmtElapsed(s.elapsedMs)}</span>
                <span className="soc-mono">{fmtEta(s.etaMs)}</span>
              </div>
            ))}
          </div>
        ) : null}
        <div className="soc-proc-hud-hint">You can keep navigating while this runs.</div>
      </div>
    </div>
  );
}

