/**
 * Social selling (fork ASK, T-20261120-001, pedido do Bruno em 20/11/2026): lançamento diário de cada vendedor
 * (mensagens enviadas, respostas, WhatsApp, agendamento, no-show) e visão da semana de segunda a sexta com totais e taxas.
 * Funções puras: a rota lê e grava, aqui só se calcula.
 */

export const CAMPOS_NUMERICOS = ["mensagens_enviadas", "respostas", "whatsapp", "agendamento", "no_show"] as const;
export type CampoNumerico = (typeof CAMPOS_NUMERICOS)[number];

export type Contagens = Record<CampoNumerico, number>;

export interface LancamentoDoDia extends Contagens {
  dia: string; // AAAA-MM-DD
  user_id: string | null; // null = total da equipe importado da planilha antiga
  obs: string;
}

export interface TaxasSocialSelling {
  resposta_sobre_enviadas: number | null;
  agendamento_sobre_respostas: number | null;
}

export const contagensZeradas = (): Contagens => ({ mensagens_enviadas: 0, respostas: 0, whatsapp: 0, agendamento: 0, no_show: 0 });

const DIAS_UTEIS = 5;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

const paraIso = (d: Date): string => d.toISOString().slice(0, 10);

/** Segunda a sexta da semana que contém o dia (sábado e domingo caem na semana que acabou). Datas em UTC puro, sem fuso. */
export function diasDaSemana(dia: string): string[] {
  const base = new Date(`${dia}T00:00:00Z`);
  const diaDaSemana = base.getUTCDay(); // 0 domingo, 1 segunda
  const recuo = diaDaSemana === 0 ? 6 : diaDaSemana - 1;
  const segunda = new Date(base.getTime() - recuo * MS_POR_DIA);
  return Array.from({ length: DIAS_UTEIS }, (_, i) => paraIso(new Date(segunda.getTime() + i * MS_POR_DIA)));
}

export function somar(lancamentos: readonly Contagens[]): Contagens {
  return lancamentos.reduce<Contagens>(
    (acc, l) => ({
      mensagens_enviadas: acc.mensagens_enviadas + l.mensagens_enviadas,
      respostas: acc.respostas + l.respostas,
      whatsapp: acc.whatsapp + l.whatsapp,
      agendamento: acc.agendamento + l.agendamento,
      no_show: acc.no_show + l.no_show,
    }),
    contagensZeradas(),
  );
}

const porcento = (parte: number, base: number): number | null => (base > 0 ? Math.round((parte / base) * 100) : null);

export function taxas(c: Contagens): TaxasSocialSelling {
  return { resposta_sobre_enviadas: porcento(c.respostas, c.mensagens_enviadas), agendamento_sobre_respostas: porcento(c.agendamento, c.respostas) };
}

export interface DiaDaSemana {
  dia: string;
  total: Contagens;
  por_vendedor: Record<string, Contagens>; // chave = user_id ou "equipe" para o histórico sem vendedor
  obs: string[];
}

export interface SemanaSocialSelling {
  inicio: string;
  fim: string;
  dias: DiaDaSemana[];
  total: Contagens;
  por_vendedor: Record<string, Contagens>;
  taxas: TaxasSocialSelling;
}

export const CHAVE_EQUIPE = "equipe";

/** Monta a semana (seg a sex) com total do dia, total da semana e por vendedor, somando exatamente os lançamentos recebidos. */
export function montarSemana(dia: string, lancamentos: readonly LancamentoDoDia[]): SemanaSocialSelling {
  const datas = diasDaSemana(dia);
  const noPeriodo = lancamentos.filter((l) => datas.includes(l.dia));
  const porVendedorDaSemana: Record<string, Contagens[]> = {};
  const dias = datas.map((d) => {
    const doDia = noPeriodo.filter((l) => l.dia === d);
    const agrupado: Record<string, Contagens[]> = {};
    for (const l of doDia) {
      const chave = l.user_id ?? CHAVE_EQUIPE;
      (agrupado[chave] ??= []).push(l);
      (porVendedorDaSemana[chave] ??= []).push(l);
    }
    return {
      dia: d,
      total: somar(doDia),
      por_vendedor: Object.fromEntries(Object.entries(agrupado).map(([k, v]) => [k, somar(v)])),
      obs: doDia.map((l) => l.obs.trim()).filter(Boolean),
    };
  });
  const total = somar(noPeriodo);
  return {
    inicio: datas[0],
    fim: datas[DIAS_UTEIS - 1],
    dias,
    total,
    por_vendedor: Object.fromEntries(Object.entries(porVendedorDaSemana).map(([k, v]) => [k, somar(v)])),
    taxas: taxas(total),
  };
}
