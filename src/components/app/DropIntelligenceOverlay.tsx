// DropIntelligenceOverlay — the one-time "DROP Intelligence" initialization
// screen. Shown only on native devices that need the engine provisioned.
// No technical terminology: users see "Preparing your private AI…", a
// progress bar, and a simple one-time download confirmation. It never shows
// models, tiers, keys or servers.

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Download, Loader2, WifiOff } from "lucide-react";
import { useDropAI } from "@/lib/drop-ai";
import { isNative } from "@/lib/mobile/platform";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";

export default function DropIntelligenceOverlay() {
  const { engine, status } = useDropAI();
  const [visible, setVisible] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const active =
    isNative() &&
    (status.phase === "detecting" ||
      status.phase === "downloading" ||
      (status.phase === "error" && status.label === "needs_confirmation"));

  useEffect(() => {
    if (active) {
      setConfirming(status.phase === "error");
      setVisible(true);
      return;
    }
    // Ready → short celebration, then dismiss.
    if (status.phase === "ready" && visible) {
      setCelebrating(true);
      const t = setTimeout(() => {
        setCelebrating(false);
        setVisible(false);
      }, 1100);
      return () => clearTimeout(t);
    }
  }, [status.phase, active, visible]);

  if (!visible) return null;

  const downloading = status.phase === "downloading";
  const detecting = status.phase === "detecting";
  const pct = Math.round((status.progress ?? 0) * 100);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-background px-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="flex flex-col items-center text-center"
          initial={{ scale: 0.94, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.div
            animate={celebrating ? { scale: [1, 1.12, 1] } : detecting || downloading ? { scale: [1, 1.06, 1] } : undefined}
            transition={{ duration: 1.6, repeat: detecting || downloading ? Infinity : 0 }}
            className="relative"
          >
            <Logo />
          </motion.div>

          <h1 className="mt-6 text-2xl font-bold tracking-tight">DROP Intelligence</h1>

          {celebrating ? (
            <motion.p
              className="mt-2 flex items-center gap-2 text-emerald-600 dark:text-emerald-300"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Check className="h-4 w-4" />
              Ready
            </motion.p>
          ) : confirming ? (
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
              DROP needs to download its AI engine once (≈1.8 GB). It makes
              DROP smarter on this device — and you can use DROP normally
              while it downloads.
            </p>
          ) : (
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
              {detecting
                ? "Preparing your private AI…"
                : "Downloading AI model"}
            </p>
          )}

          {downloading && (
            <div className="mt-6 w-64">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <motion.div
                  className="h-full rounded-full bg-primary"
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <p className="mt-2 text-xs font-semibold text-muted-foreground">{pct}%</p>
            </div>
          )}

          {detecting && (
            <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              One-time setup
            </div>
          )}

          {confirming && (
            <div className="mt-6 flex w-64 flex-col gap-2">
              <Button
                className="gap-2 rounded-2xl"
                onClick={async () => {
                  await engine?.setPolicy({ wifiOnly: false });
                  await engine?.prepare();
                }}
              >
                <Download className="h-4 w-4" />
                Download now
              </Button>
              <Button
                variant="outline"
                className="gap-2 rounded-2xl"
                onClick={() => {
                  setConfirming(false);
                  setVisible(false);
                }}
              >
                <WifiOff className="h-4 w-4" />
                Wait for Wi-Fi
              </Button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
