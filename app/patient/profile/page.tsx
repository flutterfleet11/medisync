import type { Metadata } from "next";
import { PatientHistoryList } from "@/components/patient-history";
import { ProfileForm } from "@/components/patient/booking";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getPatientHistory } from "@/lib/data";

export const metadata: Metadata = { title: "Profile & history" };

export default async function PatientProfilePage() {
  const session = await requireRole("patient");
  const history = await getPatientHistory(session.userId, 20);

  return (
    <>
      <PageHeader title="Profile & history" description={session.email ?? undefined} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Your details" description="Shared with clinics you visit." />
          <div className="p-5">
            <ProfileForm profile={session.profile} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Medical history" description="Completed consultations across MediSync clinics." />
          <PatientHistoryList history={history} rxHrefBase="/patient/prescriptions" />
        </Card>
      </div>
    </>
  );
}
