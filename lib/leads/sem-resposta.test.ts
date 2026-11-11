import { describe, expect, it } from "vitest";

import type { Lead } from "@/lib/types/leads";
import { compararPorEspera, esperaDoLead, estaSemResposta, rotuloDeEspera } from "./sem-resposta";

const lead = (status: string, awaiting?: string | null) =>
  ({ status, conversa: awaiting === undefined ? null : { id: "c", preview: null, last_message_at: null, unread: 0, awaiting_since: awaiting } }) as unknown as Lead;

describe("sem resposta", () => {
  it("só negócio aberto com mensagem do lead sem resposta conta", () => {
    expect(estaSemResposta(lead("open", "2026-11-11T10:00:00Z"))).toBe(true);
    expect(estaSemResposta(lead("open", null))).toBe(false);
    expect(estaSemResposta(lead("open"))).toBe(false);
    expect(estaSemResposta(lead("won", "2026-11-11T10:00:00Z"))).toBe(false);
    expect(esperaDoLead(lead("lost", "2026-11-11T10:00:00Z"))).toBeNull();
  });
  it("rótulo em minutos, horas e dias", () => {
    const agora = Date.parse("2026-11-11T12:00:00Z");
    expect(rotuloDeEspera("2026-11-11T11:25:00Z", agora)).toBe("há 35 min");
    expect(rotuloDeEspera("2026-11-11T09:30:00Z", agora)).toBe("há 2 h");
    expect(rotuloDeEspera("2026-11-08T12:00:00Z", agora)).toBe("há 3 d");
    expect(rotuloDeEspera("2026-11-11T12:00:30Z", agora)).toBe("agora");
  });
  it("ordena do mais antigo para o mais novo e quem não espera por último", () => {
    const lista = [lead("open", "2026-11-11T11:00:00Z"), lead("open", null), lead("open", "2026-11-11T08:00:00Z")];
    expect(lista.sort(compararPorEspera).map((l) => l.conversa?.awaiting_since ?? null)).toEqual(["2026-11-11T08:00:00Z", "2026-11-11T11:00:00Z", null]);
  });
});
