/**
 * GET/POST/PATCH /api/v1/social-selling/prospectos (fork ASK, Bruno 25/11/2026): a fila de prospecção de cada vendedor.
 * POST "Adicionar à minha fila" (vira lead do vendedor com especialidade e versão do roteiro). PATCH muda o status; cada passo
 * à frente (abordado, respondeu, reunião) soma uma vez no lançamento do dia, que alimenta os números da aba. Nada de DM automático.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { isServiceRoleConfigured } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK } from "@/lib/auth/types";
import { CAMPO_POR_STATUS, limparUsername, PRODUTOS, STATUS_PROSPECTO, type StatusProspecto } from "@/lib/social-selling/busca";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const TABELA = "social_selling_prospectos" as never;
const COLUNAS = "id, user_id, username, nome, bio, seguidores, especialidade, cidade, registro, nota, motivo, produto, mensagem, versao_roteiro, origem, status, created_at";
const postSchema = z
  .object({
    username: z.string().trim().min(1).max(80),
    nome: z.string().trim().max(200).default(""),
    bio: z.string().max(1000).default(""),
    seguidores: z.number().int().min(0).nullable().default(null),
    especialidade: z.string().trim().max(60).default(""),
    cidade: z.string().trim().max(120).default(""),
    registro: z.string().trim().max(80).default(""),
    nota: z.number().int().min(0).max(10).default(0),
    motivo: z.string().max(600).default(""),
    produto: z.enum(PRODUTOS).or(z.literal("")).default(""),
    mensagem: z.string().max(3000).default(""),
    versao_roteiro: z.string().trim().max(20).default(""),
  })
  .strict();
const patchSchema = z.object({ id: z.string().uuid(), status: z.enum(STATUS_PROSPECTO) }).strict();

const hojeEmSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "social_selling" });
  if (!authz.ok) return authz.response;
  if (!isServiceRoleConfigured()) return fail("service_unavailable", "Leitura administrativa não configurada.", 503, { requestId });
  const veTodos = ROLE_RANK[authz.org.role] >= ROLE_RANK.manager;
  const consulta = createAdminClient().from(TABELA).select(COLUNAS).eq("organization_id", authz.org.orgId).order("nota", { ascending: false }).limit(500);
  const { data, error } = await consulta;
  if (error) return fail("internal_error", (error as { message: string }).message, 500, { requestId });
  const todas = (data ?? []) as unknown as Array<{ user_id: string | null; status: string }>;
  const visiveis = todas.filter((p) => p.status === "base" || p.user_id === authz.user.id || veTodos);
  return ok({ prospectos: visiveis, eu: authz.user.id }, { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "social_selling" });
  if (!authz.ok) return authz.response;
  if (!isServiceRoleConfigured()) return fail("service_unavailable", "Escrita administrativa não configurada.", 503, { requestId });
  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Dados inválidos.", 422, { details: parsed.error.flatten().fieldErrors as Record<string, unknown>, requestId });
  const username = limparUsername(parsed.data.username);
  const admin = createAdminClient();
  const { data: existente } = await admin.from(TABELA).select("id, user_id, status").eq("organization_id", authz.org.orgId).eq("username", username).maybeSingle();
  const atual = existente as { id: string; user_id: string | null; status: string } | null;
  if (atual && atual.user_id && atual.user_id !== authz.user.id) return fail("conflict", "Esse perfil já está na fila de outro vendedor.", 409, { requestId });
  if (atual && atual.user_id === authz.user.id) return ok({ prospecto: atual, ja_estava: true }, { requestId });
  const campos = { ...parsed.data, username, user_id: authz.user.id, status: "fila", updated_at: new Date().toISOString() };
  const consulta = atual
    ? admin.from(TABELA).update(campos as never).eq("organization_id", authz.org.orgId).eq("id", atual.id)
    : admin.from(TABELA).insert({ ...campos, organization_id: authz.org.orgId, origem: "busca" } as never);
  const { data, error } = await consulta.select(COLUNAS).single();
  if (error) return fail("internal_error", (error as { message: string }).message, 500, { requestId });
  return ok({ prospecto: data }, { requestId });
}

async function somarNoLancamento(orgId: string, userId: string, campo: "mensagens_enviadas" | "respostas" | "agendamento", p: { especialidade: string; versao_roteiro: string }) {
  const admin = createAdminClient();
  const dia = hojeEmSP();
  const { data: linha } = await admin.from("social_selling_diario" as never).select(`id, ${campo}`).eq("organization_id", orgId).eq("user_id", userId).eq("dia", dia).eq("especialidade", p.especialidade).eq("versao_roteiro", p.versao_roteiro).maybeSingle();
  const atual = linha as unknown as ({ id: string } & Record<string, number>) | null;
  if (atual) return admin.from("social_selling_diario" as never).update({ [campo]: (atual[campo] ?? 0) + 1, updated_at: new Date().toISOString() } as never).eq("id", atual.id);
  return admin.from("social_selling_diario" as never).insert({ organization_id: orgId, user_id: userId, dia, especialidade: p.especialidade, versao_roteiro: p.versao_roteiro, [campo]: 1 } as never);
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "social_selling" });
  if (!authz.ok) return authz.response;
  if (!isServiceRoleConfigured()) return fail("service_unavailable", "Escrita administrativa não configurada.", 503, { requestId });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Dados inválidos.", 422, { requestId });
  const admin = createAdminClient();
  const { data } = await admin.from(TABELA).select("*").eq("organization_id", authz.org.orgId).eq("id", parsed.data.id).maybeSingle();
  const p = data as unknown as { id: string; user_id: string | null; especialidade: string; versao_roteiro: string; contado_abordado: boolean; contado_respondeu: boolean; contado_reuniao: boolean } | null;
  if (!p) return fail("not_found", "Perfil não encontrado.", 404, { requestId });
  if (p.user_id !== authz.user.id && ROLE_RANK[authz.org.role] < ROLE_RANK.manager) return fail("forbidden", "Você só mexe nos seus perfis.", 403, { requestId });
  if (!p.user_id) return fail("validation_failed", "Adicione o perfil à sua fila antes de mudar o status.", 422, { requestId });
  const status: StatusProspecto = parsed.data.status;
  const campo = CAMPO_POR_STATUS[status];
  const marca = ({ abordado: "contado_abordado", respondeu: "contado_respondeu", reuniao: "contado_reuniao" } as const)[status as "abordado" | "respondeu" | "reuniao"];
  const mudancas: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  // Pular etapas conta as anteriores (reunião implica abordado e respondeu), uma única vez cada.
  const pendentes: Array<["contado_abordado" | "contado_respondeu" | "contado_reuniao", "mensagens_enviadas" | "respostas" | "agendamento"]> = [];
  if (campo && marca) {
    const ordem: Array<["contado_abordado" | "contado_respondeu" | "contado_reuniao", "mensagens_enviadas" | "respostas" | "agendamento"]> = [["contado_abordado", "mensagens_enviadas"], ["contado_respondeu", "respostas"], ["contado_reuniao", "agendamento"]];
    for (const [m, c] of ordem.slice(0, ordem.findIndex(([x]) => x === marca) + 1)) if (!p[m]) pendentes.push([m, c]);
    for (const [m] of pendentes) mudancas[m] = true;
  }
  const { data: novo, error } = await admin.from(TABELA).update(mudancas as never).eq("organization_id", authz.org.orgId).eq("id", p.id).select(COLUNAS).single();
  if (error) return fail("internal_error", (error as { message: string }).message, 500, { requestId });
  for (const [, c] of pendentes) await somarNoLancamento(authz.org.orgId, p.user_id, c, p);
  return ok({ prospecto: novo, somou: pendentes.map(([, c]) => c) }, { requestId });
}
