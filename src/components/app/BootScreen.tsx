import { DropMark } from "@/components/Logo";

/**
 * Branded boot screen — shown while the session is being restored
 * (startupState === "BOOTING"). Matches the native splash + inline HTML
 * splash so there's never a white flash or a bare spinner between launch
 * and content.
 */
export function BootScreen() {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-background">
      <div className="relative flex h-24 w-24 items-center justify-center">
        <span className="absolute inset-0 rounded-[2rem] bg-primary/15 animate-drop-ping" />
        <span className="absolute inset-2 rounded-[1.6rem] bg-primary/10 animate-drop-ping-slow" />
        <DropMark className="relative h-16 w-16 animate-drop-splash" />
      </div>
      <div className="flex flex-col items-center gap-1.5">
        <span className="text-2xl font-extrabold tracking-[0.08em] text-foreground">DROP</span>
        <span className="text-xs font-medium text-muted-foreground">
          Restoring your memory…
        </span>
      </div>
    </div>
  );
}
