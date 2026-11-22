import type { Metadata } from "next";
import { ClinicSettingsForm } from "@/components/admin-forms";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";

export const metadata: Metadata = { title: "Clinic settings" };

export default async function SettingsPage() {
  const session = await requireStaff("admin");
  return (
    <>
      <PageHeader title="Clinic settings" description="Shown to patients on the clinic page and used for wait estimates." />
      <Card className="max-w-3xl">
        <CardHeader title="Clinic profile" />
        <div className="p-5">
          <ClinicSettingsForm clinic={session.clinic} />
        </div>
      </Card>
    </>
  );
}
