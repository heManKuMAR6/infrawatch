import { useEffect, useState } from "react";
import { apiGet } from "@/api";
import { StatusBadge } from "@/components/StatusBadge";
import { TopBar } from "@/components/TopBar";
import { useTheme } from "@/theme/ThemeContext";

type Row = { service: string; status: string; latency_ms: number; detail: string };

type Props = { embedded?: boolean };

export function ConnectivityPage({ embedded = false }: Props) {
  const { theme } = useTheme();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiGet<Row[]>("/api/connectivity");
        if (!cancelled) setRows(data);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = rows
    ? {
        ok: rows.filter((r) => r.status === "OK").length,
        warn: rows.filter((r) => r.status === "Warning").length,
        err: rows.filter((r) => r.status === "Error").length,
        skip: rows.filter((r) => r.status === "Not configured").length,
      }
    : null;

  return (
    <div className={embedded ? "soc-embedded-root" : undefined} style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {!embedded ? (
        <TopBar
          title="Connectivity matrix"
          subtitle="Pre-flight probes across AWS, Bedrock catalog, data plane APIs, and optional IBM Quantum — no model burn."
        />
      ) : null}
      <div className={`soc-page${embedded ? " soc-page--embedded" : ""}`}>
        {err ? <div className="soc-alert soc-alert--err">{err}</div> : null}

        {summary && rows ? (
          <div className="soc-strip" style={{ marginBottom: "1rem" }}>
            <span className="soc-posture soc-posture--nominal">CHECKS · {rows.length}</span>
            <span className="soc-strip-meta">
              <strong style={{ color: "var(--ok)" }}>{summary.ok}</strong> OK ·{" "}
              <strong style={{ color: "var(--warn)" }}>{summary.warn}</strong> warn ·{" "}
              <strong style={{ color: "var(--critical)" }}>{summary.err}</strong> err ·{" "}
              <strong>{summary.skip}</strong> skipped
            </span>
          </div>
        ) : null}

        {!rows ? (
          <p style={{ color: "var(--text-muted)" }}>Running diagnostics…</p>
        ) : (
          <div className="soc-table-wrap" style={{ maxHeight: "none" }}>
            <table className="soc-table">
              <thead>
                <tr>
                  {["Service", "Status", "Latency (ms)", "Detail"].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.service}>
                    <td style={{ fontWeight: 600 }}>{r.service}</td>
                    <td>
                      <StatusBadge status={r.status} theme={theme} />
                    </td>
                    <td className="soc-mono" style={{ color: "var(--text-muted)" }}>
                      {r.latency_ms}
                    </td>
                    <td style={{ color: "var(--text-muted)", maxWidth: 520 }}>{r.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
