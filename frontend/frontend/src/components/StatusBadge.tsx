import type { ThemeId } from "@/theme/ThemeContext";

const statusTone = (status: string, theme: ThemeId) => {
  const s = status.toLowerCase();
  if (s === "ok")
    return {
      bg: theme === "dark" ? "rgba(74, 222, 128, 0.12)" : "rgba(22, 163, 74, 0.12)",
      fg: "var(--ok)",
    };
  if (s === "error")
    return {
      bg: theme === "dark" ? "rgba(248, 113, 113, 0.12)" : "rgba(220, 38, 38, 0.1)",
      fg: "var(--critical)",
    };
  if (s === "warning")
    return {
      bg: theme === "dark" ? "rgba(251, 191, 36, 0.12)" : "rgba(202, 138, 4, 0.12)",
      fg: "var(--warn)",
    };
  return {
    bg: "var(--bg-hover)",
    fg: "var(--text-muted)",
  };
};

export function StatusBadge({ status, theme }: { status: string; theme: ThemeId }) {
  const { bg, fg } = statusTone(status, theme);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "0.2rem 0.55rem",
        borderRadius: "999px",
        fontSize: "0.72rem",
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "uppercase" as const,
        background: bg,
        color: fg,
        border: "1px solid var(--border-strong)",
      }}
    >
      {status}
    </span>
  );
}
