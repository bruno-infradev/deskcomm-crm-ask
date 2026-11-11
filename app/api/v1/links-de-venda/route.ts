/**
 * GET /api/v1/links-de-venda: os links de venda da organização (fork ASK, T-20261111-06, pedido do Bruno em 11/11/2026).
 * Qualquer atendente lê; só admin cria, edita e apaga (POST aqui, PATCH e DELETE em [id]). O admin troca o link pela
 * própria tela, sem novo deploy.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export const linkSchema = z.object({
  produto: z.string().trim().min(1).max(80),
  rotulo: z.string().trim().min(1).max(120),
  url: z.string().trim().url().max(1000).refine((u) => /^https?:\/\//i.test(u), "O link precisa começar com http:// ou https://"),
  ordem: z.number().int().min(0).max(10000).optional(),
});

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
  return ok({ links: data ?? [], pode_editar: ["admin", "owner"].includes(String(authz.org.role)) }, { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "links_de_venda" });
  if (!authz.ok) return authz.response;
  const parsed = linkSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("validation_failed", "Confira produto, nome e link.", 422, { requestId, details: parsed.error.flatten().fieldErrors });
  const { data, error } = await createAdminClient()
    .from("links_de_venda" as never)
    .insert({ ...parsed.data, ordem: parsed.data.ordem ?? 0, organization_id: authz.org.orgId } as never)
    .select(COLUNAS)
    .single();
  if (error) return fail("internal_error", (error as { message: string }).message, 500, { requestId });
  return ok({ link: data }, { requestId, status: 201 });
}
