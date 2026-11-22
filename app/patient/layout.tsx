import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("patient");
  return <AppShell session={session}>{children}</AppShell>;
}
