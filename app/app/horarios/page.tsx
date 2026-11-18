import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth/server";

import { HorariosClient } from "./_components/HorariosClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Horários de resposta" };

export default async function HorariosPage() {
  await requireAuth();
  return (
    <div className="flex h-full flex-col gap-6 md:p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Horários de resposta</h1>
        <p className="text-sm text-muted-foreground">
          Quando os leads respondem e qual horário de envio rende mais resposta (até 24 h depois), por período do dia e dia da semana, no horário de São Paulo.
        </p>
      </header>
      <HorariosClient />
    </div>
  );
}
