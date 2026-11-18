/**
 * GET /api/v1/metrics/horarios — quando os leads respondem (período do dia e dia da semana, fuso de São Paulo).
 * Pedido do Bruno (18/11/2026). Conversas individuais (sem grupo) dos números que têm vendedor responsável.
 * Query: dias (1 a 90, padrão 30), vendedor (user_id; manager+ ou Bearer). Agent vê só os próprios números.
 * Só leitura. A org vem da org ativa ou do Bearer, nunca do query.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { isServiceRoleConfigured } from "@/lib/audit";
import { resolveAuthDual, tetoDeEscritaDoToken } from "@/lib/api/auth-dual";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK } from "@/lib/auth/types";
import { horariosDeResposta, JANELA_RESPOSTA_MS, type MensagemDeConversa } from "@/lib/metrics/horarios-de-resposta";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const PAGINA = 1000;
const MAX_PAGINAS = 150;
const DIA_MS = 24 * 60 * 60 * 1000;

const querySchema = z.object({
  dias: z.coerce.number().int().min(1).max(90).optional(),
  vendedor: z.string().uuid().optional(),
});

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const ehBearer = (req.headers.get("authorization") ?? "").toLowerCase().startsWith("bearer ");
  let orgId: string;
  let veTodos: boolean;
  let usuarioId: string | null = null;
  if (ehBearer) {
    const dual = await resolveAuthDual(req, { requestId, resource: "metrics", role: "agent", scope: "mcp:read" });
    if (!dual.ok) return dual.response;
    const teto = await tetoDeEscritaDoToken(dual, "metrics", requestId);
    if (teto) return teto;
    orgId = dual.organizationId;
    veTodos = true;
  } else {
    const authz = await requireRole("agent", { requestId, resource: "metrics" });
    if (!authz.ok) return authz.response;
    orgId = authz.org.orgId;
    veTodos = ROLE_RANK[authz.org.role] >= ROLE_RANK.manager;
    usuarioId = authz.user.id;
  }
  if (!isServiceRoleConfigured()) return fail("service_unavailable", "Leitura administrativa não configurada.", 503, { requestId });

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    dias: url.searchParams.get("dias") ?? undefined,
    vendedor: url.searchParams.get("vendedor") ?? undefined,
  });
  if (!parsed.success) {
    return fail("validation_failed", "Query inválida.", 422, { details: parsed.error.flatten().fieldErrors as Record<string, unknown>, requestId });
  }
  const dias = parsed.data.dias ?? 30;
  const agora = Date.now();
  // Envios só entram se tiveram 24 h para ser respondidos; por isso o período termina 24 h atrás e a leitura de mensagens vai até agora.
  const inicio = new Date(agora - dias * DIA_MS);

  const admin = createAdminClient();
  const [{ data: sessoes, error: e1 }, { data: politicas, error: e2 }] = await Promise.all([
    admin.from("channel_sessions").select("id").eq("organization_id", orgId).is("archived_at", null),
    admin.from("channel_routing_policies").select("channel_session_id, default_assignee_user_id").eq("organization_id", orgId),
  ]);
  if (e1 || e2) return fail("internal_error", (e1 ?? e2)!.message, 500, { requestId });

  const donoDaSessao = new Map<string, string>();
  for (const p of politicas ?? []) if (p.default_assignee_user_id) donoDaSessao.set(p.channel_session_id as string, p.default_assignee_user_id as string);
  const alvo = veTodos ? parsed.data.vendedor : usuarioId;
  const idsSessoes = (sessoes ?? []).map((s) => s.id as string).filter((id) => donoDaSessao.has(id) && (!alvo || donoDaSessao.get(id) === alvo));
  if (idsSessoes.length === 0) return ok({ dias, horarios: horariosDeResposta([], agora), vendedores: [] }, { requestId });

  const mensagens: MensagemDeConversa[] = [];
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
    const { data, error } = await admin
      .from("messages")
      .select("channel_session_id, contact_id, direction, created_at, conversations!inner(is_group)")
      .eq("organization_id", orgId)
      .eq("conversations.is_group", false)
      .in("channel_session_id", idsSessoes)
      .gte("created_at", inicio.toISOString())
      .order("created_at", { ascending: true })
      .range(pagina * PAGINA, pagina * PAGINA + PAGINA - 1);
    if (error) return fail("internal_error", error.message, 500, { requestId });
    mensagens.push(...((data ?? []) as unknown as MensagemDeConversa[]));
    if ((data ?? []).length < PAGINA) break;
  }

  // Lista completa de vendedores visíveis (para o filtro da tela), mesmo quando o recorte já está num só.
  const idsVendedores = [...new Set((sessoes ?? []).map((s) => donoDaSessao.get(s.id as string)).filter((id): id is string => !!id && (veTodos || id === usuarioId)))];
  const nomes = await Promise.all(
    idsVendedores.map(async (id) => {
      const { data } = await admin.auth.admin.getUserById(id);
      const u = data?.user;
      return { user_id: id, nome: (u?.user_metadata?.full_name as string | undefined) ?? u?.email ?? "Sem nome" };
    }),
  );

  return ok(
    { dias, janela_horas: JANELA_RESPOSTA_MS / 3_600_000, vendedores: nomes, mensagens_lidas: mensagens.length, horarios: horariosDeResposta(mensagens, agora) },
    { requestId },
  );
}
