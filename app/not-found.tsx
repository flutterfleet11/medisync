import { LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-medium text-blue-700">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-navy-900">We couldn&apos;t find that</h1>
      <p className="mt-2 text-sm text-slate-500">The page doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <LinkButton href="/" className="mt-6" variant="secondary">
        Go home
      </LinkButton>
    </main>
  );
}
