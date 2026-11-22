import { redirect } from "next/navigation";
import { connection } from "next/server";
import { signOut } from "@/app/actions/auth";
import { CreateClinicForm } from "@/components/create-clinic-form";
import { ProfileForm } from "@/components/patient/booking";
import { Button, Card, CardHeader } from "@/components/ui";
import { getSession, ROLE_HOME, ROLE_LABEL } from "@/lib/auth";

export default async function UnassignedPage() {
  await connection();
  const session = await getSession();
  if (!session) redirect("/login");
  const role = session.profile.role;
  if (role === "patient") redirect(ROLE_HOME.patient);
  const ready = session.clinic && (role !== "doctor" || session.doctor);
  if (ready) redirect(ROLE_HOME[role]);

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-navy-900">
            {role === "admin" ? "Set up your clinic" : "Your staff account isn't linked to a clinic yet"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Signed in as {session.email} · {ROLE_LABEL[role]}
          </p>
        </div>
        <form action={signOut}>
          <Button variant="secondary" size="sm">
            Sign out
          </Button>
        </form>
      </div>

      {role === "admin" ? (
        <Card>
          <CardHeader
            title="Create your clinic"
            description="You'll manage this clinic. Next, add doctors and compounders from Staff & users using their login email."
          />
          <div className="p-5">
            <CreateClinicForm />
          </div>
        </Card>
      ) : (
        <Card className="p-6 text-sm text-slate-600">
          Ask your clinic admin to add <span className="font-medium text-navy-900">{session.email}</span> from{" "}
          <span className="font-medium">Admin → Staff &amp; users</span>. Meanwhile you can fill in your profile below, then sign in
          again once you&apos;ve been added.
        </Card>
      )}

      <Card>
        <CardHeader title="Your profile" description="Your name is shown to patients and colleagues." />
        <div className="p-5">
          <ProfileForm profile={session.profile} />
        </div>
      </Card>
    </main>
  );
}
