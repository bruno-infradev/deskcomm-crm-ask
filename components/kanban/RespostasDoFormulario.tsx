"use client";

import { useT } from "@/hooks/i18n/useT";
import {
  CHAVES_DE_RESPOSTA,
  ROTULO_DA_RESPOSTA,
  respostasDoPopup,
} from "@/lib/leads/respostas-do-popup";
import type { Lead } from "@/lib/types/leads";

/**
 * As respostas do popup das páginas (tem clínica, injetáveis, área, faturamento) num bloco FIXO do card, logo
 * abaixo do cabeçalho: o comercial lê antes de abrir a conversa, sem procurar em campo genérico (fork ASK,
 * T-20261111-01). Lead sem nenhuma das quatro respostas não desenha o bloco. Pergunta sem resposta aparece
 * como "não respondeu", para não parecer que a tela perdeu o dado.
 */
export function RespostasDoFormulario({ lead }: { lead: Pick<Lead, "custom_fields"> }) {
  const t = useT();
  const respostas = respostasDoPopup(lead);
  if (CHAVES_DE_RESPOSTA.every((chave) => !respostas[chave])) return null;
  return (
    <section
      aria-label={t("Respostas do formulário")}
      data-testid="respostas-do-formulario"
      className="rounded-lg border border-border bg-surface p-3"
    >
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
        {t("Respostas do formulário")}
      </h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {CHAVES_DE_RESPOSTA.map((chave) => (
          <div key={chave} data-testid={`resposta-${chave}`}>
            <dt className="text-xs text-text-muted">{t(ROTULO_DA_RESPOSTA[chave])}</dt>
            <dd className={respostas[chave] ? "font-medium" : "text-text-muted"}>
              {respostas[chave] ?? t("não respondeu")}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
