/**
 * As respostas do popup das páginas (fork ASK, T-20261111-01): se tem clínica, se atua com injetáveis,
 * área de atuação e faixa de faturamento.
 *
 * Elas moram em `crm_leads.custom_fields` (jsonb), e cada funil gravou com chaves e valores diferentes:
 *   - popup do workshop (`lp-workshop`): possui_clinica, atua_injetaveis, faturamento_lp, profissao e especialidade;
 *   - formulário de qualificação: tem_clinica, faturamento_mensal, especialidade.
 * Aqui a normalização é na LEITURA: o dado original não é tocado. A área vira um grupo pequeno
 * (Médico(a), Dentista, Biomédico(a), Enfermeiro(a), Outra); a clínica e os injetáveis viram Sim/Não;
 * o faturamento segue com o texto real de cada página (os cortes das faixas diferem entre elas).
 */
import type { Lead } from "@/lib/types/leads";

export const CHAVES_DE_RESPOSTA = ["clinica", "injetaveis", "area", "faturamento"] as const;
export type ChaveDeResposta = (typeof CHAVES_DE_RESPOSTA)[number];

export const ROTULO_DA_RESPOSTA: Record<ChaveDeResposta, string> = {
  clinica: "Tem clínica",
  injetaveis: "Atua com injetáveis",
  area: "Área de atuação",
  faturamento: "Faturamento",
};

export type RespostasDoPopup = Partial<Record<ChaveDeResposta, string>>;

const CHAVES_DE_ORIGEM: Record<ChaveDeResposta, readonly string[]> = {
  clinica: ["possui_clinica", "tem_clinica"],
  injetaveis: ["atua_injetaveis"],
  area: ["profissao", "especialidade"],
  faturamento: ["faturamento_lp", "faturamento_mensal"],
};

const texto = (valor: unknown): string => (typeof valor === "string" ? valor.trim() : "");

function primeiroTexto(campos: Record<string, unknown>, chaves: readonly string[]): string {
  for (const chave of chaves) {
    const valor = texto(campos[chave]);
    if (valor) return valor;
  }
  return "";
}

/** "sim" / "Sim" / "não" / "Não" / "não informado". Qualquer outra coisa não vira resposta. */
function simOuNao(bruto: string): string | undefined {
  const v = bruto.toLowerCase();
  if (v === "sim") return "Sim";
  if (v === "não" || v === "nao") return "Não";
  if (v.startsWith("não informado") || v.startsWith("nao informado")) return "Não informado";
  return undefined;
}

/** A área de atuação em grupos. A ordem das regras importa: odonto e biomedicina antes de "medic". */
export function grupoDaArea(bruto: string): string | undefined {
  const v = bruto.toLowerCase();
  if (!v) return undefined;
  if (v.startsWith("outro")) return "Outra";
  if (/odonto|dentist/.test(v)) return "Dentista";
  if (/biom[eé]d/.test(v)) return "Biomédico(a)";
  if (/enfermei/.test(v)) return "Enfermeiro(a)";
  if (/m[eé]dic|dermato|endocrin|nutr[oó]log|cirurgi|ginecolog|pediatr|cardiolog|ortoped|oftalm|psiquiatr|anestesi/.test(v)) {
    return "Médico(a)";
  }
  return "Outra";
}

export function respostasDoPopup(lead: Pick<Lead, "custom_fields">): RespostasDoPopup {
  const campos = (lead.custom_fields ?? {}) as Record<string, unknown>;
  const resposta: RespostasDoPopup = {};
  const clinica = simOuNao(primeiroTexto(campos, CHAVES_DE_ORIGEM.clinica));
  if (clinica) resposta.clinica = clinica;
  const injetaveis = simOuNao(primeiroTexto(campos, CHAVES_DE_ORIGEM.injetaveis));
  if (injetaveis) resposta.injetaveis = injetaveis;
  const area = grupoDaArea(primeiroTexto(campos, CHAVES_DE_ORIGEM.area));
  if (area) resposta.area = area;
  const faturamento = primeiroTexto(campos, CHAVES_DE_ORIGEM.faturamento);
  if (faturamento) resposta.faturamento = faturamento;
  return resposta;
}

/** Primeiro número da faixa ("R$ 100 a 500 mil" → 100; "Até R$ 50 mil" → 0; "Acima de 100 mil" → 100), para ordenar as opções. */
function pisoDaFaixa(faixa: string): number {
  if (/^at[eé]/i.test(faixa)) return 0;
  const m = faixa.match(/\d+/);
  return m ? Number(m[0]) : Number.MAX_SAFE_INTEGER;
}

/** Os valores que existem nos leads carregados, para as opções do filtro. Faturamento ordenado por faixa, o resto por nome. */
export function opcoesDaResposta(leads: readonly Pick<Lead, "custom_fields">[], chave: ChaveDeResposta): string[] {
  const valores = new Set<string>();
  for (const lead of leads) {
    const valor = respostasDoPopup(lead)[chave];
    if (valor) valores.add(valor);
  }
  const lista = Array.from(valores);
  return chave === "faturamento"
    ? lista.sort((a, b) => pisoDaFaixa(a) - pisoDaFaixa(b) || a.localeCompare(b, "pt-BR"))
    : lista.sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export type FiltroDeRespostas = Partial<Record<ChaveDeResposta, readonly string[]>>;

/** Dentro de uma pergunta vale OU (qualquer valor marcado); entre perguntas vale E. Lead sem a resposta não passa quando a pergunta está filtrada. */
export function passaNasRespostas(lead: Pick<Lead, "custom_fields">, filtro: FiltroDeRespostas | undefined): boolean {
  if (!filtro) return true;
  const respostas = respostasDoPopup(lead);
  for (const chave of CHAVES_DE_RESPOSTA) {
    const escolhidos = filtro[chave];
    if (!escolhidos || escolhidos.length === 0) continue;
    const valor = respostas[chave];
    if (!valor || !escolhidos.includes(valor)) return false;
  }
  return true;
}
