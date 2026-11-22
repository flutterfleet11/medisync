"use client";

import { useEffect } from "react";
import { Button, LinkButton } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-medium text-red-700">Something went wrong</p>
      <h1 className="mt-2 text-2xl font-semibold text-navy-900">We couldn&apos;t load this screen</h1>
      <p className="mt-2 text-sm text-slate-500">This is usually a brief network problem. Your data is safe.</p>
      <div className="mt-6 flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <LinkButton href="/" variant="secondary">
          Go home
        </LinkButton>
      </div>
    </main>
  );
}
