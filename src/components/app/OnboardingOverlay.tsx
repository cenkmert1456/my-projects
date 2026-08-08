import { api } from "@/convex/_generated/api";
import { DropMark } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Camera, Search, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const STEPS = [
  {
    icon: <DropMark className="h-16 w-16" />,
    title: "Never lose something you saved again.",
    desc: "Screenshots, links, products, places — drop them in, and they're remembered forever.",
  },
  {
    icon: <Camera className="h-10 w-10 text-primary" />,
    title: "Save anything. Instantly.",
    desc: "Screenshots, photos, links, notes, documents — paste, drag, or drop. It's saved the moment you add it.",
  },
  {
    icon: <Sparkles className="h-10 w-10 text-primary" />,
    title: "DROP understands it all.",
    desc: "AI reads what's inside, creates a smart title, extracts the price, place and date — and organizes everything for you.",
  },
  {
    icon: <Search className="h-10 w-10 text-primary" />,
    title: "Find it with a sentence.",
    desc: "“Where was that hotel I saved for Tokyo?” DROP finds it. No folders, no organizing.",
  },
];

export function OnboardingOverlay() {
  // The overlay stays mounted while the user is signed in; it decides its own
  // visibility from the reactive user record. This lets AnimatePresence finish
  // the exit animation cleanly — unmounting this component from an external
  // conditional while AnimatePresence owns exiting DOM nodes crashes React with
  // "The node to be removed is not a child of this node."
  const { user } = useAuth();
  const open = user ? user.onboardingDone !== true : false;

  const [step, setStep] = useState(0);
  const [withDemo, setWithDemo] = useState(true);
  const [busy, setBusy] = useState(false);
  const updateProfile = useMutation(api.profile.updateProfile);
  const loadDemoData = useMutation(api.profile.loadDemoData);

  const finish = async () => {
    setBusy(true);
    try {
      if (withDemo) {
        try {
          await loadDemoData();
        } catch {
          // demo data is optional
        }
      }
      await updateProfile({ patch: { onboardingDone: true } });
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute left-1/2 top-1/3 h-80 w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[100px]" />
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.35 }}
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

              {step === STEPS.length - 1 && (
                <label className="mt-5 flex cursor-pointer items-center gap-2.5 rounded-2xl border border-border/80 bg-muted/50 px-4 py-3 text-sm">
                  <input
                    type="checkbox"
                    checked={withDemo}
                    onChange={(e) => setWithDemo(e.target.checked)}
                    className="h-4 w-4 accent-[var(--primary)]"
                  />
                  <span className="text-left">
                    <span className="block font-semibold">
                      Try with sample Drops
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Shoes, flights, restaurants — feel the magic instantly
                    </span>
                  </span>
                </label>
              )}

              <div className="mt-6 flex w-full items-center gap-2">
                {step > 0 && (
                  <Button
                    variant="ghost"
                    onClick={() => setStep((s) => Math.max(0, s - 1))}
                  >
                    Back
                  </Button>
                )}
                <Button
                  className="flex-1 gap-2 rounded-xl font-semibold"
                  disabled={busy}
                  onClick={async () => {
                    if (step < STEPS.length - 1) setStep((s) => s + 1);
                    else {
                      await finish();
                      toast("Welcome to DROP ✨", {
                        description:
                          "Drop your first screenshot or link — DROP takes it from there.",
                      });
                    }
                  }}
                >
                  {busy
                    ? "Getting ready…"
                    : step === STEPS.length - 1
                      ? "Start dropping"
                      : "Next"}
                  {!busy && <ArrowRight className="h-4 w-4" />}
                </Button>
              </div>
              <button
                type="button"
                onClick={() => void finish()}
                className="mt-3 cursor-pointer text-xs text-muted-foreground hover:text-foreground"
              >
                Skip for now
              </button>
            </motion.div>
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
