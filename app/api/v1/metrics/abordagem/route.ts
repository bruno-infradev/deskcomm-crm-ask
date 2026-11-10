/**
 * GET /api/v1/metrics/abordagem — pessoas abordadas no dia por vendedor e por número.
 *
 * Pedido do Bruno (10/11/2026): meta de 30 pessoas abordadas por dia por vendedor, pelo número dele.
 * "Abordada" = contato distinto que recebeu ao menos 1 mensagem de saída (`messages.direction = 'outbound'`)
 * no dia de São Paulo, em conversa que não é de grupo, por um número (channel_session) que tem responsável
 * no roteamento (`channel_routing_policies.default_assignee_user_id`). "Respondeu" = abordada que também
 * mandou mensagem de entrada no mesmo dia pelo mesmo vendedor. Só leitura; manager+ vê todos os vendedores,
 * agent vê só a própria linha. A org vem da org ativa (cookie validado), nunca do query.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { isServiceRoleConfigured } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK } from "@/lib/auth/types";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const META_PADRAO = 30;
const FUSO_SP = "-03:00"; // São Paulo sem horário de verão desde 2019
const PAGINA = 1000;
const MAX_PAGINAS = 50;

const querySchema = z.object({
  dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  meta: z.coerce.number().int().min(1).max(500).optional(),
});

interface LinhaMensagem {
  channel_session_id: string;
  contact_id: string | null;
  direction: string;
}

const hojeEmSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "metrics" });
  if (!authz.ok) return authz.response;
  if (!isServiceRoleConfigured()) {
    return fail("service_unavailable", "Leitura administrativa não configurada.", 503, { requestId });
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    dia: url.searchParams.get("dia") ?? undefined,
    meta: url.searchParams.get("meta") ?? undefined,
  });
  if (!parsed.success) {
    return fail("validation_failed", "Query inválida.", 422, {
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
      requestId,
    });
  }
  const dia = parsed.data.dia ?? hojeEmSP();
  const meta = parsed.data.meta ?? META_PADRAO;
  const inicio = new Date(`${dia}T00:00:00${FUSO_SP}`);
  const fim = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);
  const orgId = authz.org.orgId;
  const veTodos = ROLE_RANK[authz.org.role] >= ROLE_RANK.manager;

  const admin = createAdminClient();
  const [{ data: sessoes, error: e1 }, { data: politicas, error: e2 }] = await Promise.all([
    admin.from("channel_sessions").select("id, display_name, phone_number").eq("organization_id", orgId).is("archived_at", null),
    admin.from("channel_routing_policies").select("channel_session_id, default_assignee_user_id").eq("organization_id", orgId),
  ]);
  if (e1 || e2) return fail("internal_error", (e1 ?? e2)!.message, 500, { requestId });

  const donoDaSessao = new Map<string, string>();
  for (const p of politicas ?? []) {
    if (p.default_assignee_user_id) donoDaSessao.set(p.channel_session_id as string, p.default_assignee_user_id as string);
  }
  const sessoesDosVendedores = (sessoes ?? []).filter((s) => donoDaSessao.has(s.id as string));
  const idsSessoes = sessoesDosVendedores.map((s) => s.id as string);
  if (idsSessoes.length === 0) return ok({ dia, meta, vendedores: [] }, { requestId });

  const linhas: LinhaMensagem[] = [];
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
    const { data, error } = await admin
      .from("messages")
      .select("channel_session_id, contact_id, direction, conversations!inner(is_group)")
      .eq("organization_id", orgId)
      .eq("conversations.is_group", false)
      .in("channel_session_id", idsSessoes)
      .gte("created_at", inicio.toISOString())
      .lt("created_at", fim.toISOString())
      .order("created_at", { ascending: true })
      .range(pagina * PAGINA, pagina * PAGINA + PAGINA - 1);
    if (error) return fail("internal_error", error.message, 500, { requestId });
    linhas.push(...((data ?? []) as unknown as LinhaMensagem[]));
    if ((data ?? []).length < PAGINA) break;
  }

  const idsVendedores = [...new Set(donoDaSessao.values())].filter((id) => veTodos || id === authz.user.id);
  const nomes = new Map<string, string>();
  await Promise.all(
    idsVendedores.map(async (id) => {
      const { data } = await admin.auth.admin.getUserById(id);
      const u = data?.user;
      nomes.set(id, (u?.user_metadata?.full_name as string | undefined) ?? u?.email ?? "Sem nome");
    }),
  );

  const vendedores = idsVendedores.map((userId) => {
    const doVendedor = sessoesDosVendedores.filter((s) => donoDaSessao.get(s.id as string) === userId);
    const idsDele = new Set(doVendedor.map((s) => s.id as string));
    const saida = linhas.filter((l) => idsDele.has(l.channel_session_id) && l.direction === "outbound" && l.contact_id);
    const entrada = new Set(linhas.filter((l) => idsDele.has(l.channel_session_id) && l.direction === "inbound" && l.contact_id).map((l) => l.contact_id as string));
    const abordados = new Set(saida.map((l) => l.contact_id as string));
    return {
      user_id: userId,
      nome: nomes.get(userId) ?? "Sem nome",
      abordados: abordados.size,
      meta,
      mensagens_enviadas: saida.length,
      responderam: [...abordados].filter((c) => entrada.has(c)).length,
      numeros: doVendedor.map((s) => {
        const saidaDoNumero = saida.filter((l) => l.channel_session_id === s.id);
        return {
          session_id: s.id as string,
          nome: (s.display_name as string | null) ?? "Número",
          final: String(s.phone_number ?? "").replace(/\D/g, "").slice(-4),
          abordados: new Set(saidaDoNumero.map((l) => l.contact_id as string)).size,
          mensagens_enviadas: saidaDoNumero.length,
        };
      }),
    };
  });
  vendedores.sort((a, b) => b.abordados - a.abordados);

  return ok({ dia, meta, vendedores }, { requestId });
}
