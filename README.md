# DROP — Everything you save. Finally searchable.

DROP is an AI-powered personal memory system. It turns screenshots, links,
videos, notes, documents, receipts, products, places, reservations and saved
content into a searchable "second brain" — with one obsession:

**Save anything. Organize nothing. Find everything.**

The core loop is `SAVE → UNDERSTAND → SEARCH`:

1. Drop anything (screenshot, photo, link, note, document, paste, clipboard) —
   it's saved instantly. Multi-file drops, drag-and-drop anywhere, ⌘K command
   palette, ⌘⇧D quick capture.
2. DROP's AI pipeline analyzes it in the background: smart title, summary,
   category, entities (people, brands, places, prices, dates), product/place/
   event/receipt/flight details, suggested actions and reminders.
3. Later, find it with a vague human-memory query — *"those black shoes I
   saved"*, *"the hotel with the infinity pool"*, *"what I saved from
   Instagram last month"* — via hybrid keyword + semantic search with natural
   time-language parsing.

---

## Highlights

- **Free / self-hosted AI**: the whole pipeline runs on your own **Ollama**
  server with open-weight models (vision, text, embeddings) — zero API costs.
  Optional cloud Gemini as a fallback. DROP health-checks the provider at
  startup and degrades gracefully to its built-in deterministic analyzer, so
  the product never breaks.
- **Hybrid search** (`src/convex/search.ts`): keyword scoring + semantic
  vectors + metadata filters + favorites nudge, with natural time phrases
  ("last week", "around March") parsed into date windows.
- **Ask DROP with sources**: retrieval-augmented answers strictly from your
  own Drops, with referenced source cards and conversational follow-ups.
- **Trash & recovery**: soft delete → 30-day recoverable trash → permanent
  delete / empty trash, with restore.
- **Stacks**: active research groups ("Japan 2027", "New Gaming PC") — batch
  uploads auto-group into a stack.
- **Action Center**: aggregated return deadlines, upcoming plans, failed
  analyses, pending reminders, pinned Drops.
- **Settings → AI & Privacy**: live health check of your AI provider, model
  names, latency, and a clear **Local AI** badge when running on Ollama.
- Pinned / sensitive Drops, notes, bulk actions, duplicate detection + merge,
  data export, private-by-default everywhere.

---

## Stack

| Layer    | Technology                                                        |
| -------- | ----------------------------------------------------------------- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, Framer Motion |
| Backend  | **Convex** (managed serverless backend + database + file storage) |
| Auth     | Convex Auth — email OTP + anonymous (guest)                       |
| AI       | **Ollama (local, free)** → Gemini (cloud) → deterministic fallback, behind one abstraction |
| Search   | Hybrid: keyword scoring + semantic vectors (cosine) + metadata filters |

## Local setup

```bash
bun install
bun convex dev --once      # pushes backend functions & generates types
bun run dev                # starts the Vite dev server
```

Convex runs against the deployment configured via `VITE_CONVEX_URL`
(injected by the platform — secrets live in the Keys/API keys UI, never in
`.env` files).

---

## Free AI — Ollama (recommended)

DROP can run entirely on a local, self-hosted AI server. Nothing is
hardcoded to one model; DROP inspects the server's installed models at
runtime and picks the best configured match.

### 1. Install & start Ollama

```bash
# https://ollama.com — then:
ollama serve
```

### 2. Pull the recommended models

```bash
# Text (analysis, Ask DROP synthesis)
ollama pull qwen2.5:7b

# Vision (screenshot / image understanding, OCR)
ollama pull qwen2.5vl:7b

# Embeddings (semantic search)
ollama pull nomic-embed-text
```

Other supported open models (auto-detected if configured models are absent):
`llama3.2`, `gemma3`, `mistral`, `llama3.1` (text);
`llama3.2-vision`, `minicpm-v` (vision);
`bge-m3`, `all-minilm`, `mxbai-embed-large` (embeddings).

### 3. Configure environment variables

Set these in the platform's **Keys/API keys** UI (Convex env vars):

| Variable               | Default               | Purpose                                  |
| ---------------------- | --------------------- | ---------------------------------------- |
| `OLLAMA_BASE_URL`      | `http://localhost:11434` | Base URL of your Ollama server        |
| `OLLAMA_VISION_MODEL`  | auto-detect           | Vision model (screenshots, OCR)          |
| `OLLAMA_TEXT_MODEL`    | auto-detect           | Text model (analysis, Ask DROP)          |
| `OLLAMA_EMBEDDING_MODEL` | auto-detect         | Embedding model (semantic search)        |

