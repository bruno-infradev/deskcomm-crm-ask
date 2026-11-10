/**
 * Fork ASK (10/11/2026): a primeira mensagem ao lead em "Novo" leva o card para "Em andamento" do mesmo funil.
 * Vigiados: grupo não move; lead fora de "Novo" não move; funil sem "Em andamento" não move; card que o humano já mexeu não é sobrescrito.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EventRow } from "@/lib/event-log/dispatcher";
import { primeiraMensagemMoveHandler } from "@/lib/leads/primeira-mensagem-move.handler";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/leads/activity-emitter", () => ({ emitLeadActivity: vi.fn(async () => ({ ok: true })), stageChangeReason: (a: string, b: string) => `Movido de ${a} para ${b}` }));
vi.mock("@/lib/leads/posicao-de-entrada", () => ({ lerPosicaoDeEntrada: vi.fn(async () => null) }));

const ORG = "org-1";
let updates: Array<{ id: unknown; de: unknown; para: unknown }> = [];

function fake(t: { grupo?: boolean; etapa?: string; temDestino?: boolean; humanoMexeu?: boolean }) {
  return {
    from(tabela: string) {
      const filtros: Record<string, unknown> = {};
      let patch: Record<string, unknown> | null = null;
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: unknown) => { filtros[c] = v; return q; },
        ilike: () => q,
        update: (p: Record<string, unknown>) => { patch = p; return q; },
        maybeSingle: async () => {
          if (tabela === "conversations") return { data: { contact_id: "c1", is_group: !!t.grupo } };
          if (tabela === "crm_stages") return { data: t.temDestino === false ? null : { id: "st-and", name: "Em andamento" } };
          return { data: null };
        },
        then: (res: (v: unknown) => void) => {
          if (tabela === "crm_leads" && patch) {
            if (t.humanoMexeu) return res({ data: [], error: null });
            updates.push({ id: filtros.id, de: filtros.stage_id, para: patch.stage_id });
            return res({ data: [{ id: filtros.id }], error: null });
          }
          if (tabela === "crm_leads") return res({ data: [{ id: "l1", pipeline_id: "p1", stage_id: "st-novo", crm_stages: { name: t.etapa ?? "Novo" } }], error: null });
          return res({ data: null, error: null });
        },
      };
      return q;
    },
    rpc: async () => ({ error: null }),
  };
}
const evento = (payload: Record<string, unknown>): EventRow => ({ id: "e1", organization_id: ORG, event_type: "message.sent", entity_kind: "message", entity_id: null, payload, metadata: {}, consumed_by: [], attempts: 0 });

describe("primeira mensagem move de Novo para Em andamento", () => {
  beforeEach(() => { updates = []; });
  it("move o lead aberto em Novo", async () => {
    vi.mocked(createAdminClient).mockReturnValue(fake({}) as never);
    const r = await primeiraMensagemMoveHandler.handle(evento({ conversation_id: "conv" }));
    expect(r.status).toBe("ok");
    expect(updates).toEqual([{ id: "l1", de: "st-novo", para: "st-and" }]);
  });
  it("grupo não move", async () => {
    vi.mocked(createAdminClient).mockReturnValue(fake({ grupo: true }) as never);
    expect((await primeiraMensagemMoveHandler.handle(evento({ conversation_id: "conv" }))).status).toBe("skipped");
    expect(updates).toEqual([]);
  });
  it("lead fora de Novo não move", async () => {
    vi.mocked(createAdminClient).mockReturnValue(fake({ etapa: "Em andamento" }) as never);
    expect((await primeiraMensagemMoveHandler.handle(evento({ conversation_id: "conv" }))).status).toBe("skipped");
    expect(updates).toEqual([]);
  });
  it("funil sem Em andamento não move", async () => {
    vi.mocked(createAdminClient).mockReturnValue(fake({ temDestino: false }) as never);
    expect((await primeiraMensagemMoveHandler.handle(evento({ conversation_id: "conv" }))).status).toBe("skipped");
    expect(updates).toEqual([]);
  });
  it("card que o humano já mexeu não é sobrescrito", async () => {
    vi.mocked(createAdminClient).mockReturnValue(fake({ humanoMexeu: true }) as never);
    expect((await primeiraMensagemMoveHandler.handle(evento({ conversation_id: "conv" }))).status).toBe("skipped");
  });
});
