"use client";

import { useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import type { ActionResult } from "@/lib/types";

/**
 * Runs a server action, shows a toast with the outcome and refreshes the page.
 * Every button that mutates data in MediSync goes through this (no dead buttons).
 */
export function ActionButton({
  action,
  children,
  variant,
  size = "sm",
  confirm,
  className,
  disabled,
  redirectTo,
}: {
  action: () => Promise<ActionResult<unknown>>;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "teal";
  size?: "sm" | "md" | "lg";
  confirm?: string;
  className?: string;
  disabled?: boolean;
  redirectTo?: string;
}) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      disabled={pending || disabled}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        start(async () => {
          try {
            const res = await action();
            if (res.ok) {
              if (res.message) toast(res.message, "success");
              if (redirectTo) router.push(redirectTo);
              else router.refresh();
            } else {
              toast(res.error, "error");
            }
          } catch {
            toast("Something went wrong. Please try again.", "error");
          }
        });
      }}
    >
      {pending ? <Spinner /> : null}
      {children}
    </Button>
  );
}
