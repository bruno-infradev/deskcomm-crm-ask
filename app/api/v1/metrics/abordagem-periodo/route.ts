/**
 * GET /api/v1/metrics/abordagem-periodo?dia=AAAA-MM-DD — abordados por vendedor no dia, na semana e no mês (fork ASK, 25/11/2026).
 * Mesma regra de /metrics/abordagem (contato distinto com mensagem de saída, pelo número que tem responsável, sem grupos).
 * Só leitura. manager+ e Bearer do OS veem todos os vendedores; agent vê só a própria linha.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { resolveAuthDual } from "@/lib/api/auth-dual";
import { fail, ok } from "@/lib/api/wrappers";
import { isServiceRoleConfigured } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK } from "@/lib/auth/types";
import { abordadosPorVendedor, inicioDoMes, type MensagemPeriodo } from "@/lib/metrics/abordagem-periodo";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const FUSO_SP = "-03:00"; // São Paulo sem horário de verão desde 2019
const MS_POR_DIA = 24 * 60 * 60 * 1000;
const PAGINA = 1000;
const MAX_PAGINAS = 200;
const querySchema = z.object({ dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
const hojeEmSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const ehBearer = (req.headers.get("authorization") ?? "").toLowerCase().startsWith("bearer ");
  let orgId: string;
  let veTodos: boolean;
  let usuarioId: string | null = null;
  if (ehBearer) {
    const dual = await resolveAuthDual(req, { requestId, resource: "metrics", role: "agent", scope: "mcp:read" });
    if (!dual.ok) return dual.response;
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
  const parsed = querySchema.safeParse({ dia: new URL(req.url).searchParams.get("dia") ?? undefined });
  if (!parsed.success) return fail("validation_failed", "Dia inválido.", 422, { requestId });
  const dia = parsed.data.dia ?? hojeEmSP();
  const inicio = new Date(`${inicioDoMes(dia)}T00:00:00${FUSO_SP}`);
  const fim = new Date(new Date(`${dia}T00:00:00${FUSO_SP}`).getTime() + MS_POR_DIA);

  const admin = createAdminClient();
  const { data: politicas, error: e1 } = await admin.from("channel_routing_policies").select("channel_session_id, default_assignee_user_id").eq("organization_id", orgId);
  if (e1) return fail("internal_error", e1.message, 500, { requestId });
  const donoDaSessao = new Map<string, string>();
  for (const p of politicas ?? []) {
    const dono = p.default_assignee_user_id as string | null;
    if (dono && (veTodos || dono === usuarioId)) donoDaSessao.set(p.channel_session_id as string, dono);
  }
  if (donoDaSessao.size === 0) return ok({ dia, vendedores: [] }, { requestId });

  const mensagens: MensagemPeriodo[] = [];
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
    const { data, error } = await admin
      .from("messages")
      .select("channel_session_id, contact_id, direction, created_at, conversations!inner(is_group)")
      .eq("organization_id", orgId)
      .eq("conversations.is_group", false)
      .in("channel_session_id", [...donoDaSessao.keys()])
      .gte("created_at", inicio.toISOString())
      .lt("created_at", fim.toISOString())
      .order("created_at", { ascending: true })
      .range(pagina * PAGINA, pagina * PAGINA + PAGINA - 1);
    if (error) return fail("internal_error", error.message, 500, { requestId });
    mensagens.push(...((data ?? []) as unknown as MensagemPeriodo[]));
    if ((data ?? []).length < PAGINA) break;
  }

  const porVendedor = abordadosPorVendedor(mensagens, donoDaSessao, dia);
  const vendedores = await Promise.all(
    [...porVendedor].map(async ([userId, periodos]) => {
      const { data } = await admin.auth.admin.getUserById(userId);
      const u = data?.user;
      return { user_id: userId, nome: (u?.user_metadata?.full_name as string | undefined) ?? u?.email ?? "Sem nome", ...periodos };
    }),
  );
  vendedores.sort((a, b) => b.mes.abordados - a.mes.abordados);
  return ok({ dia, vendedores }, { requestId });
}
