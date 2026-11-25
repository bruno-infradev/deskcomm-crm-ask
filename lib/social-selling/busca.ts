/**
 * Busca de perfis do social selling (fork ASK, Bruno 25/11/2026). Funções puras: o motor (Apify) e o banco ficam nas rotas.
 * Público definido na call de 20/11: médicos com margem de crescimento, até ~30 mil seguidores; fora dentista, biomédico,
 * professor de faculdade, perfil "modelo" e quem já é gigante.
 */
import type { ESPECIALIDADES } from "@/lib/metrics/social-selling";

export const LIMITE_DIARIO_PADRAO = 20;
export const VALIDADE_CACHE_DIAS = 7;
export const SEGUIDORES_MAXIMO = 30000;
export const SEGUIDORES_IDEAL = 20000;
export const PRODUTOS = ["Workshop", "Acelerador", "Mentoria"] as const;
export type Produto = (typeof PRODUTOS)[number];
export type Especialidade = (typeof ESPECIALIDADES)[number];

export interface PerfilBruto {
  username: string;
  fullName?: string | null;
  biography?: string | null;
  followersCount?: number | null;
  private?: boolean | null;
  verified?: boolean | null;
  isBusinessAccount?: boolean | null;
  externalUrls?: unknown[] | null;
  latestPosts?: Array<{ timestamp?: string | null; caption?: string | null }> | null;
  url?: string | null;
}

export interface PerfilAvaliado {
  username: string;
  nome: string;
  bio: string;
  seguidores: number | null;
  especialidade: string;
  cidade: string;
  registro: string;
  nota: number;
  motivo: string;
  produto: Produto;
  link: string;
  ultimo_post: string | null;
  mensagem: string;
  versao_roteiro: string;
  privado: boolean;
}

/** Palavra de busca no Instagram para cada especialidade do rodízio. */
export const TERMO_POR_ESPECIALIDADE: Record<string, string> = {
  Dermatologia: "dermatologista",
  "Medicina estética": "medicina estética",
  "Emagrecimento e nutrologia": "nutrólogo emagrecimento",
  Ginecologia: "ginecologista",
  Oftalmologia: "oftalmologista",
  Otorrinolaringologia: "otorrinolaringologista",
  Urologia: "urologista",
  "Cirurgia plástica": "cirurgião plástico",
  "Medicina do esporte": "medicina do esporte",
};

