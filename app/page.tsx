import Link from "next/link";
import { connection } from "next/server";
import { ArrowRight, Bell, FileText, MapPin, Pill, Sparkles, Stethoscope } from "lucide-react";
import { Logo } from "@/components/app-shell";
import { Badge, Card, LinkButton } from "@/components/ui";
import { getSession, ROLE_HOME } from "@/lib/auth";
import { listClinics } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";
import { integrationStatus } from "@/lib/integrations/status";

const FLOW = [
  { icon: MapPin, title: "Patient", text: "Finds a clinic and books a token from the phone." },
  { icon: Bell, title: "Clinic", text: "Live queue: everyone sees now-serving and their wait." },
  { icon: Stethoscope, title: "Doctor", text: "Consults with history + cited Copilot, writes the Rx." },
  { icon: Pill, title: "Compounder", text: "Gets the Rx instantly, checks stock, dispenses." },
  { icon: MapPin, title: "Pharmacy", text: "Unavailable medicines → nearby pharmacies with directions." },
  { icon: FileText, title: "Patient", text: "PDF prescription and plain-language explanations." },
];

export default async function Landing() {
  await connection();
  const configured = isSupabaseConfigured();
  const [session, clinics] = configured ? await Promise.all([getSession(), listClinics()]) : [null, []];
  const status = integrationStatus();

  return (
    <div className="min-h-screen bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <Logo />
          <span className="text-lg font-semibold tracking-tight text-navy-900">MediSync</span>
        </Link>
        <nav className="flex items-center gap-2">
          {session ? (
            <LinkButton href={ROLE_HOME[session.profile.role]}>Open dashboard</LinkButton>
          ) : (
            <>
              <LinkButton href="/login" variant="ghost">
                Sign in
              </LinkButton>
              <LinkButton href="/register">Get started</LinkButton>
            </>
          )}
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-4 pt-10 pb-16 sm:px-6 lg:pt-16">
        <div className="max-w-3xl">
          <Badge tone="teal">Patient → Clinic → Doctor → Compounder → Pharmacy → Patient</Badge>
          <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight text-navy-900 sm:text-5xl">
            The clinic visit, connected end to end.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-slate-600">
            Patients stop guessing their place in the queue. Prescriptions travel from doctor to compounder in realtime. Unavailable medicines come
            with nearby pharmacies — and every patient leaves with a prescription they understand.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton href={session ? ROLE_HOME[session.profile.role] : "/login"} size="lg">
              {session ? "Go to your dashboard" : "Try the demo"} <ArrowRight className="h-4 w-4" />
            </LinkButton>
            {!session ? (
              <LinkButton href="/register" variant="secondary" size="lg">
                Register as a patient
              </LinkButton>
            ) : null}
          </div>
        </div>
      </section>

      <section className="border-y border-slate-100 bg-canvas">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">The problem</h2>
            <ul className="mt-4 space-y-3 text-slate-700">
              {[
                "Patients wait without knowing their queue position.",
                "Tokens and appointments are managed on paper.",
                "Prescriptions are carried by hand to the compounder.",
                "Nobody knows which medicines are actually in stock.",
                "Patients hunt for unavailable medicines on their own.",
                "Prescriptions are hard to read and harder to understand.",
              ].map((p) => (
                <li key={p} className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">One connected workflow</h2>
            <ol className="mt-4 grid gap-3 sm:grid-cols-2">
              {FLOW.map((s, i) => (
                <li key={i} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy-900 text-xs font-semibold text-white">{i + 1}</span>
                    <s.icon className="h-4 w-4 text-teal-600" />
                    <p className="font-medium text-navy-900">{s.title}</p>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="p-6">
            <Bell className="h-5 w-5 text-blue-600" />
            <p className="mt-3 font-semibold text-navy-900">Realtime by Nexconn</p>
            <p className="mt-1 text-sm text-slate-600">Queue moves and prescription handoffs are pushed to exactly the people involved.</p>
            <div className="mt-3">{status.nexconn ? <Badge tone="teal">Configured</Badge> : <Badge tone="amber">Supabase Realtime fallback active</Badge>}</div>
          </Card>
          <Card className="p-6">
            <MapPin className="h-5 w-5 text-teal-600" />
            <p className="mt-3 font-semibold text-navy-900">Discovery by SerpApi</p>
            <p className="mt-1 text-sm text-slate-600">Nearby clinics and pharmacies from Google Maps, with directions — never auto-substitution.</p>
            <div className="mt-3">{status.serpapi ? <Badge tone="teal">Live</Badge> : <Badge tone="amber">Mock data until key is set</Badge>}</div>
          </Card>
          <Card className="p-6">
            <Sparkles className="h-5 w-5 text-indigo-600" />
            <p className="mt-3 font-semibold text-navy-900">Answers by You.com</p>
            <p className="mt-1 text-sm text-slate-600">Doctor Copilot and patient explanations with real citations. Never diagnoses or prescribes.</p>
            <div className="mt-3">{status.youcom ? <Badge tone="teal">Live</Badge> : <Badge tone="amber">Offline sample until key is set</Badge>}</div>
          </Card>
        </div>
      </section>

      {clinics.length > 0 ? (
        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Clinics on MediSync</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {clinics.slice(0, 4).map((c) => (
              <Link key={c.id} href={session?.profile.role === "patient" ? `/patient/clinics/${c.id}` : "/login"} className="group">
                <Card className="h-full p-5 transition-all group-hover:-translate-y-0.5 group-hover:border-blue-300 group-hover:shadow-sm">
                  <p className="font-semibold text-navy-900 group-hover:text-blue-700">{c.name}</p>
                  <p className="mt-1 text-sm text-slate-500">{[c.address, c.city].filter(Boolean).join(", ")}</p>
                  {c.opening_hours ? <p className="mt-1 text-sm text-slate-500">{c.opening_hours}</p> : null}
                  <span className="mt-3 inline-block text-sm font-medium text-blue-700">Book a token →</span>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <footer className="border-t border-slate-100 py-8 text-center text-xs text-slate-500">
        MediSync hackathon build · synthetic demo data only · AI information is not medical advice
        {!configured ? (
          <>
            {" "}·{" "}
            <Link href="/setup" className="text-blue-700 hover:underline">
              Setup required
            </Link>
          </>
        ) : null}
      </footer>
    </div>
  );
}
