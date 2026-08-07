# DROP — Everything you save. Finally searchable.

DROP is an AI-powered personal memory system. It turns screenshots, links,
videos, notes, documents, receipts, products, places, reservations and saved
content into a searchable "second brain" — with one obsession:

**Remember everything without organizing anything.**

The core loop is `SAVE → UNDERSTAND → SEARCH`:

1. Drop anything (screenshot, photo, link, note, document) — it's saved instantly.
2. DROP's AI pipeline analyzes it in the background: smart title, summary,
   category, entities (people, brands, places, prices, dates), product/place/
   event/receipt details, suggested actions and reminders.
3. Later, find it with a vague natural-language query: *"the black shoes I
   saved"* → the exact screenshot, from hybrid keyword + semantic search.

---

## Stack

| Layer    | Technology                                                        |
| -------- | ----------------------------------------------------------------- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, Framer Motion |
| Backend  | **Convex** (managed serverless backend + database + file storage) |
| Auth     | Convex Auth — email OTP + anonymous (guest)                       |
| AI       | Google Gemini (multimodal vision + embeddings), swappable via an abstraction layer |
| Search   | Hybrid: keyword scoring + semantic vectors (cosine) + metadata filters |

> **Note on the stack:** the original brief suggested Next.js + PostgreSQL.
> This build runs on the project template's stack (Vite + React + Convex),
> which provides a managed database, reactive queries, and private object
> storage out of the box — no separate Postgres or S3 to run. The schema and
> AI layer are written so they can be lifted to PostgreSQL + pgvector later
> without reworking the product.

## Local setup

```bash
bun install
bun convex dev --once      # pushes backend functions & generates types
bun run dev                # starts the Vite dev server
```

Convex runs against the deployment configured via `CONVEX_DEPLOYMENT` /
`VITE_CONVEX_URL` (injected by the platform — do not edit `.env` files).

## Environment variables

| Variable                    | Where           | Required | Purpose                                   |
| --------------------------- | --------------- | -------- | ----------------------------------------- |
| `GOOGLE_API_KEY`            | Convex env vars | No       | Real AI analysis + embeddings (Gemini)     |
| `GEMINI_MODEL`              | Convex env vars | No       | Default `gemini-2.5-flash`                 |
| `GEMINI_EMBEDDING_MODEL`    | Convex env vars | No       | Default `text-embedding-004`               |
| `VITE_CONVEX_URL`           | Client          | Yes      | Convex deployment URL (platform-managed)   |
| `CONVEX_DEPLOYMENT`         | Convex          | Yes      | Deployment token (platform-managed)        |
| `VLY_INTEGRATION_KEY`       | Convex          | Optional | Vly integrations gateway (email/payments)  |

### AI provider setup (Gemini)

