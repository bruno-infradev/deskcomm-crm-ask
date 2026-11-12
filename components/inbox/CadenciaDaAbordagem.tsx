/**
 * Contador das abordagens novas do número desta conversa (T-20261112-003).
 *
 * "12/30 hoje · última há 3 min" e, se a última foi há menos de 10 min, um aviso
 * amarelo. Só informação: o envio não é barrado (Bruno, 12/11 10h33). Para quem não é vendedor a rota diz `aplica: false` e nada aparece.
 */
"use client";
import { useEffect, useState } from "react";

import { useT } from "@/hooks/i18n/useT";

interface Cadencia {
  aplica: boolean;
  meta?: number;
  feitas_hoje?: number;
  ultima_ha_min?: number | null;
  intervalo_recomendado_min?: number;
  espere?: boolean;
}

const ATUALIZA_A_CADA_MS = 20_000;

export function CadenciaDaAbordagem({ conversationId }: { conversationId: string }) {
  const t = useT();
  const [dados, setDados] = useState<Cadencia | null>(null);

  useEffect(() => {
    let vivo = true;
    const ler = () =>
      fetch(`/api/v1/conversations/${conversationId}/cadencia`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!vivo || !j?.data) return;
          setDados(j.data as Cadencia);
        })
        .catch(() => undefined);
    void ler();
    const leitura = setInterval(ler, ATUALIZA_A_CADA_MS);
    return () => {
      vivo = false;
      clearInterval(leitura);
    };
  }, [conversationId]);

  if (!dados?.aplica) return null;
  const espere = dados.espere === true;

  return (
    <div
      data-testid="cadencia-da-abordagem"
      className={
        espere
          ? "mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-50"
          : "mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground"
      }
    >
      <span>
        {t("Abordagens novas hoje")}: <strong>{dados.feitas_hoje}/{dados.meta}</strong>
        {dados.ultima_ha_min != null ? ` · ${t("última há")} ${dados.ultima_ha_min} min` : ""}
      </span>
      {espere && (
        <span>
          {t("Espere ~")}{dados.intervalo_recomendado_min} min {t("entre abordagens novas para não bloquear o número")}
        </span>
      )}
    </div>
  );
}
