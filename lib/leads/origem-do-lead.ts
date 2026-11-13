/**
 * A ORIGEM DO LEAD NO CARD (Bruno, 12/11/2026): "origem da última entrada" e, quando for diferente, "primeira entrada".
 *
 * `source_metadata` guarda a origem do 1º cadastro (`utm_*`) e, para quem volta por um formulário, as entradas novas em
 * `entradas[]` e o resumo em `last_utm_*` (gatilho `trg_captura_soma_entrada`). Pura: o componente só desenha.
 */
type Metadados = Record<string, unknown>;

export interface OrigemDeEntrada {
  texto: string;
  data: string | null;
}

export interface OrigemDoLead {
  ultima: OrigemDeEntrada;
  primeira: OrigemDeEntrada | null;
}

const NOME_DA_FONTE: Record<string, string> = { meta: "Meta", instagram: "Instagram", facebook: "Facebook", google: "Google" };
export const SEM_UTM = "sem UTM (orgânico ou link direto)";

const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** "Meta · workshop-antes-depois · ws-011-preenchimento-labial-1112" (fonte · campanha · anúncio). */
export function rotuloDaOrigem(fonte: unknown, campanha: unknown, anuncio: unknown): string {
  const f = texto(fonte);
  const partes = [NOME_DA_FONTE[f.toLowerCase()] ?? f, texto(campanha), texto(anuncio)].filter(Boolean);
  return partes.length > 0 ? partes.join(" · ") : SEM_UTM;
}

export function origemDoLead(sm: Metadados | null | undefined, criadoEm: string | null): OrigemDoLead {
  const m: Metadados = sm ?? {};
  const primeiraTexto = rotuloDaOrigem(m.utm_source, m.utm_campaign, m.utm_content);
  const primeira: OrigemDeEntrada = { texto: primeiraTexto, data: criadoEm };
  const teveEntradaNova = typeof m.last_entrada_em === "string" && m.last_entrada_em !== "";
  if (!teveEntradaNova) return { ultima: primeira, primeira: null };
  const ultima: OrigemDeEntrada = {
    texto: rotuloDaOrigem(m.last_utm_source, m.last_utm_campaign, m.last_utm_content),
    data: m.last_entrada_em as string,
  };
  return { ultima, primeira: ultima.texto === primeira.texto ? null : primeira };
}
