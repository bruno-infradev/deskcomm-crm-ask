import { describe, expect, it } from "vitest";

import { conversaoPorOrigem, formaDaVenda, origensDoLead, resumirVendas, tempoDeResposta } from "@/lib/metrics/resultado-comercial";

const m = (contact_id: string, direction: string, hhmm: string) => ({ contact_id, direction, created_at: `2026-11-11T${hhmm}:00Z` });

describe("tempoDeResposta", () => {
  it("mede do inbound até a primeira saída seguinte e conta quem ficou sem resposta", () => {
    const r = tempoDeResposta([m("a", "inbound", "12:00"), m("a", "outbound", "12:10"), m("b", "inbound", "13:00"), m("c", "outbound", "13:00"), m("c", "inbound", "14:00")]);
    expect(r).toEqual({ media_minutos: 10, respondidos: 1, sem_resposta: 2 });
  });
  it("devolve média nula quando nada foi respondido", () => {
    expect(tempoDeResposta([m("a", "inbound", "12:00")]).media_minutos).toBeNull();
  });
  it("só a primeira mensagem da rajada do lead conta", () => {
    const r = tempoDeResposta([m("a", "inbound", "12:00"), m("a", "inbound", "12:05"), m("a", "outbound", "12:20")]);
    expect(r.media_minutos).toBe(20);
  });
});

describe("resumirVendas", () => {
  it("separa Hubla de fora da Hubla", () => {
    const r = resumirVendas([{ valor_reais: 15000, forma: "fora_da_hubla" }, { valor_reais: 5000, forma: "hubla" }]);
    expect(r).toEqual({ qtd: 2, valor_reais: 20000, hubla: { qtd: 1, valor_reais: 5000 }, fora_da_hubla: { qtd: 1, valor_reais: 15000 } });
  });
  it("forma desconhecida vira nao_informada", () => {
    expect(formaDaVenda("pix")).toBe("nao_informada");
  });
});

describe("conversaoPorOrigem", () => {
  it("agrupa por tag de origem e calcula taxa e vendas", () => {
    const r = conversaoPorOrigem([
      { abordado: true, respondeu: true, tags: ["workshop", "x"], venda_reais: 3000 },
      { abordado: true, respondeu: false, tags: ["workshop"], venda_reais: null },
      { abordado: true, respondeu: true, tags: [], venda_reais: null },
    ]);
    expect(r[0]).toEqual({ origem: "workshop", abordados: 2, responderam: 1, taxa_resposta: 50, vendas: 1, valor_reais: 3000 });
    expect(r.find((o) => o.origem === "sem-origem")?.abordados).toBe(1);
  });
  it("lead com funil-* usa a tag de funil como origem", () => {
    expect(origensDoLead(["funil-imersao", "etapa-fechado"])).toEqual(["funil-imersao"]);
  });
});
