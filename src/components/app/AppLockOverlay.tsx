import { Button } from "@/components/ui/button";
import { DropMark } from "@/components/Logo";
import { Lock } from "lucide-react";
import { useEffect } from "react";
import { haptic } from "@/lib/mobile/native";

export function AppLockOverlay({
  onUnlock,
  onFallback,
}: {
  onUnlock: () => void;
  /** Fall back to the normal sign-in flow (no biometric hardware). */
  onFallback: () => void;
}) {
  useEffect(() => {
    haptic("light");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-background px-6 text-center">
      <DropMark className="h-16 w-16" />
      <div className="mt-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
        <Lock className="h-7 w-7" />
      </div>
      <h1 className="mt-5 text-2xl font-extrabold tracking-tight">DROP is locked</h1>
      <p className="mt-2 max-w-xs text-sm text-muted-foreground">
        Unlock with Face ID, Touch ID or your device PIN to view your memory.
      </p>
      <Button
        size="lg"
        className="mt-8 h-12 w-full max-w-xs rounded-2xl text-base font-semibold"
        onClick={onUnlock}
      >
        Unlock
      </Button>
      <button
        type="button"
        onClick={onFallback}
        className="mt-4 cursor-pointer text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        Use my DROP password instead
      </button>
    </div>
  );
}
