import { ProfileForm } from "@/components/patient/booking";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import type { Session } from "@/lib/auth";

export function StaffProfile({ session }: { session: Session }) {
  return (
    <>
      <PageHeader title="My profile" description={session.email ?? undefined} />
      <Card className="max-w-3xl">
        <CardHeader
          title="Your details"
          description={
            session.profile.role === "doctor"
              ? "Your name appears to patients as your doctor name (\"Dr.\" is added automatically)."
              : "Shown to colleagues at your clinic."
          }
        />
        <div className="p-5">
          <ProfileForm profile={session.profile} />
        </div>
      </Card>
    </>
  );
}
