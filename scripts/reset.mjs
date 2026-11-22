// MediSync full reset — wipes ALL data (every user, clinic, token, prescription,
// medicine…) and creates only blank login accounts. No demo data.
//   npm run reset
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (load .env.local).");
  process.exit(1);
}
const realtime = typeof globalThis.WebSocket === "undefined" ? { transport: class { constructor() { throw new Error("no realtime"); } } } : undefined;
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false }, ...(realtime ? { realtime } : {}) });

const PASSWORD = process.env.RESET_PASSWORD || "MediSync@2026";
// Blank accounts: role only, no clinic, no name. Everything else is created in the app.
const ACCOUNTS = [
  { email: "admin@medisync.demo", role: "admin" },
  { email: "doctor@medisync.demo", role: "doctor" },
  { email: "compounder@medisync.demo", role: "compounder" },
  { email: "patient@medisync.demo", role: "patient" },
];
const TABLES = ["dispensing_records", "prescription_items", "prescriptions", "consultations", "tokens", "queue_state", "medicines", "doctors", "clinics", "profiles"];

async function counts() {
  const out = {};
  for (const t of TABLES) {
    const { count, error } = await db.from(t).select("*", { count: "exact", head: true });
    out[t] = error ? `err: ${error.message}` : count;
  }
  return out;
}

async function allUsers() {
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 200) break;
  }
  return users;
}

const before = await allUsers();
const byDomain = {};
for (const u of before) {
  const d = (u.email ?? "no-email").split("@")[1] ?? "no-email";
  byDomain[d] = (byDomain[d] ?? 0) + 1;
}
console.log("Before:", { users: before.length, byDomain, tables: await counts() });

// 1. Delete every user (cascades profiles → tokens, consultations, prescriptions…)
for (const u of before) {
  const { error } = await db.auth.admin.deleteUser(u.id);
  if (error) throw new Error(`delete ${u.email}: ${error.message}`);
}
// 2. Delete every clinic (cascades doctors, medicines, queue state, remaining rows)
{
  const { error } = await db.from("clinics").delete().not("id", "is", null);
  if (error) throw new Error(`delete clinics: ${error.message}`);
}

// 3. Blank login accounts
for (const a of ACCOUNTS) {
  const { data, error } = await db.auth.admin.createUser({ email: a.email, password: PASSWORD, email_confirm: true });
  if (error) throw new Error(`create ${a.email}: ${error.message}`);
  const { error: e2 } = await db.from("profiles").update({ role: a.role, full_name: "" }).eq("id", data.user.id);
  if (e2) throw new Error(`profile ${a.email}: ${e2.message}`);
}

const after = await counts();
console.log("After:", { users: (await allUsers()).length, tables: after });
const dirty = Object.entries(after).filter(([t, n]) => t !== "profiles" && n !== 0);
if (dirty.length || after.profiles !== ACCOUNTS.length) {
  console.error("Reset incomplete:", dirty);
  process.exit(1);
}
console.log(`\nDatabase is empty. Logins (password: ${PASSWORD}):`);
for (const a of ACCOUNTS) console.log(`  ${a.role.padEnd(10)} ${a.email}`);
