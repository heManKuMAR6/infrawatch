import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type Bundle = Record<string, unknown> | null;

type Ctx = {
  bundle: Bundle;
  setBundle: (b: Bundle) => void;
  clearBundle: () => void;
};

const BundleContext = createContext<Ctx | null>(null);

export function BundleProvider({ children }: { children: ReactNode }) {
  const [bundle, setBundleState] = useState<Bundle>(null);

  const setBundle = useCallback((b: Bundle) => {
    setBundleState(b);
  }, []);

  const clearBundle = useCallback(() => setBundleState(null), []);

  const value = useMemo(
    () => ({ bundle, setBundle, clearBundle }),
    [bundle, setBundle, clearBundle],
  );

  return <BundleContext.Provider value={value}>{children}</BundleContext.Provider>;
}

export function useBundle() {
  const c = useContext(BundleContext);
  if (!c) throw new Error("useBundle must be used within BundleProvider");
  return c;
}
