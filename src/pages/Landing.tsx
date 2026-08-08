import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Bell,
  Camera,
  Cpu,
  FileText,
  Image,
  Link2,
  Lock,
  MapPin,
  Search,
  ShoppingBag,
  Sparkles,
  StickyNote,
  TrendingDown,
} from "lucide-react";
import { useNavigate } from "react-router";
import { cn } from "@/lib/utils";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.55, ease: "easeOut" as const },
};

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const goApp = () => navigate(isAuthenticated ? "/app" : "/auth?returnTo=%2Fapp");

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <button type="button" onClick={() => navigate("/")} className="cursor-pointer">
            <Logo />
          </button>
          <nav className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex">
            <a href="#how" className="transition-colors hover:text-foreground">How it works</a>
            <a href="#features" className="transition-colors hover:text-foreground">Features</a>
            <a href="#privacy" className="transition-colors hover:text-foreground">Privacy</a>
            <a href="#intelligence" className="transition-colors hover:text-foreground">Intelligence</a>
            <a href="#pricing" className="transition-colors hover:text-foreground">Pricing</a>
            <a href="#faq" className="transition-colors hover:text-foreground">FAQ</a>
          </nav>
          <Button className="gap-1.5 rounded-xl font-semibold" onClick={goApp}>
            {isAuthenticated ? "Open DROP" : "Start Dropping"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-40 left-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-primary/15 blur-[120px]" />
          <div className="absolute -left-32 top-64 h-72 w-72 rounded-full bg-sky-500/10 blur-[100px]" />
          <div className="absolute -right-24 top-40 h-72 w-72 rounded-full bg-amber-400/10 blur-[100px]" />
        </div>
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-2 lg:pt-24">
          <div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1.5 text-xs font-bold text-primary">
                <Sparkles className="h-3.5 w-3.5" /> Your AI-powered second brain
              </span>
              <h1 className="mt-6 text-5xl font-extrabold leading-[1.04] tracking-tight sm:text-6xl lg:text-7xl">
                Everything you save.
                <br />
                <span className="text-primary">Finally searchable.</span>
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">
                Screenshots, links, products, places, tickets, ideas — DROP
                understands each one, files it automatically, and finds it later
                when you ask in plain words.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button
                  size="lg"
                  className="h-13 gap-2 rounded-2xl px-7 text-base font-semibold shadow-lg shadow-primary/25"
                  onClick={goApp}
                >
                  Start Dropping <ArrowRight className="h-4 w-4" />
                </Button>
                <a href="#how">
                  <Button size="lg" variant="outline" className="h-13 rounded-2xl px-6 text-base">
                    See how it works
                  </Button>
                </a>
              </div>
              <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
                <Lock className="h-3.5 w-3.5" /> Private by default. No organizing. No folders to fill.
              </p>
            </motion.div>
          </div>

          {/* Demo mockup */}
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="relative"
          >
            <DemoMockup />
          </motion.div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-y border-border/50 bg-muted/30">
        <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
          <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold uppercase tracking-widest text-primary">How it works</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
              Drop it now. Find it later.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Three steps. No folders, no tagging, no thinking.
            </p>
          </motion.div>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {[
              { icon: Camera, title: "1 · Drop it", desc: "Screenshot, photo, link, note or document. Paste, drag, or share — it's saved instantly.", emoji: "📸" },
              { icon: Sparkles, title: "2 · DROP understands it", desc: "AI reads what's inside: what it is, its price, its place, its date, and why it matters.", emoji: "✨" },
              { icon: Search, title: "3 · Find it in words", desc: "“the black shoes I saved” — DROP finds the right screenshot from a vague sentence.", emoji: "🔎" },
            ].map((s, i) => (
              <motion.div
                key={s.title}
                {...fadeUp}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="rounded-3xl border border-border/70 bg-card p-6"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/12 text-2xl">
                  {s.emoji}
                </span>
                <h3 className="mt-4 text-lg font-bold tracking-tight">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Save anything */}
      <section id="features" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-primary">Save anything</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
            One place for your digital life
          </h2>
          <p className="mt-4 text-muted-foreground">
            It replaces the screenshot folder, the bookmark bar, the saved posts,
            the wishlist, and the “I'll remember this” pile.
          </p>
        </motion.div>
        <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { icon: Camera, label: "Screenshots", desc: "OCR'd & searchable" },
            { icon: Image, label: "Photos", desc: "AI describes them" },
            { icon: Link2, label: "Links & posts", desc: "Instagram, TikTok, web" },
            { icon: ShoppingBag, label: "Products", desc: "Price + wishlist" },
            { icon: MapPin, label: "Places", desc: "Restaurants, hotels, trips" },
            { icon: StickyNote, label: "Notes", desc: "Thoughts & ideas" },
            { icon: FileText, label: "Documents", desc: "PDFs, summarized" },
            { icon: Bell, label: "Reminders", desc: "Flights, returns, events" },
          ].map((f, i) => (
            <motion.div
              key={f.label}
              {...fadeUp}
              transition={{ duration: 0.45, delay: i * 0.06 }}
              className="group rounded-3xl border border-border/70 bg-card p-5 transition-colors hover:border-primary/30"
            >
              <f.icon className="h-5 w-5 text-primary transition-transform group-hover:scale-110" />
              <p className="mt-3 font-bold tracking-tight">{f.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Ask DROP + travel/shopping split */}
      <section className="border-y border-border/50 bg-muted/30">
        <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-20 sm:px-6 lg:grid-cols-3">
          <motion.div {...fadeUp} className="rounded-3xl border border-border/70 bg-card p-7 lg:col-span-2">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/12 text-primary">
              <Sparkles className="h-5 w-5" />
            </span>
            <h3 className="mt-4 text-2xl font-extrabold tracking-tight">Ask DROP anything about your stuff</h3>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
              Not just search — answers. “Which hotel should I pick for Barcelona?” DROP
              compares the five hotels you actually saved, prices and all. It only ever
              answers from your Drops.
            </p>
            <div className="mt-5 space-y-2.5">
              {[
                "“Compare the cameras I've been looking at”",
                "“What did I save for my apartment?”",
                "“When did I buy my headphones?”",
              ].map((q) => (
                <div key={q} className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/60 px-4 py-3">
                  <span className="text-primary">💬</span>
                  <span className="text-sm">{q}</span>
                </div>
              ))}
            </div>
          </motion.div>

          <div className="space-y-6">
            <motion.div {...fadeUp} transition={{ duration: 0.45, delay: 0.05 }} className="rounded-3xl border border-border/70 bg-card p-6">
              <TrendingDown className="h-5 w-5 text-primary" />
              <h4 className="mt-3 font-bold tracking-tight">A wishlist that builds itself</h4>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Save any product — DROP records the price, store and color, and
                gathers everything into your Wishlist.
              </p>
            </motion.div>
            <motion.div {...fadeUp} transition={{ duration: 0.45, delay: 0.12 }} className="rounded-3xl border border-border/70 bg-card p-6">
              <MapPin className="h-5 w-5 text-primary" />
              <h4 className="mt-3 font-bold tracking-tight">Trips, organized for you</h4>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Hotels, flights and restaurants file themselves under Places,
                Upcoming and a suggested Tokyo Trip.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Privacy */}
      <section id="privacy" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-primary">Privacy</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Your memory. Not ours.
          </h2>
          <p className="mt-4 text-muted-foreground">
            DROP is built around trust. Your screenshots and documents stay yours.
          </p>
        </motion.div>
        <div className="mt-12 grid gap-3 sm:grid-cols-3">
          {[
            { icon: Lock, title: "Private by default", desc: "Nothing you save is ever public. Ever." },
            { icon: Lock, title: "Signed, private files", desc: "Uploads are served through private signed URLs." },
            { icon: Lock, title: "You control it all", desc: "Export your data or delete your account — everything, anytime." },
          ].map((p, i) => (
            <motion.div
              key={p.title}
              {...fadeUp}
              transition={{ duration: 0.45, delay: i * 0.08 }}
              className="rounded-3xl border border-border/70 bg-card p-6"
            >
              <Lock className="h-5 w-5 text-primary" />
              <h4 className="mt-3 font-bold tracking-tight">{p.title}</h4>
              <p className="mt-1.5 text-sm text-muted-foreground">{p.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* DROP Intelligence */}
      <section id="intelligence" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-primary">DROP Intelligence</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
            It already knows how to think.
          </h2>
          <p className="mt-4 text-muted-foreground">
            DROP's AI lives on your device and sets itself up automatically. You
            never configure it — you just start Dropping.
          </p>
        </motion.div>
        <div className="mt-12 grid items-center gap-6 lg:grid-cols-2">
          <motion.div
            {...fadeUp}
            className="rounded-3xl border border-primary/25 bg-card p-8 shadow-xl shadow-primary/5"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/12 text-primary">
              <Sparkles className="h-6 w-6" />
            </span>
            <h3 className="mt-4 text-xl font-extrabold tracking-tight">Zero configuration. By design.</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Install DROP → open it → it understands. There are no servers to
              install, no API keys to paste, no models to choose and no
              localhost to type.
            </p>
            <ul className="mt-5 space-y-2.5">
              {[
                "Runs on-device — private, fast, works offline",
                "Automatically picks the best engine for your phone",
                "No accounts with AI providers, no usage limits",
                "Never uploads screenshots to third-party AI",
              ].map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm">
                  <span className="text-primary">✓</span> {f}
                </li>
              ))}
            </ul>
          </motion.div>
          <motion.div {...fadeUp} transition={{ duration: 0.45, delay: 0.08 }} className="space-y-3">
            {[
              {
                icon: Sparkles,
                title: "Apple Intelligence-ready iPhones & supported Androids",
                desc: "Uses the system's on-device AI — the best of everything, instantly.",
              },
              {
                icon: Cpu,
                title: "Every other phone",
                desc: "DROP's own private on-device engine, downloaded once and cached securely. One-time setup, no technical choices.",
              },
              {
                icon: Search,
                title: "Small or older phones",
                desc: "A fast, light mode still reads your screenshots, understands them and finds them — just leaner.",
              },
            ].map((card) => (
              <div key={card.title} className="flex items-start gap-4 rounded-2xl border border-border/70 bg-card p-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                  <card.icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-bold tracking-tight">{card.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{card.desc}</p>
                </div>
              </div>
            ))}
            <p className="px-1 pt-1 text-xs leading-relaxed text-muted-foreground">
              You'll never see the engine. You'll only see it work.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-y border-border/50 bg-muted/30">
        <div className="mx-auto w-full max-w-5xl px-4 py-20 sm:px-6">
          <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold uppercase tracking-widest text-primary">Pricing</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
              Start free. Feel the magic first.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Save, search, and experience the “aha” — then go Pro when you're ready.
            </p>
          </motion.div>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {[
              {
                name: "Free",
                price: "$0",
                period: "forever",
                cta: "Start free",
                features: ["100 Drops", "Basic search", "Basic AI organization", "1 collection"],
              },
              {
                name: "Pro",
                price: "$5.99",
                period: "/month",
                cta: "Go Pro",
                highlight: true,
                features: [
                  "Unlimited Drops",
                  "Advanced AI search & Ask DROP",
                  "Document understanding",
                  "Smart reminders & travel",
                  "Wishlist & unlimited collections",
                ],
              },
              {
                name: "Family",
                price: "$9.99",
                period: "/month",
                cta: "Invite the family",
                features: [
                  "Up to 5 people",
                  "Private accounts",
                  "Shared collections & trips",
                  "Shared shopping lists",
                ],
              },
            ].map((plan, i) => (
              <motion.div
                key={plan.name}
                {...fadeUp}
                transition={{ duration: 0.45, delay: i * 0.08 }}
                className={cn(
                  "relative rounded-3xl border p-6",
                  plan.highlight
                    ? "border-primary/50 bg-card shadow-xl shadow-primary/10"
                    : "border-border/70 bg-card/60",
                )}
              >
                {plan.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-[11px] font-bold text-primary-foreground">
                    MOST POPULAR
                  </span>
                )}
                <h4 className="font-bold tracking-tight">{plan.name}</h4>
                <p className="mt-3">
                  <span className="text-3xl font-extrabold tracking-tight">{plan.price}</span>
                  <span className="text-sm text-muted-foreground"> {plan.period}</span>
                </p>
                <ul className="mt-5 space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <span className="text-primary">✓</span> {f}
                    </li>
                  ))}
                </ul>
                <Button
                  className={cn("mt-6 w-full rounded-xl font-semibold", plan.highlight ? "" : "variant-outline")}
                  variant={plan.highlight ? "default" : "outline"}
                  onClick={goApp}
                >
                  {plan.cta}
                </Button>
              </motion.div>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Pro is also available for $49.99/year. Family for $99.99/year.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto w-full max-w-3xl px-4 py-20 sm:px-6">
        <motion.div {...fadeUp} className="text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-primary">FAQ</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Questions, answered</h2>
        </motion.div>
        <motion.div {...fadeUp} className="mt-10">
          <Accordion type="single" collapsible className="space-y-2.5">
            {[
              { q: "How does DROP understand my screenshots?", a: "A multimodal AI reads the image like you would — it sees the product, the text, the price and the place — then files it under a smart title and category automatically." },
              { q: "Do I need to organize anything?", a: "No. DROP does the organizing. Collections exist, but they're optional — you can search everything in plain words instead." },
              { q: "Is my stuff private?", a: "Yes. Drops are private by default, files use signed URLs, and your content is never used to train models. You can export or delete everything anytime." },
              { q: "What happens if the AI can't figure something out?", a: "Your Drop is still saved instantly. It just waits in your Inbox marked “needs review” until you help it — or retry it later. Nothing is ever lost." },
              { q: "Does DROP need any AI setup?", a: "No. DROP Intelligence runs automatically on your device — no servers, API keys or models to configure. On phones that support it, DROP uses the system's on-device AI; everywhere else it uses its own private engine with a simple one-time download." },
              { q: "Does DROP see my screenshots?", a: "DROP reads them to understand what they contain — that's the whole point — and it does so privately: on-device analysis, private by default, nothing ever public." },
              { q: "What counts toward the free 100 Drops?", a: "Every item you save — screenshots, links, notes, documents. Delete a Drop and the space frees up." },
            ].map((item) => (
              <AccordionItem key={item.q} value={item.q} className="rounded-2xl border border-border/70 bg-card px-5">
                <AccordionTrigger className="py-4 text-left font-semibold tracking-tight">{item.q}</AccordionTrigger>
                <AccordionContent className="pb-4 text-sm leading-relaxed text-muted-foreground">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden border-t border-border/50">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 h-72 w-[720px] -translate-x-1/2 rounded-full bg-primary/15 blur-[110px]" />
        </div>
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center px-4 py-24 text-center sm:px-6">
          <motion.div {...fadeUp}>
            <h2 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
              Remember everything.
              <br />
              Organize nothing.
            </h2>
            <p className="mx-auto mt-5 max-w-md text-lg text-muted-foreground">
              Stop losing what you save. Join DROP and never search your own
              screenshots folder again.
            </p>
            <Button
              size="lg"
              className="mt-8 h-14 gap-2 rounded-2xl px-9 text-base font-semibold shadow-lg shadow-primary/25"
              onClick={goApp}
            >
              Start Dropping <ArrowRight className="h-4 w-4" />
            </Button>
            <p className="mt-4 text-sm text-muted-foreground">Free to start · No credit card · 30 seconds to your first Drop</p>
          </motion.div>
        </div>
      </section>

      <footer className="border-t border-border/50">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-6 px-4 py-10 sm:flex-row sm:px-6">
          <Logo withTagline />
          <div className="flex gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-foreground">Terms</a>
            <a href="#" className="hover:text-foreground">Privacy</a>
            <a href="mailto:hello@drop.app" className="hover:text-foreground">Contact</a>
          </div>
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} DROP. Everything you save. Finally searchable.</p>
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hero demo mockup — screenshot → AI understanding → search          */
/* ------------------------------------------------------------------ */
function DemoMockup() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br from-primary/25 via-transparent to-amber-400/20 blur-2xl" />
      <div className="space-y-4">
        {/* Search */}
        <div className="rounded-3xl border border-border/60 bg-card/90 p-4 shadow-2xl shadow-black/20 backdrop-blur-xl">
          <div className="flex items-center gap-2.5 rounded-2xl bg-muted px-4 py-3">
            <Search className="h-4 w-4 text-primary" />
            <span className="text-sm text-muted-foreground">“black shoes I saved”</span>
            <Sparkles className="ml-auto h-4 w-4 text-primary" />
          </div>
        </div>

        {/* The Nike drop */}
        <div className="overflow-hidden rounded-3xl border border-border/60 bg-card/90 shadow-2xl shadow-black/20 backdrop-blur-xl">
          <div className="relative">
            <ShoeImage />
            <span className="absolute bottom-3 left-3 rounded-full bg-background/85 px-3 py-1.5 text-xs font-bold backdrop-blur">
              Understanding your Drop… ✨
            </span>
          </div>
          <div className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <p className="text-lg font-extrabold tracking-tight">Black Nike Air Max 95</p>
              <span className="text-lg font-extrabold text-primary">€129</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-600 dark:text-amber-300">🛍️ Products</span>
              <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-300">📍 Nike · Shoe size 42</span>
              <span className="rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">Wishlist</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="h-8 flex-1 rounded-xl text-xs font-semibold">
                Track price <TrendingDown className="ml-1 h-3 w-3" />
              </Button>
              <Button size="sm" variant="outline" className="h-8 flex-1 rounded-xl text-xs font-semibold">
                <ShoppingBag className="mr-1 h-3 w-3" /> Buy later
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShoeImage() {
  return (
    <div className="relative flex aspect-[5/3] w-full items-center justify-center overflow-hidden bg-gradient-to-br from-zinc-200 via-zinc-300 to-zinc-400 dark:from-zinc-800 dark:via-zinc-700 dark:to-zinc-800">
      {/* Abstract sneaker silhouette */}
      <svg viewBox="0 0 200 120" className="h-3/4 w-3/4 drop-shadow-xl">
        <path
          d="M20 78c14-8 26-14 40-16 14-2 22 4 28 10 8 8 20 10 32 8 12-2 22-8 32-12 6-2 12-2 16 2 4 4 8 8 10 12 2 4 0 8-4 10-6 2-12 4-18 5-30 4-62 4-92-2-14-2-28-6-40-12-2-2-6-3-8-5z"
          className="fill-zinc-950 dark:fill-zinc-100"
        />
        <path d="M44 64c10-2 18 2 24 8" className="stroke-primary stroke-2 fill-none" />
        <path d="M132 66c8-3 16-4 24-3" className="stroke-primary stroke-2 fill-none" />
        <circle cx="164" cy="58" r="3" className="fill-primary" />
      </svg>
      <span className="absolute right-3 top-3 rounded-full bg-background/80 px-2.5 py-1 text-[10px] font-bold backdrop-blur">
        nike.com
      </span>
    </div>
  );
}
