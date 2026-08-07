// Shared helpers used by both the drops mutations and the analyze/search
// pipeline.

import type { Doc } from "../_generated/dataModel";

/** Build the flat searchable text for a drop (hybrid search input). */
export function buildSearchText(input: {
  title: string;
  summary?: string;
  keywords?: string[];
  tags?: string[];
  text?: string;
  ocrText?: string;
  category?: string;
  subcategory?: string;
  url?: string;
  source?: string;
  entities?: Array<{ value: string; type?: string }>;
}): string {
  const parts: string[] = [];
  const push = (...values: Array<string | undefined>) => {
    for (const v of values) {
      if (v && v.trim()) parts.push(v.trim());
    }
  };
  push(input.title, input.summary);
  push(...(input.keywords ?? []));
  push(...(input.tags ?? []));
  push(input.text, input.ocrText, input.category, input.subcategory, input.url, input.source);
  for (const e of input.entities ?? []) push(e.value);
  // de-dupe, keep casing for display but lowercase is fine for matching
  return [...new Set(parts)].join(" ");
}

export function dropSavedAt(drop: Pick<Doc<"drops">, "savedAt" | "_creationTime">): number {
  return drop.savedAt ?? drop._creationTime;
}
