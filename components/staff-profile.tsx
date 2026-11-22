import { DoctorDetailsForm } from "@/components/doctor-details-form";
import { ProfileForm } from "@/components/patient/booking";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import type { Session } from "@/lib/auth";

export function StaffProfile({ session }: { session: Session }) {
  const doctor = session.doctor;
  return (
    <>
      <PageHeader title="My profile" description={session.email ?? undefined} />
      <div className="grid max-w-3xl gap-6">
        {doctor ? (
          <Card>
            <CardHeader
              title="Professional details"
              description={`Patients see you as ${doctor.display_name}${doctor.qualification ? `, ${doctor.qualification}` : ""} · ${doctor.specialty}`}
            />
            <div className="p-5">
              <DoctorDetailsForm qualification={doctor.qualification} specialty={doctor.specialty} />
            </div>
          </Card>
        ) : null}
        <Card>
          <CardHeader
            title="Your details"
            description={doctor ? 'Your name becomes your doctor name ("Dr." is added automatically).' : "Shown to colleagues at your clinic."}
          />
          <div className="p-5">
            <ProfileForm profile={session.profile} />
          </div>
        </Card>
      </div>
    </>
  );
}
