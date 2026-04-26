import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type ProcessingState = {
  active: boolean;
  title: string;
  detail: string;
  startedAtMs: number;
  chunkIndex: number | null;
  chunkTotal: number | null;
  lastUpdateAtMs: number;
  stepName: string | null;
  stepStartedAtMs: number | null;
  stepHistory: { name: string; elapsedMs: number; etaMs: number | null; outcome: "ok" | "warn" | "err" }[];
  stepAvgMs: Record<string, { n: number; avgMs: number }>;
};

type Ctx = {
  state: ProcessingState;
  start: (args: { title: string; detail?: string; chunkTotal?: number | null }) => void;
  update: (patch: Partial<Omit<ProcessingState, "active" | "startedAtMs">>) => void;
  step: (ev: { name: string; phase: "start" | "end"; outcome?: "ok" | "warn" | "err" }) => void;
  stop: () => void;
};

const initial: ProcessingState = {
  active: false,
  title: "Processing",
  detail: "",
  startedAtMs: 0,
  chunkIndex: null,
  chunkTotal: null,
  lastUpdateAtMs: 0,
  stepName: null,
  stepStartedAtMs: null,
  stepHistory: [],
  stepAvgMs: {},
};

const ProcessingContext = createContext<Ctx | null>(null);

export function ProcessingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ProcessingState>(initial);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const start = useCallback((args: { title: string; detail?: string; chunkTotal?: number | null }) => {
    const now = Date.now();
    setState({
      active: true,
      title: args.title,
      detail: args.detail ?? "",
      startedAtMs: now,
      chunkIndex: null,
      chunkTotal: args.chunkTotal ?? null,
      lastUpdateAtMs: now,
      stepName: args.detail ? "Start" : null,
      stepStartedAtMs: args.detail ? now : null,
      stepHistory: [],
      stepAvgMs: {},
    });
  }, []);

  const update = useCallback((patch: Partial<Omit<ProcessingState, "active" | "startedAtMs">>) => {
    if (!aliveRef.current) return;
    const now = Date.now();
    setState((prev) => {
      if (!prev.active) return prev;
      return { ...prev, ...patch, lastUpdateAtMs: now };
    });
  }, []);

  const step = useCallback((ev: { name: string; phase: "start" | "end"; outcome?: "ok" | "warn" | "err" }) => {
    if (!aliveRef.current) return;
    const now = Date.now();
    setState((prev) => {
      if (!prev.active) return prev;
      if (!ev.name.trim()) return prev;

      if (ev.phase === "start") {
        if (prev.stepName === ev.name) return { ...prev, lastUpdateAtMs: now };
        return { ...prev, stepName: ev.name, stepStartedAtMs: now, lastUpdateAtMs: now };
      }

      const started = prev.stepStartedAtMs ?? now;
      const elapsedMs = Math.max(0, now - started);
      const outcome = ev.outcome ?? "ok";

      const prevAvg = prev.stepAvgMs[ev.name];
      const n = (prevAvg?.n ?? 0) + 1;
      const avgMs = prevAvg ? prevAvg.avgMs + (elapsedMs - prevAvg.avgMs) / n : elapsedMs;
      const nextAvg = { n, avgMs };

      const histItem = {
        name: ev.name,
        elapsedMs,
        etaMs: prevAvg ? Math.max(0, Math.round(prevAvg.avgMs - elapsedMs)) : null,
        outcome,
      } as const;

      const stepHistory = [histItem, ...prev.stepHistory].slice(0, 6);
      const stepAvgMs = { ...prev.stepAvgMs, [ev.name]: nextAvg };

      return { ...prev, stepName: null, stepStartedAtMs: null, stepHistory, stepAvgMs, lastUpdateAtMs: now };
    });
  }, []);

  const stop = useCallback(() => {
    setState(initial);
  }, []);

  const value = useMemo(() => ({ state, start, update, step, stop }), [state, start, update, step, stop]);

  return <ProcessingContext.Provider value={value}>{children}</ProcessingContext.Provider>;
}

export function useProcessing() {
  const c = useContext(ProcessingContext);
  if (!c) throw new Error("useProcessing must be used within ProcessingProvider");
  return c;
}

