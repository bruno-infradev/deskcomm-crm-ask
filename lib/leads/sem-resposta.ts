/**
 * "Sem resposta" (fork ASK, T-20261111-08, pedido do Bruno em 11/11/2026): lead cuja última mensagem da conversa é do
 * próprio lead e o vendedor ainda não respondeu. A régua é a `awaiting_since` da conversa (migration 0267): o instante da
 * mensagem do cliente MAIS ANTIGA que ninguém respondeu, a mesma que ordena a Fila do Inbox.
 */
import type { Lead } from "@/lib/types/leads";

/** Desde quando o lead espera resposta (ISO) ou null quando ninguém espera. Só negócio aberto conta. */
export function esperaDoLead(lead: Pick<Lead, "status" | "conversa">): string | null {
  if (lead.status !== "open") return null;
  return lead.conversa?.awaiting_since ?? null;
}

export const estaSemResposta = (lead: Pick<Lead, "status" | "conversa">): boolean => esperaDoLead(lead) !== null;

const MIN = 60 * 1000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

/** "há 35 min", "há 2 h", "há 3 d". Instante no futuro ou inválido vira "agora". */
export function rotuloDeEspera(desde: string, agora: number = Date.now()): string {
  const ms = agora - Date.parse(desde);
  if (!Number.isFinite(ms) || ms < MIN) return "agora";
  if (ms < HORA) return `há ${Math.floor(ms / MIN)} min`;
  if (ms < DIA) return `há ${Math.floor(ms / HORA)} h`;
  return `há ${Math.floor(ms / DIA)} d`;
}

/** Mais antigo primeiro (quem espera há mais tempo); quem não espera vai para o fim. */
export function compararPorEspera(a: Pick<Lead, "status" | "conversa">, b: Pick<Lead, "status" | "conversa">): number {
  const ea = esperaDoLead(a);
  const eb = esperaDoLead(b);
  if (ea && eb) return Date.parse(ea) - Date.parse(eb);
  if (ea) return -1;
  if (eb) return 1;
  return 0;
}
