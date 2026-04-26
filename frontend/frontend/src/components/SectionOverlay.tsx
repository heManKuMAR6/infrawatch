import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnalysisPage } from "@/pages/AnalysisPage";
import { ConnectivityPage } from "@/pages/ConnectivityPage";
import { StreamPage } from "@/pages/StreamPage";
import { parseSocPanel, socPanelSubtitle, socPanelTitle, type SocPanel } from "@/lib/socPanel";

export function SectionOverlay() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const panel = parseSocPanel(searchParams.get("panel"));
  const closeRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    navigate({ pathname: "/", search: "" }, { replace: true });
  }, [navigate]);

  useEffect(() => {
    if (!panel) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [panel, close]);

  if (!panel) return null;

  const tree = (
    <div className="soc-section-overlay" role="dialog" aria-modal="true" aria-labelledby="soc-section-overlay-title">
      <button type="button" className="soc-section-overlay-backdrop" aria-label="Close panel" onClick={close} />
      <div className="soc-section-overlay-panel">
        <header className="soc-section-overlay-head">
          <div>
            <div className="soc-section-overlay-kicker">SOC module</div>
            <h2 id="soc-section-overlay-title" className="soc-section-overlay-title">
              {socPanelTitle(panel)}
            </h2>
            <p className="soc-section-overlay-sub">{socPanelSubtitle(panel)}</p>
          </div>
          <button ref={closeRef} type="button" className="soc-section-overlay-close soc-btn-outline" onClick={close}>
            Close · Esc
          </button>
        </header>
        <div className="soc-section-overlay-body">
          <PanelBody panel={panel} />
        </div>
      </div>
    </div>
  );

  return createPortal(tree, document.body);
}

function PanelBody({ panel }: { panel: SocPanel }) {
  switch (panel) {
    case "analysis":
      return <AnalysisPage embedded />;
    case "stream":
      return <StreamPage embedded />;
    case "connectivity":
      return <ConnectivityPage embedded />;
    default:
      return null;
  }
}
