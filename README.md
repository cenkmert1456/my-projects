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

- **DROP Intelligence — zero-config AI**: no keys, no servers, no model
  setup. The built-in engine understands every Drop out of the box. On the
  mobile apps a native **DropAI engine** runs on-device (OCR + embeddings +
  tiered local models, with Apple Foundation Models / Gemini Nano used
  automatically when available), and the web backend runs the same pipeline
  with an optional cloud Gemini boost. Everything degrades gracefully to the
  deterministic analyzer, so the product never breaks and never asks for
  configuration.
- **Hybrid search** (`src/lib/services/search.ts`): keyword scoring +
  semantic vectors + metadata filters + favorites nudge, with natural time
  phrases ("last week", "around March") parsed into date windows.
- **Ask DROP with sources**: retrieval-augmented answers strictly from your
  own Drops, with referenced source cards and conversational follow-ups.
- **Trash & recovery**: soft delete → 30-day recoverable trash → permanent
  delete / empty trash, with restore.
- **Stacks**: active research groups ("Japan 2027", "New Gaming PC") — batch
  uploads auto-group into a stack.
- **Action Center**: aggregated return deadlines, upcoming plans, failed
  analyses, pending reminders, pinned Drops.
- **Settings → DROP Intelligence**: Status **Ready**, **Processing: On
  device** (mobile), Wi-Fi-only download toggle, AI storage, remove/re-download
  — with model/runtime details tucked under Advanced diagnostics.
- Pinned / sensitive Drops, notes, bulk actions, duplicate detection + merge,
  data export, private-by-default everywhere.

---

## Stack

| Layer    | Technology                                                        |
| -------- | ----------------------------------------------------------------- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, Framer Motion |
| Backend  | **Supabase** (PostgreSQL + Row Level Security + Storage + Realtime) |
| Auth     | Supabase Auth — email/password + persistent sessions (secure device storage on mobile) |
| AI       | **DROP Intelligence** — deterministic built-in engine (default, zero-config); on-device native engine in the mobile apps |
| Search   | Hybrid: keyword scoring + semantic vectors (cosine) + metadata filters |

## Local setup

```bash
bun install
bun run dev                # starts the Vite dev server
```

### Automatic backend provisioning (no manual SQL)

Point the app at your Supabase project with two public env vars
(no backend to run locally):

