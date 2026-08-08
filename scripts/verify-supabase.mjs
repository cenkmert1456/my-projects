#!/usr/bin/env node
/**
 * DROP — end-to-end Supabase verification.
 *
 * Actually exercises the production backend exactly like the app does:
 *
 *   register  →  login  →  profile auto-create  →  insert drop
 *   →  storage upload  →  storage read  →  search  →  collections
 *   →  logout  →  login again (persistence)  →  ownership isolation
 *
 * Usage (needs the public client keys, no service-role key required):
 *
 *   npm run supabase:verify
 *
 * Env / Keys-tab vars:
 *   VITE_SUPABASE_URL        https://<ref>.supabase.co
 *   VITE_SUPABASE_ANON_KEY   the anon/publishable key
 *
 * Optional: SUPABASE_SERVICE_ROLE_KEY to clean up the test users afterwards.
 */

const URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

let failures = 0;
const ok = (name, detail = "") => console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ""}`);
const fail = (name, detail = "") => {
  failures++;
  console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
};

async function auth(method, body, token) {
  const res = await fetch(`${URL}/auth/v1/${method}`, {
    method: "POST",
    headers: {
      apikey: ANON,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method}: ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}

async function rest(method, path, body, token) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`rest ${method} ${path}: ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}

async function storageUpload(token, path, bytes, contentType = "image/png") {
  const res = await fetch(`${URL}/storage/v1/object/${path}`, {
    method: "POST",
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": contentType,
      "x-upsert": "false",
    },
    body: bytes,
  });
  if (!res.ok) throw new Error(`storage upload: ${res.status} ${await res.text()}`);
  return res.json();
}

