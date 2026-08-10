import { DropMark } from "@/components/Logo";
import { useTranslation } from "react-i18next";

/**
 * Branded boot screen — shown while the session is being restored
 * (startupState === "BOOTING"). Matches the native splash + inline HTML
 * splash so there's never a white flash or a bare spinner between launch
 * and content. Deliberately calm: no pulsing rings, no bright glow.
 */
export function BootScreen() {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-background">
      <div className="animate-drop-splash">
        <DropMark className="h-16 w-16" />
      </div>
      <div className="flex flex-col items-center gap-1.5">
        <span className="text-2xl font-extrabold tracking-[0.08em] text-foreground">DROP</span>
        <span className="text-xs font-medium text-muted-foreground">
          {t("states.loadingMemory")}
        </span>
      </div>
    </div>
  );
}