```bash
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

Then provision the database **automatically** — tables, RLS policies, storage
buckets, pgvector, triggers and the search RPC are all applied by one command:

```bash
# Needs a personal access token + project ref (add to the Freebuff Keys tab,
# or pass --token / --ref):
npm run supabase:setup
```

This applies every migration in `supabase/migrations/` through the Supabase
Management API and verifies tables, RLS, storage buckets and auth health.

```bash
# Full end-to-end test against the live backend (register → login → drop →
# upload → search → collections → isolation):
npm run supabase:verify
```

The CLI alternative (`supabase link --project-ref <project> && supabase db
push`) works too — `supabase/config.toml` is included. No Convex deployment,
no codegen, no auth issuer — nothing else to run.

---

## DROP Intelligence — automatic, zero-configuration AI

Users never configure AI. **Install DROP → Open DROP → AI works.**
No Ollama, no localhost, no API keys, no model pickers — nothing to install
or download manually for the web product.

### How it works

- **Web**: DROP's built-in deterministic engine (`src/lib/services/analyze.ts`
  + `src/lib/embed.ts`) understands every Drop out of the box — smart titles,
  categories, entities, prices, dates, actions, and consistent semantic
  embeddings for search. Nothing ever stops working, no key is ever required.
- **Mobile (Android/iOS)**: a native **DropAI engine** (`packages/drop-ai/`)
  runs directly inside the app — on-device OCR (ML Kit / Apple Vision),
  deterministic metadata extraction, local embeddings, and tiered on-device
  models. On first launch DROP detects the device, picks the best engine
  (Apple Foundation Models / Gemini Nano when available, otherwise DROP's own
  bundled model), and shows a one-time friendly setup screen
  ("Preparing your private AI…"). System AI is never required.
- **Settings → DROP Intelligence** shows only: **Status: Ready**,
  **Processing: On device**, an optional Wi-Fi-only download toggle, AI
  storage size, and Remove/Re-download. Model names and tiers live under
  **Advanced** for diagnostics only.

### Optional cloud AI — Google Gemini (web backend only)

Set only if you want a cloud intelligence boost on the web backend:

| Variable               | Default               | Purpose                                  |
| ---------------------- | --------------------- | ---------------------------------------- |
| `GOOGLE_API_KEY`       | —                     | Optional cloud AI analysis + embeddings  |
| `GEMINI_TEXT_MODEL`    | `gemini-1.5-flash`    | Text model                               |
| `GEMINI_VISION_MODEL`  | `gemini-1.5-flash`    | Vision model                             |

Get a key at <https://aistudio.google.com/apikey>. **Without it, DROP works
fully on the built-in engine** — the key only upgrades analysis quality.

### AI failure fallback

- Vision unavailable → text metadata + deterministic rules still classify the Drop.
- Embeddings unavailable → keyword + metadata search still works.
- LLM unavailable → saving, searching, categories, collections, favorites,
  archives, reminders, and OCR all keep working.
- A failed analysis never loses the file — the Drop stays in your library as
  `needs_review` with a **Try analysis again** action (Action Center / Inbox).

### The web engine

Analysis runs client-side through `analyzeText()` (categorization, entity
recognition, pricing, dates, suggested actions) and `dropEmbedText()` (a
stable 128-dim embedding used everywhere for semantic search). On mobile the
native **DropAI** engine upgrades this with on-device OCR and local models via
`dropService.attachOcr` / `attachAnalysis`. The same deterministic algorithm
is used across web and native so search vectors stay consistent.

---

## Architecture

```
supabase/migrations/0001_initial_schema.sql
                       PostgreSQL schema: profiles, drops, collections,
                       collection_drops, stacks, stack_drops, reminders,
                       search_history, subscriptions, shared_collections,
                       notifications, activities, plans — with UUID keys, JSONB
                       metadata, pgvector(128) embeddings, full RLS policies
                       and private storage buckets (drop-files)
0002_production_tables.sql
                       Production tables: user_settings, devices, push_tokens,
                       processing_jobs, collection_members; profile auto-create
                       trigger on auth.users; drop_search hybrid RPC; avatars
                       bucket; realtime publications; extra indexes

src/lib/services/     The data-access layer — drops, collections, stacks,
                       reminders, search (hybrid + Ask DROP), profile, storage
                       (signed URLs), activities/notifications. Every query is
                       scoped to the authenticated user id; RLS is the backstop.
  supabase/client.ts   Supabase client (anon key only, Capacitor-aware storage)
  supabase/database.types.ts  Strong app types (Drop, Collection, Stack, …)
  services/analyze.ts  Built-in deterministic AI analysis (zero-config)
  embed.ts             128-dim embedding used by web + native search
  hooks/use-realtime-query.ts  Reactive data hook (fetch + Realtime refetch)

packages/drop-ai/     Native DropAI engine (Capacitor plugin): Kotlin + Swift
                     OCR, embeddings, tiered on-device models, model manager
                     (verified, resumable downloads), tier detection

src/
  pages/Landing.tsx      Marketing page (hero demo, feature stories, privacy,
                         AI section, pricing, FAQ)
  pages/Auth.tsx         Sign-in / sign-up (Supabase email + password, reset)
  pages/app/…            Home, Search, Inbox, Collections(+detail), Places,
                         Wishlist, Upcoming, Ask DROP, Drop detail, Profile,
                         Stacks(+detail), Trash, Settings, Action Center
  components/app/        App shell (sidebar + mobile bottom nav + onboarding),
                         Command palette (⌘K), Quick Drop (⌘⇧D), global drag
                         overlay
  components/drops/      Add Drop sheet (multi-file, clipboard detection,
                         group-into-stack), Drop card, status badges
