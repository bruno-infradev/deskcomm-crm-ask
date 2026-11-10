import { describe, expect, it } from "vitest";

import { abordagemPorHora } from "@/lib/metrics/abordagem-por-hora";

// 2026-11-10 em São Paulo (UTC-3): 10h SP = 13h UTC
const msg = (contact: string, direction: string, utc: string) => ({ contact_id: contact, direction, created_at: `2026-11-10T${utc}:00Z` });

describe("abordagemPorHora", () => {
  it("conta o contato na hora da primeira saída e soma igual ao total", () => {
    const horas = abordagemPorHora([
      msg("a", "outbound", "13:05"),
      msg("a", "outbound", "14:10"),
      msg("b", "outbound", "14:20"),
      msg("a", "inbound", "14:30"),
      msg("c", "inbound", "14:31"),
    ]);
    expect(horas.find((h) => h.hora === 10)).toMatchObject({ abordados: 1, mensagens: 1, respostas: 0 });
    expect(horas.find((h) => h.hora === 11)).toMatchObject({ abordados: 1, mensagens: 2, respostas: 1 });
    expect(horas.reduce((s, h) => s + h.abordados, 0)).toBe(2);
    expect(horas.reduce((s, h) => s + h.respostas, 0)).toBe(1);
  });
  it("manda mensagens fora de 7h a 22h para as pontas", () => {
    const horas = abordagemPorHora([
      msg("a", "outbound", "05:00"), // 2h SP vira 7h
      { contact_id: "b", direction: "outbound", created_at: "2026-11-11T02:30:00Z" }, // 23h30 SP vira 22h
    ]);
    expect(horas.at(0)?.abordados).toBe(1);
    expect(horas.at(-1)?.abordados).toBe(1);
  });
});
