/**
 * GET /api/v1/conversations/[id]/cadencia — contador das abordagens novas do número desta conversa (T-20261112-003).
 *
 * Só faz sentido para vendedor (papel `agent`): para os demais devolve `aplica: false` e a tela não mostra nada.
 * Reflete a MESMA decisão que o envio aplica (`lib/channels/cadencia-abordagem.ts`).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { resolveAuthDual } from "@/lib/api/auth-dual";
import { ok, fail } from "@/lib/api/wrappers";
import { abordagensNovasDoDia, decidirCadencia, META_DO_DIA } from "@/lib/channels/cadencia-abordagem";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;
  const authz = await resolveAuthDual(req, { requestId, resource: "conversations", role: "agent", scope: "mcp:read" });
  if (!authz.ok) return authz.response;
  if (authz.via !== "session" || authz.papel !== "agent") return ok({ aplica: false }, { requestId });

  const { data: conversa } = await authz.supabase
    .from("conversations")
    .select("channel_session_id, is_group")
    .eq("organization_id", authz.organizationId)
    .eq("id", id)
    .maybeSingle();
  if (!conversa?.channel_session_id || conversa.is_group) return ok({ aplica: false }, { requestId });

  const admin = createAdminClient();
  const agora = new Date();
  const [doDia, { count }] = await Promise.all([
    abordagensNovasDoDia(admin, { organizationId: authz.organizationId, channelSessionId: conversa.channel_session_id as string, agora }),
    admin.from("messages").select("id", { count: "exact", head: true }).eq("organization_id", authz.organizationId).eq("conversation_id", id),
  ]);
  if (doDia.leitura === "indisponivel") return fail("internal_error", "Cadência indisponível.", 503, { requestId });
  const decisao = decidirCadencia(doDia.instantes, agora);
  return ok(
    {
      aplica: true,
      meta: META_DO_DIA,
      feitas_hoje: decisao.feitasHoje,
      espera_s: Math.ceil(decisao.esperaMs / 1000),
      conversa_nova: (count ?? 0) === 0,
    },
    { requestId },
  );
}
