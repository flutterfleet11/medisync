import Link from "next/link";
import { Logo } from "@/components/app-shell";

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-center px-4 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-md">
          <Link href="/" className="mb-8 inline-flex items-center gap-2">
            <Logo />
            <span className="text-lg font-semibold text-navy-900">MediSync</span>
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-navy-900">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
      </div>
      <div className="hidden bg-navy-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <p className="text-sm font-medium text-teal-300">One connected clinic workflow</p>
        <div>
          <p className="text-3xl font-semibold leading-tight">
            Know your place in the queue. Get your prescription digitally. Find medicines nearby.
          </p>
          <ol className="mt-8 space-y-3 text-sm text-slate-300">
            {["Patient books a token and tracks the live queue", "Doctor consults and sends the prescription", "Compounder dispenses and flags unavailable medicines", "Patient gets the PDF, explanations and nearby pharmacies"].map((s, i) => (
              <li key={s} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
        </div>
        <p className="text-xs text-slate-400">Demo build · synthetic data only · not for clinical use</p>
      </div>
    </div>
  );
}
