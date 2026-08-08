/**
 * DROP embedding — deterministic 128-dim bag-of-ngrams vector.
 *
 * The exact algorithm previously lived in the legacy demo provider and is
 * mirrored natively (Kotlin/Swift) by the DropAI engine. Keeping one shared
 * implementation here means web, native and stored embeddings are all
 * cosine-comparable: search over on-device embeddings and server rows stays
 * consistent.
 */

export function dropEmbedText(text: string): number[] {
  const dim = 128;
  const vec = new Array<number>(dim).fill(0);
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s€$£¥]/g, " ");
  const clean = norm(text);
  const tokens = clean.split(/\s+/).filter(Boolean);
  const add = (key: string) => {
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    vec[Math.abs(h) % dim] += 1;
  };
  for (const t of tokens) {
    add(t);
    if (t.length > 2) add("2:" + t.slice(0, 2));
    if (t.length > 3) add("3:" + t.slice(0, 3));
  }
  let mag = 0;
  for (const v of vec) mag += v * v;
  mag = Math.sqrt(mag) || 1;
  return vec.map((v) => v / mag);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const mag = Math.sqrt(na) * Math.sqrt(nb) || 1;
  return dot / mag;
}
