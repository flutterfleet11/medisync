import { AppShell } from "@/components/app-shell";
import { requireStaff } from "@/lib/auth";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await requireStaff("admin");
  return <AppShell session={session}>{children}</AppShell>;
}
