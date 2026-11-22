import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getClinic, getPrescription, getProfile } from "@/lib/data";
import { isUuid } from "@/lib/format";
import { renderPrescriptionPdf } from "@/lib/pdf";

// Prescription PDF. Data is loaded with the caller's session, so RLS decides
// access: the patient themselves, or staff at the prescribing clinic.
export async function GET(_req: Request, ctx: RouteContext<"/api/prescriptions/[id]/pdf">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const canSeeDiagnosis = session.profile.role !== "compounder";
  const rx = await getPrescription(id, canSeeDiagnosis);
  if (!rx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [clinic, patient] = await Promise.all([getClinic(rx.clinic_id), getProfile(rx.patient_id)]);

  const bytes = await renderPrescriptionPdf({ rx, clinic, patient });
  const safeName = (patient?.full_name ?? "patient").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="medisync-prescription-${safeName}-${rx.created_at.slice(0, 10)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
