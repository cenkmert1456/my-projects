"use node";

// AI diagnostics for the Settings → DROP Intelligence page. Runs a real
// health check against the active provider (built-in engine by default,
// optional Gemini when a key exists) so the UI can show Ready / degraded
// status. Never exposes model configuration to consumers.

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
