/**
 * Link de venda com os UTMs do vendedor (fork ASK, T-20261111-06, pedido do Bruno em 11/11/2026): o botão Copiar entrega o
 * link da Hubla já com `utm_source=crm&utm_medium=whatsapp&utm_campaign=<produto-valor>&utm_content=<vendedor>`, para a venda
 * ficar atribuída a quem mandou o link.
 */
const SEM_ACENTO = /[̀-ͯ]/g;

export function slugDe(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(SEM_ACENTO, "")
    .toLowerCase()
    .replace(/r\$\s*/g, "")
    .replace(/(\d)\.(\d{3})/g, "$1$2")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** O vendedor como entra no `utm_content`: nome sem acento, minúsculo, hífen no lugar do espaço ("João Paulo" vira "joao-paulo"). */
export const slugDoVendedor = (nomeOuEmail: string): string => slugDe(nomeOuEmail.includes("@") ? (nomeOuEmail.split("@")[0] ?? "").replace(/\./g, " ") : nomeOuEmail);

export function linkComUtm(url: string, produto: string, rotulo: string, vendedor: string): string {
  const u = new URL(url);
  u.searchParams.set("utm_source", "crm");
  u.searchParams.set("utm_medium", "whatsapp");
  u.searchParams.set("utm_campaign", `${slugDe(produto)}-${slugDe(rotulo)}`);
  u.searchParams.set("utm_content", vendedor);
  return u.toString();
}
