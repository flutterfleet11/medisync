import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { NavLinks, type NavItem } from "@/components/nav-links";
import { RealtimeProvider } from "@/components/realtime/realtime-provider";
import { LiveBadge } from "@/components/realtime/live-refresh";
import { ROLE_LABEL, type Session } from "@/lib/auth";
import { isNexconnConfigured } from "@/lib/env";
import type { AppRole } from "@/lib/types";

const NAV: Record<AppRole, NavItem[]> = {
  patient: [
    { href: "/patient", label: "Dashboard", icon: "home" },
    { href: "/patient/clinics", label: "Find a clinic", icon: "search" },
    { href: "/patient/prescriptions", label: "Prescriptions", icon: "rx" },
    { href: "/patient/profile", label: "Profile & history", icon: "user" },
  ],
  doctor: [
    { href: "/doctor", label: "Today's queue", icon: "queue" },
    { href: "/doctor/patients", label: "Patients", icon: "users" },
    { href: "/doctor/copilot", label: "Copilot", icon: "spark" },
    { href: "/doctor/profile", label: "My profile", icon: "user" },
  ],
  compounder: [
    { href: "/compounder", label: "Prescriptions", icon: "rx" },
    { href: "/compounder/queue", label: "Queue & walk-ins", icon: "queue" },
    { href: "/compounder/inventory", label: "Inventory", icon: "box" },
    { href: "/compounder/profile", label: "My profile", icon: "user" },
  ],
  admin: [
    { href: "/admin", label: "Overview", icon: "home" },
    { href: "/admin/staff", label: "Staff & users", icon: "users" },
    { href: "/admin/inventory", label: "Inventory", icon: "box" },
    { href: "/admin/settings", label: "Clinic settings", icon: "settings" },
    { href: "/admin/profile", label: "My profile", icon: "user" },
  ],
};

export function AppShell({ session, children }: { session: Session; children: React.ReactNode }) {
  const role = session.profile.role;
  const initials = session.profile.full_name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <RealtimeProvider nexconnEnabled={isNexconnConfigured()}>
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside className="border-b border-slate-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:border-r lg:border-b-0">
          <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-5 lg:py-5">
            <Link href="/" className="flex items-center gap-2">
              <Logo />
              <span className="text-lg font-semibold tracking-tight text-navy-900">MediSync</span>
            </Link>
            <span className="rounded-md bg-navy-900 px-2 py-0.5 text-xs font-medium text-white lg:hidden">{ROLE_LABEL[role]}</span>
          </div>
          <NavLinks items={NAV[role]} />
          <div className="mt-auto hidden border-t border-slate-100 p-4 lg:block">
            {session.clinic ? (
              <p className="mb-3 truncate text-xs text-slate-500">
                Clinic: <span className="font-medium text-slate-700">{session.clinic.name}</span>
              </p>
            ) : null}
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700">
                {initials || "?"}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-navy-900">{session.profile.full_name}</p>
                <p className="text-xs text-slate-500">{ROLE_LABEL[role]}</p>
              </div>
            </div>
            <form action={signOut} className="mt-3">
              <button className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">Sign out</button>
            </form>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white/80 px-4 py-2.5 backdrop-blur sm:px-6 lg:px-8">
            <p className="hidden truncate text-sm text-slate-500 sm:block">
              Signed in as <span className="font-medium text-slate-700">{session.profile.full_name}</span>
              {session.clinic ? <> · {session.clinic.name}</> : null}
            </p>
            <div className="flex items-center gap-2">
              <LiveBadge />
              <form action={signOut} className="lg:hidden">
                <button className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">Sign out</button>
              </form>
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>
    </RealtimeProvider>
  );
}

export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#0b1f3a" />
      <path d="M13 8h6v5h5v6h-5v5h-6v-5H8v-6h5z" fill="#14b8a6" />
      <path d="M13 8h6v5h-6z" fill="#3b82f6" />
    </svg>
  );
}
