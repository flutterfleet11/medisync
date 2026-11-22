// MediSync demo seed — SYNTHETIC DATA ONLY.
// Idempotent: deletes the demo clinics/users it owns, then recreates them, so
// `npm run seed` always resets the demo to a known state.
//   node --env-file=.env.local scripts/seed.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (load .env.local).");
  process.exit(1);
}
// Node < 22 has no global WebSocket; the seed never uses realtime, so pass an inert transport.
const realtime = typeof globalThis.WebSocket === "undefined" ? { transport: class { constructor() { throw new Error("no realtime in seed"); } } } : undefined;
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false }, ...(realtime ? { realtime } : {}) });

const PASSWORD = "MediSync@2026";
const TZ = "Asia/Kolkata";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const daysAgo = (n) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(Date.now() - n * 86400000));
const isoDaysAgo = (n, h = 10) => new Date(Date.now() - n * 86400000 - h * 3600000).toISOString();

const CLINICS = [
  {
    key: "citycare",
    name: "CityCare Family Clinic",
    description: "Family medicine and pediatrics with an in-house dispensary. Walk-ins welcome.",
    address: "12, 100 Feet Road, Indiranagar",
    city: "Bengaluru",
    phone: "+91 80 4000 1200",
    opening_hours: "Mon–Sat · 9:00 AM – 8:00 PM",
    latitude: 12.9719,
    longitude: 77.6412,
    avg_consult_minutes: 8,
  },
  {
    key: "sunrise",
    name: "Sunrise Health Centre",
    description: "General physician and diabetes care clinic.",
    address: "45, 5th Block, Koramangala",
    city: "Bengaluru",
    phone: "+91 80 4000 3400",
    opening_hours: "Mon–Sun · 8:00 AM – 9:00 PM",
    latitude: 12.9352,
    longitude: 77.6245,
    avg_consult_minutes: 10,
  },
];

const USERS = [
  { email: "admin@medisync.demo", full_name: "Meera Iyer", role: "admin", clinic: "citycare" },
  { email: "doctor@medisync.demo", full_name: "Dr. Ananya Rao", role: "doctor", clinic: "citycare", specialty: "General Physician", qualification: "MBBS, MD", room: "2" },
  { email: "doctor2@medisync.demo", full_name: "Dr. Vikram Shah", role: "doctor", clinic: "citycare", specialty: "Pediatrics", qualification: "MBBS, DCH", room: "3" },
  { email: "doctor3@medisync.demo", full_name: "Dr. Farah Siddiqui", role: "doctor", clinic: "sunrise", specialty: "Diabetology", qualification: "MBBS, MD", room: "1" },
  { email: "compounder@medisync.demo", full_name: "Ravi Kumar", role: "compounder", clinic: "citycare" },
  { email: "compounder2@medisync.demo", full_name: "Lakshmi Nair", role: "compounder", clinic: "sunrise" },
  { email: "patient@medisync.demo", full_name: "Aisha Khan", role: "patient", phone: "+91 98450 00001", date_of_birth: "1994-03-12", gender: "Female", blood_group: "B+", allergies: "Penicillin" },
  { email: "patient2@medisync.demo", full_name: "Rohan Mehta", role: "patient", phone: "+91 98450 00002", date_of_birth: "1988-07-25", gender: "Male", blood_group: "O+" },
  { email: "patient3@medisync.demo", full_name: "Kavya Reddy", role: "patient", phone: "+91 98450 00003", date_of_birth: "2001-11-02", gender: "Female", blood_group: "A+" },
  { email: "patient4@medisync.demo", full_name: "Arjun Das", role: "patient", phone: "+91 98450 00004", date_of_birth: "1979-01-30", gender: "Male", blood_group: "AB+" },
];

