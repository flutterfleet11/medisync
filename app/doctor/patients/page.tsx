import type { Metadata } from "next";
import { ExportMenu } from "@/components/export-menu";
import { PatientDirectory } from "@/components/patient-directory";
import { PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { listClinicPatients } from "@/lib/data";

export const metadata: Metadata = { title: "Patients" };

export default async function DoctorPatientsPage() {
  const session = await requireStaff("doctor");
  const patients = await listClinicPatients(session.clinic.id, session.doctor!.id);
  return (
    <>
      <PageHeader
        title="Patients"
        description={`${patients.length} patient${patients.length === 1 ? "" : "s"} have booked with you. Open one to see their history.`}
        action={<ExportMenu dataset="patients" />}
      />
      <PatientDirectory patients={patients} hrefBase="/doctor/patients" emptyText="Patients who book with you will appear here." />
    </>
  );
}
