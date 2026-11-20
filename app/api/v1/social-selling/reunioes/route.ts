/**
 * GET/POST/PATCH /api/v1/social-selling/reunioes (fork ASK, T-20261120-001, pedido do Bruno em 20/11/2026).
 * Uma linha por reunião do social selling: vendedor, data, lead, especialidade, versão do roteiro, gravada (e link) e resultado.
 * GET ?dia=AAAA-MM-DD: as reuniões da semana (seg a sex) de todos (todos veem todos) com o resumo geral, por especialidade, por versão e por vendedor.
 * POST cria e PATCH muda (por id): vendedor só mexe nas dele, manager+ em qualquer uma. A org vem da org ativa (cookie), nunca do body.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { isServiceRoleConfigured } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK } from "@/lib/auth/types";
import { diasDaSemana, ESPECIALIDADES } from "@/lib/metrics/social-selling";
import { porEspecialidade, porVendedor, porVersao, resumir, RESULTADOS, type Reuniao } from "@/lib/metrics/social-selling-reunioes";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const TABELA = "social_selling_reunioes" as never;
const COLUNAS = "id, user_id, dia, lead, especialidade, versao_roteiro, gravada, link_gravacao, resultado, obs";
const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const camposDaReuniao = {
  dia: dataIso,
  lead: z.string().trim().min(1).max(200),
  especialidade: z.enum(ESPECIALIDADES),
  versao_roteiro: z.string().trim().max(20),
  gravada: z.boolean(),
  link_gravacao: z.string().trim().max(500),
  resultado: z.enum(RESULTADOS),
  obs: z.string().max(1000),
};
// POST: cria com valores padrão nos opcionais. PATCH: só os campos enviados mudam (sem default, para não apagar o que já estava).
const postSchema = z
  .object({
    ...camposDaReuniao,
    versao_roteiro: camposDaReuniao.versao_roteiro.default(""),
    gravada: camposDaReuniao.gravada.default(false),
    link_gravacao: camposDaReuniao.link_gravacao.default(""),
    resultado: camposDaReuniao.resultado.default("marcada"),
    obs: camposDaReuniao.obs.default(""),
    user_id: z.string().uuid().optional(),
  })
  .strict();
const patchSchema = z
  .object({
    id: z.string().uuid(),
    dia: camposDaReuniao.dia.optional(),
    lead: camposDaReuniao.lead.optional(),
    especialidade: camposDaReuniao.especialidade.optional(),
    versao_roteiro: camposDaReuniao.versao_roteiro.optional(),
    gravada: camposDaReuniao.gravada.optional(),
    link_gravacao: camposDaReuniao.link_gravacao.optional(),
    resultado: camposDaReuniao.resultado.optional(),
    obs: camposDaReuniao.obs.optional(),
  })
  .strict();

const hojeEmSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const nomeDoUsuario = (u: { email?: string | null; user_metadata?: Record<string, unknown> } | null | undefined): string =>
  (u?.user_metadata?.full_name as string | undefined) ?? u?.email ?? "Sem nome";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "social_selling" });
  if (!authz.ok) return authz.response;
  if (!isServiceRoleConfigured()) return fail("service_unavailable", "Leitura administrativa não configurada.", 503, { requestId });
  const diaParam = new URL(req.url).searchParams.get("dia") ?? hojeEmSP();
  if (!dataIso.safeParse(diaParam).success) return fail("validation_failed", "Dia inválido.", 422, { requestId });
  const datas = diasDaSemana(diaParam);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from(TABELA)
    .select(COLUNAS)
    .eq("organization_id", authz.org.orgId)
    .gte("dia", datas[0] ?? diaParam)
    .lte("dia", datas[datas.length - 1] ?? diaParam)
    .order("dia", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return fail("internal_error", (error as { message: string }).message, 500, { requestId });
  const reunioes = (data ?? []) as unknown as Reuniao[];
  const ids = [...new Set([authz.user.id, ...reunioes.map((r) => r.user_id).filter((id): id is string => Boolean(id))])];
  const nomes: Record<string, string> = {};
  await Promise.all(ids.map(async (id) => { const { data: u } = await admin.auth.admin.getUserById(id); nomes[id] = nomeDoUsuario(u?.user); }));
  return ok(
    {
      inicio: datas[0], fim: datas[datas.length - 1], reunioes, nomes,
      resumo: resumir(reunioes), por_especialidade: porEspecialidade(reunioes), por_versao: porVersao(reunioes), por_vendedor: porVendedor(reunioes),
      eu: { user_id: authz.user.id, pode_editar_de_todos: ROLE_RANK[authz.org.role] >= ROLE_RANK.manager },
    },
    { requestId },
  );
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "social_selling" });
  if (!authz.ok) return authz.response;
  if (!isServiceRoleConfigured()) return fail("service_unavailable", "Escrita administrativa não configurada.", 503, { requestId });
  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Dados inválidos.", 422, { details: parsed.error.flatten().fieldErrors as Record<string, unknown>, requestId });
  const veTodos = ROLE_RANK[authz.org.role] >= ROLE_RANK.manager;
  const { user_id: alvo, ...valores } = parsed.data;
  const userId = alvo ?? authz.user.id;
  if (userId !== authz.user.id && !veTodos) return fail("forbidden", "Você só lança as suas reuniões.", 403, { requestId });
  const { data, error } = await createAdminClient()
    .from(TABELA)
    .insert({ organization_id: authz.org.orgId, user_id: userId, ...valores } as never)
    .select(COLUNAS)
    .single();
  if (error) return fail("internal_error", (error as { message: string }).message, 500, { requestId });
  return ok({ reuniao: data }, { requestId });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "social_selling" });
  if (!authz.ok) return authz.response;
  if (!isServiceRoleConfigured()) return fail("service_unavailable", "Escrita administrativa não configurada.", 503, { requestId });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Dados inválidos.", 422, { details: parsed.error.flatten().fieldErrors as Record<string, unknown>, requestId });
  const { id, ...mudancas } = parsed.data as { id: string } & Record<string, unknown>;
  const admin = createAdminClient();
  const { data: atual } = await admin.from(TABELA).select("id, user_id").eq("organization_id", authz.org.orgId).eq("id", id).maybeSingle();
  const dono = (atual as { user_id: string | null } | null)?.user_id;
  if (!atual) return fail("not_found", "Reunião não encontrada.", 404, { requestId });
  if (dono !== authz.user.id && ROLE_RANK[authz.org.role] < ROLE_RANK.manager) return fail("forbidden", "Você só edita as suas reuniões.", 403, { requestId });
  const { data, error } = await admin
    .from(TABELA)
    .update({ ...mudancas, updated_at: new Date().toISOString() } as never)
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .select(COLUNAS)
    .single();
  if (error) return fail("internal_error", (error as { message: string }).message, 500, { requestId });
  return ok({ reuniao: data }, { requestId });
}
