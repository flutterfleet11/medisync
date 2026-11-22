import { serverEnv } from "@/lib/env";
import { TtlCache } from "@/lib/integrations/rate-limit";

// You.com Answer API — server side only.
// Docs: https://you.com/docs/api-reference/answer/v1-answer
//   POST https://api.you.com/v1/answer  (X-API-Key)
//   → { answer: "...[[1, 2]]", citations: [{source, excerpts[]}], results: { web: [{url, title, ...}] } }
// Citations shown in the UI come only from this response — never generated locally.

export interface Citation {
  n: number;
  url: string;
  title: string;
  excerpt: string | null;
}

export interface AiAnswer {
  source: "live" | "mock";
  notice: string | null;
  answer: string;
  citations: Citation[];
  /** Web results You.com returned alongside the answer (shown only when there are no citations). */
  related: { url: string; title: string }[];
}

interface YouAnswerResponse {
  answer?: string;
  citations?: { source?: string; excerpts?: string[] }[];
  results?: { web?: { url?: string; title?: string }[] };
}

const TRUSTED_DOMAINS = [
  "medlineplus.gov",
  "nih.gov",
  "nhs.uk",
  "mayoclinic.org",
  "who.int",
  "fda.gov",
  "drugs.com",
  "cdc.gov",
];

const cache = new TtlCache<AiAnswer>(30 * 60 * 1000);

