import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth/server";

import { LeadsPorOrigemClient } from "./_components/LeadsPorOrigemClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Leads por origem" };

export default async function LeadsPorOrigemPage() {
  await requireAuth();
  return (
    <div className="flex h-full flex-col gap-6 md:p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Leads por origem</h1>
        <p className="text-sm text-muted-foreground">
          Leads novos por dia e por origem de anúncio no funil Clínica (WhatsApp da Kath), no horário de São Paulo, para comparar com os cliques da Meta.
        </p>
      </header>
      <LeadsPorOrigemClient />
    </div>
  );
}