// Stock 0 / low on purpose so the demo shows the unavailable-medicine path.
const MEDICINES = [
  ["Paracetamol 500mg", "Paracetamol", "Tablet", "500 mg", 240, "tablets", 50],
  ["Amoxicillin 500mg", "Amoxicillin", "Capsule", "500 mg", 60, "capsules", 30],
  ["Azithromycin 500mg", "Azithromycin", "Tablet", "500 mg", 0, "tablets", 20],
  ["Cetirizine 10mg", "Cetirizine", "Tablet", "10 mg", 120, "tablets", 30],
  ["Pantoprazole 40mg", "Pantoprazole", "Tablet", "40 mg", 90, "tablets", 30],
  ["Ibuprofen 400mg", "Ibuprofen", "Tablet", "400 mg", 8, "tablets", 30],
  ["Metformin 500mg", "Metformin", "Tablet", "500 mg", 150, "tablets", 40],
  ["Amlodipine 5mg", "Amlodipine", "Tablet", "5 mg", 90, "tablets", 30],
  ["ORS Sachet", "Oral rehydration salts", "Sachet", "21 g", 40, "sachets", 20],
  ["Vitamin D3 60000 IU", "Cholecalciferol", "Capsule", "60000 IU", 0, "capsules", 10],
  ["Salbutamol Inhaler", "Salbutamol", "Inhaler", "100 mcg", 6, "inhalers", 5],
  ["Cough Syrup (Dextromethorphan)", "Dextromethorphan", "Syrup", "100 ml", 25, "bottles", 10],
];

