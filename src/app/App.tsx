import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppShell } from "@/components/layout/AppShell";
import { TooltipProvider } from "@/components/ui/Tooltip";

export function App() {
  return (
    <ErrorBoundary label="application" fullScreen>
      <TooltipProvider>
        <AppShell />
      </TooltipProvider>
    </ErrorBoundary>
  );
}