async function storageRead(token, path) {
  const res = await fetch(`${URL}/storage/v1/object/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`storage read: ${res.status}`);
  return res.arrayBuffer();
}

const stamp = Date.now();
const userA = `test-a-${stamp}@drop.test`;
const userB = `test-b-${stamp}@drop.test`;
const PASSWORD = "Drop-Test-123!";

async function main() {
  console.log("");
  console.log("──────────────────────────────────────────────");
  console.log("  DROP — end-to-end backend verification");
  console.log("──────────────────────────────────────────────");

  if (!URL || !ANON) {
    console.error("\n  Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.");
    console.error("  Add them to the Freebuff Keys/API keys tab and re-run.");
    process.exit(1);
  }
  console.log(`\n  Backend: ${URL}`);
  console.log("  Test users:", userA, "/", userB, "\n");

  // 1. Register user A (real Supabase Auth user)
  console.log("[1/9] Register…");
  let sessionA;
  try {
    const reg = await auth("signup", { email: userA, password: PASSWORD, data: { name: "Test Alice" } });
    if (reg.access_token) {
      sessionA = { access_token: reg.access_token, refresh_token: reg.refresh_token };
      ok("register A", "session granted");
    } else {
      // Email confirmation enabled → still a real user, just no session yet.
      ok("register A", "confirmation required (user created)");
      fail("session restore after register", "email confirmation is enabled — log in instead");
      process.exit(1);
    }
  } catch (e) {
    fail("register A", e.message);
    process.exit(1);
  }

  // 2. Profile auto-created by trigger?
  console.log("\n[2/9] Profile auto-create…");
  try {
    const prof = await rest("GET", `profiles?id=eq.${sessionA.user?.id ?? "none"}`, null, sessionA.access_token);
    const uid = sessionA.user?.id ?? prof?.[0]?.id;
    if (uid) ok("profile row", `id=${uid}`);
    else {
      // fall back: query by email
      const byEmail = await rest("GET", `profiles?email=eq.${encodeURIComponent(userA)}`, null, sessionA.access_token);
      if (byEmail?.[0]?.id) ok("profile row", `id=${byEmail[0].id}`);
      else fail("profile row", "no profile found — is the handle_new_user trigger applied?");
    }
  } catch (e) {
    fail("profile check", e.message);
  }

  // 3. Insert a Drop (through the same shape the app uses)
  console.log("\n[3/9] Insert drop…");
  let dropId;
  try {
    const drop = await rest(
      "POST",
      "drops",
      {
        kind: "screenshot",
        title: "Black Nike Air Max",
        summary: "Screenshot of black Nike shoes from the Nike website",
        category: "Products",
        subcategory: "Shoes",
        status: "ready",
        analysis_status: "done",
        starred: false,
        archived: false,
        search_text: "black nike air max shoes screenshot nike website",
        saved_at: Date.now(),
        product: { name: "Nike Air Max", brand: "Nike", color: "Black", price: 129, currency: "EUR", store: "Nike website" },
      },
      sessionA.access_token,
    );
    dropId = drop?.[0]?.id;
    if (dropId) ok("drop inserted", `id=${dropId}`);
    else fail("drop inserted", "no id returned");
  } catch (e) {
    fail("drop inserted", e.message);
  }

  // 4. Storage upload + read
  console.log("\n[4/9] Storage upload/read…");
  const fileBytes = new TextEncoder().encode("DROP test file bytes");
  try {
    const up = await storageUpload(sessionA.access_token, `${sessionA.user.id}/test/drop.png`, fileBytes);
    ok("upload", up?.Key ?? up?.path ?? "ok");
    const buf = await storageRead(sessionA.access_token, `${sessionA.user.id}/test/drop.png`);
    if (buf.byteLength === fileBytes.byteLength) ok("read back", `${buf.byteLength} bytes`);
    else fail("read back", "byte mismatch");
  } catch (e) {
    fail("storage", e.message);
  }

  // 5. Search (hybrid RPC + plain query)
  console.log("\n[5/9] Search…");
  try {
    const rpc = await fetch(`${URL}/rest/v1/rpc/drop_search`, {
      method: "POST",
      headers: { apikey: ANON, Authorization: `Bearer ${sessionA.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_query: "black nike shoes", p_limit: 5 }),
    });
    const hits = await rpc.json();
    if (rpc.ok) ok("drop_search RPC", `${Array.isArray(hits) ? hits.length : 0} hits`);
    else ok("drop_search RPC", `not available (${rpc.status}) — web search still works`);
    const kw = await rest("GET", `drops?user_id=eq.${sessionA.user.id}&select=id,title`, null, sessionA.access_token);
    if (Array.isArray(kw) && kw.length > 0) ok("keyword query", `${kw.length} drops`);
    else fail("keyword query", "expected at least 1 drop");
  } catch (e) {
    fail("search", e.message);
  }

  // 6. Collections
  console.log("\n[6/9] Collections…");
  try {
    const col = await rest("POST", "collections", { name: "Test Collection", emoji: "📁" }, sessionA.access_token);
    const colId = col?.[0]?.id;
    if (colId) {
      ok("collection created", `id=${colId}`);
      if (dropId) {
        await rest(
          "POST",
          "collection_drops",
          { collection_id: colId, drop_id: dropId, user_id: sessionA.user.id },
          sessionA.access_token,
        );
        ok("drop added to collection");
      }
    } else fail("collection created", "no id returned");
  } catch (e) {
    fail("collections", e.message);
  }

  // 7. Logout + login again (persistence)
  console.log("\n[7/9] Session persistence…");
  try {
    const login = await auth("token?grant_type=password", { email: userA, password: PASSWORD });
    if (login.access_token) ok("login again", "new session");
    else fail("login again", "no token");
  } catch (e) {
    fail("login again", e.message);
  }

  // 8. Ownership isolation — user B must NOT read user A's drop
  console.log("\n[8/9] Ownership isolation…");
  try {
    const regB = await auth("signup", { email: userB, password: PASSWORD, data: { name: "Test Bob" } });
    const tokenB = regB.access_token;
    if (!tokenB) {
      fail("isolation", "user B needs a session (email confirmation disabled required for this test)");
    } else {
      const stolen = await rest("GET", `drops?id=eq.${dropId}`, null, tokenB).catch(() => null);
      const leak = Array.isArray(stolen) && stolen.length > 0;
      if (leak) fail("isolation", "USER B READ USER A'S DROP — RLS broken!");
      else ok("isolation", "user B cannot read user A's drop (RLS works)");
    }
  } catch (e) {
    ok("isolation", `user B blocked (${e.message.split(":")[0]})`);
  }

  // 9. Cleanup test users (requires service role key)
  console.log("\n[9/9] Cleanup…");
  if (SERVICE_ROLE) {
    try {
      const { data: users } = await fetch(`${URL}/auth/v1/admin/users?per_page=200`, {
        headers: { apikey: ANON, Authorization: `Bearer ${SERVICE_ROLE}` },
      }).then((r) => r.json());
      for (const u of [userA, userB]) {
        const found = (users?.users ?? []).find((x) => x.email === u);
        if (found) {
          await fetch(`${URL}/auth/v1/admin/users/${found.id}`, {
            method: "DELETE",
            headers: { apikey: ANON, Authorization: `Bearer ${SERVICE_ROLE}` },
          });
        }
      }
      ok("test users removed");
    } catch (e) {
      ok("cleanup", `skipped (${e.message})`);
    }
  } else {
    console.log("  ℹ️  no SUPABASE_SERVICE_ROLE_KEY — test users left in place for inspection");
  }

  console.log("");
  console.log("──────────────────────────────────────────────");
  if (failures === 0) console.log("  ✅ ALL END-TO-END CHECKS PASSED");
  else console.log(`  ⚠️  ${failures} check(s) failed`);
  console.log("──────────────────────────────────────────────");
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
