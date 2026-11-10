/**
 * Abordagem hora a hora (São Paulo, 7h às 22h). Pedido do Bruno em 10/11/2026.
 * Cada contato conta UMA vez: abordado na hora da primeira mensagem de saída do dia e "respondeu" na hora da
 * primeira mensagem de entrada do dia (só se foi abordado). Assim a soma das horas bate com o total do dia.
 * Mensagens fora de 7h a 22h vão para as pontas (antes das 7h em 7h, depois das 22h em 22h).
 */
export const HORA_INICIAL = 7;
export const HORA_FINAL = 22;

export interface MensagemDoDia {
  contact_id: string | null;
  direction: string;
  created_at: string;
}
export interface HoraAbordagem {
  hora: number;
  abordados: number;
  mensagens: number;
  respostas: number;
}

export function horaEmSP(iso: string): number {
  const h = Number(new Date(iso).toLocaleString("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }));
  return h === 24 ? 0 : h;
}

const limitar = (h: number) => Math.min(HORA_FINAL, Math.max(HORA_INICIAL, h));

export function abordagemPorHora(mensagens: readonly MensagemDoDia[]): HoraAbordagem[] {
  const porHora = new Map<number, HoraAbordagem>();
  for (let hora = HORA_INICIAL; hora <= HORA_FINAL; hora += 1) porHora.set(hora, { hora, abordados: 0, mensagens: 0, respostas: 0 });
  const somar = (iso: string, campo: "abordados" | "mensagens" | "respostas") => {
    const hora = limitar(horaEmSP(iso));
    const atual = porHora.get(hora);
    if (atual) porHora.set(hora, { ...atual, [campo]: atual[campo] + 1 });
  };
  const ordenadas = [...mensagens].filter((m) => m.contact_id).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const abordados = new Set<string>();
  for (const m of ordenadas) {
    if (m.direction !== "outbound") continue;
    somar(m.created_at, "mensagens");
    if (!abordados.has(m.contact_id!)) {
      abordados.add(m.contact_id!);
      somar(m.created_at, "abordados");
    }
  }
  const jaRespondeu = new Set<string>();
  for (const m of ordenadas) {
    if (m.direction !== "inbound" || !abordados.has(m.contact_id!) || jaRespondeu.has(m.contact_id!)) continue;
    jaRespondeu.add(m.contact_id!);
    somar(m.created_at, "respostas");
  }
  return [...porHora.values()];
}