async function must(promise, label) {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function main() {
  console.log("Resetting demo data…");
  // 1. Remove previous demo users (cascades to profiles, tokens, prescriptions…).
  let page = 1;
  for (;;) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) {
      if (u.email?.endsWith("@medisync.demo") || u.email?.endsWith("@walkin.medisync.local")) {
        await db.auth.admin.deleteUser(u.id);
      }
    }
    if (data.users.length < 200) break;
    page++;
  }
  // 2. Remove demo clinics (cascades doctors, medicines, queue state).
  await must(db.from("clinics").delete().in("name", CLINICS.map((c) => c.name)), "delete clinics");

  // 3. Clinics
  const clinicIds = {};
  for (const c of CLINICS) {
    const { key, ...row } = c;
    const created = await must(db.from("clinics").insert({ ...row, timezone: TZ }).select("id").single(), `clinic ${c.name}`);
    clinicIds[key] = created.id;
  }

  // 4. Users → profiles (trigger) → roles, clinic links, doctor rows
  const ids = {};
  const doctorIds = {};
  for (const u of USERS) {
    const created = await db.auth.admin.createUser({
      email: u.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: u.full_name, phone: u.phone ?? "" },
    });
    if (created.error) throw new Error(`user ${u.email}: ${created.error.message}`);
    const id = created.data.user.id;
    ids[u.email] = id;
    await must(
      db
        .from("profiles")
        .update({
          role: u.role,
          clinic_id: u.clinic ? clinicIds[u.clinic] : null,
          phone: u.phone ?? null,
          date_of_birth: u.date_of_birth ?? null,
          gender: u.gender ?? null,
          blood_group: u.blood_group ?? null,
          allergies: u.allergies ?? null,
        })
        .eq("id", id),
      `profile ${u.email}`,
    );
    if (u.role === "doctor") {
      const d = await must(
        db
          .from("doctors")
          .insert({
            profile_id: id,
            clinic_id: clinicIds[u.clinic],
            display_name: u.full_name,
            specialty: u.specialty,
            qualification: u.qualification,
            room: u.room,
          })
          .select("id")
          .single(),
        `doctor ${u.email}`,
      );
      doctorIds[u.email] = d.id;
    }
  }

  // 5. Inventory (both clinics)
  const medIds = {};
  for (const [key, clinicId] of Object.entries(clinicIds)) {
    const rows = MEDICINES.map(([name, generic_name, form, strength, stock_qty, unit, reorder_level]) => ({
      clinic_id: clinicId,
      name,
      generic_name,
      form,
      strength,
      stock_qty: key === "sunrise" ? Math.max(stock_qty, 30) : stock_qty,
      unit,
      reorder_level,
    }));
    const inserted = await must(db.from("medicines").insert(rows).select("id, name"), `medicines ${key}`);
    if (key === "citycare") for (const m of inserted) medIds[m.name] = m.id;
  }

  const citycare = clinicIds.citycare;
  const drRao = doctorIds["doctor@medisync.demo"];
  const drShah = doctorIds["doctor2@medisync.demo"];

  // 6. History: Aisha's past visit (completed + dispensed) so doctors see history.
  async function pastVisit({ patient, doctor, day, number, diagnosis, notes, advice, items, status }) {
    const tok = await must(
      db
        .from("tokens")
        .insert({
          clinic_id: citycare,
          doctor_id: doctor,
          patient_id: patient,
          token_date: daysAgo(day),
          token_number: number,
          status: "completed",
          source: "online",
          reason: diagnosis,
          booked_by: patient,
          called_at: isoDaysAgo(day, 9),
          started_at: isoDaysAgo(day, 9),
          completed_at: isoDaysAgo(day, 8.8),
          created_at: isoDaysAgo(day, 11),
        })
        .select("id")
        .single(),
      "past token",
    );
    const cons = await must(
      db
        .from("consultations")
        .insert({
          token_id: tok.id,
          clinic_id: citycare,
          doctor_id: doctor,
          patient_id: patient,
          diagnosis,
          notes,
          started_at: isoDaysAgo(day, 9),
          completed_at: isoDaysAgo(day, 8.8),
        })
        .select("id")
        .single(),
      "past consultation",
    );
    const rx = await must(
      db
        .from("prescriptions")
        .insert({ consultation_id: cons.id, clinic_id: citycare, doctor_id: doctor, patient_id: patient, status, advice, created_at: isoDaysAgo(day, 8.8) })
        .select("id")
        .single(),
      "past prescription",
    );
    await must(
      db.from("prescription_items").insert(
        items.map((it, i) => ({
          prescription_id: rx.id,
          medicine_id: medIds[it.name] ?? null,
          medicine_name: it.name,
          dosage: it.dosage,
          frequency: it.frequency,
          duration: it.duration,
          instructions: it.instructions ?? null,
          quantity: it.quantity,
          status: it.status,
          position: i + 1,
        })),
      ),
      "past items",
    );
    return rx.id;
  }

  await pastVisit({
    patient: ids["patient@medisync.demo"],
    doctor: drRao,
    day: 21,
    number: 4,
    diagnosis: "Acute gastritis",
    notes: "Epigastric pain after meals for 3 days. No red flags.",
    advice: "Small frequent meals, avoid spicy food.",
    status: "dispensed",
    items: [
      { name: "Pantoprazole 40mg", dosage: "1 tablet", frequency: "OD", duration: "14 days", instructions: "Before breakfast", quantity: 14, status: "dispensed" },
      { name: "ORS Sachet", dosage: "1 sachet", frequency: "SOS", duration: "3 days", quantity: 3, status: "dispensed" },
    ],
  });
  await pastVisit({
    patient: ids["patient2@medisync.demo"],
    doctor: drRao,
    day: 9,
    number: 2,
    diagnosis: "Allergic rhinitis",
    notes: "Seasonal sneezing and nasal congestion.",
    advice: "Avoid dust exposure.",
    status: "partially_dispensed",
    items: [
      { name: "Cetirizine 10mg", dosage: "1 tablet", frequency: "HS", duration: "7 days", quantity: 7, status: "dispensed" },
      { name: "Vitamin D3 60000 IU", dosage: "1 capsule", frequency: "Weekly", duration: "4 weeks", instructions: "After a meal", quantity: 4, status: "unavailable" },
    ],
  });

  // 7. Today's live queue for Dr. Rao: #1 done, #2 in queue → the demo patient
  //    books next and sees "1 ahead". Dr. Shah has one waiting walk-in.
  const insToken = (row) => must(db.from("tokens").insert({ clinic_id: citycare, token_date: today, ...row }).select("id").single(), "today token");
  await insToken({
    doctor_id: drRao,
    patient_id: ids["patient4@medisync.demo"],
    token_number: 1,
    status: "completed",
    source: "walk_in",
    reason: "BP review",
    booked_by: ids["compounder@medisync.demo"],
    called_at: new Date(Date.now() - 50 * 60000).toISOString(),
    started_at: new Date(Date.now() - 48 * 60000).toISOString(),
    completed_at: new Date(Date.now() - 40 * 60000).toISOString(),
  });
  await insToken({ doctor_id: drRao, patient_id: ids["patient2@medisync.demo"], token_number: 2, status: "waiting", source: "online", reason: "Sore throat and fever", booked_by: ids["patient2@medisync.demo"] });
  await insToken({ doctor_id: drShah, patient_id: ids["patient3@medisync.demo"], token_number: 1, status: "waiting", source: "walk_in", reason: "Child vaccination query", booked_by: ids["compounder@medisync.demo"] });

  // The tokens trigger keeps queue_state (counter + now serving) consistent.
  const qs = await must(db.from("queue_state").select("doctor_id, last_token_number, now_serving, waiting_count").eq("clinic_id", citycare), "queue_state");
  console.log("Queue state:", qs);

  console.log("\nDemo accounts (password: %s)", PASSWORD);
  for (const u of USERS) console.log(`  ${u.role.padEnd(10)} ${u.email}`);
  console.log("\nSeed complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
