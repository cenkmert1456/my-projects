# @drop/ai — DROP Intelligence engine

Zero-configuration, on-device AI for DROP (Android + iOS). Users install DROP,
sign in, and the engine automatically detects the best AI backend for their
device. No Ollama, no servers, no keys, no model selection.

## How it picks an engine (internal tiers — never shown to users)

| Tier | Trigger | Capabilities |
| ---- | ------- | ------------ |
| `system` | Apple Foundation Models (iOS 26+) / Gemini Nano (Android) available | Full multimodal: OCR-free structured image analysis, Q&A, generation |
| `local` | Strong device (≥ 6 GB RAM, 64-bit, modern OS) | Downloads the bundled open-weight model once (Gemma-class, ~1.8 GB), verified + resumable + atomic install |
| `light` | Capable device | Native OCR + deterministic structured analysis + embeddings + search |
| `basic` | Very limited device | OCR + metadata + full-text search |

Every tier keeps the product functional. `prepare()` never fails the app: if a
model download fails, is declined, or the device can't run one, DROP silently
uses the lightweight pipeline. Users only ever see **"DROP Intelligence:
Ready"**.

## Native implementation

- **Android (Kotlin)**: `android/src/main/java/com/drop/ai/`
  - `DropAIPlugin.kt` — Capacitor bridge
  - `DropAIEngine.kt` — orchestration, structured-output parsing
  - `TierDetector.kt` — device capability detection + Gemini Nano adapter (reflection)
  - `DropOCR.kt` — ML Kit Text Recognition (offline)
  - `ModelManager.kt` — versioned, resumable, SHA-256 verified, atomic downloads
  - `NativeEmbed.kt` / `DeterministicAnalyzer.kt` — mirrors of the server engine
- **iOS (Swift)**: `ios/`
  - `DropAIPlugin.swift` — Capacitor bridge
  - `DropAIEngine.swift` — orchestration, Apple Vision OCR, Foundation Models adapter, model manager
  - `NativeEmbed.swift` / `DeterministicAnalyzer.swift` — mirrors of the server engine

Embeddings mirror the server's deterministic 128-dim FNV-1a n-gram algorithm
exactly, so on-device vectors are cosine-comparable with server-side vectors:
semantic search works with zero configuration.

## Capacitor API

`prepare()`, `getStatus()`, `getEmbedding({text})`, `ocr({image})`,
`analyzeImage({image})`, `generateText({prompt, context?})`,
`answerQuestion({question, context})`, `setPolicy({wifiOnly})`,
`getPolicy()`, `removeModel()`, `getStorageInfo()` + `status` and
`downloadProgress` events.

## Publishing a model

1. Build a mobile-quantized open-weight multimodal model (Gemma 3n E2B 4B
   recommended) with the LiteRT-LM / AI Edge toolchain.
2. Host it behind HTTPS, e.g. `https://cdn.drop.app/models/drop-ai-v2026.08.1.tflite`.
3. Set the matching `MODEL_URL` / `modelURL`, `MODEL_SHA256` / `modelSHA256`
   and `MODEL_SIZE_BYTES` / `modelSizeBytes` in `ModelManager.kt` /
   `DropAIEngine.swift`. Bump `DROP_AI_MODEL_VERSION` for updates — DROP never
   re-downloads an installed, verified version, and never deletes the working
   model before the replacement is verified.
4. Connect the runtime: add the LiteRT-LM dependency (see `android/build.gradle`)
   and implement `LocalRuntime.generate` / the `LocalModelRuntime` class.

## Privacy

Analysis, OCR and embeddings run on-device. No screenshot is sent to any
third-party AI provider. DROP's own cloud still stores your Drops so they sync
across devices — the Privacy Center states this precisely.
