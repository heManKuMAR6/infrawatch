import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { TopBar } from "@/components/TopBar";
import { useBundle } from "@/context/BundleContext";
import { useProcessing } from "@/context/ProcessingContext";

type Props = { embedded?: boolean };
type StreamEvent = Record<string, unknown>;

function parseSseBlocks(buffer: string): { events: StreamEvent[]; rest: string } {
  const events: StreamEvent[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const block of parts) {
    for (const line of block.split("\n").filter(Boolean)) {
      if (line.startsWith("data:")) {
        const raw = line.slice(5).trim();
        try { events.push(JSON.parse(raw) as StreamEvent); }
        catch { events.push({ type: "parse_error", raw }); }
      }
    }
  }
  return { events, rest };
}

export function AnalysisPage({ embedded = false }: Props) {
  const { setBundle } = useBundle();
  const proc = useProcessing();
  const [folder, setFolder] = useState("");
  const [maxClips, setMaxClips] = useState(5);
  const [files, setFiles] = useState<FileList | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runLive = useCallback(async () => {
    setErr(null);
    setOk(null);
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const fd = new FormData();
    fd.append("max_clips", String(maxClips));
    if (folder.trim()) fd.append("folder", folder.trim());
    if (files?.length) {
      for (let i = 0; i < files.length; i += 1) fd.append("files", files[i]);
    }

    setBusy(true);
    setUploading(true);
    proc.start({
      title: "InfraWatch pipeline",
      detail: "Uploading video to backend…",
      chunkTotal: null,
    });
    proc.step({ name: "Init pipeline", phase: "start" });

    try {
      // POST directly to the backend (CORS enabled) to avoid Vite proxy buffering large files
      const res = await fetch("http://localhost:8000/api/analysis/live-sse", {
        method: "POST",
        body: fd,
        signal: abortRef.current.signal,
      });
      setUploading(false);

      if (res.ok && res.headers.get("content-type")?.includes("text/event-stream")) {
        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const dec = new TextDecoder();
        let buf = "";
        let gotBundle = false;

        proc.step({ name: "Init pipeline", phase: "end", outcome: "ok" });

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            // Flush any partial SSE block left in the buffer (e.g. large bundle JSON
            // that arrived in the same TCP packet as the stream-close signal).
            if (buf.trim()) {
              const { events: trailing } = parseSseBlocks(buf + "\n\n");
              for (const ev of trailing) {
                if (String(ev.type) === "bundle") {
                  const b = (ev as { bundle?: unknown }).bundle as Record<string, unknown> | undefined;
                  if (b) { setBundle(b); gotBundle = true; }
                }
              }
            }
            break;
          }
          buf += dec.decode(value, { stream: true });
          const { events: parsed, rest } = parseSseBlocks(buf);
          buf = rest;
          if (!parsed.length) continue;

          const tail = parsed[parsed.length - 1];
          const t = String(tail.type ?? "");
          const ct = typeof (tail as { chunk_total?: unknown }).chunk_total === "number"
            ? (tail as { chunk_total?: number }).chunk_total ?? null : null;
          const ci = typeof (tail as { chunk_index?: unknown }).chunk_index === "number"
            ? (tail as { chunk_index?: number }).chunk_index ?? null : null;
          const msg = String((tail as { message?: unknown }).message ?? "");
          const st = String((tail as { status?: unknown }).status ?? "");

          if (ct) proc.update({ chunkTotal: ct });
          if (ci) proc.update({ chunkIndex: ci });
          if (msg && t === "chunk_status") proc.update({ detail: msg });

          if (t === "chunk_status") {
            const stepName = (() => {
              if (msg.toLowerCase().includes("marengo")) return "Marengo priors";
              if (msg.toLowerCase().includes("initializ")) return "Chunk extract";
              if (msg.toLowerCase().includes("pegasus") || msg.toLowerCase().includes("analyz")) return "Pegasus analyze";
              if (msg.toLowerCase().includes("fus")) return "Fusion";
              if (msg.toLowerCase().includes("complete") && ci === ct) return "Finalize";
              return "Chunk stage";
            })();
            if (st === "processing") proc.step({ name: stepName, phase: "start" });
            if (st === "complete") proc.step({ name: stepName, phase: "end", outcome: "ok" });
            if (st === "error") proc.step({ name: stepName, phase: "end", outcome: "err" });
          }

          if (t === "bundle") {
            const b = (tail as { bundle?: unknown }).bundle as Record<string, unknown> | undefined;
            if (b) {
              setBundle(b);
              const n = Array.isArray((b as { anomalies?: unknown[] }).anomalies)
                ? (b as { anomalies: unknown[] }).anomalies.length : 0;
              setOk(`Pipeline complete — ${n} finding(s) fused into the command center.`);
              proc.step({ name: "Finalize", phase: "end", outcome: "ok" });
              gotBundle = true;
            }
          }
        }

        if (!gotBundle) {
          setErr("Analysis ended before producing results.");
          proc.step({ name: "Finalize", phase: "end", outcome: "err" });
        }
      } else {
        // Fallback: plain JSON
        proc.step({ name: "Init pipeline", phase: "end", outcome: "ok" });
        const bundle = await res.json() as Record<string, unknown>;
        setBundle(bundle);
        const n = Array.isArray(bundle.anomalies) ? bundle.anomalies.length : 0;
        setOk(`Pipeline complete — ${n} finding(s) fused into the command center.`);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setErr(e instanceof Error ? e.message : String(e));
        proc.step({ name: "Init pipeline", phase: "end", outcome: "err" });
      }
    } finally {
      setBusy(false);
      setUploading(false);
      proc.stop();
    }
  }, [files, folder, maxClips, proc, setBundle]);

  return (
    <div
      className={embedded ? "soc-embedded-root" : undefined}
      style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
    >
      {!embedded && (
        <TopBar
          title="Live analysis — ingest"
          subtitle="Upload drone footage → TwelveLabs Pegasus 1.2 analyzes each segment → findings fuse into the command center."
        />
      )}

      <div
        className={`soc-page${embedded ? " soc-page--embedded" : ""}`}
        style={embedded ? undefined : { maxWidth: 1100 }}
      >
        {err && <div className="soc-alert soc-alert--err">{err}</div>}
        {ok && (
          <div className="soc-alert soc-alert--ok">
            {ok}{" "}
            <Link to={{ pathname: "/", search: "" }}>Open command center →</Link>
          </div>
        )}

        <div className="soc-form-layout">
          <div className="soc-steps">
            <div style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.12em", color: "var(--text-muted)", marginBottom: 10 }}>
              RUNBOOK
            </div>
            <div className="soc-step">
              <span className="soc-step-num">1</span>
              <div>Upload drone video — Pegasus 1.2 analyzes each 30s segment via AWS Bedrock.</div>
            </div>
            <div className="soc-step">
              <span className="soc-step-num">2</span>
              <div>Marengo 3.0 builds frame embeddings; sensor telemetry fused per chunk.</div>
            </div>
            <div className="soc-step">
              <span className="soc-step-num">3</span>
              <div>Anomalies scored by composite risk — PHMSA / NERC regulatory checks applied.</div>
            </div>
            <div className="soc-step">
              <span className="soc-step-num">4</span>
              <div>Results hydrate the SOC dashboard with map pins, evidence clips, and exports.</div>
            </div>
          </div>

          <div className="soc-form-card">
            <div className="soc-panel-head" style={{ marginBottom: "1rem" }}>
              <span className="soc-panel-title">Ingest parameters</span>
              <span className="soc-panel-tag">POST /api/analysis/live-sse</span>
            </div>

            <div className="soc-field soc-drop">
              <label>
                <span>VIDEO FILES</span>
                <input
                  type="file"
                  accept="video/mp4,video/quicktime,video/x-matroska,video/*"
                  multiple
                  disabled={busy}
                  onChange={(e) => setFiles(e.target.files)}
                />
              </label>
            </div>

            <div className="soc-field">
              <label>
                <span>SERVER FOLDER (OPTIONAL)</span>
                <input
                  value={folder}
                  onChange={(e) => setFolder(e.target.value)}
                  placeholder="/mnt/data/patrol_clips or C:\\data\\clips"
                  disabled={busy}
                />
              </label>
            </div>

            <div className="soc-field">
              <label>
                <span>MAX CLIPS</span>
                <input
                  type="number" min={1} max={20} value={maxClips}
                  onChange={(e) => setMaxClips(Number(e.target.value) || 1)}
                  style={{ maxWidth: 140 }}
                  disabled={busy}
                />
              </label>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: "0.5rem" }}>
              <button type="button" className="soc-btn-primary" onClick={runLive} disabled={busy}>
                {uploading ? "Uploading video…" : busy ? "Analyzing pipeline…" : "Execute live analysis"}
              </button>
              {busy && (
                <button
                  type="button"
                  className="soc-btn-outline"
                  onClick={() => abortRef.current?.abort()}
                >
                  Abort
                </button>
              )}
              <Link
                to={{ pathname: "/", search: "?panel=stream" }}
                style={{ alignSelf: "center", fontSize: "0.82rem", fontWeight: 600 }}
              >
                Chunked SSE pipeline →
              </Link>
            </div>

            <p style={{ margin: "1rem 0 0", fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.55 }}>
              Requires <code className="mono">BEDROCK_*</code>, optional{" "}
              <code className="mono">VIDEO_S3_BUCKET</code> for large objects,{" "}
              <code className="mono">EIA_API_KEY</code>, and{" "}
              <code className="mono">BEDROCK_ASYNC_OUTPUT_S3</code> for Marengo async indexing.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
