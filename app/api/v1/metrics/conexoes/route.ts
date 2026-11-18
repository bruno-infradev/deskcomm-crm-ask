/**
 * GET /api/v1/metrics/conexoes — estado real de cada WhatsApp do CRM (channel_sessions) com o responsável e a última mensagem
 * recebida e enviada. Existe porque o aviso de queda no grupo COMERCIAL ASK olhava as instâncias da Evolution, que não são as que o
 * CRM usa (ele usa WAHA, só acessível por dentro do servidor). Pedido do Carlos (18/11/2026). manager+ ou Bearer do OS; só leitura.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { isServiceRoleConfigured } from "@/lib/audit";
import { resolveAuthDual, tetoDeEscritaDoToken } from "@/lib/api/auth-dual";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

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

  const admin = createAdminClient();
  const [{ data: sessoes, error: e1 }, { data: politicas, error: e2 }] = await Promise.all([
    admin.from("channel_sessions").select("id, display_name, phone_number, status, updated_at").eq("organization_id", orgId).is("archived_at", null).order("display_name"),
    admin.from("channel_routing_policies").select("channel_session_id, default_assignee_user_id").eq("organization_id", orgId),
  ]);
  if (e1 || e2) return fail("internal_error", (e1 ?? e2)!.message, 500, { requestId });

  const donoDe = new Map((politicas ?? []).map((p) => [p.channel_session_id as string, p.default_assignee_user_id as string | null]));
  const ultima = async (sessaoId: string, direcao: "inbound" | "outbound") => {
    const { data } = await admin.from("messages").select("created_at").eq("organization_id", orgId).eq("channel_session_id", sessaoId).eq("direction", direcao).order("created_at", { ascending: false }).limit(1);
    return (data?.[0]?.created_at as string | undefined) ?? null;
  };
  const numeros = await Promise.all(
    (sessoes ?? []).map(async (s) => {
      const id = s.id as string;
      const dono = donoDe.get(id) ?? null;
      let responsavel: string | null = null;
      if (dono) {
        const { data } = await admin.auth.admin.getUserById(dono);
        responsavel = (data?.user?.user_metadata?.full_name as string | undefined) ?? data?.user?.email ?? null;
      }
      const [recebida, enviada] = await Promise.all([ultima(id, "inbound"), ultima(id, "outbound")]);
      return { id, nome: s.display_name, telefone: s.phone_number, status: s.status, status_mudou_em: s.updated_at, responsavel, ultima_recebida: recebida, ultima_enviada: enviada };
    }),
  );
  return ok({ numeros }, { requestId });
}
