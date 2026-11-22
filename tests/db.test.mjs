// Applies the MediSync migrations to PGlite (real Postgres in WASM) with a
// stubbed Supabase `auth` schema, then exercises RLS + RPC workflow.
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Usage: npm run test:db   (no Supabase project or Docker needed)
const migDir = process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations");
const db = new PGlite();
let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures++;
};

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  create publication supabase_realtime;
  -- Mirror Supabase's default privileges: anon/authenticated are granted everything; RLS must do the work.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
`);

for (const f of fs.readdirSync(migDir).sort()) {
  try {
    await db.exec(fs.readFileSync(path.join(migDir, f), "utf8"));
    ok(true, `migration ${f}`);
  } catch (e) {
    ok(false, `migration ${f}: ${e.message}`);
    process.exit(1);
  }
}

const U = {
  p1: "00000000-0000-0000-0000-000000000001",
  p2: "00000000-0000-0000-0000-000000000002",
  p3: "00000000-0000-0000-0000-000000000003",
  doc: "00000000-0000-0000-0000-0000000000d1",
  doc2: "00000000-0000-0000-0000-0000000000d2",
  comp: "00000000-0000-0000-0000-0000000000c1",
  admin: "00000000-0000-0000-0000-0000000000a1",
  newbie: "00000000-0000-0000-0000-0000000000e1",
  admin2: "00000000-0000-0000-0000-0000000000a2",
};
for (const [k, id] of Object.entries(U)) {
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
    id, `${k}@test.dev`, { full_name: `User ${k}`, phone: "555" },
  ]);
}
ok((await db.query(`select count(*)::int c from public.profiles where role='patient'`)).rows[0].c === Object.keys(U).length, "signup trigger creates patient profiles");

const clinic = (await db.query(`insert into public.clinics (name, city) values ('C1','X') returning id`)).rows[0].id;
const clinic2 = (await db.query(`insert into public.clinics (name, city) values ('C2','Y') returning id`)).rows[0].id;
await db.query(`update public.profiles set role='doctor', clinic_id=$1 where id in ($2)`, [clinic, U.doc]);
await db.query(`update public.profiles set role='doctor', clinic_id=$1 where id in ($2)`, [clinic2, U.doc2]);
await db.query(`update public.profiles set role='compounder', clinic_id=$1 where id=$2`, [clinic, U.comp]);
await db.query(`update public.profiles set role='admin', clinic_id=$1 where id=$2`, [clinic, U.admin]);
const d1 = (await db.query(`insert into public.doctors (profile_id, clinic_id, display_name) values ($1,$2,'Dr A') returning id`, [U.doc, clinic])).rows[0].id;
const d2 = (await db.query(`insert into public.doctors (profile_id, clinic_id, display_name) values ($1,$2,'Dr B') returning id`, [U.doc2, clinic2])).rows[0].id;
await db.query(`insert into public.medicines (clinic_id, name, stock_qty) values ($1,'Paracetamol 500mg',100),($1,'Azithromycin 500mg',0)`, [clinic]);

async function as(uid, sql, params = []) {
  return db.transaction(async (tx) => {
    if (uid === "anon") await tx.exec(`set local role anon`);
    else {
      await tx.exec(`set local role authenticated`);
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
    }
    return tx.query(sql, params);
  });
}
async function err(uid, sql, params = []) {
  try { await as(uid, sql, params); return null; } catch (e) { return e.message; }
}

// Booking
const t1 = (await as(U.p1, `select * from public.book_token($1)`, [d1])).rows[0];
const t2 = (await as(U.p2, `select * from public.book_token($1, null, 'fever')`, [d1])).rows[0];
ok(t1.token_number === 1 && t2.token_number === 2, "sequential token numbers (1, 2)");
ok(t1.source === "online", "patient booking is online");
ok(/already exists/.test(await err(U.p1, `select * from public.book_token($1)`, [d1]) ?? ""), "duplicate active token rejected");
ok(/own clinic/.test(await err(U.comp, `select * from public.book_token($1,$2)`, [d2, U.p3]) ?? ""), "compounder cannot book at other clinic");
const t3 = (await as(U.comp, `select * from public.book_token($1,$2)`, [d1, U.p3])).rows[0];
ok(t3.token_number === 3 && t3.source === "walk_in", "compounder walk-in booking (#3)");
ok(/cannot book/.test(await err(U.doc, `select * from public.book_token($1)`, [d1]) ?? ""), "doctor cannot book tokens");

// H1: staff only see patients who visited their clinic
ok((await as(U.comp, `select id from public.profiles where id=$1`, [U.newbie])).rows.length === 0, "compounder cannot read a patient who never visited the clinic");
ok((await as(U.comp, `select id from public.profiles where id=$1`, [U.p3])).rows.length === 1, "compounder reads own-clinic patient");
ok((await as(U.comp, `select * from public.search_patients('User newbie')`)).rows.length === 0, "search: no fuzzy match outside the clinic");
const byEmail = (await as(U.comp, `select * from public.search_patients('newbie@test.dev')`)).rows;
ok(byEmail.length === 1 && byEmail[0].visited_clinic === false, "search: exact email finds a new patient");
const byName = (await as(U.comp, `select * from public.search_patients('User p3')`)).rows;
ok(byName.length === 1 && /^•*\d{0,4}$/.test(byName[0].phone_masked ?? ""), `search: clinic patient by name with masked phone (${byName[0]?.phone_masked})`);
ok(/front-desk/.test(await err(U.p1, `select * from public.search_patients('User')`) ?? ""), "patients cannot search patients");

// Token visibility
ok((await as(U.p1, `select * from public.tokens`)).rows.length === 1, "patient sees only own token");
ok((await as(U.comp, `select * from public.tokens`)).rows.length === 3, "compounder sees clinic tokens");
ok((await as(U.doc2, `select * from public.tokens`)).rows.length === 0, "other-clinic doctor sees no tokens");
ok((await as("anon", `select * from public.tokens`)).rows.length === 0, "anon reads 0 tokens (RLS, despite default grants)");
ok((await as("anon", `select * from public.profiles`)).rows.length === 0, "anon reads 0 profiles");
ok(/sign in/.test(await err("anon", `select * from public.book_token($1)`, [d1]) ?? ""), "anon cannot book tokens");
ok((await as("anon", `select * from public.queue_state`)).rows[0]?.last_token_number === 3, "queue_state public, counter = 3");

// Queue position
const qp = (await as(U.p2, `select * from public.get_queue_position($1)`, [t2.id])).rows[0];
ok(qp.tokens_ahead === 1 && qp.est_wait_minutes === 10, `queue position: ahead=${qp.tokens_ahead}, wait=${qp.est_wait_minutes}`);
ok(/not found/.test(await err(U.p1, `select * from public.get_queue_position($1)`, [t2.id]) ?? ""), "patient cannot read another patient's position");

// Profile protection
ok(/cannot change role/.test(await err(U.p1, `update public.profiles set role='admin' where id=$1`, [U.p1]) ?? ""), "patient cannot self-promote");
await as(U.p1, `update public.profiles set phone='999' where id=$1`, [U.p1]);
ok((await db.query(`select phone from public.profiles where id=$1`, [U.p1])).rows[0].phone === "999", "patient can edit own phone");
ok((await as(U.p1, `update public.profiles set phone='1' where id=$1 returning id`, [U.p2])).rows.length === 0, "patient cannot edit another profile");
ok((await as(U.p1, `select * from public.profiles`)).rows.length === 1, "patient reads only own profile");

// Queue control
ok(/cannot manage/.test(await err(U.doc2, `select * from public.call_next_token($1)`, [d1]) ?? ""), "other doctor cannot call next");
const called = (await as(U.doc, `select * from public.call_next_token($1)`, [d1])).rows[0];
ok(called.token_number === 1 && called.status === "called", "doctor calls next → #1");
ok((await db.query(`select now_serving from public.queue_state where doctor_id=$1`, [d1])).rows[0].now_serving === 1, "now_serving = 1");
ok(/cancel a token/.test(await err(U.p1, `select * from public.update_token_status($1,'completed')`, [t1.id]) ?? ""), "patient cannot complete own token");

ok(/already called/.test(await err(U.comp, `select * from public.call_next_token($1)`, [d1]) ?? ""), "cannot call next while a patient is already called");

// Consultation
const cid = (await as(U.doc, `select public.start_consultation($1) as id`, [t1.id])).rows[0].id;
ok(/Finish the consultation/.test(await err(U.doc, `select public.start_consultation($1)`, [t2.id]) ?? ""), "doctor cannot run two consultations at once");
ok(/Only the doctor/.test(await err(U.comp, `select * from public.update_token_status($1,'completed')`, [t1.id]) ?? ""), "front desk cannot complete a consultation in progress");
ok(!!cid, "consultation started");
ok(/Only the assigned doctor/.test(await err(U.doc2, `select public.start_consultation($1)`, [t2.id]) ?? ""), "other doctor cannot start consultation");
const items = [
  { medicine_name: "paracetamol 500MG", dosage: "1 tab", frequency: "TDS", duration: "3 days", quantity: 9 },
  { medicine_name: "Azithromycin 500mg", dosage: "1 tab", frequency: "OD", duration: "3 days", quantity: 3 },
  { medicine_name: "Rare Syrup", dosage: "5 ml", frequency: "BD", duration: "5 days", quantity: 1 },
  { medicine_name: "  ", dosage: "x" },
];
ok(/Diagnosis is required/.test(await err(U.doc, `select public.complete_consultation($1,'')`, [t1.id]) ?? ""), "diagnosis required");
const rx = (await as(U.doc, `select public.complete_consultation($1,'Viral fever','n','rest',null,$2::jsonb) as id`, [t1.id, JSON.stringify(items)])).rows[0].id;
ok(!!rx, "prescription created");
const its = (await db.query(`select medicine_name, medicine_id is not null as matched from public.prescription_items where prescription_id=$1 order by position`, [rx])).rows;
ok(its.length === 3 && its[0].matched && its[1].matched && !its[2].matched, "3 items stored, inventory matched case-insensitively");
ok((await db.query(`select status from public.tokens where id=$1`, [t1.id])).rows[0].status === "completed", "token completed");

// Prescription visibility
ok((await as(U.p1, `select * from public.prescription_items where prescription_id=$1`, [rx])).rows.length === 3, "patient sees own items");
ok((await as(U.p2, `select * from public.prescriptions`)).rows.length === 0, "other patient sees no prescriptions");
ok((await as(U.comp, `select * from public.prescriptions`)).rows.length === 1, "compounder sees clinic prescription");
ok((await as(U.comp, `select * from public.consultations`)).rows.length === 0, "compounder cannot read diagnoses");
ok((await as(U.p1, `select * from public.consultations`)).rows.length === 1, "patient reads own consultation");
ok((await as(U.p1, `select * from public.medicines`)).rows.length === 0, "patient cannot read inventory");

// Dispensing
ok(/Only the clinic compounder/.test(await err(U.p1, `select public.dispense_items($1, array[]::uuid[])`, [rx]) ?? ""), "patient cannot dispense");
const itemIds = (await db.query(`select id from public.prescription_items where prescription_id=$1 order by position`, [rx])).rows.map((r) => r.id);
await as(U.comp, `select public.set_item_availability($1, true)`, [itemIds[0]]);
ok((await db.query(`select status from public.prescriptions where id=$1`, [rx])).rows[0].status === "in_progress", "rx in_progress after availability check");
const res = (await as(U.comp, `select public.dispense_items($1, $2::uuid[]) as r`, [rx, itemIds])).rows[0].r;
ok(res.dispensed === 1 && res.unavailable === 2 && res.status === "partially_dispensed", `dispense: ${JSON.stringify(res)}`);
ok((await db.query(`select stock_qty from public.medicines where name='Paracetamol 500mg'`)).rows[0].stock_qty === 91, "stock decremented 100 → 91");
ok((await db.query(`select count(*)::int c from public.dispensing_records where prescription_id=$1`, [rx])).rows[0].c === 4, "dispensing audit rows written");
ok((await as(U.p1, `select * from public.dispensing_records`)).rows.length === 0, "patient cannot read audit trail");

// Inventory writes
ok(/row-level security/.test(await err(U.p1, `insert into public.medicines (clinic_id, name) values ($1,'X')`, [clinic]) ?? ""), "patient cannot insert medicine");
await as(U.comp, `update public.medicines set stock_qty = 20 where name='Azithromycin 500mg'`);
ok((await db.query(`select stock_qty from public.medicines where name='Azithromycin 500mg'`)).rows[0].stock_qty === 20, "compounder restocks");
ok((await as(U.comp, `update public.medicines set stock_qty = 5 where clinic_id=$1 returning id`, [clinic2])).rows.length === 0, "compounder cannot touch other clinic inventory");

// Atomic stock adjust
const azi = (await db.query(`select id from public.medicines where name='Azithromycin 500mg'`)).rows[0].id;
ok((await as(U.comp, `select * from public.adjust_stock($1, -50)`, [azi])).rows[0].stock_qty === 0, "adjust_stock clamps at zero");
ok((await as(U.admin, `select * from public.adjust_stock($1, 15)`, [azi])).rows[0].stock_qty === 15, "admin restock +15");
ok(/Only clinic compounders/.test(await err(U.p1, `select * from public.adjust_stock($1, 5)`, [azi]) ?? ""), "patient cannot adjust stock");
ok(/Only clinic compounders/.test(await err(U.doc, `select * from public.adjust_stock($1, 5)`, [azi]) ?? ""), "doctor cannot adjust stock");

// Direct writes blocked
ok(/row-level security/.test(await err(U.p1, `insert into public.tokens (clinic_id, doctor_id, patient_id, token_date, token_number) values ($1,$2,$3,current_date,99)`, [clinic, d1, U.p1]) ?? ""), "direct token insert blocked");
ok((await as(U.doc, `update public.prescriptions set status='dispensed' returning id`)).rows.length === 0, "direct prescription update blocked");

// Patient cancel
await as(U.p2, `select * from public.update_token_status($1,'cancelled')`, [t2.id]);
ok((await db.query(`select waiting_count from public.queue_state where doctor_id=$1`, [d1])).rows[0].waiting_count === 1, "cancel updates waiting_count");
const next = (await as(U.comp, `select * from public.call_next_token($1)`, [d1])).rows[0];
ok(next.token_number === 3, "compounder calls next → #3 (skips cancelled #2)");
ok(/already called/.test(await err(U.comp, `select * from public.call_next_token($1)`, [d1]) ?? ""), "second call-next blocked while #3 is called");
await as(U.comp, `select * from public.update_token_status($1,'cancelled')`, [next.id]);
const none = (await as(U.comp, `select * from public.call_next_token($1)`, [d1])).rows[0];
ok(none.id === null, "call next on empty queue returns null row");

// Admin
ok(/Only admins/.test(await err(U.comp, `select public.admin_assign_staff('newbie@test.dev','doctor')`) ?? ""), "non-admin cannot assign staff");
await as(U.admin, `select public.admin_assign_staff('newbie@test.dev','doctor','Pediatrics')`);
const nd = (await db.query(`select p.role, p.clinic_id, d.specialty from public.profiles p join public.doctors d on d.profile_id=p.id where p.id=$1`, [U.newbie])).rows[0];
ok(nd?.role === "doctor" && nd.clinic_id === clinic && nd.specialty === "Pediatrics", "admin assigns doctor role + doctor row");
ok(/another clinic/.test(await err(U.admin, `select public.admin_assign_staff('doc2@test.dev','compounder')`) ?? ""), "admin cannot poach other clinic staff");
ok((await as(U.admin, `update public.clinics set name='C1b' returning id`)).rows.length === 1, "admin updates own clinic only");

// Start-from-zero: admin without a clinic creates one, then assigns staff
await db.query(`update public.profiles set role='admin' where id=$1`, [U.admin2]);
ok(/already manages/.test(await err(U.admin, `select public.admin_create_clinic('X')`) ?? ""), "admin with a clinic cannot create another");
ok(/Only admins/.test(await err(U.p1, `select public.admin_create_clinic('X')`) ?? ""), "patient cannot create a clinic");
const newClinic = (await as(U.admin2, `select public.admin_create_clinic('Fresh Clinic', 'Addr', 'City') as id`)).rows[0].id;
ok((await db.query(`select clinic_id from public.profiles where id=$1`, [U.admin2])).rows[0].clinic_id === newClinic, "new admin linked to created clinic");
await db.query(`update public.profiles set role='doctor', clinic_id=null where id=$1`, [U.p2]);
await as(U.admin2, `select public.admin_assign_staff('p2@test.dev','doctor','ENT')`);
ok((await db.query(`select d.clinic_id, d.display_name from public.doctors d where profile_id=$1`, [U.p2])).rows[0]?.clinic_id === newClinic, "unassigned doctor account can be assigned");
await as(U.p2, `update public.profiles set full_name='Meera Joshi' where id=$1`, [U.p2]);
ok((await db.query(`select display_name from public.doctors where profile_id=$1`, [U.p2])).rows[0].display_name === "Dr. Meera Joshi", "doctor display name follows profile name");

// Doctor self-service: degrees + specialty, own record only
await as(U.doc, `select * from public.update_my_doctor_details('MBBS, MD (Medicine)', 'General Physician')`);
ok((await db.query(`select qualification from public.doctors where id=$1`, [d1])).rows[0].qualification === "MBBS, MD (Medicine)", "doctor updates own degrees");
ok(/not set up as a doctor/.test(await err(U.comp, `select * from public.update_my_doctor_details('X', 'Y Z')`) ?? ""), "non-doctor cannot use doctor self-service");
ok(/Specialty/.test(await err(U.doc, `select * from public.update_my_doctor_details('MBBS', '')`) ?? ""), "specialty required");
ok((await as(U.doc, `update public.doctors set qualification='hack' where id=$1 returning id`, [d2])).rows.length === 0, "doctor cannot edit another doctor directly");

// Inventory delete keeps prescription history (FK set null)
const medForDelete = (await db.query(`select id from public.medicines where name='Paracetamol 500mg'`)).rows[0].id;
await as(U.comp, `delete from public.medicines where id=$1`, [medForDelete]);
const orphan = (await db.query(`select medicine_name, medicine_id from public.prescription_items where medicine_name ilike 'paracetamol%' limit 1`)).rows[0];
ok(orphan && orphan.medicine_id === null && /paracetamol/i.test(orphan.medicine_name), "deleting a medicine keeps prescription items (name kept, link cleared)");
ok((await as(U.p1, `delete from public.medicines where clinic_id=$1 returning id`, [clinic])).rows.length === 0, "patient cannot delete medicines");

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
