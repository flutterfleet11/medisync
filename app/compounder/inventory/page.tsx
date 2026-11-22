import type { Metadata } from "next";
import { InventoryManager } from "@/components/inventory";
import { PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { listMedicines } from "@/lib/data";

export const metadata: Metadata = { title: "Inventory" };

export default async function CompounderInventoryPage() {
  const session = await requireStaff("compounder");
  const medicines = await listMedicines(session.clinic.id);
  return (
    <>
      <PageHeader title="Inventory" description="Prescriptions are matched to these names. Dispensing deducts stock automatically." />
      <InventoryManager medicines={medicines} />
    </>
  );
}