> **Local server reachability:** the app's backend (Convex cloud) must be able
> to reach your Ollama server. For local dev that means running Ollama on the
> same machine as the dev tooling, or exposing it (e.g. `OLLAMA_HOST=0.0.0.0`
> + a tunnel) if the backend runs elsewhere. If Ollama is unreachable, DROP
> falls back cleanly — see **AI failure fallback** below.

### 4. Verify

Open **Settings → AI & Privacy** and hit **Re-check**. You should see:

- ✅ **Ollama · local AI** with model names and latency, plus the **Local AI**
  badge: *"your AI processing is configured through your own server."*

---

## Optional cloud AI — Google Gemini

If `OLLAMA_BASE_URL` is unset (or Ollama is unreachable), DROP uses Gemini
when a key is present:

| Variable               | Default               | Purpose                                  |
| ---------------------- | --------------------- | ---------------------------------------- |
| `GOOGLE_API_KEY`       | —                     | Cloud AI analysis + embeddings           |
| `GEMINI_TEXT_MODEL`    | `gemini-1.5-flash`    | Text model                               |
| `GEMINI_VISION_MODEL`  | `gemini-1.5-flash`    | Vision model                             |

Get a key at <https://aistudio.google.com/apikey>.

### Demo mode (no AI configured)

With neither Ollama nor a Gemini key, DROP uses a deterministic heuristic
analyzer (`src/convex/ai/demo.ts`) so the full product loop works offline,
free and instantly. The Settings page shows a clean explanation instead of
crashing.

### AI failure fallback

- Vision unavailable → text metadata + deterministic rules still classify the Drop.
- Embeddings unavailable → keyword + metadata search still works.
- LLM unavailable → saving, searching, categories, collections, favorites,
  archives, reminders, and OCR all keep working.
- A failed analysis never loses the file — the Drop stays in your library as
  `needs_review` with a **Try analysis again** action (Action Center / Inbox).

### Swapping providers

All AI goes through `AIProvider` (`src/convex/ai/types.ts`). Implementations:
`ollama.ts`, `gemini.ts`, `demo.ts`. Add a new provider by implementing
`analyze()`, `embed()`, optional `synthesize()`, `ping()` and `health()`,
then wire it into `resolveProvider()` in `src/convex/ai/index.ts`.

---

## Architecture

```
src/convex/
  schema.ts          Data model: users, drops, collections, collectionDrops,
                     reminders, searchHistory, stacks, stackDrops, activities,
                     plans
  drops.ts           Drop CRUD + queries + duplicate detection + trash/restore/
                     permanent-delete + merge + bulk actions + activity log
  analyze.ts         Async AI pipeline action (scheduled on create)
  search.ts          Hybrid search action + Ask DROP (sources, follow-ups,
                     natural time-language) 
  aiHealth.ts        AI provider health check (Settings → AI & Privacy)
  stacks.ts          Stack (research-group) CRUD + membership
  collections.ts     Collections + membership
  reminders.ts       Reminders (text + timestamp, complete/dismiss)
  profile.ts         Settings, stats, data export, account deletion, demo data
  searchHistory.ts   Search history (opt-out)
  seed.ts            Plan catalog seeding (limits live in the DB)
  ai/                Provider abstraction (Ollama + Gemini + demo) + parsing
  lib/               Constants (categories, plans, demo data), search-text builder

src/
  pages/Landing.tsx      Marketing page (hero demo, feature stories, privacy,
                         local-AI section, pricing, FAQ)
  pages/Auth.tsx         Sign-in (email OTP / guest) with DROP branding
  pages/app/…            Home, Search, Inbox, Collections(+detail), Places,
                         Wishlist, Upcoming, Ask DROP, Drop detail, Profile,
                         Stacks(+detail), Trash, Settings, Action Center
  components/app/        App shell (sidebar + mobile bottom nav + onboarding),
                         Command palette (⌘K), Quick Drop (⌘⇧D), global drag
                         overlay
  components/drops/      Add Drop sheet (multi-file, clipboard detection,
                         group-into-stack), Drop card, status badges
```

