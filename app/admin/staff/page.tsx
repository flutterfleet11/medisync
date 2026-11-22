import type { Metadata } from "next";
import { AssignStaffForm, DoctorRow } from "@/components/admin-forms";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { ROLE_LABEL, requireStaff } from "@/lib/auth";
import { listDoctors } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Staff & users" };

export default async function StaffPage() {
  const session = await requireStaff("admin");
  const supabase = await createClient();
  const [{ data: staff }, doctors, { count: patientCount }] = await Promise.all([
    supabase.from("profiles").select("*").eq("clinic_id", session.clinic.id).order("role").order("full_name"),
    listDoctors(session.clinic.id, false),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "patient"),
  ]);

  return (
    <>
      <PageHeader title="Staff & users" description={`${patientCount ?? 0} patients have visited this clinic`} />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Clinic staff" />
            {(staff ?? []).length === 0 ? (
              <EmptyState title="No staff yet" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {((staff ?? []) as Profile[]).map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                    <div>
                      <p className="font-medium text-navy-900">
                        {p.full_name}
                        {p.id === session.userId ? <span className="ml-2 text-xs text-slate-500">(you)</span> : null}
                      </p>
                      <p className="text-xs text-slate-500">{p.email}</p>
                    </div>
                    <Badge tone={p.role === "admin" ? "violet" : p.role === "doctor" ? "blue" : "teal"}>{ROLE_LABEL[p.role]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Doctors" description="Inactive doctors stop accepting new tokens." />
            {doctors.length === 0 ? (
              <EmptyState title="No doctors yet" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {doctors.map((d) => (
                  <DoctorRow key={d.id} doctor={d} />
                ))}
              </ul>
            )}
          </Card>
        </div>
        <Card className="h-fit">
          <CardHeader title="Assign a role" description="Promote a registered user to clinic staff." />
          <div className="p-5">
            <AssignStaffForm />
          </div>
        </Card>
      </div>
    </>
  );
}
