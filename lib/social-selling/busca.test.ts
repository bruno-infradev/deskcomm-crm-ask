import { describe, expect, it } from "vitest";

import { avaliarPerfil, cacheValido, chaveDeCache, filtrarEPontuar, montarTermo, restanteDaCota } from "./busca";

const AGORA = new Date("2026-11-25T12:00:00Z");
const derma = { username: "Dra.Fulana", fullName: "Dra. Fulana | Dermatologista Maringá", biography: "Dermatologista SBD\nBotox | Laser\nCRM 12345 RQE 6789\nMaringá - PR", followersCount: 8000, externalUrls: [], latestPosts: [{ timestamp: "2026-09-01T10:00:00Z" }] };

describe("busca de perfis do social selling", () => {
  it("pontua médico com margem e explica o motivo", () => {
    const r = avaliarPerfil(derma, { agora: AGORA });
    if (!("perfil" in r)) throw new Error("devia pontuar");
    expect(r.perfil.nota).toBeGreaterThanOrEqual(9);
    expect(r.perfil.especialidade).toBe("Dermatologia");
    expect(r.perfil.produto).toBe("Workshop");
    expect(r.perfil.motivo).toContain("faixa com margem");
    expect(r.perfil.mensagem).toContain("[DIA]");
  });
  it("exclui dentista, biomédico, gigante e quem não parece médico", () => {
    const motivo = (p: object) => { const r = avaliarPerfil({ username: "x", ...p }, { agora: AGORA }); return "exclusao" in r ? r.exclusao.motivo : "ok"; };
    expect(motivo({ fullName: "Dr. Beto Dentista", biography: "Cirurgião-dentista CRO 123" })).toContain("dentista");
    expect(motivo({ fullName: "Bia Biomédica", biography: "Biomédica esteta" })).toContain("fora do público");
    expect(motivo({ fullName: "Dr. Gigante", biography: "Médico dermatologista", followersCount: 185346 })).toContain("já grande");
    expect(motivo({ fullName: "Loja de roupas", biography: "Moda feminina" })).toContain("não parece médico");
  });
  it("manda emagrecimento para Mentoria e íntimo para Acelerador", () => {
    const nutro = avaliarPerfil({ username: "n", fullName: "Dr. N", biography: "Médico nutrólogo, emagrecimento. CRM 1", followersCount: 5000 }, { agora: AGORA });
    const gineco = avaliarPerfil({ username: "g", fullName: "Dra. G", biography: "Ginecologista, rejuvenescimento íntimo. CRM 2", followersCount: 5000 }, { agora: AGORA });
    expect("perfil" in nutro && nutro.perfil.produto).toBe("Mentoria");
    expect("perfil" in gineco && gineco.perfil.produto).toBe("Acelerador");
  });
  it("tira repetidos e quem já está no CRM, e ordena por nota", () => {
    const fraco = { ...derma, username: "fraca", followersCount: 25000, externalUrls: [{}], biography: "Médica. CRM 9" };
    const { perfis, excluidos } = filtrarEPontuar([fraco, derma, derma, { ...derma, username: "ja_tem" }], new Set(["ja_tem"]), { agora: AGORA });
    expect(perfis.map((p) => p.username)).toEqual(["dra.fulana", "fraca"]);
    expect(excluidos).toEqual([{ username: "ja_tem", motivo: "já está no CRM ou já foi abordado" }]);
  });
  it("monta o termo, a chave e a validade do cache de 7 dias", () => {
    expect(montarTermo({ especialidade: "Dermatologia", cidade: "Maringá PR", palavra: "#botox" })).toBe("dermatologista botox Maringá PR");
    expect(chaveDeCache("Dermatologista  MARINGÁ")).toBe("user:dermatologista maringa");
    expect(cacheValido("2026-11-20T12:00:00Z", AGORA)).toBe(true);
    expect(cacheValido("2026-11-10T12:00:00Z", AGORA)).toBe(false);
  });
  it("calcula o que resta da cota diária", () => {
    expect(restanteDaCota(12, 20)).toBe(8);
    expect(restanteDaCota(25, 20)).toBe(0);
  });
});
