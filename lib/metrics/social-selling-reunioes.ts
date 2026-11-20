/**
 * Reuniões do social selling (fork ASK, T-20261120-001, pedido do Bruno em 20/11/2026 a partir da call com o Ângelo e a Gabi):
 * cada reunião tem vendedor, data, lead, especialidade, versão do roteiro, se foi gravada (e o link) e o resultado.
 * Funções puras: a rota lê e grava, aqui só se agrupa e conta.
 */

export const RESULTADOS = ["marcada", "no_show", "feita", "proposta", "venda"] as const;
export type Resultado = (typeof RESULTADOS)[number];

export const ROTULO_RESULTADO: Record<Resultado, string> = {
  marcada: "Marcada",
  no_show: "No-show",
  feita: "Feita, sem proposta",
  proposta: "Proposta enviada",
  venda: "Venda",
};

export interface Reuniao {
  id: string;
  user_id: string | null;
  dia: string; // AAAA-MM-DD
  lead: string;
  contato: string; // telefone ou @ do lead
  link_zoom: string; // link do agendamento no Zoom
  especialidade: string;
  versao_roteiro: string;
  gravada: boolean;
  link_gravacao: string;
  resultado: Resultado;
  obs: string;
}

export interface ResumoReunioes {
  marcadas: number; // todas as reuniões lançadas
  feitas: number; // aconteceram: feita, proposta ou venda
  no_show: number;
  propostas: number; // proposta ou venda
  vendas: number;
  gravadas: number;
  comparecimento: number | null; // feitas / (feitas + no-show)
}

export const SEM_VERSAO = "Sem versão";
export const SEM_ESPECIALIDADE_REUNIAO = "Sem especialidade";

const porcento = (parte: number, base: number): number | null => (base > 0 ? Math.round((parte / base) * 100) : null);

export function resumir(reunioes: readonly Reuniao[]): ResumoReunioes {
  const feitas = reunioes.filter((r) => r.resultado === "feita" || r.resultado === "proposta" || r.resultado === "venda").length;
  const noShow = reunioes.filter((r) => r.resultado === "no_show").length;
  return {
    marcadas: reunioes.length,
    feitas,
    no_show: noShow,
    propostas: reunioes.filter((r) => r.resultado === "proposta" || r.resultado === "venda").length,
    vendas: reunioes.filter((r) => r.resultado === "venda").length,
    gravadas: reunioes.filter((r) => r.gravada).length,
    comparecimento: porcento(feitas, feitas + noShow),
  };
}

export interface GrupoDeReunioes {
  chave: string;
  resumo: ResumoReunioes;
}

/** Agrupa e resume por uma chave; ordena por vendas, depois propostas, depois reuniões feitas (a que mais rende primeiro). */
export function agrupar(reunioes: readonly Reuniao[], chave: (r: Reuniao) => string): GrupoDeReunioes[] {
  const grupos: Record<string, Reuniao[]> = {};
  for (const r of reunioes) (grupos[chave(r)] ??= []).push(r);
  return Object.entries(grupos)
    .map(([k, v]) => ({ chave: k, resumo: resumir(v) }))
    .sort((a, b) => b.resumo.vendas - a.resumo.vendas || b.resumo.propostas - a.resumo.propostas || b.resumo.feitas - a.resumo.feitas || a.chave.localeCompare(b.chave));
}

export const porEspecialidade = (r: readonly Reuniao[]) => agrupar(r, (x) => x.especialidade || SEM_ESPECIALIDADE_REUNIAO);
export const porVersao = (r: readonly Reuniao[]) => agrupar(r, (x) => x.versao_roteiro.trim() || SEM_VERSAO);
export const porVendedor = (r: readonly Reuniao[]) => agrupar(r, (x) => x.user_id ?? "equipe");
