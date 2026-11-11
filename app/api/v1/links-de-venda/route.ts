/**
 * GET /api/v1/links-de-venda: os links de venda da organização (fork ASK, T-20261111-06, pedido do Bruno em 11/11/2026).
 * SÓ LEITURA, para qualquer atendente. Decisão do Bruno (11/11, 14h): NINGUÉM cria link de venda pelo CRM. O link nasce
 * na Hubla (Bruno) ou é criado pelo OS e gravado na tabela `links_de_venda` pelo servidor; o CRM só mostra e copia.
 */
import { randomUUID } from "node:crypto";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const COLUNAS = "id, produto, rotulo, vendedor, url, ordem";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "links_de_venda" });
  if (!authz.ok) return authz.response;
  const { data, error } = await createAdminClient()
    .from("links_de_venda" as never)
    .select(COLUNAS)
    .eq("organization_id", authz.org.orgId)
    .order("produto")
    .order("rotulo")
    .order("ordem");
  if (error) return fail("internal_error", (error as { message: string }).message, 500, { requestId });
  return ok({ links: data ?? [] }, { requestId });
}
