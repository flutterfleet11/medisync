import type { Metadata } from "next";
import { ExportMenu } from "@/components/export-menu";
import { PatientDirectory } from "@/components/patient-directory";
import { PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { listClinicPatients } from "@/lib/data";

export const metadata: Metadata = { title: "Patients" };

export default async function AdminPatientsPage() {
  const session = await requireStaff("admin");
  const patients = await listClinicPatients(session.clinic.id);
  return (
    <>
      <PageHeader
        title="Patients"
        description={`${patients.length} patient${patients.length === 1 ? "" : "s"} have visited ${session.clinic.name}.`}
        action={<ExportMenu dataset="patients" />}
      />
      <PatientDirectory patients={patients} hrefBase="/admin/patients" emptyText="Patients who book a token at your clinic will appear here." />
    </>
  );
}
