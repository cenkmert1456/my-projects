import { registerPlugin } from "@capacitor/core";
import type { DropAI, DropAIStatus } from "./definitions";

/** Web fallback: intelligence runs through the DROP backend pipeline. */
const webImpl: DropAI = {
  async prepare() {
    return { ok: true };
  },
  async getStatus(): Promise<{ status: DropAIStatus }> {
    return { status: { phase: "ready", tier: "web", onDevice: false } };
  },
  async getEmbedding() {
    return { embedding: [] };
  },
  async ocr() {
    return null;
  },
  async analyzeImage() {
    return { analysis: null };
  },
  async generateText() {
    return { text: null };
  },
  async answerQuestion() {
    return { answer: null };
  },
  async setPolicy() {
    return { ok: true };
  },
  async getPolicy() {
    return { wifiOnly: true };
  },
  async removeModel() {
    return { ok: true };
  },
  async getStorageInfo() {
    return null;
  },
  addListener(): Promise<{ remove: () => Promise<void> }> {
    return Promise.resolve({ remove: async () => {} });
  },
};

const DropAI = registerPlugin<DropAI>("DropAI", {
  web: webImpl,
});

export * from "./definitions";
export { DropAI };