### The AI pipeline

1. `drops.create` inserts the Drop instantly and schedules `analyze.analyzeDrop`.
2. The action resolves the provider (Ollama → Gemini → demo), fetches the
   original file (signed URL) if present, and gets structured JSON: title,
   summary, category, subcategory, keywords, entities, product/place/event/
   receipt/reservation/flight data, suggested action/reminder, confidence.
3. The searchable text is embedded once and stored on the Drop with
   `embeddingProvider` for cache consistency (embeddings are never regenerated
   per search).
4. Results are written back; `status` becomes `ready` (or `needs_review` if
   confidence < 0.45, `failed` on error — the Drop is never lost).

Cost controls: analyses are cached via `analysisVersion`, embeddings are
generated once per content, and `retryAnalysis` re-runs on demand.

### Search

`search.searchDrops` combines:

- **Keyword scoring** across title ×4, keywords ×3, summary ×2, tags ×2,
  notes ×1.5, category/subcategory ×1.5, text/OCR ×1
- **Semantic cosine** over stored embeddings (same-provider embeddings only)
- **Metadata filters**: category, kind, source, place, price range, date range,
  collection, tag, starred, archived
- **Natural time-language**: "today", "last week", "in June", "three months
  ago" → date windows
- Favorites get a small nudge on genuinely-close results (never buries
  relevant older Drops)

Every search is scoped to the authenticated user server-side — cross-user
retrieval is impossible.

### Ask DROP

`search.askDrop` retrieves the top-matching Drops (optionally scoped to one
Drop or a Collection), passes conversation history for follow-ups, and — when
the provider can synthesize — asks it to answer **strictly from those saved
items**, citing source numbers. The UI renders "Based on N Drops" source
cards that open the Drop. Without synthesis, it falls back to a structured
result list. It never invents memories not in your Drops.

---

## Plans & billing

Plan definitions live in `src/convex/lib/constants.ts` and are seeded into
the `plans` table, so limits are configurable in the database. Free = 100
Drops; Pro = $5.99/mo or $49.99/yr; Family = $9.99/mo.

Stripe is **not wired up yet** — `profile.planInfo` reads the plan table and
the UI gates the free limit. To add billing, use the Vly payments gateway
(see `integrations.md`) or Stripe webhooks, updating `users.plan` /
`planStatus` / `planRenewsAt`.

---

## Privacy & security

- Private by default: Drops are never public; no sharing URLs are generated.
- Files are stored in Convex storage and served only via signed URLs resolved
  inside authenticated queries (`drops.getStorageUrl`).
- Every query/mutation/action checks ownership on the server (`userId`) —
  including every search and Ask DROP context.
- **Local AI**: with Ollama configured, screenshots and content never leave
  your machine for AI processing. Database & files still live in DROP's
  cloud; the Settings page explains this distinction honestly.
- Account deletion removes Drops + files + collections + reminders + history.
- Full data export (JSON) from Settings/Profile. Trash keeps deleted Drops
  recoverable for 30 days.
- No facial recognition: only textual names are extracted from screenshots.

---

## Deployment

The platform manages the dev server and Convex push. For production:

1. Configure AI: set `OLLAMA_BASE_URL` (+ models) or `GOOGLE_API_KEY` in
   Convex env vars.
2. `bun convex deploy` to push backend functions to production.
3. `bun run build && bun run preview` (or host the static build) for the
   frontend.
4. Configure your auth issuer/domain in `src/convex/auth.config.ts` if
   self-hosting outside freebuff.

## Troubleshooting

| Symptom                                  | Fix                                                           |
| ---------------------------------------- | ------------------------------------------------------------- |
| Settings shows "Ollama not reachable"    | Is `ollama serve` running? Is `OLLAMA_BASE_URL` correct? Does the backend network reach it? |
| "No Ollama model available"              | `ollama pull qwen2.5:7b` (or set `OLLAMA_TEXT_MODEL`).        |
| Vision Drops stay `needs_review`         | Install a vision model: `ollama pull qwen2.5vl:7b`.           |
| Semantic search not matching             | Pull an embedding model: `ollama pull nomic-embed-text`, then re-analyze Drops. |
| Everything still works but analysis is basic | You're in demo mode — add Ollama or a Gemini key.          |
