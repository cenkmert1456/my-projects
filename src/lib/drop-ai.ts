// DropAI — DROP Intelligence client facade.
//
// One typed API for the whole app. On mobile (Android/iOS) it talks to the
// native DropAI engine via the local `@drop/ai` Capacitor plugin — on-device
// OCR, embeddings, tiered on-device models, automatic provisioning. On the
// web it degrades gracefully: the Convex backend pipeline keeps doing the
// analysis (cloud if configured, otherwise the same built-in deterministic
// engine), and embeddings mirror the identical algorithm used server-side and
// natively, so semantic search stays consistent everywhere.
//
// Users never see models, keys, servers or configuration — only "DROP
// Intelligence: Ready".

import { demoEmbedText } from "@/convex/ai/demo";
import { isNative } from "@/lib/mobile/platform";

export type DropAITier = "system" | "local" | "light" | "basic" | "web";

export type DropAIStatus = {
  phase: "idle" | "detecting" | "downloading" | "ready" | "error";
  tier: DropAITier | null;
  onDevice?: boolean;
  /** 0..1 download progress (downloading phase). */
  progress?: number;
  /** Short human label; e.g. "needs_confirmation" signals one-time consent. */
  label?: string;
  /** Error detail (error phase). */
  message?: string;
};

export interface DropAIPolicy {
  wifiOnly: boolean;
}

export interface NativeDropAnalysis {
  title?: string;
  summary?: string;
  category?: string;
  subcategory?: string;
  keywords?: string[];
  tags?: string[];
  visualDescription?: string;
  ocrSummary?: string;
  products?: string[];
  brands?: string[];
  places?: string[];
  peopleMentioned?: string[];
  dates?: string[];
  prices?: string[];
  currency?: string;
  events?: string[];
  actions?: string[];
  confidence?: number;
  language?: string;
}

export interface DropAIEngine {
  prepare(): Promise<void>;
  getStatus(): Promise<DropAIStatus>;
  getEmbedding(text: string): Promise<number[]>;
  ocr(imageDataUrl: string): Promise<{ text: string; language?: string } | null>;
  analyzeImage(imageDataUrl: string): Promise<NativeDropAnalysis | null>;
  generateText(prompt: string, context?: string): Promise<string | null>;
  answerQuestion(question: string, context: string): Promise<string | null>;
  setPolicy(policy: DropAIPolicy): Promise<void>;
  getPolicy(): Promise<DropAIPolicy>;
  removeModel(): Promise<void>;
  getStorageInfo(): Promise<{ sizeBytes?: number } | null>;
  onStatusChange(callback: (status: DropAIStatus) => void): () => void;
}

type NativePlugin = {
  prepare: () => Promise<{ ok: boolean }>;
  getStatus: () => Promise<{ status: DropAIStatus }>;
  getEmbedding: (args: { text: string }) => Promise<{ embedding: number[] }>;
  ocr: (args: { image: string }) => Promise<{ text: string; language?: string } | null>;
  analyzeImage: (args: { image: string }) => Promise<{ analysis: NativeDropAnalysis | null }>;
  generateText: (args: { prompt: string; context?: string }) => Promise<{ text: string | null }>;
  answerQuestion: (args: { question: string; context: string }) => Promise<{ answer: string | null }>;
  setPolicy: (args: DropAIPolicy) => Promise<{ ok: boolean }>;
  getPolicy: () => Promise<DropAIPolicy>;
  removeModel: () => Promise<{ ok: boolean }>;
  getStorageInfo: () => Promise<{ sizeBytes?: number } | null>;
  addListener: (
    eventName: "status" | "downloadProgress",
    listener: (data: { status: DropAIStatus } | { progress: number; label: string }) => void,
  ) => Promise<{ remove: () => void }>;
};

let pluginPromise: Promise<NativePlugin | null> | null = null;

async function nativePlugin(): Promise<NativePlugin | null> {
  if (!isNative()) return null;
  if (pluginPromise) return pluginPromise;
  pluginPromise = (async () => {
    try {
      const { Capacitor } = await import("@capacitor/core");
      const plugin = (Capacitor as unknown as { Plugins: Record<string, NativePlugin> }).Plugins
        ?.DropAI;
      return plugin ?? null;
    } catch {
      return null;
    }
  })();
  return pluginPromise;
}

// ---------------------------------------------------------------------------
// Web fallback status (shared via a tiny store so all components agree)
// ---------------------------------------------------------------------------

const listeners = new Set<(s: DropAIStatus) => void>();
let webStatus: DropAIStatus = { phase: "ready", tier: "web", onDevice: false };

function emit(status: DropAIStatus) {
  webStatus = status;
  for (const cb of listeners) {
    try {
      cb(status);
    } catch {
      // listener errors must never break the engine
    }
  }
}

