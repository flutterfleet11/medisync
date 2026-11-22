import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

// ── Buttons ───────────────────────────────────────────────────────────
type Variant = "primary" | "secondary" | "ghost" | "danger" | "teal";
type Size = "sm" | "md" | "lg";

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap";
  const v: Record<Variant, string> = {
    primary: "bg-blue-600 text-white hover:bg-blue-700",
    teal: "bg-teal-600 text-white hover:bg-teal-700",
    secondary: "border border-slate-300 bg-white text-navy-900 hover:bg-slate-50",
    ghost: "text-slate-600 hover:bg-slate-100 hover:text-navy-900",
    danger: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
  };
  const s: Record<Size, string> = {
    sm: "h-8 px-3 text-sm",
    md: "h-10 px-4 text-sm",
    lg: "h-12 px-5 text-base",
  };
  return cn(base, v[variant], s[size], extra);
}

export function Button({
  variant,
  size,
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

// ── Surfaces ──────────────────────────────────────────────────────────
export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-xl border border-slate-200 bg-white", className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-navy-900">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-slate-500">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-navy-900">{title}</h1>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "blue",
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "blue" | "teal" | "amber" | "slate" | "red";
  href?: string;
}) {
  const bar: Record<string, string> = {
    blue: "bg-blue-600",
    teal: "bg-teal-600",
    amber: "bg-amber-500",
    slate: "bg-slate-400",
    red: "bg-red-500",
  };
  const card = (
    <Card className={cn("relative h-full overflow-hidden px-5 py-4", href && "transition-all group-hover:-translate-y-0.5 group-hover:border-blue-300 group-hover:shadow-sm")}>
      <span className={cn("absolute inset-y-0 left-0 w-1", bar[tone])} />
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-navy-900">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
      {href ? <span className="absolute top-4 right-4 text-xs text-slate-300 group-hover:text-blue-500">→</span> : null}
    </Card>
  );
  return href ? (
    <Link href={href} className="group block">
      {card}
    </Link>
  ) : (
    card
  );
}

/** Small medicine-name chips for prescription cards. */
export function MedicineChips({ names, max = 4 }: { names: string[]; max?: number }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {names.slice(0, max).map((n, i) => (
        <span key={`${n}-${i}`} className="rounded-md bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-800 ring-1 ring-teal-100 ring-inset">
          {n}
        </span>
      ))}
      {names.length > max ? <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">+{names.length - max} more</span> : null}
    </div>
  );
}

// ── Badges ────────────────────────────────────────────────────────────
export type Tone = "slate" | "blue" | "teal" | "green" | "amber" | "red" | "violet";

export function Badge({ tone = "slate", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  const t: Record<Tone, string> = {
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
    blue: "bg-blue-50 text-blue-700 ring-blue-200",
    teal: "bg-teal-50 text-teal-700 ring-teal-200",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    amber: "bg-amber-50 text-amber-800 ring-amber-200",
    red: "bg-red-50 text-red-700 ring-red-200",
    violet: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", t[tone], className)}>
      {children}
    </span>
  );
}

// ── Forms ─────────────────────────────────────────────────────────────
const fieldBase =
  "w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-navy-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldBase, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(fieldBase, "min-h-20 py-2", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(fieldBase, "h-10", className)} {...props} />;
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

// ── Feedback ──────────────────────────────────────────────────────────
export function Notice({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "warn" | "error" | "success";
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const t = {
    info: "border-blue-200 bg-blue-50 text-blue-900",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    error: "border-red-200 bg-red-50 text-red-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("rounded-lg border px-4 py-3 text-sm", t, className)}>
      {title ? <p className="font-medium">{title}</p> : null}
      {children ? <div className={title ? "mt-0.5" : ""}>{children}</div> : null}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-3 h-10 w-10 rounded-full bg-slate-100 ring-8 ring-slate-50" />
      <p className="text-sm font-medium text-navy-900">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-slate-200/70", className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent", className)}
    />
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
