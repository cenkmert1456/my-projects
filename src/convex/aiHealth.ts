"use node";

// AI diagnostics for the Settings → AI & Privacy page. Runs a real health
// check against the active provider (Ollama /api/tags, Gemini key presence,
// demo mode) so the UI can show Connected / Failed / Model Missing.

import { action } from "./_generated/server";
import { checkAIHealth, resolveProvider } from "./ai";

export const checkAI = action({
  args: {},
  handler: async () => {
    const health = await checkAIHealth();
    const provider = await resolveProvider();
    // Include which provider is actually serving analysis + embeddings.
    return {
      ...health,
      activeProvider: provider.id,
    };
  },
});
