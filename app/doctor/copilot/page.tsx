import type { Metadata } from "next";
import { CopilotPanel } from "@/components/ai-answer";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";

export const metadata: Metadata = { title: "Doctor Copilot" };

export default async function CopilotPage() {
  await requireStaff("doctor");
  return (
    <>
      <PageHeader
        title="Doctor Copilot"
        description="Cited drug and clinical reference powered by You.com. It never diagnoses, prescribes or changes a prescription."
      />
      <Card className="max-w-3xl">
        <CardHeader title="Ask a clinical reference question" />
        <div className="p-5">
          <CopilotPanel
            suggestions={[
              "Drug interactions between azithromycin and amlodipine?",
              "Paracetamol maximum daily dose for adults with liver disease",
              "Cetirizine use in pregnancy — what do guidelines say?",
              "Amoxicillin dosing for acute otitis media in children",
            ]}
          />
        </div>
      </Card>
    </>
  );
}
