/**
 * Quando os leads respondem (pedido do Bruno em 18/11/2026, via Carlos).
 * Dois recortes, ambos no fuso de São Paulo, por período do dia e por dia da semana:
 *  (a) recebidas: mensagens de entrada, por quando o lead escreveu;
 *  (b) taxa por horário de envio: mensagens NOSSAS que ganharam resposta do mesmo contato em até 24 h,
 *      sobre as mensagens enviadas naquele horário (só as que já tiveram as 24 h para amadurecer).
 */
export const JANELA_RESPOSTA_MS = 24 * 60 * 60 * 1000;

export const PERIODOS = ["madrugada", "manha", "tarde", "noite"] as const;
export type Periodo = (typeof PERIODOS)[number];
export const DIAS_DA_SEMANA = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"] as const;

export interface MensagemDeConversa {
  contact_id: string | null;
  channel_session_id: string;
  direction: string;
  created_at: string;
}
export interface CelulaRecebidas {
  recebidas: number;
}
export interface CelulaEnvio {
  enviadas: number;
  respondidas: number;
  taxa: number | null;
}
export interface Horarios {
  por_periodo: Record<Periodo, { recebidas: number } & CelulaEnvio>;
  por_dia: Record<(typeof DIAS_DA_SEMANA)[number], { recebidas: number } & CelulaEnvio>;
  mapa: Record<(typeof DIAS_DA_SEMANA)[number], Record<Periodo, { recebidas: number } & CelulaEnvio>>;
  totais: { recebidas: number; enviadas: number; respondidas: number; taxa: number | null };
}

export function periodoDaHora(hora: number): Periodo {
  if (hora < 6) return "madrugada";
  if (hora < 12) return "manha";
  if (hora < 18) return "tarde";
  return "noite";
}

const DIA_EN_PARA_INDICE: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
const formato = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", hour12: false });

export function horaEDiaEmSP(iso: string): { hora: number; dia: (typeof DIAS_DA_SEMANA)[number] } {
  const partes = formato.formatToParts(new Date(iso));
  const hora = Number(partes.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const dia = DIAS_DA_SEMANA[DIA_EN_PARA_INDICE[partes.find((p) => p.type === "weekday")?.value ?? "Mon"] ?? 0]!;
  return { hora, dia };
}

const taxa = (parte: number, base: number): number | null => (base > 0 ? Math.round((parte / base) * 1000) / 10 : null);
const vazia = () => ({ recebidas: 0, enviadas: 0, respondidas: 0, taxa: null as number | null });

export function horariosDeResposta(mensagens: readonly MensagemDeConversa[], agoraMs: number = Date.now()): Horarios {
  const mapa = Object.fromEntries(
    DIAS_DA_SEMANA.map((d) => [d, Object.fromEntries(PERIODOS.map((p) => [p, vazia()]))]),
  ) as Horarios["mapa"];

  const porConversa = new Map<string, MensagemDeConversa[]>();
  for (const m of mensagens) {
    if (!m.contact_id) continue;
    const chave = `${m.channel_session_id}:${m.contact_id}`;
    const lista = porConversa.get(chave);
    if (lista) lista.push(m);
    else porConversa.set(chave, [m]);
  }

  for (const lista of porConversa.values()) {
    const ordenadas = [...lista].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const entradas = ordenadas.filter((m) => m.direction === "inbound").map((m) => new Date(m.created_at).getTime());
    for (const m of ordenadas) {
      const { hora, dia } = horaEDiaEmSP(m.created_at);
      const celula = mapa[dia][periodoDaHora(hora)];
      if (m.direction === "inbound") {
        celula.recebidas += 1;
        continue;
      }
      if (m.direction !== "outbound") continue;
      const t = new Date(m.created_at).getTime();
      if (agoraMs - t < JANELA_RESPOSTA_MS) continue; // ainda não teve as 24 h para ser respondida
      celula.enviadas += 1;
      if (entradas.some((e) => e > t && e - t <= JANELA_RESPOSTA_MS)) celula.respondidas += 1;
    }
  }

  const somar = (celulas: ReturnType<typeof vazia>[]) => {
    const recebidas = celulas.reduce((s, c) => s + c.recebidas, 0);
    const enviadas = celulas.reduce((s, c) => s + c.enviadas, 0);
    const respondidas = celulas.reduce((s, c) => s + c.respondidas, 0);
    return { recebidas, enviadas, respondidas, taxa: taxa(respondidas, enviadas) };
  };
  for (const d of DIAS_DA_SEMANA) for (const p of PERIODOS) mapa[d][p] = { ...mapa[d][p], taxa: taxa(mapa[d][p].respondidas, mapa[d][p].enviadas) };

  const por_periodo = Object.fromEntries(PERIODOS.map((p) => [p, somar(DIAS_DA_SEMANA.map((d) => mapa[d][p]))])) as Horarios["por_periodo"];
  const por_dia = Object.fromEntries(DIAS_DA_SEMANA.map((d) => [d, somar(PERIODOS.map((p) => mapa[d][p]))])) as Horarios["por_dia"];
  return { por_periodo, por_dia, mapa, totais: somar(DIAS_DA_SEMANA.flatMap((d) => PERIODOS.map((p) => mapa[d][p]))) };
}
