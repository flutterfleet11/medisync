import type { Metadata } from "next";
import { InventoryManager } from "@/components/inventory";
import { PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { listMedicines } from "@/lib/data";

export const metadata: Metadata = { title: "Inventory" };

export default async function AdminInventoryPage() {
  const session = await requireStaff("admin");
  const medicines = await listMedicines(session.clinic.id);
  return (
    <>
      <PageHeader title="Inventory oversight" description="Same live inventory the compounder dispenses from." />
      <InventoryManager medicines={medicines} />
    </>
  );
}
