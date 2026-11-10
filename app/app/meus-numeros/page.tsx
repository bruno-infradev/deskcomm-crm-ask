import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth/server";

import { MeusNumerosClient } from "./_components/MeusNumerosClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Meus números" };

export default async function MeusNumerosPage() {
  await requireAuth();
  return (
    <div className="flex h-full flex-col gap-6 md:p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Meus números</h1>
        <p className="text-sm text-muted-foreground">
          Os WhatsApp em que você é o responsável. Se algum cair, toque em Reconectar e leia o QR no seu celular (WhatsApp &gt; Aparelhos conectados).
        </p>
      </header>
      <MeusNumerosClient />
    </div>
  );
}