/** The same deterministic embed used by the server + native engines. */
export function dropAIEmbed(text: string): number[] {
  return demoEmbedText(text);
}

const webEngine: DropAIEngine = {
  async prepare() {
    emit({ phase: "ready", tier: "web", onDevice: false });
  },
  async getStatus() {
    return webStatus;
  },
  async getEmbedding(text) {
    return demoEmbedText(text);
  },
  async ocr() {
    return null; // server pipeline handles image understanding on web
  },
  async analyzeImage() {
    return null;
  },
  async generateText() {
    return null;
  },
  async answerQuestion() {
    return null; // Ask DROP runs through the server on web
  },
  async setPolicy() {},
  async getPolicy() {
    return { wifiOnly: true };
  },
  async removeModel() {},
  async getStorageInfo() {
    return null;
  },
  onStatusChange(callback) {
    listeners.add(callback);
    callback(webStatus);
    return () => listeners.delete(callback);
  },
};

export async function getDropAI(): Promise<DropAIEngine> {
  const plugin = await nativePlugin();
  if (!plugin) return webEngine;

  return {
    async prepare() {
      try {
        await plugin.prepare();
      } catch {
        // native prepare is non-fatal — the engine reports status on its own
      }
    },
    async getStatus() {
      try {
        const res = await plugin.getStatus();
        if (res?.status) {
          emit(res.status);
          return res.status;
        }
      } catch {
        // fall through to cached
      }
      return webStatus;
    },
    async getEmbedding(text) {
      try {
        const res = await plugin.getEmbedding({ text });
        if (res?.embedding?.length) return res.embedding;
      } catch {
        // fall through to shared algorithm
      }
      return demoEmbedText(text);
    },
    async ocr(imageDataUrl) {
      try {
        return await plugin.ocr({ image: imageDataUrl });
      } catch {
        return null;
      }
    },
    async analyzeImage(imageDataUrl) {
      try {
        const res = await plugin.analyzeImage({ image: imageDataUrl });
        return res?.analysis ?? null;
      } catch {
        return null;
      }
    },
    async generateText(prompt, context) {
      try {
        const res = await plugin.generateText({ prompt, context });
        return res?.text ?? null;
      } catch {
        return null;
      }
    },
    async answerQuestion(question, context) {
      try {
        const res = await plugin.answerQuestion({ question, context });
        return res?.answer ?? null;
      } catch {
        return null;
      }
    },
    async setPolicy(policy) {
      try {
        await plugin.setPolicy(policy);
      } catch {
        // ignore
      }
    },
    async getPolicy() {
      try {
        const res = await plugin.getPolicy();
        return res ?? { wifiOnly: true };
      } catch {
        return { wifiOnly: true };
      }
    },
    async removeModel() {
      try {
        await plugin.removeModel();
      } catch {
        // ignore
      }
    },
    async getStorageInfo() {
      try {
        return await plugin.getStorageInfo();
      } catch {
        return null;
      }
    },
    onStatusChange(callback) {
      listeners.add(callback);
      let removeHandle: (() => void) | null = null;
      let disposed = false;
      void plugin
        .addListener("status", (data) => {
          if ("status" in data && data.status) {
            emit(data.status);
            callback(data.status);
          }
        })
        .then((handle) => {
          if (disposed) handle.remove();
          else removeHandle = () => handle.remove();
        });
      void plugin
        .addListener("downloadProgress", (data) => {
          if ("progress" in data) {
            emit({
              phase: "downloading",
              tier: null,
              progress: data.progress,
              label: data.label ?? "Downloading AI model",
            });
          }
        })
        .then((handle) => {
          if (disposed) handle.remove();
          else {
            const prev = removeHandle;
            removeHandle = () => {
              prev?.();
              handle.remove();
            };
          }
        });
      callback(webStatus);
      return () => {
        disposed = true;
        removeHandle?.();
        listeners.delete(callback);
      };
    },
  };
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";

export function useDropAI() {
  const [status, setStatus] = useState<DropAIStatus>(webStatus);
  const [engine, setEngine] = useState<DropAIEngine | null>(null);

  useEffect(() => {
    let disposed = false;
    let engineRef: DropAIEngine | null = null;
    let dispose: (() => void) | null = null;
    void getDropAI().then((e) => {
      if (disposed) return;
      engineRef = e;
      setEngine(e);
      dispose = e.onStatusChange((s) => {
        if (!disposed) setStatus(s);
      });
      void e.prepare().then(() => e.getStatus().then((s) => !disposed && setStatus(s)));
    });
    return () => {
      disposed = true;
      dispose?.();
      engineRef = null;
    };
  }, []);

  return { engine, status };
}
