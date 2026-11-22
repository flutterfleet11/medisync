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

/** Small transport indicator: honest about which realtime path is active. */
export function LiveBadge() {
  const { mode, detail } = useRealtime();
  const label =
    mode === "nexconn"
      ? "Live · Nexconn"
      : mode === "supabase"
        ? "Live · Supabase Realtime (fallback)"
        : mode === "connecting"
          ? "Connecting…"
          : "Offline";
  const dot = mode === "nexconn" || mode === "supabase" ? "bg-emerald-500" : mode === "connecting" ? "bg-amber-400" : "bg-slate-400";
  return (
    <span
      title={detail}
      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600"
    >
      <span className={`h-2 w-2 rounded-full ${dot} ${mode === "connecting" ? "animate-pulse" : ""}`} />
      {label}
    </span>
  );
}
