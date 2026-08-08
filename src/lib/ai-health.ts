/**
 * Web AI health — consumer-safe status for the Settings "DROP Intelligence"
 * card. The built-in DROP engine needs zero configuration, so the health
 * result is deterministic; no network or server round-trip is required.
 * Native devices report their own engine status via the DropAI plugin
 * (see src/lib/drop-ai.ts).
 */

export interface WebAIHealth {
  ok: boolean;
  provider: string;
  label: string;
  local: boolean;
  models?: { text?: string; vision?: string; embedding?: string };
  latencyMs?: number;
  error?: string;
  activeProvider?: string;
}

export async function checkWebAI(): Promise<WebAIHealth> {
  return {
    ok: true,
    provider: "builtin",
    label: "Built-in engine — no configuration needed",
    local: true,
    models: { text: "drop-native", embedding: "drop-native" },
    latencyMs: 0,
    activeProvider: "builtin",
  };
}
