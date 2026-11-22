"use client";

import { safeAction } from "@/lib/safe-action";
import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { copilotAction, explainItemAction } from "@/app/actions/integrations";
import { SourceBadge } from "@/components/status";
import { Button, Notice, Skeleton, Spinner, Textarea } from "@/components/ui";
import type { AiAnswer } from "@/lib/integrations/youcom";

export function AiAnswerView({ answer, audience }: { answer: AiAnswer; audience: "patient" | "doctor" }) {
  return (
    <div className="space-y-3 rounded-lg border border-indigo-100 bg-indigo-50/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <SourceBadge provider="You.com" source={answer.source} />
        <span className="text-xs font-medium text-indigo-800">AI-generated information · not medical advice</span>
      </div>
      <p className="whitespace-pre-line text-sm leading-relaxed text-navy-900">{answer.answer}</p>
      {answer.notice ? <p className="text-xs text-slate-500">{answer.notice}</p> : null}
      {answer.citations.length > 0 ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sources</p>
          <ol className="mt-1 space-y-1">
            {answer.citations.map((c) => (
              <li key={`${c.n}-${c.url}`} className="text-xs">
                <span className="mr-1 font-mono text-slate-500">[{c.n}]</span>
                <a href={c.url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
                  {c.title}
                </a>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {answer.citations.length === 0 && answer.related.length > 0 ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Related sources returned by You.com</p>
          <ul className="mt-1 space-y-1">
            {answer.related.map((r) => (
              <li key={r.url} className="text-xs">
                <a href={r.url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
                  {r.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-xs text-slate-500">
        {audience === "patient"
          ? "Always follow your doctor's instructions. This explanation never changes your prescription — ask your doctor or pharmacist if anything is unclear."
          : "Reference only. The AI does not diagnose, prescribe or modify prescriptions — clinical decisions remain yours."}
      </p>
    </div>
  );
}

export function MedicineExplainer({ itemId, medicineName }: { itemId: string; medicineName: string }) {
  const [answer, setAnswer] = useState<AiAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-2">
      {!answer ? (
        <Button
          variant="ghost"
          size="sm"
          className="px-2 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await safeAction(() => explainItemAction(itemId));
              if (res.ok && res.data) setAnswer(res.data);
              else if (!res.ok) setError(res.error);
            })
          }
        >
          {pending ? <Spinner /> : <Sparkles className="h-4 w-4" />}
          Explain {medicineName}
        </Button>
      ) : null}
      {pending ? <Skeleton className="h-24" /> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {answer ? <AiAnswerView answer={answer} audience="patient" /> : null}
    </div>
  );
}

export function CopilotPanel({ suggestions }: { suggestions: string[] }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AiAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const ask = (q: string) => {
    setQuestion(q);
    setError(null);
    start(async () => {
      const res = await safeAction(() => copilotAction(q));
      if (res.ok && res.data) setAnswer(res.data);
      else if (!res.ok) setError(res.error);
    });
  };

  return (
    <div className="space-y-3">
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (question.trim()) ask(question);
        }}
      >
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. Interactions between azithromycin and amlodipine?"
          maxLength={500}
          aria-label="Ask Doctor Copilot"
        />
        <Button type="submit" size="sm" disabled={pending || question.trim().length < 3}>
          {pending ? <Spinner /> : <Sparkles className="h-4 w-4" />}
          Ask Copilot
        </Button>
      </form>
      {suggestions.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              disabled={pending}
              onClick={() => ask(s)}
              className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-left text-xs text-slate-600 hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}
      {pending ? <Skeleton className="h-32" /> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {answer && !pending ? <AiAnswerView answer={answer} audience="doctor" /> : null}
    </div>
  );
}
