/**
 * GET /api/v1/metrics/atendimento — atendimento de um número de WhatsApp: tempo da 1ª resposta por lead, sem resposta, taxa de
 * resposta e os leads mais demorados, geral e por origem do anúncio (funil Clínica). Pedido do Bruno (18/11/2026) para analisar o
 * atendimento da Kath, que não usa o CRM. SÓ admin/manager (ou Bearer do OS): mostra nome de contato e espera de cada um.
 * Query: dias (1 a 90, padrão 14), sessao (uuid; padrão: o número chamado "Kath"). Só leitura; a org vem da sessão ou do Bearer.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { isServiceRoleConfigured } from "@/lib/audit";
import { resolveAuthDual, tetoDeEscritaDoToken } from "@/lib/api/auth-dual";
import { requireRole } from "@/lib/auth/require-role";
import { ORIGEM_PADRAO } from "@/lib/metrics/leads-por-origem";
import { leadsAtendidos, resumirAtendimento, type MensagemDeAtendimento } from "@/lib/metrics/atendimento";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const PAGINA = 1000;
const MAX_PAGINAS = 100;
const LOTE = 150;
const MAIS_DEMORADOS = 15;
const DIA_MS = 24 * 60 * 60 * 1000;

const querySchema = z.object({
  dias: z.coerce.number().int().min(1).max(90).optional(),
  sessao: z.string().uuid().optional(),
});

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const ehBearer = (req.headers.get("authorization") ?? "").toLowerCase().startsWith("bearer ");
  let orgId: string;
  if (ehBearer) {
    const dual = await resolveAuthDual(req, { requestId, resource: "metrics", role: "agent", scope: "mcp:read" });
    if (!dual.ok) return dual.response;
    const teto = await tetoDeEscritaDoToken(dual, "metrics", requestId);
    if (teto) return teto;
    orgId = dual.organizationId;
  } else {
    const authz = await requireRole("manager", { requestId, resource: "metrics" });
    if (!authz.ok) return authz.response;
    orgId = authz.org.orgId;
  }
  if (!isServiceRoleConfigured()) return fail("service_unavailable", "Leitura administrativa não configurada.", 503, { requestId });

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({ dias: url.searchParams.get("dias") ?? undefined, sessao: url.searchParams.get("sessao") ?? undefined });
  if (!parsed.success) {
    return fail("validation_failed", "Query inválida.", 422, { details: parsed.error.flatten().fieldErrors as Record<string, unknown>, requestId });
  }
  const dias = parsed.data.dias ?? 14;
  const agora = Date.now();
  const inicio = new Date(agora - dias * DIA_MS);

  const admin = createAdminClient();
  let consultaSessao = admin.from("channel_sessions").select("id, display_name, phone_number, status").eq("organization_id", orgId).is("archived_at", null);
  consultaSessao = parsed.data.sessao ? consultaSessao.eq("id", parsed.data.sessao) : consultaSessao.ilike("display_name", "kath%");
  const { data: sessoes, error: e1 } = await consultaSessao.limit(1);
  if (e1) return fail("internal_error", e1.message, 500, { requestId });
  const sessao = sessoes?.[0];
  if (!sessao) return fail("not_found", "Número não encontrado.", 404, { requestId });

  const mensagens: (MensagemDeAtendimento & { conversations?: unknown })[] = [];
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
    const { data, error } = await admin
      .from("messages")
      .select("contact_id, direction, created_at, conversations!inner(is_group)")
      .eq("organization_id", orgId)
      .eq("conversations.is_group", false)
      .eq("channel_session_id", sessao.id as string)
      .gte("created_at", inicio.toISOString())
      .order("created_at", { ascending: true })
      .range(pagina * PAGINA, pagina * PAGINA + PAGINA - 1);
    if (error) return fail("internal_error", error.message, 500, { requestId });
    mensagens.push(...((data ?? []) as unknown as MensagemDeAtendimento[]));
    if ((data ?? []).length < PAGINA) break;
  }

  const leads = leadsAtendidos(mensagens, agora);
  const ids = leads.map((l) => l.contact_id);
  const origemDe = new Map<string, string>();
  const nomeDe = new Map<string, string>();
  for (let i = 0; i < ids.length; i += LOTE) {
    const lote = ids.slice(i, i + LOTE);
    const [{ data: ls, error: e2 }, { data: cs, error: e3 }] = await Promise.all([
      admin.from("crm_leads").select("contact_id, source_metadata").eq("organization_id", orgId).in("contact_id", lote).eq("source", "whatsapp-clinica"),
      admin.from("contacts").select("id, display_name").eq("organization_id", orgId).in("id", lote),
    ]);
    if (e2 || e3) return fail("internal_error", (e2 ?? e3)!.message, 500, { requestId });
    for (const l of ls ?? []) {
      const o = (l.source_metadata as Record<string, unknown> | null)?.origem;
      origemDe.set(l.contact_id as string, typeof o === "string" && o ? o : ORIGEM_PADRAO);
    }
    for (const c of cs ?? []) nomeDe.set(c.id as string, ((c.display_name as string | null) ?? "").trim() || "Sem nome");
  }

  const porOrigem: Record<string, ReturnType<typeof resumirAtendimento>> = {};
  for (const origem of new Set(leads.map((l) => origemDe.get(l.contact_id) ?? ORIGEM_PADRAO))) {
    porOrigem[origem] = resumirAtendimento(leads.filter((l) => (origemDe.get(l.contact_id) ?? ORIGEM_PADRAO) === origem));
  }
  const demorados = [...leads]
    .sort((a, b) => b.espera_minutos - a.espera_minutos)
    .slice(0, MAIS_DEMORADOS)
    .map((l) => ({ nome: nomeDe.get(l.contact_id) ?? "Sem nome", origem: origemDe.get(l.contact_id) ?? ORIGEM_PADRAO, primeira_em: l.primeira_em, respondido: l.respondido, espera_minutos: l.espera_minutos }));

  return ok(
    { dias, numero: { nome: sessao.display_name, telefone: sessao.phone_number, status: sessao.status }, resumo: resumirAtendimento(leads), por_origem: porOrigem, mais_demorados: demorados },
    { requestId },
  );
}