```

### The understanding pipeline

1. `dropService.create` inserts the Drop instantly. For image/voice Drops the
   file uploads to the private `drop-files` bucket first, then the Drop row is
   written with its storage path.
2. Analysis runs locally with the built-in engine (`analyzeText`): title,
   summary, category, subcategory, keywords, entities, product/place/event/
   receipt/reservation/flight data, suggested action/reminder, confidence.
   Native devices upgrade this with on-device OCR + local models
   (`attachOcr` / `attachAnalysis`).
3. The searchable text is embedded once and stored on the Drop with
   `embedding_provider` for consistency (embeddings are never regenerated per
   search).
4. `status` becomes `ready` (or `needs_review` on low confidence, `failed` on
   error — the Drop is never lost). `retryAnalysis` re-runs on demand.

### Search

`searchService.searchDrops` combines:

- **Keyword scoring** across title ×4, keywords ×3, summary ×2, tags ×2,
  notes ×1.5, category/subcategory ×1.5, text/OCR ×1
- **Semantic cosine** over stored embeddings (same-provider embeddings only)
- **Metadata filters**: category, kind, source, place, price range, date range,
  collection, tag, starred, archived
- **Natural time-language**: "today", "last week", "in June", "three months
  ago" → date windows
- Favorites get a small nudge on genuinely-close results (never buries
  relevant older Drops)

Every search is scoped to the authenticated user — cross-user retrieval is
impossible, and RLS blocks it at the database level too.

### Ask DROP

`searchService.askDrop` retrieves the top-matching Drops (optionally scoped to
one Drop or a Collection), passes conversation history for follow-ups, and
asks the DROP engine to answer **strictly from those saved items**. The UI
renders "Based on N Drops" source cards that open the Drop. It never invents
memories not in your Drops.

---

## Plans & billing

Plan definitions live in the `plans` table (seeded by the migration). Free =
100 Drops; Pro = $5.99/mo or $49.99/yr; Family = $9.99/mo.

Stripe is **not wired up yet** — `profileService.planInfo` reads the plans
row and the UI gates the free limit. To add billing, update
`profiles.plan` / `plan_status` / `plan_renews_at` server-side.

---

## Privacy & security

- Private by default: Drops are never public; sharing is always explicit.
- Files are stored in the private `drop-files` storage bucket and served only
  via short-lived signed URLs (`storageService.getSignedUrl`).
- **Row Level Security**: every table has `auth.uid() = user_id` policies for
  select/insert/update/delete — including search and Ask DROP contexts.
  Private Drop data can never leak between users.
- **On-device AI (mobile)**: screenshots are understood locally — OCR,
  classification, embeddings and model inference run inside the app and never
  go to a third-party AI provider. Database & files still synchronize to your
  DROP account in the cloud (so they're available on every device); the
  Settings page explains this distinction honestly. On the web, the built-in
  backend engine processes content without external AI providers.
- Account deletion removes Drops + files + collections + reminders + history.
- Full data export (JSON) from Settings/Profile. Trash keeps deleted Drops
  recoverable for 30 days.
- No facial recognition: only textual names are extracted from screenshots.

---

---

## Mobile apps — Android & iOS (Capacitor)

The same codebase ships as a **Web app**, an **Android app** and an **iOS app**.
Capacitor 8 wraps the production web build (`webDir: dist`) with a native
layer; the web app, PWA, backend, database and AI are untouched.

```
Web (PWA)   →  react-router + existing UI
Android     →  Capacitor + Kotlin (share receiver, deep links, icons)
iOS         →  Capacitor + Swift (share extension handoff, deep links, icons)
Backend     →  the same Supabase backend (one shared database)
```

### Native capabilities implemented

| Feature | Implementation |
| ------- | -------------- |
| Share-to-DROP (Android) | `IncomingSharePlugin.java` — real `ACTION_SEND` intent filters for text/URL/image/file; opens the capture preview with the shared item |
| Share-to-DROP (iOS) | `ios/ShareExtension/` — Share Extension (add target in Xcode once); handoff via `drop://share` handled in `SceneDelegate.swift` |
| Camera & gallery | `@capacitor/camera` + `@capawesome/capacitor-file-picker` (multi-select) |
| Voice notes | `@capacitor-community/media` not used — recorder uses MediaRecorder API; mic permission string present |
| Local notifications | `@capacitor/local-notifications` — reminders, return deadlines, upcoming plans; tap → opens the Drop |
| Push (architecture) | `@capacitor/push-notifications` registered + handled; requires APNs/FCM config in production |
| Haptics | `@capacitor/haptics` — Drop saved, favorite, confirmations |
| Biometric app lock | `@aparajita/capacitor-biometric-auth` — Face ID/Touch ID/Android Biometric; inactivity lock (immediate/1m/5m/15m) |
| Secure storage | `@aparajita/capacitor-secure-storage` (Keychain / Keystore) for auth tokens + app-lock prefs |
| Deep links | `drop://drop/123`, `drop://collection/abc`, `drop://ask`, `drop://search` |
| Offline queue | `src/lib/mobile/upload-queue.ts` — queued captures flush when connectivity returns |
| Safe areas / status bar / splash | `env(safe-area-inset-*)` everywhere, `@capacitor/status-bar`, `@capacitor/splash-screen` |
| App icons & splash | Brand assets generated into both platforms by `@capacitor/assets` from `assets/logo.png` |

