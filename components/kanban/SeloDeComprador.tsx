"use client";

import { useT } from "@/hooks/i18n/useT";
import { produtosComprados } from "@/lib/leads/comprador";
import type { Lead } from "@/lib/types/leads";

/**
 * Selo de comprador (fork ASK): faixa forte no topo do card e do dossiê. O comercial bate o olho e sabe que é cliente:
 * não abordar como lead novo, só para ascensão. Some quando a pessoa não comprou nada.
 */
export function SeloDeComprador({ lead, grande = false }: { lead: Lead; grande?: boolean }) {
  const t = useT();
  const produtos = produtosComprados(lead);
  if (produtos.length === 0) return null;
  return (
    <div
      data-testid="selo-comprador"
      role="note"
      className={
        grande
          ? "rounded-md border-2 border-amber-500 bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-950"
          : "mb-1.5 rounded border border-amber-500 bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-950"
      }
    >
      ★ {t("Comprador")}: {produtos.join(" + ")}
      <span className="block font-normal">{t("Já é cliente. Abordar só para ascensão.")}</span>
    </div>
  );
}
