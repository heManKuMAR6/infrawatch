import { useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { parseSocPanel, type SocPanel } from "@/lib/socPanel";

const items: { panel: SocPanel | null; label: string; icon: string }[] = [
  { panel: null, label: "Command center", icon: "◆" },
  { panel: "analysis", label: "Live analysis", icon: "▶" },
  { panel: "stream", label: "SSE stream", icon: "≋" },
  { panel: "connectivity", label: "Analytics", icon: "◈" },
];

export function Sidebar() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activePanel = useMemo(() => parseSocPanel(searchParams.get("panel")), [searchParams]);

  const go = useCallback(
    (panel: SocPanel | null) => {
      if (panel == null) {
        navigate({ pathname: "/", search: "" }, { replace: false });
        return;
      }
      navigate({ pathname: "/", search: `?panel=${panel}` }, { replace: false });
    },
    [navigate],
  );

  return (
    <aside className="soc-sidebar">
      <div className="soc-sidebar-brand">
        <div className="soc-sidebar-brand-line">
          <span className="soc-sidebar-dot" aria-hidden />
          <span className="soc-sidebar-title">SOC CONSOLE</span>
        </div>
        <div className="soc-sidebar-name">Quantum Grid Sentinel</div>
        <div style={{ marginTop: "0.35rem", fontSize: "0.68rem", color: "var(--text-muted)", lineHeight: 1.35 }}>
          Track 02 · Critical infra video intel
        </div>
      </div>
      <nav style={{ display: "flex", flexDirection: "column", marginTop: 4 }}>
        {items.map(({ panel, label, icon }) => {
          const isActive = panel == null ? activePanel == null : activePanel === panel;
          return (
            <button
              key={label}
              type="button"
              className={`soc-nav-link${isActive ? " soc-nav-link--active" : ""}`}
              onClick={() => go(panel)}
            >
              <span className="soc-nav-icon" aria-hidden>
                {icon}
              </span>
              {label}
            </button>
          );
        })}
      </nav>
      <div className="soc-sidebar-footer">
        <div style={{ fontWeight: 800, letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: 6 }}>DATA PLANE</div>
        Amazon Bedrock · TwelveLabs Marengo / Pegasus
        <br />
        GridStatus · EIA · Qiskit / IBM Quantum
      </div>
    </aside>
  );
}
