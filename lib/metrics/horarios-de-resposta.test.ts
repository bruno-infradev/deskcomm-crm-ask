import { describe, expect, it } from "vitest";

import { horariosDeResposta, periodoDaHora } from "./horarios-de-resposta";

const msg = (direction: string, created_at: string, contact_id = "c1") => ({ contact_id, channel_session_id: "s1", direction, created_at });
const AGORA = new Date("2026-11-18T12:00:00Z").getTime();

describe("horariosDeResposta", () => {
  it("separa os períodos do dia", () => {
    expect([5, 6, 11, 12, 17, 18, 23].map(periodoDaHora)).toEqual(["madrugada", "manha", "manha", "tarde", "tarde", "noite", "noite"]);
  });

  it("conta recebidas no fuso de São Paulo (13h UTC = 10h, manhã de segunda)", () => {
    const h = horariosDeResposta([msg("inbound", "2026-11-16T13:00:00Z")], AGORA);
    expect(h.por_periodo.manha.recebidas).toBe(1);
    expect(h.por_dia.seg.recebidas).toBe(1);
  });

  it("taxa pelo horário de envio: respondida em até 24 h conta, depois disso não", () => {
    const h = horariosDeResposta(
      [
        msg("outbound", "2026-11-16T13:00:00Z", "a"), // seg 10h SP
        msg("inbound", "2026-11-16T15:00:00Z", "a"),
        msg("outbound", "2026-11-16T13:00:00Z", "b"),
        msg("inbound", "2026-11-18T01:00:00Z", "b"), // 36 h depois
      ],
      AGORA,
    );
    expect(h.por_periodo.manha).toMatchObject({ enviadas: 2, respondidas: 1, taxa: 50 });
  });

  it("ignora envio com menos de 24 h e mensagem sem contato", () => {
    const h = horariosDeResposta([msg("outbound", "2026-11-18T08:00:00Z"), { ...msg("inbound", "2026-11-16T13:00:00Z"), contact_id: null }], AGORA);
    expect(h.totais).toMatchObject({ enviadas: 0, recebidas: 0, taxa: null });
  });
});
