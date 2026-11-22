import { signOut } from "@/app/actions/auth";
import { Button, Card } from "@/components/ui";

export default function UnassignedPage() {
  return (
    <main className="mx-auto max-w-lg px-4 py-20">
      <Card className="p-6">
        <h1 className="text-lg font-semibold text-navy-900">Your staff account isn&apos;t linked to a clinic yet</h1>
        <p className="mt-2 text-sm text-slate-600">
          Ask your clinic admin to assign you from <span className="font-medium">Admin → Staff &amp; users</span>. Once
          assigned, sign in again.
        </p>
        <form action={signOut} className="mt-5">
          <Button variant="secondary">Sign out</Button>
        </form>
      </Card>
    </main>
  );
}
