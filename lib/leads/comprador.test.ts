import { describe, expect, it } from "vitest";

import type { Lead } from "@/lib/types/leads";
import { produtosComprados } from "./comprador";

const lead = (tags: string[], contact_tags: string[] = []) => ({ tags, contact_tags, conversation_tags: [] }) as unknown as Lead;

describe("produtosComprados", () => {
  it("lê a etiqueta da pessoa e a do negócio, sem repetir", () => {
    expect(produtosComprados(lead(["comprador-workshop"], ["compradores-mentoria", "comprador-mentoria"]))).toEqual(["Mentoria", "Workshop"]);
  });
  it("etiqueta solta de interesse não vira comprador", () => {
    expect(produtosComprados(lead(["workshop", "comprador", "lp-workshop"]))).toEqual([]);
  });
});