const REGRAS_ESPECIALIDADE: Array<[string, RegExp]> = [
  ["Emagrecimento e nutrologia", /nutr[oó]log|emagrec|obesidade/i],
  ["Cirurgia plástica", /cirurgi[aã]o?\s*pl[aá]stic|cirurgia pl[aá]stica/i],
  ["Oftalmologia", /oftalmo|blefaro/i],
  ["Otorrinolaringologia", /otorrino/i],
  ["Urologia", /urolog/i],
  ["Ginecologia", /ginecolog|obstetr|[ií]ntim/i],
  ["Medicina do esporte", /medicina do esporte|m[eé]dic[oa] do esporte|ortopedi/i],
  ["Dermatologia", /dermato/i],
  ["Medicina estética", /medicina est[eé]tica|harmoniza[cç][aã]o|m[eé]dic[oa] esteta|est[eé]tica avan/i],
];
const SINAL_MEDICO = /\bm[eé]dic[oa]\b|\bdra?\.?\s|\bdr\.|\bcrm\b|\brqe\b|dermatologista|ginecologista|oftalmologista|otorrino|urologista|nutr[oó]log|cirurgi[aã]o/i;
const EXCLUIDOS: Array<[string, RegExp]> = [
  ["dentista", /dentista|odonto|cirurgi[aã]o?[- ]dentista|\bcro\b/i],
  ["biomédico ou não médico", /biom[eé]dic|esteticista|fisioterap|nutricionista|enfermeir|farmac[eê]utic|psic[oó]log|tricologista capilar/i],
  ["perfil de modelo ou influencer", /\bmodelo\b|influenc|digital creator|blogueir/i],
];
const SINAL_PROFESSOR = /professor[a]? (da|de) (faculdade|universidade)|docente|titular da/i;
const PROCEDIMENTOS = ["botox", "toxina", "preenchimento", "harmoniza", "laser", "peeling", "bioestimulador", "blefaroplastia", "rejuvenescimento", "íntimo", "skinbooster", "fios", "lipo", "emagrecimento"];
const INJETAVEIS = /botox|toxina|preenchimento|harmoniza|bioestimulador|injet[aá]vel|[aá]cido hialur/i;
const DONA_DE_CLINICA = /\bcl[ií]nica\b|diretor[a]?|\bceo\b|fundador[a]?|propriet[aá]ri/i;
const REGISTRO = /(CRM[\s/-]*[A-Z]{0,2}[\s:-]*\d[\d.]*(?:\s*(?:\/|-|e)?\s*RQE[\s:-]*\d[\d.]*)?|RQE[\s:-]*\d[\d.]*)/i;
const CIDADE_UF = /(?:em|·|\||-|—|📍)\s*([A-ZÀ-Ú][\p{L}'. ]{2,30})\s*[-–/|,]\s*([A-Z]{2})\b/u;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

export const normalizar = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
export const limparUsername = (u: string): string => u.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/[/?#].*$/, "").toLowerCase();

export function montarTermo(entrada: { especialidade?: string; cidade?: string; palavra?: string }): string {
  const base = entrada.especialidade ? TERMO_POR_ESPECIALIDADE[entrada.especialidade] ?? "" : "";
  const palavra = (entrada.palavra ?? "").replace(/^#/, "").trim();
  return [base, palavra, (entrada.cidade ?? "").trim()].filter(Boolean).join(" ").slice(0, 120);
}

export const chaveDeCache = (termo: string): string => `user:${normalizar(termo)}`;
export const cacheValido = (criadoEm: string, agora: Date = new Date()): boolean =>
  agora.getTime() - new Date(criadoEm).getTime() < VALIDADE_CACHE_DIAS * MS_POR_DIA;

/** Cota: quantos perfis o vendedor ainda pode receber hoje. */
export const restanteDaCota = (usados: number, limite: number): number => Math.max(0, limite - usados);

export function detectarEspecialidade(texto: string, preferida?: string): string {
  for (const [nome, regra] of REGRAS_ESPECIALIDADE) if (regra.test(texto)) return nome;
  return preferida ?? "Outra";
}

export function sugerirProduto(especialidade: string, texto: string): Produto {
  if (especialidade === "Emagrecimento e nutrologia") return "Mentoria";
  if (["Ginecologia", "Oftalmologia", "Otorrinolaringologia", "Urologia", "Medicina do esporte"].includes(especialidade)) return "Acelerador";
  if (DONA_DE_CLINICA.test(texto) && !INJETAVEIS.test(texto)) return "Acelerador";
  return INJETAVEIS.test(texto) ? "Workshop" : "Acelerador";
}

function procedimentoDoTexto(texto: string): string {
  const t = texto.toLowerCase();
  return PROCEDIMENTOS.find((p) => t.includes(p)) ?? "";
}

/** 1ª mensagem no método de 3 passos, usando só os roteiros aprovados (C5, P3, A1). Os [DIA]/[HORA] ficam para o vendedor. */
export function montarMensagem(p: { nome: string; especialidade: string; produto: Produto; bio: string; ultimoPostEm: string | null }): { versao: string; texto: string } {
  const primeiro = p.nome.split(/[|·\-–]/)[0]?.trim() ?? p.nome;
  const procedimento = procedimentoDoTexto(p.bio) || p.especialidade.toLowerCase();
  const destaque = p.ultimoPostEm ? "o seu último post" : "o seu perfil";
  const conexao = `Oi, ${primeiro}! Passei pelo seu perfil e vi ${destaque}. Que trabalho bonito! Há quanto tempo você atende com ${procedimento}?`;
  const problema = "Esse procedimento é o que mais sai aí hoje, ou tem algum que você queria que saísse mais?";
  const convite = "Faz muito sentido o que você falou. Isso é muito comum em quem está crescendo, e tem caminho. Se eu separar 30 minutos para a gente olhar isso juntos, faria sentido para você? Tenho [DIA] às [HORA] ou [DIA] às [HORA].";
  return { versao: "C5", texto: `1) Conexão (C5):\n${conexao}\n\n2) Problema (P3), só depois que ela responder:\n${problema}\n\n3) Chamada para a conversa (A1), só depois que ela contar o problema:\n${convite}\n\nProduto sugerido: ${p.produto}.` };
}

const seguidoresDe = (p: PerfilBruto): number | null => (typeof p.followersCount === "number" ? p.followersCount : null);

function ultimoPostEm(p: PerfilBruto): string | null {
  const datas = (p.latestPosts ?? []).map((x) => x.timestamp).filter((x): x is string => Boolean(x)).sort();
  return datas.length ? (datas[datas.length - 1] ?? null) : null;
}

export interface Exclusao { username: string; motivo: string }

/** Pontua um perfil de 0 a 10 com o motivo, ou devolve a razão de exclusão. */
export function avaliarPerfil(p: PerfilBruto, opcoes: { especialidade?: string; cidade?: string; agora?: Date } = {}): { perfil: PerfilAvaliado } | { exclusao: Exclusao } {
  const username = limparUsername(p.username ?? "");
  const nome = (p.fullName ?? "").trim();
  const bio = (p.biography ?? "").trim();
  const texto = `${nome}\n${bio}`;
  const fora = (motivo: string) => ({ exclusao: { username, motivo } });
  if (!username) return fora("sem usuário");
  for (const [rotulo, regra] of EXCLUIDOS) if (regra.test(texto) && !/\bm[eé]dic[oa]\b/i.test(texto)) return fora(`fora do público (${rotulo})`);
  if (EXCLUIDOS[0] && EXCLUIDOS[0][1].test(texto)) return fora("fora do público (dentista)");
  if (!SINAL_MEDICO.test(texto)) return fora("não parece médico (sem médico, Dr., Dra., CRM ou RQE na bio)");
  const seguidores = seguidoresDe(p);
  if (seguidores !== null && seguidores > SEGUIDORES_MAXIMO) return fora(`já grande (${seguidores} seguidores, acima de ${SEGUIDORES_MAXIMO})`);
  if (SINAL_PROFESSOR.test(bio)) return fora("professor de faculdade");

  const motivos: string[] = ["médico pela bio (+3)"];
  let nota = 3;
  const registro = REGISTRO.exec(texto)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
  if (registro) { nota += 1; motivos.push("CRM ou RQE na bio (+1)"); }
  const especialidade = detectarEspecialidade(texto, opcoes.especialidade);
  if (especialidade !== "Outra") { nota += 2; motivos.push(`especialidade alvo: ${especialidade} (+2)`); }
  if (seguidores !== null) {
    if (seguidores <= SEGUIDORES_IDEAL) { nota += 2; motivos.push(`${seguidores} seguidores, faixa com margem (+2)`); }
    else { nota += 1; motivos.push(`${seguidores} seguidores, perto do teto (+1)`); }
  }
  const semLink = !(p.externalUrls && p.externalUrls.length > 0);
  if (semLink) { nota += 1; motivos.push("sem link na bio, funil fraco (+1)"); }
  const ultimo = ultimoPostEm(p);
  const agora = (opcoes.agora ?? new Date()).getTime();
  if (ultimo && agora - new Date(ultimo).getTime() > 30 * MS_POR_DIA) { nota += 1; motivos.push("último post há mais de 30 dias, conteúdo parado (+1)"); }
  if (procedimentoDoTexto(texto)) { nota += 1; motivos.push("cita procedimento estético na bio (+1)"); }
  nota = Math.min(10, nota);

  const cidadeBio = CIDADE_UF.exec(texto);
  const cidade = cidadeBio ? `${cidadeBio[1]?.trim()}/${cidadeBio[2]}` : (opcoes.cidade ?? "");
  const produto = sugerirProduto(especialidade, texto);
  const { versao, texto: mensagem } = montarMensagem({ nome: nome || username, especialidade, produto, bio, ultimoPostEm: ultimo });
  return {
    perfil: {
      username, nome, bio, seguidores, especialidade, cidade, registro, nota, motivo: motivos.join("; "), produto,
      link: p.url ?? `https://www.instagram.com/${username}/`, ultimo_post: ultimo, mensagem, versao_roteiro: versao, privado: Boolean(p.private),
    },
  };
}

/** Avalia a lista, tira repetidos e quem já está na base, e ordena por nota. */
export function filtrarEPontuar(brutos: readonly PerfilBruto[], jaConhecidos: ReadonlySet<string>, opcoes: { especialidade?: string; cidade?: string; agora?: Date } = {}) {
  const vistos = new Set<string>();
  const perfis: PerfilAvaliado[] = [];
  const excluidos: Exclusao[] = [];
  for (const bruto of brutos) {
    const usuario = limparUsername(bruto.username ?? "");
    if (!usuario || vistos.has(usuario)) continue;
    vistos.add(usuario);
    if (jaConhecidos.has(usuario)) { excluidos.push({ username: usuario, motivo: "já está no CRM ou já foi abordado" }); continue; }
    const r = avaliarPerfil(bruto, opcoes);
    if ("perfil" in r) perfis.push(r.perfil); else excluidos.push(r.exclusao);
  }
  perfis.sort((a, b) => b.nota - a.nota || (a.seguidores ?? 0) - (b.seguidores ?? 0));
  return { perfis, excluidos };
}

/** Status que alimentam os números da aba: cada passo à frente soma 1 no lançamento do dia, uma única vez. */
export const STATUS_PROSPECTO = ["fila", "abordado", "respondeu", "reuniao", "descartado"] as const;
export type StatusProspecto = (typeof STATUS_PROSPECTO)[number];
export const CAMPO_POR_STATUS: Partial<Record<StatusProspecto, "mensagens_enviadas" | "respostas" | "agendamento">> = {
  abordado: "mensagens_enviadas",
  respondeu: "respostas",
  reuniao: "agendamento",
};
