/**
 * Contador das abordagens novas do número desta conversa (T-20261112-003).
 *
 * "12/30 hoje" e "Próxima abordagem nova liberada em 7 min" para o vendedor se
 * cadenciar ao longo do dia. A decisão é do servidor (o envio recusa); isto só
 * mostra. Para quem não é vendedor a rota diz `aplica: false` e nada aparece.
 */
"use client";
import { useEffect, useState } from "react";

import { useT } from "@/hooks/i18n/useT";

interface Cadencia {
  aplica: boolean;
  meta?: number;
  feitas_hoje?: number;
  espera_s?: number;
  conversa_nova?: boolean;
}

const ATUALIZA_A_CADA_MS = 20_000;

export function CadenciaDaAbordagem({ conversationId }: { conversationId: string }) {
  const t = useT();
  const [dados, setDados] = useState<Cadencia | null>(null);
  const [restanteS, setRestanteS] = useState(0);

  useEffect(() => {
    let vivo = true;
    const ler = () =>
      fetch(`/api/v1/conversations/${conversationId}/cadencia`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!vivo || !j?.data) return;
          setDados(j.data as Cadencia);
          setRestanteS((j.data as Cadencia).espera_s ?? 0);
        })
        .catch(() => undefined);
    void ler();
    const leitura = setInterval(ler, ATUALIZA_A_CADA_MS);
    const relogio = setInterval(() => setRestanteS((s) => Math.max(0, s - 1)), 1000);
    return () => {
      vivo = false;
      clearInterval(leitura);
      clearInterval(relogio);
    };
  }, [conversationId]);

  if (!dados?.aplica) return null;
  const minutos = Math.max(1, Math.ceil(restanteS / 60));
  const travada = restanteS > 0 && dados.conversa_nova === true;

  return (
    <div
      data-testid="cadencia-da-abordagem"
      className={
        travada
          ? "mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-50"
          : "mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground"
      }
    >
      <span>
        {t("Abordagens novas hoje")}: <strong>{dados.feitas_hoje}/{dados.meta}</strong>
      </span>
      <span>
        {restanteS > 0
          ? `${t("Próxima abordagem nova liberada em")} ${minutos} min`
          : t("Abordagem nova liberada")}
        {" · "}
        {t("responder a quem já escreveu segue livre")}
      </span>
    </div>
  );
}
