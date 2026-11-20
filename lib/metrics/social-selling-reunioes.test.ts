import { describe, expect, it } from "vitest";

import { porEspecialidade, porVersao, resumir, type Reuniao } from "./social-selling-reunioes";

const r = (n: Partial<Reuniao>): Reuniao => ({ id: "x", user_id: "a", dia: "2026-11-20", lead: "Dra. X", contato: "", link_zoom: "", especialidade: "Dermatologia", versao_roteiro: "C1", gravada: false, link_gravacao: "", resultado: "marcada", obs: "", ...n });

describe("resumir", () => {
  it("conta marcadas, feitas, no-show, propostas, vendas, gravadas e comparecimento", () => {
    const s = resumir([r({ resultado: "marcada" }), r({ resultado: "no_show" }), r({ resultado: "feita", gravada: true }), r({ resultado: "proposta" }), r({ resultado: "venda", gravada: true })]);
    expect(s).toEqual({ marcadas: 5, feitas: 3, no_show: 1, propostas: 2, vendas: 1, gravadas: 2, comparecimento: 75 });
  });
  it("sem base devolve traço no comparecimento", () => {
    expect(resumir([r({ resultado: "marcada" })]).comparecimento).toBeNull();
    expect(resumir([]).marcadas).toBe(0);
  });
});

describe("agrupar", () => {
  const lista = [
    r({ especialidade: "Dermatologia", versao_roteiro: "C1", resultado: "feita" }),
    r({ especialidade: "Ginecologia", versao_roteiro: "P2", resultado: "venda" }),
    r({ especialidade: "Ginecologia", versao_roteiro: "P2", resultado: "no_show" }),
    r({ especialidade: "", versao_roteiro: "", resultado: "marcada" }),
  ];
  it("ordena pela especialidade que mais vende", () => {
    const g = porEspecialidade(lista);
    expect(g.map((x) => x.chave)).toEqual(["Ginecologia", "Dermatologia", "Sem especialidade"]);
    expect(g[0]?.resumo.vendas).toBe(1);
  });
  it("agrupa por versão e junta as sem versão", () => {
    expect(porVersao(lista).map((x) => x.chave)).toEqual(["P2", "C1", "Sem versão"]);
  });
  it("a soma dos grupos é o total", () => {
    expect(porEspecialidade(lista).reduce((n, x) => n + x.resumo.marcadas, 0)).toBe(lista.length);
  });
});
