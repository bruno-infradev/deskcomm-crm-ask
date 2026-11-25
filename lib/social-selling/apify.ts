/** Chamada ao Apify (apify/instagram-search-scraper, tipo "user"): dado público de perfis. Custo ~US$ 0,0023 por perfil. */
import type { PerfilBruto } from "./busca";

const ATOR = "apify~instagram-search-scraper";
const TIMEOUT_SEGUNDOS = 55;
export const RESULTADOS_POR_BUSCA = 20;

export class ApifyIndisponivel extends Error {}

export async function buscarPerfisNoApify(termo: string, token: string | undefined, fetchFn: typeof fetch = fetch): Promise<PerfilBruto[]> {
  if (!token) throw new ApifyIndisponivel("Motor de busca não configurado (APIFY_TOKEN ausente no servidor).");
  const url = `https://api.apify.com/v2/acts/${ATOR}/run-sync-get-dataset-items?timeout=${TIMEOUT_SEGUNDOS}`;
  const resposta = await fetchFn(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ search: termo, searchType: "user", searchLimit: RESULTADOS_POR_BUSCA }),
    signal: AbortSignal.timeout((TIMEOUT_SEGUNDOS + 10) * 1000),
  });
  if (!resposta.ok) {
    const detalhe = (await resposta.text().catch(() => "")).slice(0, 200);
    throw new ApifyIndisponivel(resposta.status === 402 || /limit|usage/i.test(detalhe) ? "O limite mensal do Apify acabou. A busca volta quando o limite for renovado ou subir." : `O motor de busca respondeu ${resposta.status}.`);
  }
  const itens = (await resposta.json().catch(() => null)) as unknown;
  if (!Array.isArray(itens)) throw new ApifyIndisponivel("O motor de busca devolveu uma resposta inesperada.");
  return itens.filter((i): i is PerfilBruto => typeof (i as PerfilBruto)?.username === "string");
}
