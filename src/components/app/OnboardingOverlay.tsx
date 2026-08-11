import { DropMark } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { profileService } from "@/lib/services";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, Search, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const STEPS = [
  {
    icon: <DropMark className="h-12 w-12" />,
    title: "Save anything.",
    desc: "Screenshots, links, products, places, notes — drop them in and they're saved instantly.",
  },
  {
    icon: <Camera className="h-10 w-10 text-primary" />,
    title: "Organize nothing.",
    desc: "DROP understands it automatically — smart titles, prices, places and dates, with no folders.",
  },
  {
    icon: <Search className="h-10 w-10 text-primary" />,
    title: "Find everything.",
    desc: "“Black shoes I saved last month” — DROP finds it. Search naturally, later.",
  },
];

export function OnboardingOverlay() {
  const { t } = useTranslation();
  // The overlay stays mounted while the user is signed in; it decides its own
  // visibility from the reactive user record. This lets AnimatePresence finish
  // the exit animation cleanly.
  const { user, refreshProfile } = useAuth();
  const open = user ? user.onboardingDone !== true : false;

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    setBusy(true);
    try {
      if (user?.id) {
        await profileService.updateProfile(user.id, { onboardingDone: true });
        // Refresh the reactive user record so this overlay closes AND the
        // first-launch permission setup (which waits for onboarding to
        // complete) can appear.
        await refreshProfile();
      }
    } finally {
      setBusy(false);
    }
  };

  const current = STEPS[step];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="onboarding"
          className="fixed inset-0 z-50 flex items-center justify-center bg-background"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {/* Subtle contained glow — never peeks outside the card */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[90px]" />
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.3 }}
              className="relative mx-4 flex w-full max-w-sm flex-col items-center rounded-[2rem] border border-border/70 bg-card p-8 text-center"
            >
              <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-accent/60">
                {current.icon}
              </div>
              <h2 className="mt-6 text-2xl font-extrabold leading-tight tracking-tight">
                {current.title}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {current.desc}
              </p>

              {/* Progress dots */}
              <div className="mt-6 flex gap-1.5">
                {STEPS.map((_, i) => (
                  <span
                    key={i}
                    className={
                      i <= step
                        ? "h-1.5 w-6 rounded-full bg-primary transition-all"
                        : "h-1.5 w-1.5 rounded-full bg-border transition-all"
                    }
                  />
                ))}
              </div>

              <div className="mt-6 flex w-full items-center gap-2">
                {step > 0 && (
                  <Button
                    variant="ghost"
                    onClick={() => setStep((s) => Math.max(0, s - 1))}
                  >
                    {t("common.back")}
                  </Button>
                )}
                <Button
                  className="flex-1 gap-2 rounded-xl font-semibold"
                  disabled={busy}
                  onClick={async () => {
                    if (step < STEPS.length - 1) setStep((s) => s + 1);
                    else {
                      await finish();
                      toast(t("capture.saved"), { description: t("home.emptyDesc") });
                    }
                  }}
                >
                  {busy
                    ? "…"
                    : step === STEPS.length - 1
                      ? t("common.save")
                      : t("common.next")}
                  {!busy && step === STEPS.length - 1 && <Sparkles className="h-4 w-4" />}
                </Button>
              </div>
              <button
                type="button"
                onClick={() => void finish()}
                className="mt-3 cursor-pointer text-xs text-muted-foreground hover:text-foreground"
              >
                {t("common.skip")}
              </button>
            </motion.div>
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
