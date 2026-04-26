import { useEffect, useState } from "react";

export function SocClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const utc = now.toISOString().slice(11, 19);
  const local = now.toLocaleTimeString(undefined, { hour12: false });

  return (
    <div className="soc-clock" title="Operator console time">
      <span>UTC {utc}</span>
      <span style={{ opacity: 0.45, margin: "0 0.35rem" }}>|</span>
      <span>LOC {local}</span>
    </div>
  );
}
