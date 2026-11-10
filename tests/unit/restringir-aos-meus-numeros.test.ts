import { describe, expect, it } from "vitest";

import { restringirAosMeusNumeros } from "@/lib/channels/conversa-nova";

const canais = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("restringirAosMeusNumeros", () => {
  it("vendedor com número próprio só vê o dele", () => {
    expect(restringirAosMeusNumeros(canais, ["b"])).toEqual([{ id: "b" }]);
  });
  it("sem número próprio (admin) segue com a lista inteira", () => {
    expect(restringirAosMeusNumeros(canais, [])).toHaveLength(3);
    expect(restringirAosMeusNumeros(canais, undefined)).toHaveLength(3);
  });
  it("número próprio fora da lista (arquivado) não zera a lista", () => {
    expect(restringirAosMeusNumeros(canais, ["x"])).toHaveLength(3);
  });
});
