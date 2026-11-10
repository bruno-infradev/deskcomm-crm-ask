/**
 * Dono do número (fork ASK, 10/11/2026): o vendedor reconecta sozinho o PRÓPRIO WhatsApp (o número em que ele é o responsável
 * padrão no roteamento, `channel_routing_policies.default_assignee_user_id`), sem depender do admin. Tudo o mais na conexão
 * (apagar, arquivar, nome, roteamento, histórico, código de pareamento, logout) continua só admin.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { escreveComoPlatformAdmin, ROLE_RANK, type Role } from "@/lib/auth/types";
import type { AuthUser } from "@/lib/auth/types";

export function ehAdminDaConexao(user: Pick<AuthUser, "is_platform_admin" | "platform_admin_scope">, role: Role | null | undefined): boolean {
  return escreveComoPlatformAdmin(user) || (!!role && ROLE_RANK[role] >= ROLE_RANK.admin);
}

export async function ehResponsavelDoNumero(orgId: string, sessionId: string, userId: string): Promise<boolean> {
  const { data } = await createAdminClient()
    .from("channel_routing_policies")
    .select("default_assignee_user_id")
    .eq("organization_id", orgId)
    .eq("channel_session_id", sessionId)
    .maybeSingle();
  return !!data && data.default_assignee_user_id === userId;
}
