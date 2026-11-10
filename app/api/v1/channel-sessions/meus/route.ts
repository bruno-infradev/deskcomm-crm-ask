/**
 * GET /api/v1/channel-sessions/meus — os números de WhatsApp em que o usuário é o responsável no roteamento
 * (fork ASK, 10/11/2026: o vendedor vê e reconecta só o próprio número). Só leitura; a org vem da org ativa.
 */
import { randomUUID } from "node:crypto";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "channel_sessions" });
  if (!authz.ok) return authz.response;
  const admin = createAdminClient();
  const { data: politicas, error: e1 } = await admin
    .from("channel_routing_policies")
    .select("channel_session_id")
    .eq("organization_id", authz.org.orgId)
    .eq("default_assignee_user_id", authz.user.id);
  if (e1) return fail("internal_error", e1.message, 500, { requestId });
  const ids = (politicas ?? []).map((p) => p.channel_session_id as string);
  if (ids.length === 0) return ok({ numeros: [] }, { requestId });
  const { data: sessoes, error: e2 } = await admin
    .from("channel_sessions")
    .select("id, display_name, phone_number, status, status_reason, last_status_change_at, archived_at")
    .eq("organization_id", authz.org.orgId)
    .in("id", ids);
  if (e2) return fail("internal_error", e2.message, 500, { requestId });
  const numeros = (sessoes ?? [])
    .filter((s) => !s.archived_at)
    .map((s) => ({
      id: s.id as string,
      nome: (s.display_name as string | null) ?? "Número",
      final: String(s.phone_number ?? "").replace(/\D/g, "").slice(-4),
      status: (s.status as string | null) ?? "",
      motivo: (s.status_reason as string | null) ?? "",
      desde: (s.last_status_change_at as string | null) ?? null,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  return ok({ numeros }, { requestId });
}
