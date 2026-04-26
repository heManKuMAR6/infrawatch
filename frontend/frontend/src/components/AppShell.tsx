import { Outlet } from "react-router-dom";
import { SectionOverlay } from "@/components/SectionOverlay";
import { ProcessingHud } from "@/components/ProcessingHud";
import { Sidebar } from "./Sidebar";

export function AppShell() {
  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
      <Sidebar />
      <div className="soc-shell-main" style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "auto" }}>
        <Outlet />
      </div>
      <SectionOverlay />
      <ProcessingHud />
    </div>
  );
}
