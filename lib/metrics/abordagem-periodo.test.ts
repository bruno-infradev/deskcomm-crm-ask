import { describe, expect, it } from "vitest";

import { abordadosPorVendedor, inicioDaSemana, inicioDoMes } from "./abordagem-periodo";

const donos = new Map([["s1", "angelo"], ["s2", "joao"]]);
const msg = (s: string, c: string, d: "outbound" | "inbound", iso: string) => ({ channel_session_id: s, contact_id: c, direction: d, created_at: iso });

describe("abordados por vendedor no dia, semana e mês", () => {
  it("acha o início da semana e do mês", () => {
    expect(inicioDaSemana("2026-11-25")).toBe("2026-11-23");
    expect(inicioDaSemana("2026-11-29")).toBe("2026-11-23");
    expect(inicioDoMes("2026-11-25")).toBe("2026-11-01");
  });
  it("conta contato distinto por dia e soma nos períodos", () => {
    const r = abordadosPorVendedor([
      msg("s1", "a", "outbound", "2026-11-25T15:00:00Z"), msg("s1", "a", "outbound", "2026-11-25T16:00:00Z"), msg("s1", "a", "inbound", "2026-11-25T17:00:00Z"),
      msg("s1", "b", "outbound", "2026-11-25T15:00:00Z"),
      msg("s1", "a", "outbound", "2026-11-23T15:00:00Z"),
      msg("s1", "c", "outbound", "2026-11-10T15:00:00Z"),
      msg("s2", "d", "outbound", "2026-11-25T15:00:00Z"),
      msg("s9", "x", "outbound", "2026-11-25T15:00:00Z"),
    ], donos, "2026-11-25");
    expect(r.get("angelo")).toEqual({ hoje: { abordados: 2, responderam: 1 }, semana: { abordados: 3, responderam: 1 }, mes: { abordados: 4, responderam: 1 } });
    expect(r.get("joao")?.hoje.abordados).toBe(1);
    expect(r.size).toBe(2);
  });
  it("ignora o que veio depois do dia consultado e o dia de São Paulo vira à meia-noite local", () => {
    const r = abordadosPorVendedor([msg("s1", "a", "outbound", "2026-11-26T02:30:00Z"), msg("s1", "b", "outbound", "2026-11-26T03:30:00Z")], donos, "2026-11-25");
    expect(r.get("angelo")?.hoje.abordados).toBe(1);
  });
});
