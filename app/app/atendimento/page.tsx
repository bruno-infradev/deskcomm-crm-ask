import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth/server";

import { AtendimentoClient } from "./_components/AtendimentoClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Atendimento da Kath" };

export default async function AtendimentoPage() {
  await requireAuth();
  return (
    <div className="flex h-full flex-col gap-6 md:p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Atendimento da Kath</h1>
        <p className="text-sm text-muted-foreground">
          Quanto tempo o WhatsApp da Clínica leva para responder cada lead novo, quantos ficaram sem resposta e a taxa de resposta, no horário de São Paulo. Só para administradores.
        </p>
      </header>
      <AtendimentoClient />
    </div>
  );
}
