"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { cn } from "@/components/ui";

type ToastTone = "success" | "error" | "info";
interface ToastItem {
  id: number;
  tone: ToastTone;
  text: string;
}

const ToastContext = createContext<((text: string, tone?: ToastTone) => void) | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((text: string, tone: ToastTone = "success") => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev.slice(-3), { id, tone, text }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4500);
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto w-full max-w-sm rounded-lg border px-4 py-3 text-sm shadow-lg",
              t.tone === "success" && "border-emerald-200 bg-white text-emerald-800",
              t.tone === "error" && "border-red-200 bg-white text-red-700",
              t.tone === "info" && "border-blue-200 bg-white text-blue-800",
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
