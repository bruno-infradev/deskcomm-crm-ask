import { describe, expect, it } from "vitest";

import { CHAVE_EQUIPE, diasDaSemana, montarSemana, taxas, type LancamentoDoDia } from "./social-selling";

const lanc = (dia: string, user_id: string | null, n: Partial<LancamentoDoDia> = {}): LancamentoDoDia => ({
  dia, user_id, mensagens_enviadas: 0, respostas: 0, whatsapp: 0, agendamento: 0, no_show: 0, obs: "", ...n,
});

describe("diasDaSemana", () => {
  it("devolve segunda a sexta a partir de qualquer dia útil", () => {
    expect(diasDaSemana("2026-11-20")).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"]);
    expect(diasDaSemana("2026-11-16")[0]).toBe("2026-11-16");
  });
  it("sábado e domingo ficam na semana que acabou", () => {
    expect(diasDaSemana("2026-11-21")[0]).toBe("2026-11-16");
    expect(diasDaSemana("2026-11-22")[4]).toBe("2026-11-20");
  });
});

describe("montarSemana", () => {
  const dados = [
    lanc("2026-11-16", "angelo", { mensagens_enviadas: 30, respostas: 6, agendamento: 1 }),
    lanc("2026-11-16", "joao", { mensagens_enviadas: 10, respostas: 2 }),
    lanc("2026-11-17", "angelo", { mensagens_enviadas: 20, respostas: 4, whatsapp: 2, obs: "3 no-show" }),
    lanc("2026-11-23", "angelo", { mensagens_enviadas: 99 }), // outra semana: não entra
  ];
  const semana = montarSemana("2026-11-18", dados);
  it("o total da semana é a soma exata dos dias", () => {
    expect(semana.total.mensagens_enviadas).toBe(60);
    expect(semana.dias.reduce((s, d) => s + d.total.mensagens_enviadas, 0)).toBe(60);
    expect(semana.total.respostas).toBe(12);
  });
  it("separa por vendedor no dia e na semana", () => {
    expect(semana.dias[0]?.por_vendedor.angelo?.mensagens_enviadas).toBe(30);
    expect(semana.dias[0]?.por_vendedor.joao?.mensagens_enviadas).toBe(10);
    expect(semana.por_vendedor.angelo?.mensagens_enviadas).toBe(50);
  });
  it("lançamento sem vendedor (histórico) vira equipe", () => {
    const s = montarSemana("2026-10-19", [lanc("2026-10-19", null, { mensagens_enviadas: 6 })]);
    expect(s.por_vendedor[CHAVE_EQUIPE]?.mensagens_enviadas).toBe(6);
  });
  it("junta as observações do dia", () => {
    expect(semana.dias[1]?.obs).toEqual(["3 no-show"]);
  });
});

describe("taxas", () => {
  it("calcula resposta sobre enviadas e agendamento sobre respostas, com traço sem base", () => {
    expect(taxas({ mensagens_enviadas: 40, respostas: 10, whatsapp: 0, agendamento: 2, no_show: 0 })).toEqual({ resposta_sobre_enviadas: 25, agendamento_sobre_respostas: 20 });
    expect(taxas({ mensagens_enviadas: 0, respostas: 0, whatsapp: 0, agendamento: 0, no_show: 0 })).toEqual({ resposta_sobre_enviadas: null, agendamento_sobre_respostas: null });
  });
});
