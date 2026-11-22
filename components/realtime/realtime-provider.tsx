"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { getBrowserClient } from "@/lib/supabase/client";
import { NEXCONN_MESSAGE_TYPE, parseTopic } from "@/lib/realtime/topics";

export type RealtimeMode = "connecting" | "nexconn" | "supabase";
export type ChannelHealth = "idle" | "connecting" | "live" | "down";

type Listener = (topic: string) => void;

interface RealtimeContextValue {
  mode: RealtimeMode;
  detail: string;
  pgStatus: ChannelHealth;
  nexconnSignals: number;
  subscribe: (topicList: string[], listener: Listener) => () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

// Maps an invalidation topic to the Postgres tables/filters that represent it
// (Supabase Realtime). RLS limits which rows each user receives.
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

/** Nexconn custom message content may arrive as an object or a JSON string. */
function extractTopics(raw: unknown): string[] {
  let c: unknown = raw;
  for (let i = 0; i < 3; i++) {
    if (typeof c === "string") {
      try {
        c = JSON.parse(c);
      } catch {
        return [];
      }
      continue;
    }
    const obj = c as { topics?: unknown; content?: unknown } | null;
    if (obj && !Array.isArray(obj.topics) && typeof obj.content === "string") {
      c = obj.content;
      continue;
    }
    break;
  }
  const t = (c as { topics?: unknown } | null)?.topics;
  return Array.isArray(t) ? t.filter((x): x is string => typeof x === "string") : [];
}

export function RealtimeProvider({ children, nexconnEnabled }: { children: React.ReactNode; nexconnEnabled: boolean }) {
  const [mode, setMode] = useState<RealtimeMode>("connecting");
  const [detail, setDetail] = useState("");
  const [pgStatus, setPgStatus] = useState<ChannelHealth>("idle");
  const [nexconnSignals, setNexconnSignals] = useState(0);
  const listeners = useRef(new Map<number, { topics: Set<string>; fn: Listener }>());
  const nextId = useRef(1);
  const [topicCounts, setTopicCounts] = useState<Record<string, number>>({});

  const emit = useCallback((topicList: string[]) => {
    for (const { topics, fn } of listeners.current.values()) {
      for (const t of topicList) if (topics.has(t)) fn(t);
    }
  }, []);
  const emitAll = useCallback(() => {
    for (const { topics, fn } of listeners.current.values()) {
      const first = topics.values().next().value;
      if (first) fn(first);
    }
  }, []);

  // Transport selection: Nexconn when configured and connected, else Supabase.
  // Supabase Realtime always runs underneath as a backup, so a silent Nexconn
  // delivery failure can never freeze the screens.
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
        NCEngine.registerCustomMessages([{ messageType: NEXCONN_MESSAGE_TYPE, isPersisted: false, isCounted: false }]);
        NCEngine.addMessageHandler(
          "medisync-sync",
          new MessageHandler({
            onMessageReceived({ messages }) {
              for (const m of messages) {
                if (m.messageType !== NEXCONN_MESSAGE_TYPE) continue;
                const topicList = extractTopics(m.content);
                if (topicList.length) {
                  setNexconnSignals((n) => n + 1);
                  emit(topicList);
                }
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

  // Catch up whenever the tab becomes visible again (sleep, background tabs).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") emitAll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [emitAll]);

  // Safety net: if no realtime transport is healthy, refresh every 30 s.
  const healthy = mode === "nexconn" || pgStatus === "live";
  useEffect(() => {
    if (healthy || mode === "connecting") return;
    const h = setInterval(emitAll, 30000);
    return () => clearInterval(h);
  }, [healthy, mode, emitAll]);

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

  const value = useMemo(
    () => ({ mode, detail, pgStatus, nexconnSignals, subscribe }),
    [mode, detail, pgStatus, nexconnSignals, subscribe],
  );
  return (
    <RealtimeContext.Provider value={value}>
      {mode !== "connecting" ? <SupabaseBridge topicKey={topicKey} emit={emit} emitAll={emitAll} onStatus={setPgStatus} /> : null}
      {children}
    </RealtimeContext.Provider>
  );
}

/**
 * Supabase Realtime: one postgres_changes channel covering every topic on the
 * page. Reports real channel health and triggers a catch-up refresh after any
 * re-subscribe so events missed during a reconnect are not lost.
 */
function SupabaseBridge({
  topicKey,
  emit,
  emitAll,
  onStatus,
}: {
  topicKey: string;
  emit: (topics: string[]) => void;
  emitAll: () => void;
  onStatus: (s: ChannelHealth) => void;
}) {
  const subscribedOnce = useRef(false);

  useEffect(() => {
    if (!topicKey) return;
    const supabase = getBrowserClient();
    let channel: RealtimeChannel | null = null;
    let disposed = false;

    (async () => {
      onStatus("connecting");
      const { data } = await supabase.auth.getSession();
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      if (disposed) return;
      const ch = supabase.channel(`ms-${Math.random().toString(36).slice(2)}`);
      for (const topic of topicKey.split("|")) {
        for (const b of pgBindings(topic)) {
          ch.on("postgres_changes", { event: "*", schema: "public", table: b.table, filter: b.filter }, () => emit([topic]));
        }
      }
      ch.subscribe((status: string) => {
        if (disposed) return;
        if (status === "SUBSCRIBED") {
          onStatus("live");
          if (subscribedOnce.current) emitAll(); // catch up after a reconnect / topic change
          subscribedOnce.current = true;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          onStatus("down");
        }
      });
      channel = ch;
    })();

    return () => {
      disposed = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [topicKey, emit, emitAll, onStatus]);

  return null;
}

export function useRealtime() {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error("useRealtime must be used inside RealtimeProvider");
  return ctx;
}
