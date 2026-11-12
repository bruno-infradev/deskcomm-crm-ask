/**
 * GET /api/v1/conversations/[id]/cadencia — contador das abordagens novas do número desta conversa (T-20261112-003).
 *
 * Só informação para o vendedor (papel `agent`): para os demais devolve `aplica: false`. O envio NÃO é barrado por cadência
 * (Bruno, 12/11 10h33: os vendedores espaçam à mão e o fim do dia é analisado).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { resolveAuthDual } from "@/lib/api/auth-dual";
import { ok, fail } from "@/lib/api/wrappers";
import { abordagensNovasDoDia, estatisticaDeCadencia, INTERVALO_MINIMO_MS, META_DO_DIA } from "@/lib/channels/cadencia-abordagem";
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
  const doDia = await abordagensNovasDoDia(admin, { organizationId: authz.organizationId, channelSessionId: conversa.channel_session_id as string, agora });
  if (doDia.leitura === "indisponivel") return fail("internal_error", "Cadência indisponível.", 503, { requestId });
  const est = estatisticaDeCadencia(doDia.instantes, agora);
  return ok(
    {
      aplica: true,
      meta: META_DO_DIA,
      intervalo_recomendado_min: INTERVALO_MINIMO_MS / 60000,
      feitas_hoje: est.total,
      ultima_ha_min: est.ultima_ha_min,
      // Só informação: o envio nunca é barrado por cadência (Bruno, 12/11 10h33).
      espere: est.ultima_ha_min !== null && est.ultima_ha_min < INTERVALO_MINIMO_MS / 60000,
    },
    { requestId },
  );
}