async function callAnswer(query: string): Promise<AiAnswer> {
  const apiKey = serverEnv().youApiKey;
  if (!apiKey) throw new MockReason("You.com API key not configured");

  let res: Response;
  try {
    res = await fetch("https://api.you.com/v1/answer", {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ query, boost_domains: TRUSTED_DOMAINS, safesearch: "strict" }),
      signal: AbortSignal.timeout(25000),
      cache: "no-store",
    });
  } catch (e) {
    throw new MockReason(e instanceof Error && e.name === "TimeoutError" ? "You.com timed out" : "You.com unreachable");
  }
  if (res.status === 429) throw new MockReason("You.com rate limit reached");
  if (!res.ok) throw new MockReason(`You.com error (HTTP ${res.status})`);

  const json = (await res.json()) as YouAnswerResponse;
  const web = json.results?.web ?? [];
  const citeList = json.citations ?? [];
  const titleFor = (url: string) => {
    const t = web.find((w) => w.url === url)?.title;
    if (t) return t;
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  };

  // [[1, 2]] markers index the citations array (1-based); fall back to web results.
  const citations: Citation[] = [];
  const seen = new Set<number>();
  const answer = (json.answer ?? "").replace(/\[\[([\d,\s]+)\]\]/g, (_m, nums: string) => {
    const ns = nums
      .split(",")
      .map((x) => parseInt(x.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    for (const n of ns) {
      if (seen.has(n)) continue;
      const url = citeList[n - 1]?.source ?? web[n - 1]?.url;
      if (!url) continue;
      seen.add(n);
      citations.push({ n, url, title: titleFor(url), excerpt: citeList[n - 1]?.excerpts?.[0] ?? null });
    }
    return ns.filter((n) => seen.has(n)).map((n) => `[${n}]`).join("");
  });

  // Citations that were returned but not referenced inline are still real sources.
  citeList.forEach((c, i) => {
    if (c.source && !seen.has(i + 1)) {
      seen.add(i + 1);
      citations.push({ n: i + 1, url: c.source, title: titleFor(c.source), excerpt: c.excerpts?.[0] ?? null });
    }
  });
  citations.sort((a, b) => a.n - b.n);

  const related =
    citations.length === 0
      ? web
          .filter((w): w is { url: string; title?: string } => typeof w.url === "string")
          .slice(0, 3)
          .map((w) => ({ url: w.url, title: w.title ?? titleFor(w.url) }))
      : [];

  return {
    source: "live",
    notice: citations.length === 0 ? "No inline citations were returned for this answer." : null,
    answer: answer.trim() || "No answer was returned.",
    citations,
    related,
  };
}

class MockReason extends Error {}

/** Doctor Copilot: general clinical/drug reference with citations. */
export async function askCopilot(question: string): Promise<AiAnswer> {
  const q = question.trim().slice(0, 500);
  const key = `copilot|${q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const result = await callAnswer(
      `Clinical reference for a licensed physician (general information, cite sources): ${q}`,
    );
    cache.set(key, result);
    return result;
  } catch (e) {
    if (!(e instanceof MockReason)) throw e;
    const sample = findSample(q);
    return {
      source: "mock",
      notice: `${e.message} — offline sample shown, no live citations.`,
      answer: sample
        ? `${sample.name}: ${sample.use} ${sample.precautions}`
        : "Live clinical reference is unavailable in offline mode. Configure YOU_API_KEY to get cited answers from You.com.",
      citations: [],
      related: [],
    };
  }
}

/** Patient explanation of one prescribed medicine (no patient data is sent). */
export async function explainMedicine(medicineName: string): Promise<AiAnswer> {
  const name = medicineName.trim().slice(0, 120);
  const key = `explain|${name.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const result = await callAnswer(
      `In simple, patient-friendly language: what is ${name} generally used for, how is it usually taken, and what are the common precautions and side effects? General information only.`,
    );
    cache.set(key, result);
    return result;
  } catch (e) {
    if (!(e instanceof MockReason)) throw e;
    const sample = findSample(name);
    return {
      source: "mock",
      notice: `${e.message} — offline sample shown, no live citations.`,
      answer: sample
        ? `${sample.use} ${sample.precautions}`
        : `No offline sample is available for ${name}. Please ask your doctor or pharmacist.`,
      citations: [],
      related: [],
    };
  }
}

// ── Offline samples (general, widely known facts; clearly labeled mock) ──
const SAMPLES: { match: RegExp; name: string; use: string; precautions: string }[] = [
  { match: /paracetamol|acetaminophen/i, name: "Paracetamol", use: "Commonly used to relieve pain and reduce fever.", precautions: "Do not exceed the daily maximum dose; avoid combining with other paracetamol-containing products; take care with liver disease or regular alcohol use." },
  { match: /amoxicillin/i, name: "Amoxicillin", use: "A penicillin-type antibiotic used for certain bacterial infections.", precautions: "Finish the full course as prescribed; tell your doctor about any penicillin allergy; may cause stomach upset or rash." },
  { match: /azithromycin/i, name: "Azithromycin", use: "A macrolide antibiotic used for certain bacterial infections.", precautions: "Take exactly as prescribed and complete the course; may cause stomach upset; tell your doctor about heart rhythm problems." },
  { match: /cetirizine/i, name: "Cetirizine", use: "An antihistamine used for allergy symptoms such as sneezing, runny nose and itching.", precautions: "May cause drowsiness in some people; avoid alcohol; be careful when driving." },
  { match: /pantoprazole|omeprazole/i, name: "Proton pump inhibitor", use: "Reduces stomach acid; used for acidity, heartburn and ulcers.", precautions: "Usually taken before a meal; long-term use should be reviewed by your doctor." },
  { match: /metformin/i, name: "Metformin", use: "Used to help control blood sugar in type 2 diabetes.", precautions: "Usually taken with meals to reduce stomach upset; your doctor may monitor kidney function." },
  { match: /ibuprofen/i, name: "Ibuprofen", use: "An anti-inflammatory pain reliever (NSAID) used for pain, swelling and fever.", precautions: "Take with food; avoid if you have stomach ulcers or certain kidney problems unless your doctor advises otherwise." },
  { match: /\bors\b|oral rehydration/i, name: "Oral rehydration salts", use: "Replaces fluids and salts lost through diarrhoea or vomiting.", precautions: "Mix with the exact amount of clean water stated on the pack." },
  { match: /vitamin d|cholecalciferol/i, name: "Vitamin D3", use: "A supplement used to treat or prevent vitamin D deficiency.", precautions: "High-dose forms are often taken weekly — follow the exact schedule your doctor gave." },
  { match: /salbutamol|albuterol/i, name: "Salbutamol", use: "A reliever inhaler that opens the airways during wheezing or asthma symptoms.", precautions: "Use as directed; seek help if you need it more often than usual; may cause a fast heartbeat or tremor." },
  { match: /amlodipine/i, name: "Amlodipine", use: "Used to treat high blood pressure and some types of chest pain.", precautions: "Can cause ankle swelling or dizziness; do not stop suddenly without advice." },
];

function findSample(text: string) {
  return SAMPLES.find((s) => s.match.test(text));
}
