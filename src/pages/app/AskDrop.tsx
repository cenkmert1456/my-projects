import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { motion } from "framer-motion";
import { ArrowUp, Loader2, Lock, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { searchService } from "@/lib/services";
import type { AskSource } from "@/lib/supabase/database.types";
import { CATEGORY_META } from "@/lib/drop-meta";
import { cn } from "@/lib/utils";

interface Msg {
  role: "user" | "assistant";
  text?: string;
  sources?: AskSource[];
}

const SUGGESTIONS = [
  "Which hotel should I choose for Barcelona?",
  "What did I save about Paris?",
  "Compare the cameras I've been looking at",
  "What restaurants did I save near the Eiffel Tower?",
];

export default function AskDrop() {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const [params] = useSearchParams();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = params.get("q");
    if (q) {
      setInput(q);
      void send(q);
      params.delete("q");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || loading || !uid) return;
    setInput("");
    const nextMessages: Msg[] = [...messages, { role: "user", text }];
    setMessages(nextMessages);
    setLoading(true);
    try {
      // Pass the conversation so follow-ups keep context ("which one is cheaper?").
      const history = nextMessages
        .filter((m) => m.text)
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.text as string }))
        .slice(-8);
      const res = await searchService.askDrop(uid, { query: text, history });
      setMessages((m) => [...m, { role: "assistant", text: res.answer ?? undefined, sources: res.sources }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "Sorry — I couldn't search your Drops right now. Try again in a moment." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-[calc(100dvh-10.5rem)] flex-col lg:h-[calc(100dvh-8.5rem)]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Sparkles className="h-6 w-6 text-primary" /> Ask DROP
          </h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Lock className="h-3 w-3" /> Answers only from your saved Drops. Nothing else.
          </p>
        </div>
      </div>

      <div ref={scrollRef} className="nice-scroll mt-4 flex-1 space-y-4 overflow-y-auto pb-2">
        {messages.length === 0 && (
          <div className="flex flex-col items-center pt-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
              <Sparkles className="h-7 w-7" />
            </div>
            <h3 className="mt-4 text-lg font-bold tracking-tight">
              Ask about anything you've saved
            </h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              DROP reads your own Drops and answers — compare hotels, find that
              screenshot, recall prices.
            </p>
            <div className="mt-5 flex max-w-md flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="cursor-pointer rounded-2xl border border-border/80 bg-card px-4 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
                >
                  “{s}”
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-3",
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border/80 bg-card",
              )}
            >
              {m.role === "assistant" && (
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-primary">
                  <Sparkles className="h-3 w-3" /> DROP
                </p>
              )}
              {m.text && <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.text}</p>}
              {m.role === "assistant" && !m.text && m.sources && (
                <p className="text-sm font-medium">Based on your Drops:</p>
              )}
              {m.role === "assistant" && m.sources && m.sources.length > 0 && (
                <div className="mt-2.5">
                  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    Based on {m.sources.length} Drop{m.sources.length !== 1 ? "s" : ""}
                  </p>
                  <div className="space-y-2">
                    {m.sources.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => navigate(`/app/drop/${s.id}`)}
                        className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border/70 bg-muted/40 p-2.5 text-left transition-colors hover:border-primary/30"
                      >
                        <span className="text-lg">
                          {CATEGORY_META[s.category ?? "Other"]?.emoji ?? "📦"}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{s.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {s.facts ?? s.category ?? "Saved item"}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {m.role === "assistant" && !m.text && m.sources && m.sources.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  I couldn't find anything in your Drops about that yet. Try rephrasing, or drop it first.
                </p>
              )}
            </div>
          </motion.div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl border border-border/80 bg-card px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Thinking about your Drops…
            </div>
          </div>
        )}
      </div>

      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask DROP…"
          rows={1}
          className="max-h-28 min-h-11 flex-1 resize-none rounded-2xl py-3"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <Button
          type="submit"
          size="icon"
          disabled={!input.trim() || loading}
          className="h-11 w-11 shrink-0 rounded-2xl"
          aria-label="Ask"
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowUp className="h-5 w-5" />}
        </Button>
      </form>
    </div>
  );
}
