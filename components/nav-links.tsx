"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Box, ClipboardList, Home, ListOrdered, Pill, Search, Settings, Sparkles, User, Users } from "lucide-react";
import { cn } from "@/components/ui";

const ICONS = {
  home: Home,
  search: Search,
  rx: Pill,
  user: User,
  users: Users,
  queue: ListOrdered,
  spark: Sparkles,
  box: Box,
  settings: Settings,
  list: ClipboardList,
};

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
}

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  // Most specific match wins so "/patient" isn't active on "/patient/clinics".
  const active = items
    .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-2 lg:flex-col lg:overflow-visible lg:px-3 lg:pb-0">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const isActive = item.href === active;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50 hover:text-navy-900",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
