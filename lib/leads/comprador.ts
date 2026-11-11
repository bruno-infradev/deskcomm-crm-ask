/**
 * Comprador de produto da ASK (fork ASK, pedido do Bruno em 11/11/2026): quem comprou Workshop, Mentoria ou Acelerador
 * ganha destaque no card para o comercial não abordar como lead novo, só para ascensão.
 *
 * A marca é a etiqueta da PESSOA (`contacts.tags`, chega ao card como `contact_tags`) ou do negócio, gravada pelo
 * sincronismo do OS com as vendas pagas da Hubla (`comprador-workshop`, `comprador-mentoria`, `comprador-acelerador`).
 * `compradores-mentoria` é a etiqueta antiga, escrita à mão antes do sincronismo, e vale igual.
 */
import type { Lead } from "@/lib/types/leads";
import { marcadoresDoCard } from "@/lib/kanban/marcadores-do-card";

const PRODUTO_DA_ETIQUETA: Record<string, string> = {
  "comprador-workshop": "Workshop",
  "comprador-mentoria": "Mentoria",
  "compradores-mentoria": "Mentoria",
  "comprador-acelerador": "Acelerador",
};

export const ORDEM_DOS_PRODUTOS = ["Mentoria", "Acelerador", "Workshop"] as const;

/** Os produtos comprados, sem repetição, na ordem fixa (o de maior valor primeiro). Vazio = não é comprador. */
export function produtosComprados(lead: Lead): string[] {
  const produtos = new Set<string>();
  for (const marcador of marcadoresDoCard(lead)) {
    const produto = PRODUTO_DA_ETIQUETA[marcador.trim().toLowerCase()];
    if (produto) produtos.add(produto);
  }
  return ORDEM_DOS_PRODUTOS.filter((p) => produtos.has(p));
}
