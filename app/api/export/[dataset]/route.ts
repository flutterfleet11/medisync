import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listMedicines } from "@/lib/data";
import { ageFrom, formatDate, formatDateTime, todayIn } from "@/lib/format";
import { EXPORT_FORMATS, mimeFor, render, type ExportFormat, type Table } from "@/lib/export";
import { createClient } from "@/lib/supabase/server";
import type { Medicine } from "@/lib/types";

// Data export: /api/export/{inventory|patients}?format=csv|xlsx|json|pdf
// Inventory: compounder/admin. Patients: admin (whole clinic) or doctor (own patients).
// All reads use the caller's session, so RLS keeps exports clinic-scoped.

interface PatientRow {
  name: string;
  phone: string | null;
  email: string | null;
  gender: string | null;
  dob: string | null;
  blood: string | null;
  allergies: string | null;
  visits: number;
  first: string;
  last: string;
  walkIn: boolean;
}

export async function GET(req: Request, ctx: RouteContext<"/api/export/[dataset]">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { dataset } = await ctx.params;
  const format = (new URL(req.url).searchParams.get("format") ?? "csv") as ExportFormat;
  if (!EXPORT_FORMATS.includes(format)) return NextResponse.json({ error: "Unknown format" }, { status: 400 });
  const clinic = session.clinic;
  if (!clinic) return NextResponse.json({ error: "Not linked to a clinic" }, { status: 403 });
  const role = session.profile.role;
  const generated = `${clinic.name} - generated ${formatDateTime(new Date().toISOString(), clinic.timezone)}`;

  let bytes: Uint8Array;
  if (dataset === "inventory") {
    if (role !== "compounder" && role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const meds = await listMedicines(clinic.id);
    const table: Table<Medicine> = {
      title: "Inventory",
      subtitle: generated,
      rows: meds,
      columns: [
        { header: "Medicine", value: (m) => m.name, width: 2.2 },
        { header: "Generic name", value: (m) => m.generic_name, width: 1.6 },
        { header: "Form", value: (m) => m.form, width: 1 },
        { header: "Strength", value: (m) => m.strength, width: 1 },
        { header: "Stock", value: (m) => m.stock_qty, width: 0.8 },
        { header: "Unit", value: (m) => m.unit, width: 0.9 },
        { header: "Reorder level", value: (m) => m.reorder_level, width: 0.9 },
        { header: "Status", value: (m) => (m.stock_qty === 0 ? "Out of stock" : m.stock_qty <= m.reorder_level ? "Low" : "In stock"), width: 1 },
        { header: "Last updated", value: (m) => formatDateTime(m.updated_at, clinic.timezone), width: 1.3 },
      ],
    };
    bytes = await render(table, format);
  } else if (dataset === "patients") {
    if (role !== "admin" && role !== "doctor") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const supabase = await createClient();
    let q = supabase
      .from("tokens")
      .select("patient_id, token_date, patient:profiles!tokens_patient_id_fkey(full_name, phone, email, gender, date_of_birth, blood_group, allergies)")
      .eq("clinic_id", clinic.id)
      .order("token_date", { ascending: false })
      .limit(5000);
    if (role === "doctor" && session.doctor) q = q.eq("doctor_id", session.doctor.id);
    const { data } = await q;
    const map = new Map<string, PatientRow>();
    type Raw = { patient_id: string; token_date: string; patient: { full_name: string; phone: string | null; email: string | null; gender: string | null; date_of_birth: string | null; blood_group: string | null; allergies: string | null } | null };
    for (const r of (data ?? []) as unknown as Raw[]) {
      const prev = map.get(r.patient_id);
      if (prev) {
        prev.visits += 1;
        if (r.token_date < prev.first) prev.first = r.token_date;
        continue;
      }
      const walkIn = (r.patient?.email ?? "").endsWith("@walkin.medisync.local");
      map.set(r.patient_id, {
        name: r.patient?.full_name || "(no name)",
        phone: r.patient?.phone ?? null,
        email: walkIn ? null : (r.patient?.email ?? null),
        gender: r.patient?.gender ?? null,
        dob: r.patient?.date_of_birth ?? null,
        blood: r.patient?.blood_group ?? null,
        allergies: r.patient?.allergies ?? null,
        visits: 1,
        first: r.token_date,
        last: r.token_date,
        walkIn,
      });
    }
    const rows = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
    const table: Table<PatientRow> = {
      title: role === "doctor" ? `Patients of ${session.doctor?.display_name ?? "doctor"}` : "Patients",
      subtitle: `${generated} - confidential patient data`,
      rows,
      columns: [
        { header: "Name", value: (p) => p.name, width: 1.8 },
        { header: "Phone", value: (p) => p.phone, width: 1.3 },
        { header: "Email", value: (p) => p.email, width: 1.9 },
        { header: "Gender", value: (p) => p.gender, width: 0.8 },
        { header: "Date of birth", value: (p) => (p.dob ? formatDate(p.dob) : null), width: 1.1 },
        { header: "Age", value: (p) => ageFrom(p.dob), width: 0.5 },
        { header: "Blood group", value: (p) => p.blood, width: 0.8 },
        { header: "Allergies", value: (p) => p.allergies, width: 1.5 },
        { header: "Visits", value: (p) => p.visits, width: 0.6 },
        { header: "First visit", value: (p) => formatDate(p.first), width: 1 },
        { header: "Last visit", value: (p) => formatDate(p.last), width: 1 },
        { header: "Registration", value: (p) => (p.walkIn ? "Walk-in" : "Online"), width: 0.9 },
      ],
    };
    bytes = await render(table, format);
  } else {
    return NextResponse.json({ error: "Unknown dataset" }, { status: 404 });
  }

  const slug = clinic.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "clinic";
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": mimeFor(format),
      "Content-Disposition": `attachment; filename="medisync-${dataset}-${slug}-${todayIn(clinic.timezone)}.${format}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
