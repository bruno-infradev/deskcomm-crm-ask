/**
 * GET/PUT /api/v1/social-selling (fork ASK, T-20261120-001, pedido do Bruno em 20/11/2026).
 * GET ?dia=AAAA-MM-DD: a semana (seg a sex) com total do dia, total da semana e por vendedor. Todos da organização veem os lançamentos
 * de todos (Bruno, 20/11: "eles podem ver um do outro, sem problemas"). PUT: grava o dia de um vendedor (upsert). Vendedor só grava o dele, no máximo 14 dias para trás
 * e nunca no futuro; manager+ grava de qualquer vendedor, em qualquer dia passado. A org vem da org ativa (cookie), nunca do body.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { isServiceRoleConfigured } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK } from "@/lib/auth/types";
import { diasDaSemana, ESPECIALIDADES, montarSemana, type LancamentoDoDia } from "@/lib/metrics/social-selling";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const TABELA = "social_selling_diario" as never;
const MAX_CONTAGEM = 100000;
const DIAS_PARA_TRAS_DO_VENDEDOR = 14;
const MS_POR_DIA = 24 * 60 * 60 * 1000;
const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const contagem = z.number().int().min(0).max(MAX_CONTAGEM);

const querySchema = z.object({ dia: dataIso.optional() });
const putSchema = z
  .object({
    dia: dataIso,
    user_id: z.string().uuid().optional(),
    especialidade: z.enum(ESPECIALIDADES),
    versao_roteiro: z.string().trim().max(20).default(""),
    mensagens_enviadas: contagem,
    respostas: contagem,
    whatsapp: contagem,
    agendamento: contagem,
    no_show: contagem,
    obs: z.string().max(1000).default(""),
  })
  .strict();

const hojeEmSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

interface Linha {
  user_id: string | null;
  dia: string;
  especialidade: string;
  versao_roteiro: string;
  mensagens_enviadas: number;
  respostas: number;
  whatsapp: number;
  agendamento: number;
  no_show: number;
  obs: string;
}

const nomeDoUsuario = (u: { email?: string | null; user_metadata?: Record<string, unknown> } | null | undefined): string =>
  (u?.user_metadata?.full_name as string | undefined) ?? u?.email ?? "Sem nome";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "social_selling" });
  if (!authz.ok) return authz.response;
  if (!isServiceRoleConfigured()) return fail("service_unavailable", "Leitura administrativa não configurada.", 503, { requestId });
  const parsed = querySchema.safeParse({ dia: new URL(req.url).searchParams.get("dia") ?? undefined });
  if (!parsed.success) return fail("validation_failed", "Query inválida.", 422, { details: parsed.error.flatten().fieldErrors as Record<string, unknown>, requestId });

  const lancaDeTodos = ROLE_RANK[authz.org.role] >= ROLE_RANK.manager;
  const dia = parsed.data.dia ?? hojeEmSP();
  const datas = diasDaSemana(dia);
  const admin = createAdminClient();
  const consulta = admin
    .from(TABELA)
    .select("user_id, dia, especialidade, versao_roteiro, mensagens_enviadas, respostas, whatsapp, agendamento, no_show, obs")
    .eq("organization_id", authz.org.orgId)
    .gte("dia", datas[0])
    .lte("dia", datas[datas.length - 1]);
  const { data, error } = await consulta;
  if (error) return fail("internal_error", (error as { message: string }).message, 500, { requestId });

  const linhas = (data ?? []) as unknown as Linha[];
  const lancamentos: LancamentoDoDia[] = linhas.map((l) => ({ ...l }));
  const semana = montarSemana(dia, lancamentos);

  const ids = [...new Set([authz.user.id, ...linhas.map((l) => l.user_id).filter((id): id is string => Boolean(id))])];
  const nomes: Record<string, string> = {};
  await Promise.all(ids.map(async (id) => { const { data: u } = await admin.auth.admin.getUserById(id); nomes[id] = nomeDoUsuario(u?.user); }));

  return ok({ dia, semana, nomes, especialidades: ESPECIALIDADES, eu: { user_id: authz.user.id, papel: authz.org.role, pode_ver_todos: true, pode_lancar_de_todos: lancaDeTodos }, lancamentos: linhas }, { requestId });
}

export async function PUT(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "social_selling" });
  if (!authz.ok) return authz.response;
  if (!isServiceRoleConfigured()) return fail("service_unavailable", "Escrita administrativa não configurada.", 503, { requestId });
  const corpo = await req.json().catch(() => null);
  const parsed = putSchema.safeParse(corpo);
  if (!parsed.success) return fail("validation_failed", "Dados inválidos.", 422, { details: parsed.error.flatten().fieldErrors as Record<string, unknown>, requestId });

  const veTodos = ROLE_RANK[authz.org.role] >= ROLE_RANK.manager;
  const { user_id: alvo, ...valores } = parsed.data;
  const userId = alvo ?? authz.user.id;
  if (userId !== authz.user.id && !veTodos) return fail("forbidden", "Você só lança o seu próprio dia.", 403, { requestId });

  const hoje = hojeEmSP();
  if (valores.dia > hoje) return fail("validation_failed", "Não dá para lançar um dia que ainda não chegou.", 422, { requestId });
  const limite = new Date(new Date(`${hoje}T00:00:00Z`).getTime() - DIAS_PARA_TRAS_DO_VENDEDOR * MS_POR_DIA).toISOString().slice(0, 10);
  if (!veTodos && valores.dia < limite) return fail("forbidden", `Vendedor edita só os últimos ${DIAS_PARA_TRAS_DO_VENDEDOR} dias; peça ao gestor.`, 403, { requestId });

  const admin = createAdminClient();
  if (userId !== authz.user.id) {
    const { data: membro } = await admin.from("user_organizations").select("user_id").eq("organization_id", authz.org.orgId).eq("user_id", userId).maybeSingle();
    if (!membro) return fail("validation_failed", "Esse vendedor não é da organização.", 422, { requestId });
  }
  const { data, error } = await admin
    .from(TABELA)
    .upsert({ organization_id: authz.org.orgId, user_id: userId, ...valores, updated_at: new Date().toISOString() } as never, { onConflict: "organization_id,user_id,dia,especialidade,versao_roteiro" })
    .select("user_id, dia, especialidade, versao_roteiro, mensagens_enviadas, respostas, whatsapp, agendamento, no_show, obs")
    .single();
  if (error) return fail("internal_error", (error as { message: string }).message, 500, { requestId });
  return ok({ lancamento: data }, { requestId });
}
