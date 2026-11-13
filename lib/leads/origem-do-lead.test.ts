import { describe, expect, it } from "vitest";

import { origemDoLead, SEM_UTM } from "./origem-do-lead";

describe("origemDoLead", () => {
  it("lead novo: só a origem do cadastro, sem 'primeira entrada'", () => {
    const o = origemDoLead({ utm_source: "meta", utm_campaign: "workshop-antes-depois", utm_content: "ws-011-preenchimento-labial-1112" }, "2026-11-12T19:50:00Z");
    expect(o.ultima.texto).toBe("Meta · workshop-antes-depois · ws-011-preenchimento-labial-1112");
    expect(o.primeira).toBeNull();
  });

  it("lead que voltou por outra origem: última entrada em cima e a primeira embaixo", () => {
    const o = origemDoLead(
      { utm_source: "facebook", utm_campaign: "clinica-prova-crises", utm_content: "crises-1109", last_entrada_em: "2026-11-13T00:54:50Z", last_utm_source: "meta", last_utm_campaign: "workshop-antes-depois", last_utm_content: "ws-011" },
      "2026-11-10T23:37:00Z",
    );
    expect(o.ultima).toEqual({ texto: "Meta · workshop-antes-depois · ws-011", data: "2026-11-13T00:54:50Z" });
    expect(o.primeira).toEqual({ texto: "Facebook · clinica-prova-crises · crises-1109", data: "2026-11-10T23:37:00Z" });
  });

  it("voltou sem UTM: a última diz 'sem UTM' e a primeira segue visível", () => {
    const o = origemDoLead({ utm_source: "facebook", utm_campaign: "c", last_entrada_em: "2026-11-13T00:54:50Z" }, "2026-11-10T00:00:00Z");
    expect(o.ultima.texto).toBe(SEM_UTM);
    expect(o.primeira?.texto).toBe("Facebook · c");
  });

  it("lead sem nenhum dado (planilha) mostra 'sem UTM' e não quebra", () => {
    expect(origemDoLead(null, null).ultima.texto).toBe(SEM_UTM);
    expect(origemDoLead({}, "2026-11-10T00:00:00Z").primeira).toBeNull();
  });

  it("voltou pela mesma origem: não repete a primeira", () => {
    const o = origemDoLead({ utm_source: "meta", utm_campaign: "x", last_entrada_em: "2026-11-13T00:00:00Z", last_utm_source: "meta", last_utm_campaign: "x" }, "2026-11-10T00:00:00Z");
    expect(o.primeira).toBeNull();
  });
});
