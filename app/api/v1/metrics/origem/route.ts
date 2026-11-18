/**
 * GET /api/v1/metrics/origem — leads por dia e por origem de um funil (padrão: Clínica), dia de São Paulo.
 * Pedido do Bruno (18/11/2026): comparar com os cliques da Meta os leads que chegam ao WhatsApp da Kath.
 * Origem = `crm_leads.source_metadata->>'origem'` (gravada pelo gatilho do funil Clínica: anuncio-fios, anuncio-abdomen,
 * sem-origem-de-anuncio). Leads com a tag `teste` ficam de fora. Query: pipeline (slug), dias (1 a 90, padrão 14).
 * Só leitura. manager+ e Bearer veem tudo; agent vê só os leads dele. A org vem da org ativa ou do Bearer.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { isServiceRoleConfigured } from "@/lib/audit";
import { resolveAuthDual, tetoDeEscritaDoToken } from "@/lib/api/auth-dual";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK } from "@/lib/auth/types";
import { leadsPorDiaEOrigem, type LeadParaOrigem } from "@/lib/metrics/leads-por-origem";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const PAGINA = 1000;
const MAX_PAGINAS = 30;
const DIA_MS = 24 * 60 * 60 * 1000;

const querySchema = z.object({
  pipeline: z.string().regex(/^[a-z0-9_-]{2,40}$/).optional(),
  dias: z.coerce.number().int().min(1).max(90).optional(),
});

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const ehBearer = (req.headers.get("authorization") ?? "").toLowerCase().startsWith("bearer ");
  let orgId: string;
  let usuarioFiltro: string | null = null;
  if (ehBearer) {
    const dual = await resolveAuthDual(req, { requestId, resource: "metrics", role: "agent", scope: "mcp:read" });
    if (!dual.ok) return dual.response;
    const teto = await tetoDeEscritaDoToken(dual, "metrics", requestId);
    if (teto) return teto;
    orgId = dual.organizationId;
  } else {
    const authz = await requireRole("agent", { requestId, resource: "metrics" });
    if (!authz.ok) return authz.response;
    orgId = authz.org.orgId;
    if (ROLE_RANK[authz.org.role] < ROLE_RANK.manager) usuarioFiltro = authz.user.id;
  }
  if (!isServiceRoleConfigured()) return fail("service_unavailable", "Leitura administrativa não configurada.", 503, { requestId });

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({ pipeline: url.searchParams.get("pipeline") ?? undefined, dias: url.searchParams.get("dias") ?? undefined });
  if (!parsed.success) {
    return fail("validation_failed", "Query inválida.", 422, { details: parsed.error.flatten().fieldErrors as Record<string, unknown>, requestId });
  }
  const slug = parsed.data.pipeline ?? "clinica";
  const dias = parsed.data.dias ?? 14;
  const inicio = new Date(Date.now() - (dias + 1) * DIA_MS);

  const admin = createAdminClient();
  const { data: funil, error: e1 } = await admin.from("crm_pipelines").select("id, name").eq("organization_id", orgId).eq("slug", slug).maybeSingle();
  if (e1) return fail("internal_error", e1.message, 500, { requestId });
  if (!funil) return fail("not_found", "Funil não encontrado.", 404, { requestId });

  const leads: LeadParaOrigem[] = [];
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
    let consulta = admin
      .from("crm_leads")
      .select("created_at, tags, source_metadata, crm_stages!crm_leads_stage_id_fkey(name)")
      .eq("organization_id", orgId)
      .eq("pipeline_id", funil.id as string)
      .gte("created_at", inicio.toISOString())
      .order("created_at", { ascending: true })
      .range(pagina * PAGINA, pagina * PAGINA + PAGINA - 1);
    if (usuarioFiltro) consulta = consulta.eq("owner_user_id", usuarioFiltro);
    const { data, error } = await consulta;
    if (error) return fail("internal_error", error.message, 500, { requestId });
    leads.push(...((data ?? []) as unknown as LeadParaOrigem[]));
    if ((data ?? []).length < PAGINA) break;
  }

  return ok({ funil: funil.name, pipeline: slug, ...leadsPorDiaEOrigem(leads, dias) }, { requestId });
}
