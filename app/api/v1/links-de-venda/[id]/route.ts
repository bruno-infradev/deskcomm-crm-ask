/** PATCH e DELETE de um link de venda (só admin). Ver ../route.ts. */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

import { linkSchema } from "../route";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: Ctx): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await params;
  const authz = await requireRole("admin", { requestId, resource: "links_de_venda" });
  if (!authz.ok) return authz.response;
  const parsed = linkSchema.partial().safeParse(await req.json().catch(() => ({})));
  if (!parsed.success || Object.keys(parsed.data).length === 0) return fail("validation_failed", "Confira produto, nome e link.", 422, { requestId });
  const { data, error } = await createAdminClient()
    .from("links_de_venda" as never)
    .update({ ...parsed.data, updated_at: new Date().toISOString() } as never)
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .select("id, produto, rotulo, url, ordem")
    .maybeSingle();
  if (error) return fail("internal_error", (error as { message: string }).message, 500, { requestId });
  if (!data) return fail("not_found", "Link não encontrado.", 404, { requestId });
  return ok({ link: data }, { requestId });
}

export async function DELETE(_req: NextRequest, { params }: Ctx): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await params;
  const authz = await requireRole("admin", { requestId, resource: "links_de_venda" });
  if (!authz.ok) return authz.response;
  const { error } = await createAdminClient()
    .from("links_de_venda" as never)
    .delete()
    .eq("organization_id", authz.org.orgId)
    .eq("id", id);
  if (error) return fail("internal_error", (error as { message: string }).message, 500, { requestId });
  return ok({ id }, { requestId });
}
