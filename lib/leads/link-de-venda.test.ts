import { describe, expect, it } from "vitest";

import { linkComUtm, slugDe, slugDoVendedor } from "./link-de-venda";

describe("link de venda com UTM", () => {
  it("slug do vendedor sem acento e com hífen", () => {
    expect(slugDoVendedor("João Paulo")).toBe("joao-paulo");
    expect(slugDoVendedor("Ângelo")).toBe("angelo");
    expect(slugDoVendedor("Vanessa")).toBe("vanessa");
    expect(slugDoVendedor("joao.paulo@metodoask.com.br")).toBe("joao-paulo");
  });
  it("slug de produto e valor", () => {
    expect(slugDe("Workshop Hands On")).toBe("workshop-hands-on");
    expect(slugDe("R$ 20 mil")).toBe("20-mil");
    expect(slugDe("R$ 6.900")).toBe("6900");
  });
  it("monta o link com os quatro UTMs", () => {
    expect(linkComUtm("https://pay.hub.la/beN8Sk7xOmnrmB406ZhT", "Workshop Hands On", "R$ 20 mil", "vanessa")).toBe(
      "https://pay.hub.la/beN8Sk7xOmnrmB406ZhT?utm_source=crm&utm_medium=whatsapp&utm_campaign=workshop-hands-on-20-mil&utm_content=vanessa",
    );
  });
  it("preserva a query que o link já tinha", () => {
    expect(linkComUtm("https://pay.hub.la/x?off=1", "ASK10X", "R$ 6.900", "angelo")).toContain("off=1&utm_source=crm");
  });
});
