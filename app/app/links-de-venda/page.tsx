import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth/server";

import { LinksDeVendaClient } from "./_components/LinksDeVendaClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Links de venda" };

export default async function LinksDeVendaPage() {
  await requireAuth();
  return (
    <div className="flex h-full flex-col gap-6 md:p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Links de venda</h1>
        <p className="text-sm text-muted-foreground">
          Os links de pagamento da Hubla por produto e valor. Toque em Copiar e cole na conversa com o paciente.
        </p>
      </header>
      <LinksDeVendaClient />
    </div>
  );
}
