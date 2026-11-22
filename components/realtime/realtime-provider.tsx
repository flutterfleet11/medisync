"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { getBrowserClient } from "@/lib/supabase/client";
import { NEXCONN_MESSAGE_TYPE, parseTopic } from "@/lib/realtime/topics";

export type RealtimeMode = "connecting" | "nexconn" | "supabase" | "offline";

type Listener = (topic: string) => void;

interface RealtimeContextValue {
  mode: RealtimeMode;
  detail: string;
  subscribe: (topicList: string[], listener: Listener) => () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

// Maps an invalidation topic to the Postgres tables/filters that represent it
// (Supabase Realtime fallback). RLS limits which rows each user receives.
function pgBindings(topic: string): { table: string; filter: string }[] {
  const parsed = parseTopic(topic);
  if (!parsed) return [];
  const { kind, id } = parsed;
  switch (kind) {
    case "queue":
      return [
        { table: "queue_state", filter: `doctor_id=eq.${id}` },
        { table: "tokens", filter: `doctor_id=eq.${id}` },
      ];
    case "clinic-queue":
      return [
        { table: "queue_state", filter: `clinic_id=eq.${id}` },
        { table: "tokens", filter: `clinic_id=eq.${id}` },
      ];
    case "clinic-rx":
      return [{ table: "prescriptions", filter: `clinic_id=eq.${id}` }];
    case "rx":
      return [
        { table: "prescriptions", filter: `id=eq.${id}` },
        { table: "prescription_items", filter: `prescription_id=eq.${id}` },
      ];
    case "patient":
      return [
        { table: "tokens", filter: `patient_id=eq.${id}` },
        { table: "prescriptions", filter: `patient_id=eq.${id}` },
      ];
  }
}

const AREA_CODES: Record<string, number> = { sg: 2, na: 3 };

export function RealtimeProvider({ children, nexconnEnabled }: { children: React.ReactNode; nexconnEnabled: boolean }) {
  const [mode, setMode] = useState<RealtimeMode>("connecting");
  const [detail, setDetail] = useState("");
  const listeners = useRef(new Map<number, { topics: Set<string>; fn: Listener }>());
  const nextId = useRef(1);
  const [topicCounts, setTopicCounts] = useState<Record<string, number>>({});

  const emit = useCallback((topicList: string[]) => {
    for (const { topics, fn } of listeners.current.values()) {
      for (const t of topicList) if (topics.has(t)) fn(t);
    }
  }, []);

  // Transport selection: Nexconn when configured and connected, else Supabase.
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    const fallBackToSupabase = (reason: string) => {
      if (cancelled) return;
      setMode("supabase");
      setDetail(reason);
    };

    async function connectNexconn() {
      try {
        const res = await fetch("/api/realtime/nexconn-token", { cache: "no-store" });
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `HTTP ${res.status}`);
        const { token } = (await res.json()) as { token: string };
        const sdk = await import("@nexconn/chat");
        const { NCEngine, MessageHandler } = sdk;
        const areaCode = AREA_CODES[publicEnv.nexconnRegion];
        NCEngine.initialize({
          appKey: publicEnv.nexconnAppKey,
          ...(areaCode ? { areaCode: areaCode as never } : {}),
        });
        NCEngine.registerCustomMessages([
          { messageType: NEXCONN_MESSAGE_TYPE, isPersisted: false, isCounted: false },
        ]);
        NCEngine.addMessageHandler(
          "medisync-sync",
          new MessageHandler({
            onMessageReceived({ messages }) {
              for (const m of messages) {
                if (m.messageType !== NEXCONN_MESSAGE_TYPE) continue;
                const content = m.content as { topics?: unknown };
                if (Array.isArray(content?.topics)) emit(content.topics.filter((t): t is string => typeof t === "string"));
              }
            },
          }),
        );
        const result = await NCEngine.connect({ token });
        if (result.code !== 0) throw new Error(`connect code ${result.code}`);
        if (cancelled) return;
        setMode("nexconn");
        setDetail("Connected to Nexconn");
        cleanup = () => {
          NCEngine.removeMessageHandler("medisync-sync");
          void NCEngine.disconnect();
        };
      } catch (e) {
        console.warn("[realtime] Nexconn unavailable, using Supabase Realtime fallback:", e);
        fallBackToSupabase(`Nexconn unavailable (${e instanceof Error ? e.message : "error"})`);
      }
    }

    if (nexconnEnabled && publicEnv.nexconnAppKey) void connectNexconn();
    else fallBackToSupabase("Nexconn not configured on the server");

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [emit, nexconnEnabled]);

  const subscribe = useCallback((topicList: string[], fn: Listener) => {
    const id = nextId.current++;
    listeners.current.set(id, { topics: new Set(topicList), fn });
    const bump = (delta: number) =>
      setTopicCounts((prev) => {
        const next = { ...prev };
        for (const t of topicList) next[t] = (next[t] ?? 0) + delta;
        return next;
      });
    bump(1);
    return () => {
      listeners.current.delete(id);
      bump(-1);
    };
  }, []);

  const topicKey = useMemo(
    () =>
      Object.keys(topicCounts)
        .filter((t) => topicCounts[t] > 0)
        .sort()
        .join("|"),
    [topicCounts],
  );

  const value = useMemo(() => ({ mode, detail, subscribe }), [mode, detail, subscribe]);
  return (
    <RealtimeContext.Provider value={value}>
      {mode === "supabase" ? <SupabaseBridge topicKey={topicKey} emit={emit} /> : null}
      {children}
    </RealtimeContext.Provider>
  );
}

/**
 * Supabase Realtime fallback: one postgres_changes channel covering every
 * topic currently subscribed on the page. Rebuilt when the topic set changes.
 */
function SupabaseBridge({ topicKey, emit }: { topicKey: string; emit: (topics: string[]) => void }) {
  useEffect(() => {
    if (!topicKey) return;
    const supabase = getBrowserClient();
    let channel: RealtimeChannel | null = null;
    let disposed = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      if (disposed) return;
      const ch = supabase.channel(`ms-${Math.random().toString(36).slice(2)}`);
      for (const topic of topicKey.split("|")) {
        for (const b of pgBindings(topic)) {
          ch.on("postgres_changes", { event: "*", schema: "public", table: b.table, filter: b.filter }, () => emit([topic]));
        }
      }
      ch.subscribe();
      channel = ch;
    })();

    return () => {
      disposed = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [topicKey, emit]);

  return null;
}

export function useRealtime() {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error("useRealtime must be used inside RealtimeProvider");
  return ctx;
}
