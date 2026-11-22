import Link from "next/link";
import { notFound } from "next/navigation";
import { PatientHistoryList } from "@/components/patient-history";
import { Card, CardHeader, Notice } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { getPatientHistory, getProfile } from "@/lib/data";
import { ageFrom, isUuid } from "@/lib/format";

export default async function DoctorPatientPage({ params }: PageProps<"/doctor/patients/[id]">) {
  await requireStaff("doctor");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  // RLS: doctors can only read patients who have visited their clinic.
  const patient = await getProfile(id);
  if (!patient || patient.role !== "patient") notFound();
  const history = await getPatientHistory(id, 30);
  const age = ageFrom(patient.date_of_birth);

  return (
    <>
      <Link href="/doctor/patients" className="text-sm text-slate-500 hover:text-navy-900">
        ← Patients
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-navy-900">{patient.full_name}</h1>
      <p className="mt-1 mb-6 text-sm text-slate-500">
        {[age != null ? `${age} years` : null, patient.gender, patient.blood_group ? `Blood ${patient.blood_group}` : null, patient.phone]
          .filter(Boolean)
          .join(" · ") || "No demographics recorded"}
      </p>
      {patient.allergies ? (
        <Notice tone="warn" title="Allergies" className="mb-6">
          {patient.allergies}
        </Notice>
      ) : null}
      <Card>
        <CardHeader title="Consultation history" description="Diagnoses and prescriptions at this clinic" />
        <PatientHistoryList history={history} />
      </Card>
    </>
  );
}
