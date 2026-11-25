/**
 * Abordados por vendedor no dia, na semana (segunda até o dia) e no mês (dia 1 até o dia). Pedido do Ângelo ao Bruno em 25/11/2026.
 * Mesma regra de /api/v1/metrics/abordagem: abordado = contato distinto que recebeu ao menos 1 mensagem de saída no dia de São Paulo,
 * e respondeu = abordado que mandou mensagem de entrada no mesmo dia. A semana e o mês somam os dias (quem é abordado em dois dias conta duas vezes).
 */
export interface MensagemPeriodo {
  channel_session_id: string;
  contact_id: string | null;
  direction: string;
  created_at: string;
}
export interface Contagem {
  abordados: number;
  responderam: number;
}
export interface PeriodosDoVendedor {
  hoje: Contagem;
  semana: Contagem;
  mes: Contagem;
}

const MS_POR_DIA = 24 * 60 * 60 * 1000;
export const diaEmSP = (iso: string): string => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

export function inicioDaSemana(dia: string): string {
  const base = new Date(`${dia}T00:00:00Z`);
  const recuo = base.getUTCDay() === 0 ? 6 : base.getUTCDay() - 1;
  return new Date(base.getTime() - recuo * MS_POR_DIA).toISOString().slice(0, 10);
}
export const inicioDoMes = (dia: string): string => `${dia.slice(0, 8)}01`;

/** `donoDaSessao`: número (channel_session) -> vendedor responsável. Número sem responsável não entra. */
export function abordadosPorVendedor(mensagens: readonly MensagemPeriodo[], donoDaSessao: ReadonlyMap<string, string>, ate: string): Map<string, PeriodosDoVendedor> {
  const semana = inicioDaSemana(ate);
  const mes = inicioDoMes(ate);
  const saida = new Map<string, Set<string>>(); // "vendedor|dia" -> contatos abordados
  const entrada = new Map<string, Set<string>>();
  for (const m of mensagens) {
    const vendedor = donoDaSessao.get(m.channel_session_id);
    if (!vendedor || !m.contact_id) continue;
    const dia = diaEmSP(m.created_at);
    if (dia > ate || dia < mes) continue;
    const alvo = m.direction === "outbound" ? saida : m.direction === "inbound" ? entrada : null;
    if (!alvo) continue;
    const chave = `${vendedor}|${dia}`;
    (alvo.get(chave) ?? alvo.set(chave, new Set()).get(chave))!.add(m.contact_id);
  }
  const resultado = new Map<string, PeriodosDoVendedor>();
  const zero = (): PeriodosDoVendedor => ({ hoje: { abordados: 0, responderam: 0 }, semana: { abordados: 0, responderam: 0 }, mes: { abordados: 0, responderam: 0 } });
  for (const vendedor of new Set(donoDaSessao.values())) resultado.set(vendedor, zero());
  for (const [chave, contatos] of saida) {
    const [vendedor, dia] = chave.split("|") as [string, string];
    const resp = [...contatos].filter((c) => entrada.get(chave)?.has(c)).length;
    const p = resultado.get(vendedor) ?? zero();
    const somar = (c: Contagem) => ({ abordados: c.abordados + contatos.size, responderam: c.responderam + resp });
    resultado.set(vendedor, {
      hoje: dia === ate ? somar(p.hoje) : p.hoje,
      semana: dia >= semana ? somar(p.semana) : p.semana,
      mes: somar(p.mes),
    });
  }
  return resultado;
}
