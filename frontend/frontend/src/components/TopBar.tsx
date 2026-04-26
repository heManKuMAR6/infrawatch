import type { ReactNode } from "react";
import { SocClock } from "@/components/SocClock";
import { useTheme } from "@/theme/ThemeContext";

type Props = {
  title: string;
  subtitle?: string;
  /** Extra pills / controls (shown before clock) */
  extra?: ReactNode;
  showClock?: boolean;
};

export function TopBar({ title, subtitle, extra, showClock = true }: Props) {
  const { theme, toggle } = useTheme();

  return (
    <header className="soc-topbar">
      <div style={{ flex: "1 1 200px", minWidth: 0 }}>
        <h1>{title}</h1>
        {subtitle ? <p className="soc-topbar-sub">{subtitle}</p> : null}
      </div>
      <div className="soc-topbar-right">
        {extra}
        {showClock ? <SocClock /> : null}
        <button type="button" className="soc-btn-ghost" onClick={toggle} title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
          <span aria-hidden>{theme === "dark" ? "◐" : "◑"}</span>
          {theme === "dark" ? "Midnight" : "Daylight"}
        </button>
      </div>
    </header>
  );
}
