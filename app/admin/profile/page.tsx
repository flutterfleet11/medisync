import type { Metadata } from "next";
import { StaffProfile } from "@/components/staff-profile";
import { requireStaff } from "@/lib/auth";

export const metadata: Metadata = { title: "My profile" };

export default async function ProfilePage() {
  const session = await requireStaff("admin");
  return <StaffProfile session={session} />;
}
