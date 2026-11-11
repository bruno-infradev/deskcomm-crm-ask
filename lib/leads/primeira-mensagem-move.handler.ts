/**
 * Primeira mensagem ao lead novo move o card de "Novo" para "Em andamento" (fork ASK, pedido do Bruno em 10/11/2026:
 * "quando mandarmos a primeira mensagem em lead novo, já mover automaticamente para em andamento").
 *
 * Consome `message.sent` (saída de qualquer canal, humano ou automação). Para cada negócio ABERTO do contato que está
 * numa etapa chamada "Novo", move para a etapa "Em andamento" do MESMO funil. Funil sem essas duas etapas fica como está.
 * Grupo não conta. O update é condicionado à etapa de origem: se alguém já mexeu no card, nada muda (sem briga com o humano).
 */
import type { EventHandler, EventRow, HandlerResult } from "@/lib/event-log/dispatcher";
import { emitLeadActivity, stageChangeReason } from "@/lib/leads/activity-emitter";
import { lerPosicaoDeEntrada } from "@/lib/leads/posicao-de-entrada";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

const CONSUMER_KEY = "leads.primeira-mensagem-move";
const ETAPA_NOVO = /^\s*novo\s*$/i;
const ETAPA_EM_ANDAMENTO = /^\s*em andamento\s*$/i;

const resultado = (status: HandlerResult["status"], detail?: string): HandlerResult => ({ consumer_key: CONSUMER_KEY, status, detail });

export const primeiraMensagemMoveHandler: EventHandler = {
  key: CONSUMER_KEY,
  events: ["message.sent"],
  naOrgParada: "roda",
  async handle(row: EventRow): Promise<HandlerResult> {
    const conversationId = typeof row.payload?.conversation_id === "string" ? row.payload.conversation_id : null;
    if (!conversationId) return resultado("skipped", "sem_conversa");
    const admin = createAdminClient();
    const { data: conversa } = await admin
      .from("conversations")
      .select("contact_id, is_group")
      .eq("id", conversationId)
      .eq("organization_id", row.organization_id)
      .maybeSingle();
    if (!conversa?.contact_id || conversa.is_group) return resultado("skipped", "grupo_ou_sem_contato");

    const { data: leads, error } = await admin
      .from("crm_leads")
      .select("id, pipeline_id, stage_id, crm_stages!crm_leads_stage_id_fkey!inner(name)")
      .eq("organization_id", row.organization_id)
      .eq("contact_id", conversa.contact_id)
      .eq("status", "open");
    if (error) return resultado("retry", error.message);
    const novos = ((leads ?? []) as unknown as { id: string; pipeline_id: string; stage_id: string; crm_stages: { name: string } }[])
      .filter((l) => ETAPA_NOVO.test(l.crm_stages?.name ?? ""));
    if (!novos.length) return resultado("skipped", "nenhum_lead_em_novo");

    let movidos = 0;
    for (const lead of novos) {
      const { data: destino } = await admin
        .from("crm_stages")
        .select("id, name")
        .eq("pipeline_id", lead.pipeline_id)
        .ilike("name", "em andamento")
        .maybeSingle();
      if (!destino || !ETAPA_EM_ANDAMENTO.test(destino.name as string)) continue;
      const posicao = await lerPosicaoDeEntrada(admin, row.organization_id, destino.id as string);
      const { data: atualizados, error: erroUpdate } = await admin
        .from("crm_leads")
        .update({ stage_id: destino.id, ...(posicao === null ? {} : { position_in_stage: posicao }) })
        .eq("id", lead.id)
        .eq("stage_id", lead.stage_id)
        .select("id");
      if (erroUpdate) { logger.warn("[primeira-mensagem-move] update falhou", { lead_id: lead.id, error: erroUpdate.message }); continue; }
      if (!(atualizados ?? []).length) continue; // alguém mexeu no card antes: não briga
      movidos += 1;
      await emitLeadActivity(admin, {
        organizationId: row.organization_id,
        leadId: lead.id,
        contactId: conversa.contact_id as string,
        type: "stage_changed",
        sourceModule: "messaging",
        sourceId: conversationId,
        actor: { type: "webhook_source", id: "primeira-mensagem-move" },
        reason: stageChangeReason(lead.crm_stages.name, destino.name as string),
        payload: { pipeline_id: lead.pipeline_id, from_stage_id: lead.stage_id, to_stage_id: destino.id, motivo: "primeira_mensagem" },
      });
      const { error: erroEvento } = await admin.rpc("emit_event" as never, {
        p_event_type: "lead.stage_changed",
        p_entity_kind: "crm_lead",
        p_entity_id: lead.id,
        p_payload: { pipeline_id: lead.pipeline_id, from_stage_id: lead.stage_id, to_stage_id: destino.id, status: "open" },
        p_metadata: { actor_kind: "system", source: "primeira-mensagem-move" },
        p_organization_id: row.organization_id,
      } as never);
      if (erroEvento) logger.error("[primeira-mensagem-move] emit_event falhou", { lead_id: lead.id, error: (erroEvento as { message?: string }).message ?? String(erroEvento) });
    }
    return resultado(movidos ? "ok" : "skipped", movidos ? `movidos ${movidos}` : "nada_a_mover");
  },
};
