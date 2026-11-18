import { describe, expect, it } from "vitest";

import { leadsAtendidos, resumirAtendimento } from "./atendimento";

const m = (contact_id: string, direction: string, created_at: string) => ({ contact_id, direction, created_at });
const AGORA = new Date("2026-11-18T16:00:00Z").getTime();

describe("atendimento", () => {
  it("mede a 1ª resposta, conta sem resposta até agora e ignora quem a gente abordou primeiro", () => {
    const leads = leadsAtendidos(
      [
        m("a", "inbound", "2026-11-18T10:00:00Z"), m("a", "outbound", "2026-11-18T10:03:00Z"), m("a", "outbound", "2026-11-18T11:00:00Z"),
        m("b", "inbound", "2026-11-18T12:00:00Z"),
        m("c", "outbound", "2026-11-18T09:00:00Z"), m("c", "inbound", "2026-11-18T09:30:00Z"),
      ],
      AGORA,
    );
    expect(leads.map((l) => [l.contact_id, l.respondido, l.espera_minutos])).toEqual([["a", true, 3], ["b", false, 240]]);
  });

  it("resume com taxa, média, mediana e faixas", () => {
    const r = resumirAtendimento([
      { contact_id: "1", primeira_em: "", respondido: true, espera_minutos: 2 },
      { contact_id: "2", primeira_em: "", respondido: true, espera_minutos: 40 },
      { contact_id: "3", primeira_em: "", respondido: true, espera_minutos: 120 },
      { contact_id: "4", primeira_em: "", respondido: false, espera_minutos: 300 },
    ]);
    expect(r).toMatchObject({ leads: 4, respondidos: 3, sem_resposta: 1, taxa_resposta: 75, media_minutos: 54, mediana_minutos: 40, ate_5_min: 25, ate_30_min: 25, ate_60_min: 50 });
  });

  it("sem dados não inventa número", () => {
    expect(resumirAtendimento([])).toMatchObject({ leads: 0, taxa_resposta: null, media_minutos: null, mediana_minutos: null });
  });
});
