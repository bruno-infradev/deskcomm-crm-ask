import { describe, expect, it } from "vitest";

import { decidirCadencia, esperaLegivel, INTERVALO_MINIMO_MS, MAXIMO_POR_HORA, mensagemDaCadencia } from "./cadencia-abordagem";

const AGORA = new Date("2026-11-12T12:00:00.000Z");
const minAtras = (m: number) => new Date(AGORA.getTime() - m * 60000);

describe("decidirCadencia", () => {
  it("a primeira abordagem do dia sai", () => {
    expect(decidirCadencia([], AGORA)).toEqual({ liberado: true, feitasHoje: 0, esperaMs: 0 });
  });

  it("a segunda logo depois da primeira é barrada pelo intervalo", () => {
    const d = decidirCadencia([minAtras(1)], AGORA);
    expect(d.liberado).toBe(false);
    if (!d.liberado) {
      expect(d.motivo).toBe("intervalo");
      expect(d.esperaMs).toBe(INTERVALO_MINIMO_MS - 60000);
      expect(esperaLegivel(d.esperaMs)).toBe("9 min");
    }
  });

  it("passados 10 minutos a próxima sai", () => {
    expect(decidirCadencia([minAtras(10)], AGORA).liberado).toBe(true);
  });

  it("o caso do dia 12/11: 30 em 34 minutos teria parado na segunda", () => {
    const rajada = Array.from({ length: 30 }, (_, i) => minAtras(34 - i));
    const d = decidirCadencia(rajada.slice(0, 2), minAtras(32));
    expect(d.liberado).toBe(false);
  });

  it("6 na última hora (feitas pelo celular) trava até a mais antiga sair da janela", () => {
    const seis = Array.from({ length: MAXIMO_POR_HORA }, (_, i) => minAtras(55 - i));
    const d = decidirCadencia([...seis, minAtras(300)], AGORA);
    expect(d.liberado).toBe(false);
    if (!d.liberado) {
      expect(d.motivo).toBe("limite_por_hora");
      expect(d.esperaMs).toBe(5 * 60000);
    }
  });

  it("a frase diz quanto falta, quantas já foram e que nada saiu", () => {
    const d = decidirCadencia([minAtras(3)], AGORA);
    if (d.liberado) throw new Error("esperava barrar");
    const frase = mensagemDaCadencia(d);
    expect(frase).toMatch(/liberada em 7 min/);
    expect(frase).toMatch(/1\/30 hoje/);
    expect(frase).toMatch(/Nada foi enviado/);
  });
});
