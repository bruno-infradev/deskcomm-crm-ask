/**
 * Motor de busca de perfis (Apify, dado público). Dois passos, porque a busca sozinha não traz bio nem seguidores:
 * 1) apify/instagram-search-scraper (liveSearch, ~4 s, ~US$ 0,0023 por perfil) acha usuários pelo termo;
 * 2) apify/instagram-profile-scraper (~1 min para 20, ~US$ 0,0023 por perfil) traz bio, seguidores e últimos posts.
 * Só enriquece quem ainda não está na base e não é excluído pelo nome (dentista, biomédico...), para gastar menos.
 */
import { nomeForaDoPublico, limparUsername, type PerfilBruto } from "./busca";

const URL_BASE = "https://api.apify.com/v2/acts";
const TIMEOUT_BUSCA_S = 40;
const TIMEOUT_PERFIS_S = 100;
export const RESULTADOS_POR_BUSCA = 20;

export class ApifyIndisponivel extends Error {}

async function rodar(ator: string, entrada: object, timeoutS: number, token: string, fetchFn: typeof fetch): Promise<unknown[]> {
  const resposta = await fetchFn(`${URL_BASE}/${ator}/run-sync-get-dataset-items?timeout=${timeoutS}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(entrada),
    signal: AbortSignal.timeout((timeoutS + 15) * 1000),
  });
  if (!resposta.ok) {
    const detalhe = (await resposta.text().catch(() => "")).slice(0, 300);
    if (resposta.status === 402 || /limit|usage|credit/i.test(detalhe)) throw new ApifyIndisponivel("O limite mensal do Apify acabou. A busca volta quando o limite for renovado ou subir.");
    if (/TIMED-OUT/i.test(detalhe)) throw new ApifyIndisponivel("O Instagram demorou demais para responder. Tente de novo em instantes.");
    throw new ApifyIndisponivel(`O motor de busca respondeu ${resposta.status}.`);
  }
  const itens = (await resposta.json().catch(() => null)) as unknown;
  if (!Array.isArray(itens)) throw new ApifyIndisponivel("O motor de busca devolveu uma resposta inesperada.");
  return itens;
}

export async function buscarPerfisNoApify(termo: string, token: string | undefined, jaConhecidos: ReadonlySet<string>, fetchFn: typeof fetch = fetch): Promise<PerfilBruto[]> {
  if (!token) throw new ApifyIndisponivel("Motor de busca não configurado (APIFY_TOKEN ausente no servidor).");
  const achados = (await rodar("apify~instagram-search-scraper", { search: termo, searchType: "user", searchLimit: RESULTADOS_POR_BUSCA, liveSearch: true }, TIMEOUT_BUSCA_S, token, fetchFn)) as Array<{ username?: string; fullName?: string }>;
  const usuarios = [...new Set(
    achados
      .filter((a) => typeof a?.username === "string" && !nomeForaDoPublico(a.fullName ?? ""))
      .map((a) => limparUsername(a.username as string))
      .filter((u) => u && !jaConhecidos.has(u)),
  )].slice(0, RESULTADOS_POR_BUSCA);
  if (usuarios.length === 0) return [];
  const perfis = await rodar("apify~instagram-profile-scraper", { usernames: usuarios }, TIMEOUT_PERFIS_S, token, fetchFn);
  return perfis.filter((i): i is PerfilBruto => typeof (i as PerfilBruto)?.username === "string");
}
