import { describe, expect, it } from "vitest";

import { estatisticaDeCadencia } from "./cadencia-abordagem";

const AGORA = new Date("2026-11-12T12:00:00.000Z");
const minAtras = (m: number) => new Date(AGORA.getTime() - m * 60000);

describe("estatisticaDeCadencia", () => {
  it("dia sem abordagem nova", () => {
    expect(estatisticaDeCadencia([], AGORA)).toEqual({ total: 0, maximo_em_uma_hora: 0, menor_intervalo_min: null, menos_de_5_min: 0, ultima_ha_min: null });
  });

  it("o caso de 12/11: 30 abordagens em 34 min, uma por minuto", () => {
    const rajada = Array.from({ length: 30 }, (_, i) => minAtras(40 - i));
    const e = estatisticaDeCadencia(rajada, AGORA);
    expect(e.total).toBe(30);
    expect(e.maximo_em_uma_hora).toBe(30);
    expect(e.menor_intervalo_min).toBe(1);
    expect(e.menos_de_5_min).toBe(29);
    expect(e.ultima_ha_min).toBe(11);
  });

  it("abordagem espaçada de 10 em 10 minutos tem no máximo 6 por hora e nenhuma rápida", () => {
    const espacadas = Array.from({ length: 10 }, (_, i) => minAtras(100 - i * 10));
    const e = estatisticaDeCadencia(espacadas, AGORA);
    expect(e.maximo_em_uma_hora).toBe(6);
    expect(e.menos_de_5_min).toBe(0);
    expect(e.menor_intervalo_min).toBe(10);
  });
});
