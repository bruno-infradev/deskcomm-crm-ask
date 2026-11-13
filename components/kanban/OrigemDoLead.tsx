"use client";

import { useT } from "@/hooks/i18n/useT";
import { origemDoLead } from "@/lib/leads/origem-do-lead";
import type { Lead } from "@/lib/types/leads";

const dataCurta = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }) : "";

/**
 * "Origem" no card (Bruno, 12/11/2026): fonte, campanha e anúncio da ÚLTIMA entrada, com a data; e, quando a origem da
 * primeira entrada for outra, "Primeira entrada" logo abaixo. Vem de `source_metadata` (ver `lib/leads/origem-do-lead.ts`).
 */
export function OrigemDoLead({ lead }: { lead: Pick<Lead, "source_metadata" | "created_at"> }) {
  const t = useT();
  const o = origemDoLead(lead.source_metadata, lead.created_at);
  return (
    <section aria-label={t("Origem")} data-testid="origem-do-lead" className="rounded-lg border border-border bg-surface p-3">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">{t("Origem")}</h3>
      <dl className="grid grid-cols-1 gap-y-2 text-sm">
        <div data-testid="origem-ultima">
          <dt className="text-xs text-text-muted">
            {t("Última entrada")}
            {o.ultima.data ? ` · ${dataCurta(o.ultima.data)}` : ""}
          </dt>
          <dd className="font-medium">{o.ultima.texto}</dd>
        </div>
        {o.primeira && (
          <div data-testid="origem-primeira">
            <dt className="text-xs text-text-muted">
              {t("Primeira entrada")}
              {o.primeira.data ? ` · ${dataCurta(o.primeira.data)}` : ""}
            </dt>
            <dd>{o.primeira.texto}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
