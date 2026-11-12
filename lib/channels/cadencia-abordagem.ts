/**
 * CADÊNCIA DAS ABORDAGENS NOVAS (T-20261112-003, pedido do Bruno em 12/11/2026).
 *
 * ─── O defeito que isto fecha ───────────────────────────────────────────────
 *
 * Em 12/11 o número Ângelo · 1 mandou 30 "Bom dia" a contatos frios em 34 minutos
 * (07h54 a 08h28, uma por minuto) e o WhatsApp bloqueou o número por 24 h. Sem
 * nada que segurasse, o vendedor chegava à meta de 30 do dia em meia hora.
 *
 * ─── O que é uma "abordagem nova" ───────────────────────────────────────────
 *
 * A PRIMEIRA mensagem a um contato que ainda não tem nenhuma mensagem na
 * conversa. Resposta a quem escreveu, e mensagem numa conversa que já existe,
 * NÃO entram: o risco de bloqueio mora em escrever primeiro para quem não pediu.
 *
 * ─── Sem bloqueio (Bruno, 12/11 10h33) ──────────────────────────────────────
 *
 * A primeira versão barrava o envio (10 min entre abordagens novas, 6 por hora).
 * O Bruno tirou o bloqueio: os vendedores espaçam à mão e o fim do dia é
 * analisado. Fica o contador na tela, o aviso amarelo "espere ~10 min" e as
 * estatísticas em /api/v1/metrics/abordagem (`cadencia` por vendedor e número).
 *
 * ─── Os números (premissa, não tabela oficial) ──────────────────────────────
 *
 * O WhatsApp não publica limite para número não oficial. O estudo da casa
 * (04-recursos/estudos/2026-09-24-aquecimento-chip.md, seção 4, a partir de
 * zaple.ai, greentick.ai e clickmassa.com.br) converge em: nada de rajada, nada
 * de intervalo de minuto em minuto, poucas dezenas por dia. Daí:
 *
 *   - intervalo mínimo de 10 min entre abordagens novas do mesmo número;
 *   - no máximo 6 por hora (com 10 min de intervalo isto só pega a abordagem
 *     feita pelo celular, que o CRM enxerga mas não consegue segurar);
 *   - a meta de 30 por dia (a mesma da tela "Abordagem do dia") se espalha em
 *     cerca de 5 horas.
 *
 * Conta por NÚMERO (sessão), não por usuário: o bloqueio é do número. Quem manda
 * pelo celular (`external_device`) também conta, mas só dá para barrar o envio
 * feito pelo CRM.
 *
 * A decisão é pura (`decidirCadencia`); `abordagensNovasDoDia` lê o banco.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const INTERVALO_MINIMO_MS = 10 * 60 * 1000;
/** Abaixo disto a abordagem nova é "rápida demais" para o relatório do fim do dia. */
export const INTERVALO_RAPIDO_MS = 5 * 60 * 1000;
export const META_DO_DIA = 30;
const UMA_HORA_MS = 60 * 60 * 1000;
const FUSO_SP = "-03:00"; // São Paulo sem horário de verão desde 2019
const LIMITE_DE_LINHAS = 3000;
const LOTE = 150;

export function inicioDoDiaEmSP(agora: Date): Date {
  const dia = agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return new Date(`${dia}T00:00:00${FUSO_SP}`);
}

export interface EstatisticaDeCadencia {
  total: number;
  maximo_em_uma_hora: number;
  menor_intervalo_min: number | null;
  menos_de_5_min: number;
  ultima_ha_min: number | null;
}

/**
 * Pura: o retrato do dia para a análise de fim de tarde. "Menos de 5 min" conta
 * as abordagens que saíram a menos de 5 min da anterior.
 */
export function estatisticaDeCadencia(abordagensDoDia: readonly Date[], agora: Date): EstatisticaDeCadencia {
  const t = abordagensDoDia.map((d) => d.getTime()).sort((a, b) => a - b);
  let maximo = 0;
  for (let i = 0, j = 0; i < t.length; i += 1) {
    while (t[i]! - t[j]! >= UMA_HORA_MS) j += 1;
    maximo = Math.max(maximo, i - j + 1);
  }
  const intervalos = t.slice(1).map((x, i) => x - t[i]!);
  const menor = intervalos.length > 0 ? Math.min(...intervalos) : null;
  return {
    total: t.length,
    maximo_em_uma_hora: maximo,
    menor_intervalo_min: menor === null ? null : Math.round((menor / 60000) * 10) / 10,
    menos_de_5_min: intervalos.filter((x) => x < INTERVALO_RAPIDO_MS).length,
    ultima_ha_min: t.length > 0 ? Math.max(0, Math.round((agora.getTime() - t[t.length - 1]!) / 60000)) : null,
  };
}

type LinhaDeMensagem = { conversation_id: string; direction: string; created_at: string };

/**
 * Quando saiu a primeira mensagem de cada conversa que COMEÇOU hoje por uma
 * mensagem nossa neste número. Conversa que já tinha mensagem antes de hoje, ou
 * que hoje começou por uma mensagem do contato, não é abordagem nova.
 */
export async function abordagensNovasDoDia(
  db: SupabaseClient,
  p: { organizationId: string; channelSessionId: string; agora: Date; dia?: string },
): Promise<{ leitura: "ok"; instantes: Date[] } | { leitura: "indisponivel" }> {
  const inicio = p.dia ? new Date(`${p.dia}T00:00:00${FUSO_SP}`) : inicioDoDiaEmSP(p.agora);
  const fim = new Date(inicio.getTime() + 24 * UMA_HORA_MS);
  const { data, error } = await db
    .from("messages")
    .select("conversation_id, direction, created_at")
    .eq("organization_id", p.organizationId)
    .eq("channel_session_id", p.channelSessionId)
    .gte("created_at", inicio.toISOString())
    .lt("created_at", fim.toISOString())
    .order("created_at", { ascending: true })
    .limit(LIMITE_DE_LINHAS);
  if (error) return { leitura: "indisponivel" };

  const primeira = new Map<string, LinhaDeMensagem>();
  for (const l of (data ?? []) as LinhaDeMensagem[]) {
    if (!primeira.has(l.conversation_id)) primeira.set(l.conversation_id, l);
  }
  const candidatas = [...primeira.values()].filter((l) => l.direction === "outbound");
  if (candidatas.length === 0) return { leitura: "ok", instantes: [] };

  const jaExistiam = new Set<string>();
  const ids = candidatas.map((l) => l.conversation_id);
  for (let i = 0; i < ids.length; i += LOTE) {
    const { data: antigas, error: erroAntigas } = await db
      .from("messages")
      .select("conversation_id")
      .eq("organization_id", p.organizationId)
      .in("conversation_id", ids.slice(i, i + LOTE))
      .lt("created_at", inicio.toISOString())
      .limit(LOTE * 5);
    if (erroAntigas) return { leitura: "indisponivel" };
    for (const a of (antigas ?? []) as { conversation_id: string }[]) jaExistiam.add(a.conversation_id);
  }
  return {
    leitura: "ok",
    instantes: candidatas.filter((l) => !jaExistiam.has(l.conversation_id)).map((l) => new Date(l.created_at)),
  };
}