### Requirements

- **Node + Bun**, Android Studio (Android), **Xcode on macOS** (iOS).
- iOS native builds, signing and TestFlight **require macOS** — this is an
  Apple limitation, not DROP's. Android builds work on Windows/macOS/Linux.

### Setup

```bash
bun install
export VITE_SUPABASE_URL=… VITE_SUPABASE_ANON_KEY=…
bun run build               # production web build → dist/
npx cap sync                # copy web build + plugins into android/ & ios/
```

The native projects are already generated (`android/`, `ios/`) and include
the custom native layer. Production builds load the bundled `dist/` over the
`https://` scheme — **no localhost URL dependency**.

### Commands

| Command | What it does |
| ------- | ------------ |
| `bun run mobile:sync` | build + `cap sync` (both platforms) |
| `bun run mobile:android` / `mobile:ios` | build + sync one platform |
| `bun run mobile:open:android` / `mobile:open:ios` | open Android Studio / Xcode |
| `bun run mobile:assets` | regenerate icons & splash from `assets/logo.png` |
| `bun run build:android` | **debug APK** (`android/app/build/outputs/apk/debug/`) |
| `bun run build:android:release` | **release AAB** (needs signing config below) |
| `bun run build:ios` | build the iOS app for the simulator |

### Android — debug APK & release AAB

```bash
bun run build:android            # debug APK (local testing)
bun run build:android:release    # signed release AAB (Play) + APK
```

For the release build, create a keystore and point Gradle at it in
`android/app/build.gradle` under `signingConfigs` / `buildTypes.release`:

```bash
keytool -genkey -v -keystore drop-release.keystore -alias drop -keyalg RSA -keysize 2048 -validity 10000
```

Then configure `release` signing (storeFile, storePassword, keyAlias,
keyPassword) and set `versionCode`/`versionName` in
`android/app/build.gradle` (default `versionCode 1`, `versionName "1.0.0"`).
Upload the `.aab` to **Play Console → Internal testing → Production**.

> Debug builds are signed with the debug keystore automatically — nothing to
> configure for local testing.

### iOS — Xcode, TestFlight, App Store

```bash
bun run mobile:open:ios     # opens Xcode
```

In Xcode: select the **App** target → Signing & Capabilities → set your
**Team** and a unique **Bundle Identifier** (default `com.drop.memory`). Then:

