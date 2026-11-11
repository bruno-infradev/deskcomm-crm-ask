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
import { resolveAuthDual } from "@/lib/api/auth-dual";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK } from "@/lib/auth/types";
import { abordagemPorHora } from "@/lib/metrics/abordagem-por-hora";
import {
  conversaoPorOrigem,
  formaDaVenda,
  resumirVendas,
  tempoDeResposta,
  type LeadParaOrigem,
  type VendaDoDia,
} from "@/lib/metrics/resultado-comercial";
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
  created_at: string;
}

const CENTAVOS_POR_REAL = 100;
const LOTE_CONTATOS = 200;
const ETAPAS_DE_RESULTADO = ["reuniao_marcada", "reuniao_feita", "proposta_enviada"] as const;

interface LeadDoDia {
  owner_user_id: string | null;
  contact_id: string | null;
  tags: string[] | null;
  value_cents: number | null;
  custom_fields: Record<string, unknown> | null;
}
interface LeadEtapa {
  owner_user_id: string | null;
  crm_stages: { slug: string } | { slug: string }[] | null;
}

const hojeEmSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  // Sessão (vendedor vê a própria linha, manager+ vê todos) OU Bearer do OS (só leitura, vê todos): o aviso das
  // 30 abordagens e o resumo das 18h rodam por script do OS (Marcos, 10/11/2026).
  const ehBearer = (req.headers.get("authorization") ?? "").toLowerCase().startsWith("bearer ");
  let orgId: string;
  let veTodos: boolean;
  let usuarioId: string | null = null;
  if (ehBearer) {
    const dual = await resolveAuthDual(req, { requestId, resource: "metrics", role: "agent", scope: "mcp:read" });
    if (!dual.ok) return dual.response;
    orgId = dual.organizationId;
    veTodos = true;
  } else {
    const authz = await requireRole("agent", { requestId, resource: "metrics" });
    if (!authz.ok) return authz.response;
    orgId = authz.org.orgId;
    veTodos = ROLE_RANK[authz.org.role] >= ROLE_RANK.manager;
    usuarioId = authz.user.id;
  }
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
      .select("channel_session_id, contact_id, direction, created_at, conversations!inner(is_group)")
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

  const idsVendedores = [...new Set(donoDaSessao.values())].filter((id) => veTodos || id === usuarioId);
  const nomes = new Map<string, string>();
  await Promise.all(
    idsVendedores.map(async (id) => {
      const { data } = await admin.auth.admin.getUserById(id);
      const u = data?.user;
      nomes.set(id, (u?.user_metadata?.full_name as string | undefined) ?? u?.email ?? "Sem nome");
    }),
  );

  const inicioIso = inicio.toISOString();
  const fimIso = fim.toISOString();
  const [{ data: ganhosBrutos, error: e3 }, { data: etapasBrutas, error: e4 }] = await Promise.all([
    admin
      .from("crm_leads")
      .select("owner_user_id, contact_id, tags, value_cents, custom_fields")
      .eq("organization_id", orgId)
      .eq("status", "won")
      .gte("closed_at", inicioIso)
      .lt("closed_at", fimIso)
      .in("owner_user_id", idsVendedores),
    admin
      .from("crm_leads")
      .select("owner_user_id, crm_stages!crm_leads_stage_id_fkey!inner(slug)")
      .eq("organization_id", orgId)
      .in("crm_stages.slug", [...ETAPAS_DE_RESULTADO])
      .gte("stage_changed_at", inicioIso)
      .lt("stage_changed_at", fimIso)
      .in("owner_user_id", idsVendedores),
  ]);
  if (e3 || e4) return fail("internal_error", (e3 ?? e4)!.message, 500, { requestId });
  const ganhos = (ganhosBrutos ?? []) as unknown as LeadDoDia[];
  const etapas = (etapasBrutas ?? []) as unknown as LeadEtapa[];
  const slugDe = (l: LeadEtapa) => (Array.isArray(l.crm_stages) ? l.crm_stages[0]?.slug : l.crm_stages?.slug);

  // Leads das pessoas abordadas no dia (origem por tag), em lotes para não estourar a URL.
  const contatosAbordados = [...new Set(linhas.filter((l) => l.direction === "outbound" && l.contact_id).map((l) => l.contact_id as string))];
  const leadsDosAbordados: LeadDoDia[] = [];
  for (let i = 0; i < contatosAbordados.length; i += LOTE_CONTATOS) {
    const { data, error } = await admin
      .from("crm_leads")
      .select("owner_user_id, contact_id, tags, value_cents, custom_fields")
      .eq("organization_id", orgId)
      .in("contact_id", contatosAbordados.slice(i, i + LOTE_CONTATOS));
    if (error) return fail("internal_error", error.message, 500, { requestId });
    leadsDosAbordados.push(...((data ?? []) as unknown as LeadDoDia[]));
  }
  // O valor que o vendedor informa ao ganhar (campo venda_valor_reais) vale mais que a coluna value_cents (preço do negócio).
  const vendaDe = (l: LeadDoDia): VendaDoDia => {
    const informado = Number(l.custom_fields?.venda_valor_reais);
    return {
      valor_reais: Number.isFinite(informado) && informado > 0 ? informado : Math.round((l.value_cents ?? 0) / CENTAVOS_POR_REAL),
      forma: formaDaVenda(l.custom_fields?.venda_forma),
    };
  };
  const contatosGanhos = new Map(ganhos.filter((l) => l.contact_id).map((l) => [l.contact_id as string, vendaDe(l).valor_reais]));
  const origemDe = (contatos: ReadonlySet<string>, entrada: ReadonlySet<string>): LeadParaOrigem[] =>
    leadsDosAbordados
      .filter((l) => l.contact_id && contatos.has(l.contact_id))
      .map((l) => ({
        abordado: true,
        respondeu: entrada.has(l.contact_id as string),
        tags: l.tags,
        venda_reais: contatosGanhos.get(l.contact_id as string) ?? null,
      }));

  const doVendedorIds = (userId: string) => sessoesDosVendedores.filter((s) => donoDaSessao.get(s.id as string) === userId).map((s) => s.id as string);
  const vendedores = idsVendedores.map((userId) => {
    const doVendedor = sessoesDosVendedores.filter((s) => donoDaSessao.get(s.id as string) === userId);
    const idsDele = new Set(doVendedor.map((s) => s.id as string));
    const saida = linhas.filter((l) => idsDele.has(l.channel_session_id) && l.direction === "outbound" && l.contact_id);
    const entrada = new Set(linhas.filter((l) => idsDele.has(l.channel_session_id) && l.direction === "inbound" && l.contact_id).map((l) => l.contact_id as string));
    const abordados = new Set(saida.map((l) => l.contact_id as string));
    const primeiras = new Map<string, string>();
    for (const l of [...saida].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      if (!primeiras.has(l.contact_id as string)) primeiras.set(l.contact_id as string, l.created_at);
    }
    const horaDaMeta = [...primeiras.values()].sort()[meta - 1];
    const vendasDele = ganhos.filter((l) => l.owner_user_id === userId).map(vendaDe);
    const doVendedorEtapas = etapas.filter((l) => l.owner_user_id === userId);
    const contarEtapa = (slug: string) => doVendedorEtapas.filter((l) => slugDe(l) === slug).length;
    const mensagensDele = linhas.filter((l) => idsDele.has(l.channel_session_id));
    return {
      user_id: userId,
      nome: nomes.get(userId) ?? "Sem nome",
      reunioes_marcadas: contarEtapa("reuniao_marcada"),
      reunioes_feitas: contarEtapa("reuniao_feita"),
      propostas: contarEtapa("proposta_enviada"),
      vendas: resumirVendas(vendasDele),
      resposta_do_vendedor: tempoDeResposta(mensagensDele),
      por_origem: conversaoPorOrigem(origemDe(abordados, entrada)),
      abordados: abordados.size,
      meta,
      mensagens_enviadas: saida.length,
      responderam: [...abordados].filter((c) => entrada.has(c)).length,
      cruzou_meta_as: horaDaMeta
        ? new Date(horaDaMeta).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })
        : null,
      por_hora: abordagemPorHora(linhas.filter((l) => idsDele.has(l.channel_session_id))),
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

  const idsDoTime = new Set(vendedores.flatMap((v) => doVendedorIds(v.user_id)));
  const entradaDoTime = new Set(linhas.filter((l) => idsDoTime.has(l.channel_session_id) && l.direction === "inbound" && l.contact_id).map((l) => l.contact_id as string));
  const time = {
    abordados: vendedores.reduce((s, v) => s + v.abordados, 0),
    responderam: vendedores.reduce((s, v) => s + v.responderam, 0),
    reunioes_marcadas: vendedores.reduce((s, v) => s + v.reunioes_marcadas, 0),
    reunioes_feitas: vendedores.reduce((s, v) => s + v.reunioes_feitas, 0),
    propostas: vendedores.reduce((s, v) => s + v.propostas, 0),
    vendas: resumirVendas(ganhos.map(vendaDe)),
    resposta_do_vendedor: tempoDeResposta(linhas.filter((l) => idsDoTime.has(l.channel_session_id))),
    por_origem: conversaoPorOrigem(origemDe(new Set(contatosAbordados), entradaDoTime)),
  };

  return ok({ dia, meta, vendedores, time }, { requestId });
}
