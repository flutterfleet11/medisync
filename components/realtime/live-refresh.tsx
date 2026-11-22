"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useRealtime } from "@/components/realtime/realtime-provider";

/** Re-renders the current server page whenever one of the topics fires. */
export function LiveRefresh({ topics }: { topics: string[] }) {
  const { subscribe } = useRealtime();
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = topics.join("|");

  useEffect(() => {
    const unsubscribe = subscribe(key.split("|").filter(Boolean), () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 250);
    });
    return () => {
      unsubscribe();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [key, subscribe, router]);

  return null;
}

/** Transport indicator: only claims "Live" when a channel is actually up. */
export function LiveBadge() {
  const { mode, detail, pgStatus, nexconnSignals } = useRealtime();
  let label = "Connecting…";
  let dot = "bg-amber-400 animate-pulse";
  let title = detail;
  if (mode === "nexconn") {
    label = "Live · Nexconn";
    dot = "bg-emerald-500";
    title = `${detail} · ${nexconnSignals} Nexconn signal(s) received · Supabase Realtime backup: ${pgStatus}`;
  } else if (mode === "supabase" && pgStatus === "live") {
    label = "Live · Supabase Realtime (fallback)";
    dot = "bg-emerald-500";
  } else if (mode === "supabase" && pgStatus === "down") {
    label = "Reconnecting… (auto-refresh every 30 s)";
    dot = "bg-amber-400";
  } else if (mode === "supabase" && pgStatus === "idle") {
    label = "Realtime ready · Supabase (fallback)";
    dot = "bg-slate-400";
  }
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600"
    >
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
