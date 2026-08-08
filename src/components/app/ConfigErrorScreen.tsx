import { DropMark } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

/**
 * FATAL_CONFIGURATION_ERROR screen.
 *
 * Only reachable when the production bundle was built without the Supabase
 * keys (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY). The build now
 * fails loudly in that case, so this is a safety net — never a broken white
 * screen or a raw "Failed to fetch".
 */
export function ConfigErrorScreen() {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-background px-8 text-center">
      <DropMark className="h-14 w-14" />
      <div className="flex max-w-sm flex-col items-center gap-2">
        <h1 className="text-lg font-bold tracking-tight">DROP can't connect yet</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          This build is missing its backend connection. Add{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">VITE_SUPABASE_URL</code> and{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">VITE_SUPABASE_PUBLISHABLE_KEY</code>{" "}
          in your project's keys, then rebuild.
        </p>
      </div>
      <Button
        variant="outline"
        className="gap-2 rounded-2xl"
        onClick={() => window.location.reload()}
      >
        <RefreshCw className="h-4 w-4" />
        Try again
      </Button>
    </div>
  );
}
