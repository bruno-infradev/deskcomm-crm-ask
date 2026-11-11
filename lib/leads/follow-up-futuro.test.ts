import { describe, expect, it } from "vitest";

import { dataBr, dataDeRetomada, ehEtapaFollowUpFuturo, somaMeses } from "./follow-up-futuro";

describe("follow up futuro", () => {
  it("soma meses sem estourar o mês curto", () => {
    expect(somaMeses(new Date(2026, 10, 11), 6)).toBe("2027-05-11");
    expect(somaMeses(new Date(2026, 10, 11), 12)).toBe("2027-11-11");
    expect(somaMeses(new Date(2026, 10, 30), 3)).toBe("2027-02-28");
  });
  it("lê só data válida", () => {
    expect(dataDeRetomada({ custom_fields: { retomar_em: "2027-05-11" } })).toBe("2027-05-11");
    expect(dataDeRetomada({ custom_fields: { retomar_em: "amanhã" } })).toBeNull();
    expect(dataDeRetomada({ custom_fields: {} })).toBeNull();
  });
  it("reconhece a etapa pelo slug e formata em pt-BR", () => {
    expect(ehEtapaFollowUpFuturo({ slug: "follow_up_futuro" })).toBe(true);
    expect(ehEtapaFollowUpFuturo({ slug: "follow_up" })).toBe(false);
    expect(dataBr("2027-05-11")).toBe("11/05/2027");
  });
});
