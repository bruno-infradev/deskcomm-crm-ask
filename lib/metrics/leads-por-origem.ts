/**
 * Leads por dia (São Paulo) e por origem. A origem vem de `source_metadata.origem`; sem ela, "sem-origem-de-anuncio".
 * Lead com a tag `teste` não conta.
 */
export interface LeadParaOrigem {
  created_at: string;
  tags: string[] | null;
  source_metadata: Record<string, unknown> | null;
  crm_stages?: { name: string } | { name: string }[] | null;
}
export const ORIGEM_PADRAO = "sem-origem-de-anuncio";

export interface DiaDeLeads {
  dia: string;
  total: number;
  por_origem: Record<string, number>;
}
export interface LeadsPorOrigem {
  dias: DiaDeLeads[];
  origens: string[];
  total: number;
  por_origem: Record<string, number>;
  por_etapa: Record<string, number>;
}

const diaEmSP = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const DIA_MS = 24 * 60 * 60 * 1000;

export function leadsPorDiaEOrigem(leads: readonly LeadParaOrigem[], dias: number, agoraMs: number = Date.now()): LeadsPorOrigem {
  const lista = Array.from({ length: dias }, (_, i) => diaEmSP(new Date(agoraMs - i * DIA_MS).toISOString())).reverse();
  const porDia = new Map<string, DiaDeLeads>(lista.map((dia) => [dia, { dia, total: 0, por_origem: {} }]));
  const porOrigem: Record<string, number> = {};
  const porEtapa: Record<string, number> = {};
  let total = 0;
  for (const l of leads) {
    if ((l.tags ?? []).includes("teste")) continue;
    const celula = porDia.get(diaEmSP(l.created_at));
    if (!celula) continue;
    const origem = typeof l.source_metadata?.origem === "string" && l.source_metadata.origem ? l.source_metadata.origem : ORIGEM_PADRAO;
    celula.total += 1;
    celula.por_origem[origem] = (celula.por_origem[origem] ?? 0) + 1;
    porOrigem[origem] = (porOrigem[origem] ?? 0) + 1;
    const etapa = Array.isArray(l.crm_stages) ? l.crm_stages[0]?.name : l.crm_stages?.name;
    if (etapa) porEtapa[etapa] = (porEtapa[etapa] ?? 0) + 1;
    total += 1;
  }
  return { dias: [...porDia.values()], origens: Object.keys(porOrigem).sort(), total, por_origem: porOrigem, por_etapa: porEtapa };
}
