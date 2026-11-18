import { describe, expect, it } from "vitest";

import { leadsPorDiaEOrigem } from "./leads-por-origem";

const AGORA = new Date("2026-11-18T15:00:00Z").getTime();
const lead = (created_at: string, origem?: string, tags: string[] = []) => ({ created_at, tags, source_metadata: origem ? { origem } : {} });

describe("leadsPorDiaEOrigem", () => {
  it("conta por dia de São Paulo e por origem, com origem padrão quando falta", () => {
    const r = leadsPorDiaEOrigem(
      [lead("2026-11-18T13:00:00Z", "anuncio-fios"), lead("2026-11-18T14:00:00Z", "anuncio-abdomen"), lead("2026-11-18T14:30:00Z"), lead("2026-11-18T02:00:00Z", "anuncio-fios")],
      3,
      AGORA,
    );
    // 02:00Z de 18/11 ainda é 17/11 em São Paulo
    expect(r.dias.map((d) => [d.dia, d.total])).toEqual([["2026-11-16", 0], ["2026-11-17", 1], ["2026-11-18", 3]]);
    expect(r.por_origem).toEqual({ "anuncio-fios": 2, "anuncio-abdomen": 1, "sem-origem-de-anuncio": 1 });
    expect(r.total).toBe(4);
  });

  it("ignora lead de teste e fora da janela", () => {
    const r = leadsPorDiaEOrigem([lead("2026-11-18T13:00:00Z", "anuncio-fios", ["teste"]), lead("2026-10-01T13:00:00Z", "anuncio-fios")], 3, AGORA);
    expect(r.total).toBe(0);
  });
});