1. Create a Google AI Studio API key: <https://aistudio.google.com/apikey>
2. Add it as a **Convex environment variable** named `GOOGLE_API_KEY`
   (in the project's Keys/API keys UI — never commit it).
3. Re-analyze existing Drops from their detail page ("Help DROP understand
   this") to upgrade them to real analysis + semantic embeddings.

**Demo mode:** without a key, DROP uses a deterministic heuristic analyzer
(`src/convex/ai/demo.ts`) so the full product loop works offline, free and
instantly. Real multimodal understanding (reading image pixels, OCR, PDFs,
link content) activates the moment `GOOGLE_API_KEY` is set.

### Swapping providers

All AI goes through `AIProvider` (`src/convex/ai/types.ts`) with two
implementations (`gemini.ts`, `demo.ts`). Add a new provider by implementing
`analyze()`, `embed()` and optionally `synthesize()`, then return it from
`getProvider()` in `src/convex/ai/index.ts`.

## Architecture

```
src/convex/
  schema.ts          Data model: users, drops, collections, collectionDrops,
                     reminders, searchHistory, plans
  drops.ts           Drop CRUD + queries (recent, related, upcoming, wishlist,
                     places, counts) + duplicate detection
  analyze.ts         Async AI pipeline action (scheduled on create)
  search.ts          Hybrid search action + Ask DROP synthesis action
  collections.ts     Collections + membership
  reminders.ts       Reminders (natural-language text + timestamp)
  profile.ts         Settings, stats, data export, account deletion, demo data
  searchHistory.ts   Search history (opt-out)
  seed.ts            Plan catalog seeding (limits live in the DB)
  ai/                Provider abstraction (Gemini + demo) + JSON parsing
  lib/               Constants (categories, plans, demo data), search-text builder

src/
  pages/Landing.tsx      Marketing page (hero demo, features, privacy, pricing, FAQ)
  pages/Auth.tsx         Sign-in (email OTP / guest) with DROP branding
  pages/app/…            Home, Search, Inbox, Collections(+detail), Places,
                         Wishlist, Upcoming, Ask DROP, Drop detail, Profile
  components/app/        App shell (sidebar + mobile bottom nav + onboarding)
  components/drops/      Add Drop sheet, Drop card, status badges
```

### The AI pipeline

1. `drops.create` inserts the Drop instantly and schedules `analyze.analyzeDrop`.
2. The action fetches the original file (signed URL), sends it (or the text/URL)
   to the provider, and gets structured JSON: title, summary, category,
   subcategory, keywords, entities, product/place/event/receipt/reservation/
   flight data, suggested action/reminder, confidence.
3. The searchable text is embedded once (`text-embedding-004`) and stored on the
   Drop with `embeddingProvider` for cache consistency.
4. Results are written back; `status` becomes `ready` (or `needs_review` if
   confidence < 0.45, `failed` on error — the Drop is never lost).

Cost controls: analyses are cached via `analysisVersion`, embeddings are
generated once per content, and the provider abstraction allows routing cheap
classification models vs. strong multimodal models.

### Search

`search.searchDrops` combines:

- **Keyword scoring** across title ×4, keywords ×3, summary ×2, tags ×2,
  category ×1.5, text/OCR ×1
- **Semantic cosine** over stored embeddings (same-provider embeddings only)
- **Metadata filters**: category, kind, source, place, price range, date range,
  collection, tag, starred, archived

For MVP scale the search action scans the user's own Drops in memory (hundreds
to low thousands — fine for a personal memory). The schema isolates embeddings
so the upgrade path to a real vector index (e.g., pgvector) is mechanical.

### Ask DROP

`search.askDrop` retrieves the top-matching Drops and — when a provider key is
set — asks the model to answer **strictly from those saved items** (never
inventing). Without a key it falls back to a structured "based on your Drops"
result list.

## Plans & billing

Plan definitions live in `src/convex/lib/constants.ts` and are seeded into the
`plans` table (`profile.loadDemoData` → `seed.seedPlans`), so limits are
configurable in the database. Free = 100 Drops; Pro = $5.99/mo or $49.99/yr;
Family = $9.99/mo.

Stripe is **not wired up yet** — `profile.planInfo` reads the plan table and
the UI gates the free limit. To add billing, use the Vly payments gateway
(see `integrations.md`) or Stripe webhooks, updating `users.plan` /
`planStatus` / `planRenewsAt`.

## Privacy & security

- Private by default: Drops are never public; no sharing URLs are generated.
- Files are stored in Convex storage and served only via signed URLs resolved
  inside authenticated queries (`drops.getStorageUrl`).
- Every query/mutation/action checks ownership on the server (`userId`).
- Account deletion removes Drops + files + collections + reminders + history.
- Full data export (JSON) from Profile.
- Search history is opt-in and clearable.
- No facial recognition: only textual names are extracted from screenshots.

## Deployment

The platform manages the dev server and Convex push. For production:

1. Set `GOOGLE_API_KEY` in Convex env vars.
2. `bun convex deploy` to push backend functions to production.
3. `bun run build && bun run preview` (or host the static build) for the frontend.
4. Configure your auth issuer/domain in `src/convex/auth.config.ts` if
   self-hosting outside freebuff.

## Roadmap / extension points

Future work is designed for, not blocked by, the current architecture:

- Mobile Share Sheet / iOS screenshot import / Android share intent
- Browser extension, email-to-DROP, WhatsApp/Telegram ingestion
- Price tracking & return-deadline alerts (reminders table + `receipt.returnDeadline`)
- Public collection sharing (collections already have `isPublic`/`shareToken`)
- Stripe subscriptions (plans table + users.plan fields)
- Push notifications for reminders (scheduled jobs)
- Local/private AI processing (provider abstraction)
