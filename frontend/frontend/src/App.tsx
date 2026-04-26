import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { BundleProvider } from "@/context/BundleContext";
import { ProcessingProvider } from "@/context/ProcessingContext";
import { ThemeProvider } from "@/theme/ThemeContext";
import { AppShell } from "@/components/AppShell";
import { DashboardPage } from "@/pages/DashboardPage";

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <ProcessingProvider>
          <BundleProvider>
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<DashboardPage />} />
                <Route path="analysis" element={<Navigate to="/?panel=analysis" replace />} />
                <Route path="connectivity" element={<Navigate to="/?panel=connectivity" replace />} />
                <Route path="stream" element={<Navigate to="/?panel=stream" replace />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BundleProvider>
        </ProcessingProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
