/**
 * Resultado do comercial no dia (Bruno, 11/11/2026): além do esforço (abordados e respostas), mede reuniões,
 * propostas, vendas em R$, tempo até o vendedor responder e conversão por origem (tag do lead).
 * Funções puras: a rota só busca os dados e chama estas.
 */
export interface MensagemResposta {
  contact_id: string | null;
  direction: string;
  created_at: string;
}
export interface TempoDeResposta {
  /** Média, em minutos, entre a mensagem que o lead mandou e a primeira resposta do vendedor. null se nada foi respondido. */
  media_minutos: number | null;
  respondidos: number;
  /** Leads cuja última mensagem do dia é do lead: o vendedor ainda não respondeu. */
  sem_resposta: number;
}

const MS_POR_MINUTO = 60 * 1000;

/**
 * Cada "rajada" de mensagens do lead (a primeira entrada depois de uma saída, ou a primeira do dia) espera a próxima
 * saída do vendedor para o mesmo contato. Sem saída depois, o contato fica "sem resposta".
 */
export function tempoDeResposta(mensagens: readonly MensagemResposta[]): TempoDeResposta {
  const porContato = new Map<string, MensagemResposta[]>();
  for (const m of mensagens) {
    if (!m.contact_id) continue;
    porContato.set(m.contact_id, [...(porContato.get(m.contact_id) ?? []), m]);
  }
  const esperas: number[] = [];
  let semResposta = 0;
  for (const lista of porContato.values()) {
    const ordenada = [...lista].sort((a, b) => a.created_at.localeCompare(b.created_at));
    let aberta: string | null = null;
    for (const m of ordenada) {
      if (m.direction === "inbound") {
        aberta = aberta ?? m.created_at;
      } else if (m.direction === "outbound" && aberta) {
        esperas.push(new Date(m.created_at).getTime() - new Date(aberta).getTime());
        aberta = null;
      }
    }
    if (aberta) semResposta += 1;
  }
  const media = esperas.length ? Math.round(esperas.reduce((s, e) => s + e, 0) / esperas.length / MS_POR_MINUTO) : null;
  return { media_minutos: media, respondidos: esperas.length, sem_resposta: semResposta };
}

export interface VendaDoDia {
  valor_reais: number;
  forma: "hubla" | "fora_da_hubla" | "nao_informada";
}
export interface ResumoDeVendas {
  qtd: number;
  valor_reais: number;
  hubla: { qtd: number; valor_reais: number };
  fora_da_hubla: { qtd: number; valor_reais: number };
}

export function resumirVendas(vendas: readonly VendaDoDia[]): ResumoDeVendas {
  const soma = (f: VendaDoDia["forma"]) => {
    const dela = vendas.filter((v) => v.forma === f);
    return { qtd: dela.length, valor_reais: dela.reduce((s, v) => s + v.valor_reais, 0) };
  };
  return {
    qtd: vendas.length,
    valor_reais: vendas.reduce((s, v) => s + v.valor_reais, 0),
    hubla: soma("hubla"),
    fora_da_hubla: soma("fora_da_hubla"),
  };
}

export const formaDaVenda = (valor: unknown): VendaDoDia["forma"] => (valor === "hubla" || valor === "fora_da_hubla" ? valor : "nao_informada");

/** Tags que dizem de onde o lead veio: as de funil (funil-*) e as de campanha mais usadas. */
const ORIGENS_FIXAS = new Set(["workshop", "diagnostico", "clinica-prova-crises", "lp-ask10x", "ask10x"]);
export const SEM_ORIGEM = "sem-origem";

export const origensDoLead = (tags: readonly string[] | null | undefined): string[] => {
  const achadas = (tags ?? []).filter((t) => ORIGENS_FIXAS.has(t) || t.startsWith("funil-"));
  return achadas.length ? achadas : [SEM_ORIGEM];
};

export interface LeadParaOrigem {
  abordado: boolean;
  respondeu: boolean;
  tags: readonly string[] | null;
  venda_reais: number | null;
}
export interface ConversaoPorOrigem {
  origem: string;
  abordados: number;
  responderam: number;
  taxa_resposta: number | null;
  vendas: number;
  valor_reais: number;
}

export function conversaoPorOrigem(leads: readonly LeadParaOrigem[]): ConversaoPorOrigem[] {
  const mapa = new Map<string, { abordados: number; responderam: number; vendas: number; valor_reais: number }>();
  for (const l of leads) {
    for (const origem of origensDoLead(l.tags)) {
      const a = mapa.get(origem) ?? { abordados: 0, responderam: 0, vendas: 0, valor_reais: 0 };
      mapa.set(origem, {
        abordados: a.abordados + (l.abordado ? 1 : 0),
        responderam: a.responderam + (l.abordado && l.respondeu ? 1 : 0),
        vendas: a.vendas + (l.venda_reais != null ? 1 : 0),
        valor_reais: a.valor_reais + (l.venda_reais ?? 0),
      });
    }
  }
  return [...mapa.entries()]
    .map(([origem, a]) => ({ origem, ...a, taxa_resposta: a.abordados ? Math.round((a.responderam / a.abordados) * 100) : null }))
    .sort((x, y) => y.vendas - x.vendas || y.abordados - x.abordados);
}
