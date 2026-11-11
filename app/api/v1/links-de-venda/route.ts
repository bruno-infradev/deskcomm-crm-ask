/**
 * GET /api/v1/links-de-venda: os links de venda da organização (fork ASK, T-20261111-06, pedido do Bruno em 11/11/2026).
 * SÓ LEITURA, para qualquer atendente. Decisão do Bruno (11/11, 14h): NINGUÉM cria link de venda pelo CRM. O link nasce
 * na Hubla (Bruno) ou é criado pelo OS e gravado na tabela `links_de_venda` pelo servidor; o CRM só mostra e copia.
 */
import { randomUUID } from "node:crypto";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { slugDoVendedor } from "@/lib/leads/link-de-venda";

export const dynamic = "force-dynamic";

const COLUNAS = "id, produto, rotulo, url, ordem";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "links_de_venda" });
  if (!authz.ok) return authz.response;
  const { data, error } = await createAdminClient()
    .from("links_de_venda" as never)
    .select(COLUNAS)
    .eq("organization_id", authz.org.orgId)
    .order("produto")
    .order("ordem")
    .order("rotulo");
  if (error) return fail("internal_error", (error as { message: string }).message, 500, { requestId });
  const nomeDoUsuario = authz.user.full_name?.trim() || authz.user.email;
  const eu = { slug: slugDoVendedor(nomeDoUsuario), nome: authz.user.full_name?.trim() || nomeDoUsuario.split("@")[0] };
  // Admin vê o link de cada vendedor (pode escolher de quem copiar); vendedor só o dele.
  const ehAdmin = ["admin", "owner"].includes(String(authz.org.role));
  let vendedores: Array<{ slug: string; nome: string }> = [];
  if (ehAdmin) {
    const admin = createAdminClient();
    const { data: membros } = await admin
      .from("user_organizations")
      .select("user_id, role")
      .eq("organization_id", authz.org.orgId)
      .is("revoked_at", null)
      .eq("role", "agent");
    const lidos = await Promise.all(
      (membros ?? []).map(async (m) => {
        const { data: u } = await admin.auth.admin.getUserById(m.user_id as string);
        const nome = (u?.user?.user_metadata?.full_name as string | undefined)?.trim() || (u?.user?.email ?? "").split("@")[0];
        return nome ? { slug: slugDoVendedor(nome), nome } : null;
      }),
    );
    vendedores = lidos.filter((v): v is { slug: string; nome: string } => v !== null).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }
  return ok({ links: data ?? [], eu, vendedores }, { requestId });
}
