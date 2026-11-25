/**
 * GET/POST/PATCH /api/v1/social-selling/busca (fork ASK, Bruno 25/11/2026).
 * POST: busca perfis públicos no Instagram para o vendedor (cache de 7 dias por termo, cota diária por vendedor travada aqui no servidor,
 * zera à meia-noite de São Paulo). GET: quanto o vendedor já usou hoje. PATCH (admin): muda o limite diário da org.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { isServiceRoleConfigured } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { ESPECIALIDADES } from "@/lib/metrics/social-selling";
import { cacheValido, chaveDeCache, filtrarEPontuar, LIMITE_DIARIO_PADRAO, montarTermo, restanteDaCota, type PerfilBruto } from "@/lib/social-selling/busca";
import { ApifyIndisponivel, buscarPerfisNoApify } from "@/lib/social-selling/apify";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 150;

const buscaSchema = z
  .object({
    especialidade: z.enum(ESPECIALIDADES).optional(),
    cidade: z.string().trim().max(60).default(""),
    palavra: z.string().trim().max(60).default(""),
    atualizar: z.boolean().default(false),
  })
  .strict();
const limiteSchema = z.object({ limite_diario: z.number().int().min(1).max(500) }).strict();

const hojeEmSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

async function lerLimiteEUso(orgId: string, userId: string) {
  const admin = createAdminClient();
  const [{ data: cfg }, { data: uso }] = await Promise.all([
    admin.from("social_selling_config" as never).select("limite_diario").eq("organization_id", orgId).maybeSingle(),
    admin.from("social_selling_busca_uso" as never).select("usados").eq("organization_id", orgId).eq("user_id", userId).eq("dia", hojeEmSP()).maybeSingle(),
  ]);
  const limite = (cfg as { limite_diario: number } | null)?.limite_diario ?? LIMITE_DIARIO_PADRAO;
  const usados = (uso as { usados: number } | null)?.usados ?? 0;
  return { limite, usados, restante: restanteDaCota(usados, limite) };
}

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "social_selling" });
  if (!authz.ok) return authz.response;
  if (!isServiceRoleConfigured()) return fail("service_unavailable", "Leitura administrativa não configurada.", 503, { requestId });
  return ok({ ...(await lerLimiteEUso(authz.org.orgId, authz.user.id)), dia: hojeEmSP() }, { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "social_selling" });
  if (!authz.ok) return authz.response;
  if (!isServiceRoleConfigured()) return fail("service_unavailable", "Escrita administrativa não configurada.", 503, { requestId });
  const parsed = buscaSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Dados inválidos.", 422, { details: parsed.error.flatten().fieldErrors as Record<string, unknown>, requestId });
  const termo = montarTermo(parsed.data);
  if (!termo) return fail("validation_failed", "Escolha uma especialidade ou escreva uma palavra-chave.", 422, { requestId });

  const orgId = authz.org.orgId;
  const antes = await lerLimiteEUso(orgId, authz.user.id);
  if (antes.restante === 0) return fail("rate_limited", `Você já usou ${antes.usados} de ${antes.limite} perfis hoje. A cota volta à meia-noite (horário de São Paulo).`, 429, { requestId });

  const admin = createAdminClient();
  const { data: conhecidos } = await admin.from("social_selling_prospectos" as never).select("username").eq("organization_id", orgId);
  const jaConhecidos = new Set(((conhecidos ?? []) as Array<{ username: string }>).map((c) => c.username));
  const chave = chaveDeCache(termo);
  const { data: emCache } = await admin.from("social_selling_busca_cache" as never).select("resultados, created_at").eq("organization_id", orgId).eq("chave", chave).maybeSingle();
  const cache = emCache as { resultados: PerfilBruto[]; created_at: string } | null;
  let brutos: PerfilBruto[];
  let doCache = false;
  if (cache && !parsed.data.atualizar && cacheValido(cache.created_at)) {
    brutos = cache.resultados;
    doCache = true;
  } else {
    try {
      brutos = await buscarPerfisNoApify(termo, process.env.APIFY_TOKEN, jaConhecidos);
    } catch (e) {
      const mensagem = e instanceof ApifyIndisponivel ? e.message : "Não consegui falar com o motor de busca. Tente de novo em instantes.";
      return fail("upstream_unavailable", mensagem, 502, { requestId });
    }
    await admin.from("social_selling_busca_cache" as never).upsert({ organization_id: orgId, chave, resultados: brutos, created_at: new Date().toISOString() } as never, { onConflict: "organization_id,chave" });
  }

  const { perfis, excluidos } = filtrarEPontuar(brutos, jaConhecidos, { especialidade: parsed.data.especialidade, cidade: parsed.data.cidade });
  const candidatos = perfis.slice(0, antes.restante);
  const { data: concedido, error } = await admin.rpc("social_selling_consumir_cota" as never, { p_org: orgId, p_user: authz.user.id, p_dia: hojeEmSP(), p_pedido: candidatos.length, p_limite: antes.limite } as never);
  if (error) return fail("internal_error", (error as { message: string }).message, 500, { requestId });
  const entregues = candidatos.slice(0, Number(concedido ?? 0));
  const usados = antes.usados + entregues.length;
  return ok({ termo, do_cache: doCache, perfis: entregues, excluidos: excluidos.length, motivos_exclusao: excluidos.slice(0, 15), limite: antes.limite, usados, restante: restanteDaCota(usados, antes.limite) }, { requestId });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "social_selling" });
  if (!authz.ok) return authz.response;
  if (!isServiceRoleConfigured()) return fail("service_unavailable", "Escrita administrativa não configurada.", 503, { requestId });
  const parsed = limiteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Limite inválido (1 a 500).", 422, { requestId });
  const { error } = await createAdminClient().from("social_selling_config" as never).upsert({ organization_id: authz.org.orgId, limite_diario: parsed.data.limite_diario, updated_at: new Date().toISOString() } as never, { onConflict: "organization_id" });
  if (error) return fail("internal_error", (error as { message: string }).message, 500, { requestId });
  return ok({ limite_diario: parsed.data.limite_diario }, { requestId });
}
