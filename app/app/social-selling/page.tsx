import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth/server";

import { ReunioesClient } from "./_components/ReunioesClient";
import { SocialSellingClient } from "./_components/SocialSellingClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Social selling" };

export default async function SocialSellingPage() {
  await requireAuth();
  return (
    <div className="flex h-full flex-col gap-6 md:p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Social selling</h1>
        <p className="text-sm text-muted-foreground">
          Cada vendedor lança o próprio dia (mensagens enviadas, respostas, WhatsApp, agendamento e no-show). A semana soma tudo de segunda a sexta.
        </p>
      </header>
      <SocialSellingClient />
      <ReunioesClient />
    </div>
  );
}