- Run on simulator: `⌘R` with an iPhone simulator selected.
- Run on a device: plug in, set the device, fix any signing prompt.
- Archive: Product → Archive, then distribute to **TestFlight** or **App Store**.

Before submission:

- **Bundle ID** must match a registered identifier in your Apple Developer
  account; create an App ID in App Store Connect.
- **Privacy descriptions** are already in `ios/App/App/Info.plist` (camera,
  photos, microphone, notifications) — review the wording for your listing.
- **App Icons**: generated into `Assets.xcassets/AppIcon.appiconset`; upload
  a 1024×1024 marketing icon in App Store Connect.
- **Push notifications** need an APNs key in App Store Connect + FCM/APNs
  wiring (see below).
- **Universal Links / Associated Domains**: add the domain + apple-app-site-
  association file on your server if you want `https://` links to open the
  app. Deep links work today via the `drop://` scheme.
- **Share Extension**: add the target once in Xcode (see
  `ios/ShareExtension/README.md`) — required for iOS share-to-DROP.

### Permissions model

All permissions are requested **contextually, never at startup**: camera when
you tap Take Photo, photos when you pick images, microphone when you record a
voice note, notifications when you create your first reminder, biometrics
when you enable App Lock. Each request explains why it's needed.

### Push notifications (production)

`@capacitor/push-notifications` is installed and wired. Production push
requires: **Firebase Cloud Messaging** (Android) and **APNs** (iOS), plus
server-side delivery. Local notifications (reminders, deadlines) work fully
out of the box with no external service.

### Subscriptions on mobile

Web billing stays on **Stripe**. For the stores: iOS must use **StoreKit / App
Store In-App Purchase** and Android **Google Play Billing** (store policy).
The plan/limit architecture reads from the Supabase `plans` table, so a
native purchase flow can grant entitlements server-side without changing the
product logic. Store billing is **not faked** — no placeholder purchase
buttons; when you're ready, implement the native purchase flow per platform
and update `profiles.plan` via server-side receipt verification.

### Mobile privacy

- Drops are private by default; only the user's own account sees them.
- App lock (biometrics) + optional privacy mode obscures the app preview in
the app switcher on supported platforms.
- Auth tokens live in secure device storage (Keychain/Keystore) when native.
- Offline captures are stored locally until the user's own upload runs;
  nothing is shared.

---

## Deployment

For production:

1. Create a Supabase project (or use an existing one).
2. Add `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF` (and
   `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`) to the Freebuff Keys tab.
3. Run `npm run supabase:setup` — this **applies** every migration
   automatically (tables, RLS, storage buckets, pgvector, triggers, RPC) and
   verifies the result. No manual SQL.
4. Run `npm run supabase:verify` to exercise the real backend end-to-end
   (register → login → drop → upload → search → isolation).
5. `npm run build && npm run preview` (or host the static build) for the
   frontend.

## Troubleshooting

| Symptom                                  | Fix                                                           |
| ---------------------------------------- | ------------------------------------------------------------- |
| Vision Drops stay `needs_review`         | On mobile, make sure the on-device AI model finished downloading (Settings → DROP Intelligence → Re-check). On web this is normal only for very low-confidence content — use **Try analysis again** from the Drop. |
| Semantic search not matching             | Re-analyze the Drop (Try analysis again) to regenerate its embedding. Embeddings use one consistent algorithm everywhere. |
| Analysis looks basic                      | That's the built-in engine working without any configuration. Set `GOOGLE_API_KEY` on the web backend for a cloud boost; mobile uses the on-device engine automatically. |
| Mobile shows "Preparing your private AI…" forever | The one-time model download needs a network connection. Check connectivity, or use **Wait for Wi-Fi** then **Download now** from Settings → DROP Intelligence. |
| App saves Drops but analysis is delayed   | On mobile the engine releases resources when idle and re-loads on demand — Drops remain searchable with OCR + deterministic metadata instantly. |
