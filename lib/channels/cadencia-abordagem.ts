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
export const MAXIMO_POR_HORA = 6;
export const META_DO_DIA = 30;
const UMA_HORA_MS = 60 * 60 * 1000;
const FUSO_SP = "-03:00"; // São Paulo sem horário de verão desde 2019
const LIMITE_DE_LINHAS = 3000;
const LOTE = 150;

export const CODIGO_ABORDAGEM_CADENCIADA = "abordagem_cadenciada" as const;

export type DecisaoDeCadencia =
  | { liberado: true; feitasHoje: number; esperaMs: 0 }
  | { liberado: false; feitasHoje: number; esperaMs: number; motivo: "intervalo" | "limite_por_hora" };

/** Pura: dado quando saíram as abordagens novas do dia neste número, pode sair outra agora? */
export function decidirCadencia(abordagensDoDia: readonly Date[], agora: Date): DecisaoDeCadencia {
  const instantes = abordagensDoDia.map((d) => d.getTime()).sort((a, b) => a - b);
  const feitasHoje = instantes.length;
  const agoraMs = agora.getTime();

  const ultima = instantes.length > 0 ? instantes[instantes.length - 1]! : null;
  const esperaIntervalo = ultima === null ? 0 : Math.max(0, ultima + INTERVALO_MINIMO_MS - agoraMs);

  const naJanela = instantes.filter((t) => t > agoraMs - UMA_HORA_MS);
  const esperaHora =
    naJanela.length >= MAXIMO_POR_HORA
      ? Math.max(0, naJanela[naJanela.length - MAXIMO_POR_HORA]! + UMA_HORA_MS - agoraMs)
      : 0;

  if (esperaHora > 0 && esperaHora >= esperaIntervalo) {
    return { liberado: false, feitasHoje, esperaMs: esperaHora, motivo: "limite_por_hora" };
  }
  if (esperaIntervalo > 0) {
    return { liberado: false, feitasHoje, esperaMs: esperaIntervalo, motivo: "intervalo" };
  }
  return { liberado: true, feitasHoje, esperaMs: 0 };
}

export function inicioDoDiaEmSP(agora: Date): Date {
  const dia = agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return new Date(`${dia}T00:00:00${FUSO_SP}`);
}

/** "7 min" para quem lê: arredonda para cima, nunca "0 min". */
export function esperaLegivel(esperaMs: number): string {
  const minutos = Math.max(1, Math.ceil(esperaMs / 60000));
  return `${minutos} min`;
}

export function mensagemDaCadencia(d: Extract<DecisaoDeCadencia, { liberado: false }>): string {
  const motivo =
    d.motivo === "limite_por_hora"
      ? `Você já fez ${MAXIMO_POR_HORA} abordagens novas na última hora neste número.`
      : "Espaçar as abordagens protege o número de um bloqueio do WhatsApp.";
  return `Próxima abordagem nova liberada em ${esperaLegivel(d.esperaMs)} (${d.feitasHoje}/${META_DO_DIA} hoje). ${motivo} Nada foi enviado; responder a quem já escreveu segue livre.`;
}

type LinhaDeMensagem = { conversation_id: string; direction: string; created_at: string };

/**
 * Quando saiu a primeira mensagem de cada conversa que COMEÇOU hoje por uma
 * mensagem nossa neste número. Conversa que já tinha mensagem antes de hoje, ou
 * que hoje começou por uma mensagem do contato, não é abordagem nova.
 */
export async function abordagensNovasDoDia(
  db: SupabaseClient,
  p: { organizationId: string; channelSessionId: string; agora: Date },
): Promise<{ leitura: "ok"; instantes: Date[] } | { leitura: "indisponivel" }> {
  const inicio = inicioDoDiaEmSP(p.agora);
  const { data, error } = await db
    .from("messages")
    .select("conversation_id, direction, created_at")
    .eq("organization_id", p.organizationId)
    .eq("channel_session_id", p.channelSessionId)
    .gte("created_at", inicio.toISOString())
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
