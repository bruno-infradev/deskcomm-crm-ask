import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";

import { OrigemDoLead } from "./OrigemDoLead";

const ver = (lead: { source_metadata: Record<string, unknown>; created_at: string }) =>
  render(
    <IdiomaProvider locale="pt-BR">
      <OrigemDoLead lead={lead} />
    </IdiomaProvider>,
  );

describe("OrigemDoLead", () => {
  it("lead que voltou: mostra Origem da última entrada e a Primeira entrada", () => {
    ver({
      created_at: "2026-11-10T23:37:00Z",
      source_metadata: { utm_source: "facebook", utm_campaign: "clinica-prova-crises", last_entrada_em: "2026-11-13T00:54:50Z", last_utm_source: "meta", last_utm_campaign: "workshop-antes-depois", last_utm_content: "ws-011" },
    });
    expect(screen.getByTestId("origem-ultima")).toHaveTextContent("Meta · workshop-antes-depois · ws-011");
    expect(screen.getByTestId("origem-primeira")).toHaveTextContent("Facebook · clinica-prova-crises");
  });

  it("lead novo: só a origem do cadastro", () => {
    ver({ created_at: "2026-11-12T19:50:00Z", source_metadata: { utm_source: "meta", utm_campaign: "workshop-antes-depois", utm_content: "ws-011" } });
    expect(screen.getByTestId("origem-ultima")).toHaveTextContent("Meta · workshop-antes-depois · ws-011");
    expect(screen.queryByTestId("origem-primeira")).toBeNull();
  });

  it("sem UTM: diz 'sem UTM (orgânico ou link direto)'", () => {
    ver({ created_at: "2026-11-12T19:50:00Z", source_metadata: {} });
    expect(screen.getByTestId("origem-ultima")).toHaveTextContent("sem UTM (orgânico ou link direto)");
  });
});
