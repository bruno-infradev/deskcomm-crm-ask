import { describe, expect, it } from "vitest";

import {
  grupoDaArea,
  opcoesDaResposta,
  passaNasRespostas,
  respostasDoPopup,
} from "./respostas-do-popup";

const lead = (custom_fields: Record<string, unknown>) => ({ custom_fields });

describe("respostasDoPopup", () => {
  it("lê as chaves do popup do workshop", () => {
    expect(
      respostasDoPopup(
        lead({ possui_clinica: "Sim", atua_injetaveis: "Não", profissao: "Dermatologista", faturamento_lp: "Entre 10 e 30 mil" }),
      ),
    ).toEqual({ clinica: "Sim", injetaveis: "Não", area: "Médico(a)", faturamento: "Entre 10 e 30 mil" });
  });

  it("lê as chaves do formulário de qualificação", () => {
    expect(
      respostasDoPopup(lead({ tem_clinica: "sim", especialidade: "Harmonização orofacial / Odontologia", faturamento_mensal: "R$ 100 a 500 mil" })),
    ).toEqual({ clinica: "Sim", area: "Dentista", faturamento: "R$ 100 a 500 mil" });
  });

  it("não inventa resposta para campo vazio e mantém o original intacto", () => {
    const campos = { especialidade: "", tem_clinica: "" };
    expect(respostasDoPopup(lead(campos))).toEqual({});
    expect(campos).toEqual({ especialidade: "", tem_clinica: "" });
  });
});

describe("grupoDaArea", () => {
  it.each([
    ["Médico(a) (endócrino, nutrólogo, dermato...)", "Médico(a)"],
    ["Medicina estética", "Médico(a)"],
    ["Endocrinologia / Medicina integrativa", "Médico(a)"],
    ["Biomédica", "Biomédico(a)"],
    ["Enfermeira", "Enfermeiro(a)"],
    ["Dentista", "Dentista"],
    ["Outra área da saúde", "Outra"],
    ["Outro: Formando em Medicina", "Outra"],
  ])("%s vira %s", (bruto, grupo) => {
    expect(grupoDaArea(bruto)).toBe(grupo);
  });
});

describe("filtro", () => {
  const leads = [
    lead({ profissao: "Dermatologista", possui_clinica: "Sim" }),
    lead({ profissao: "Biomédica", possui_clinica: "Não" }),
    lead({}),
  ];
  it("OU dentro da pergunta e E entre perguntas", () => {
    expect(leads.filter((l) => passaNasRespostas(l, { area: ["Médico(a)", "Biomédico(a)"] }))).toHaveLength(2);
    expect(leads.filter((l) => passaNasRespostas(l, { area: ["Médico(a)", "Biomédico(a)"], clinica: ["Sim"] }))).toHaveLength(1);
  });
  it("lead sem a resposta não passa quando a pergunta está filtrada, e sem filtro todos passam", () => {
    expect(passaNasRespostas(lead({}), { area: ["Médico(a)"] })).toBe(false);
    expect(leads.filter((l) => passaNasRespostas(l, undefined))).toHaveLength(3);
  });
  it("as opções são os valores reais, faturamento por faixa crescente", () => {
    expect(opcoesDaResposta([lead({ faturamento_lp: "Acima de 100 mil" }), lead({ faturamento_mensal: "Até R$ 50 mil" }), lead({ faturamento_lp: "Entre 30 e 60 mil" })], "faturamento")).toEqual([
      "Até R$ 50 mil",
      "Entre 30 e 60 mil",
      "Acima de 100 mil",
    ]);
  });
});
