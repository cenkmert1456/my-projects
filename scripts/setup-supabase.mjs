#!/usr/bin/env node
/**
 * DROP — automated Supabase provisioning.
 *
 * Applies every migration in supabase/migrations/ to a real Supabase project
 * through the Supabase Management API, then verifies the result:
 * tables exist, RLS is enabled, storage buckets exist, auth is reachable.
 *
 * NO manual SQL. Run:
 *
 *   npm run supabase:setup
 *
 * Credentials (paste into the project Keys/API keys tab, or pass as CLI args):
 *   SUPABASE_ACCESS_TOKEN   personal access token (Management API) — REQUIRED
 *   SUPABASE_PROJECT_REF    project reference, e.g. "abcdefghijklm" — REQUIRED
 *   SUPABASE_URL            https://<ref>.supabase.co — optional (auto-derived)
 *
 * CLI args:  --token <pat> --ref <project-ref> [--skip-verify]
 *
 * Requires Node 18+ (global fetch). Never uses the service-role key on the
 * client; this script is a developer/CI tool only.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const TOKEN = arg("--token") ?? process.env.SUPABASE_ACCESS_TOKEN;
const REF = arg("--ref") ?? process.env.SUPABASE_PROJECT_REF;
const SKIP_VERIFY = process.argv.includes("--skip-verify");

const API = "https://api.supabase.com";

let failures = 0;
const report = [];

function ok(name, detail) {
  report.push({ name, status: "PASS", detail: detail ?? "" });
  console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail) {
  failures++;
  report.push({ name, status: "FAIL", detail: detail ?? "" });
  console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
}

async function mgmt(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) {
    const msg = typeof json === "object" && json ? (json.message ?? json.error ?? JSON.stringify(json)) : text;
    throw new Error(`Management API ${res.status} on ${path}: ${msg}`);
  }
  return json;
}

/** Run raw SQL on the connected project via the Management API. */
async function runSql(sql) {
  return mgmt(`/v1/projects/${REF}/database/query`, {
    method: "POST",
    body: JSON.stringify({ query: sql }),
  });
}

async function main() {
  console.log("");
  console.log("──────────────────────────────────────────────");
  console.log("  DROP — Supabase automatic provisioning");
  console.log("──────────────────────────────────────────────");

  if (!TOKEN || !REF) {
    console.error("");
    console.error("  Missing credentials. Add these to the project Keys/API keys tab:");
    console.error("    SUPABASE_ACCESS_TOKEN   personal access token");
    console.error("    SUPABASE_PROJECT_REF    project reference");
    console.error("");
    console.error("  Then run:  npm run supabase:setup");
    console.error("");
    process.exit(1);
  }

  // 0. Auth + project lookup
  console.log("\n[1/6] Connecting to Supabase…");
  try {
    const projects = await mgmt("/v1/projects");
    const project = projects.find((p) => p.ref === REF);
    if (!project) {
      fail("project found", `no project with ref "${REF}" (refs: ${projects.map((p) => p.ref).join(", ")})`);
      process.exit(1);
    }
    ok("connected to project", `${project.name} (${REF}, ${project.region ?? "unknown"})`);
  } catch (e) {
    fail("connection", e.message);
    console.error("\n  Check that SUPABASE_ACCESS_TOKEN is a valid personal access token");
    console.error("  (https://supabase.com/dashboard/account/tokens) and that the project exists.");
    process.exit(1);
  }

  // 1. Apply migrations in order
  console.log("\n[2/6] Applying migrations…");
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (!files.length) {
    fail("migrations", "no .sql files found in supabase/migrations/");
    process.exit(1);
  }
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    try {
      await runSql(sql);
      ok(`migration ${file}`);
    } catch (e) {
      fail(`migration ${file}`, e.message);
    }
  }

  // 2. Verify tables exist
  console.log("\n[3/6] Verifying tables…");
  const REQUIRED_TABLES = [
    "profiles", "drops", "collections", "collection_drops", "stacks", "stack_drops",
    "reminders", "search_history", "notifications", "shared_collections",
    "collection_members", "subscriptions", "user_settings", "devices",
    "push_tokens", "processing_jobs",
  ];
  try {
    const res = await runSql(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE'
       order by table_name;`,
    );
    const existing = (Array.isArray(res) ? res : []).map((r) => r.table_name);
    for (const t of REQUIRED_TABLES) {
      if (existing.includes(t)) ok(`table ${t}`);
      else fail(`table ${t}`, "missing");
    }
  } catch (e) {
    fail("table verification", e.message);
  }

  // 3. Verify RLS
  console.log("\n[4/6] Verifying Row Level Security…");
  try {
    const res = await runSql(
      `select c.relname as table_name, c.relrowsecurity as rls_enabled
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
       order by c.relname;`,
    );
    const rows = Array.isArray(res) ? res : [];
    for (const r of rows) {
      if (r.rls_enabled === true) ok(`RLS ${r.table_name}`);
      else fail(`RLS ${r.table_name}`, "row level security is OFF");
    }
  } catch (e) {
    fail("RLS verification", e.message);
  }

  // 4. Verify storage buckets
  console.log("\n[5/6] Verifying storage…");
  try {
    const res = await runSql(
      `select id, name, public from storage.buckets order by id;`,
    );
    const buckets = Array.isArray(res) ? res : [];
    for (const expected of ["drop-files", "avatars"]) {
      const b = buckets.find((x) => x.id === expected);
      if (b) ok(`bucket ${expected}`, b.public === false ? "private" : `public=${b.public}`);
      else fail(`bucket ${expected}`, "missing");
    }
  } catch (e) {
    fail("storage verification", e.message);
  }

  // 5. Auth reachability
  console.log("\n[6/6] Verifying auth…");
  try {
    const url = process.env.SUPABASE_URL ?? `https://${REF}.supabase.co`;
    const res = await fetch(`${url}/auth/v1/health`);
    if (res.ok) ok("auth health", `${url}/auth/v1/health → ${res.status}`);
    else fail("auth health", `${url}/auth/v1/health → ${res.status}`);
  } catch (e) {
    fail("auth health", e.message);
  }

  console.log("");
  console.log("──────────────────────────────────────────────");
  if (failures === 0) {
    console.log("  ✅ ALL CHECKS PASSED — backend is provisioned.");
  } else {
    console.log(`  ⚠️  ${failures} check(s) failed — review above.`);
  }
  console.log("──────────────────────────────────────────────");
  console.log("");
  if (!SKIP_VERIFY) {
    console.log("  Next: paste VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY into the");
    console.log("  Keys/API keys tab, then run `npm run supabase:verify` for a full");
    console.log("  end-to-end test (register → drop → upload → search).");
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
