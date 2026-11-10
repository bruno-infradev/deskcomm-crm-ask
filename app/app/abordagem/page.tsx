import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth/server";

import { AbordagemClient } from "./_components/AbordagemClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Abordagem do dia" };

export default async function AbordagemPage() {
  await requireAuth();
  return (
    <div className="flex h-full flex-col gap-6 md:p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Abordagem do dia</h1>
        <p className="text-sm text-muted-foreground">
          Pessoas diferentes que cada vendedor abordou hoje pelo número dele (sem grupos), contra a meta diária.
        </p>
      </header>
      <AbordagemClient />
    </div>
  );
}
