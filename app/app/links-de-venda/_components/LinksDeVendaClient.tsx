"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface Link {
  id: string;
  produto: string;
  rotulo: string;
  vendedor: string;
  url: string;
  ordem: number;
}

/**
 * Produto > valor > um link por vendedor, tudo visível (pedido do Bruno em 11/11/2026): sem seletor de vendedor e sem
 * montar link na tela. O link de cada linha já vem pronto da tabela (curto, do GreatPages, com o UTM no destino) e o
 * botão copia exatamente o que está escrito. SÓ LEITURA: ninguém cria link pelo CRM.
 */
export function LinksDeVendaClient() {
  const [links, setLinks] = useState<Link[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/v1/links-de-venda", { cache: "no-store" });
      const corpo = await r.json();
      if (!r.ok) throw new Error(corpo?.error?.message ?? `erro ${r.status}`);
      setLinks(corpo.data.links as Link[]);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui carregar.");
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 0);
    return () => clearTimeout(t);
  }, [carregar]);

  const porProduto = useMemo(() => {
    const produtos = new Map<string, Map<string, Link[]>>();
    for (const l of links ?? []) {
      const valores = produtos.get(l.produto) ?? new Map<string, Link[]>();
      valores.set(l.rotulo, [...(valores.get(l.rotulo) ?? []), l]);
      produtos.set(l.produto, valores);
    }
    return Array.from(produtos.entries()).map(([produto, valores]) => [produto, Array.from(valores.entries())] as const);
  }, [links]);

  async function copiar(l: Link) {
    try {
      await navigator.clipboard.writeText(l.url);
    } catch {
      const area = document.createElement("textarea");
      area.value = l.url;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopiado(l.id);
    setTimeout(() => setCopiado((atual) => (atual === l.id ? null : atual)), 2000);
  }

  if (links === null && !erro) return <Skeleton className="h-40 w-full" />;
  return (
    <div className="flex flex-col gap-4" data-testid="links-de-venda">
      {erro ? <p role="alert" className="text-sm text-destructive">{erro}</p> : null}
      {links?.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum link cadastrado ainda.</p> : null}
      {porProduto.map(([produto, valores]) => (
        <Card key={produto}>
          <CardHeader>
            <CardTitle className="text-base">{produto}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {valores.map(([rotulo, itens]) => (
              <div key={rotulo} className="flex flex-col gap-1.5" data-testid="valor-do-produto">
                <h3 className="text-sm font-semibold">{rotulo}</h3>
                {itens.map((l) => (
                  <div key={l.id} className="flex flex-wrap items-center gap-2" data-testid="link-de-venda">
                    <span className="w-28 shrink-0 text-sm font-medium">{l.vendedor || "Sem vendedor"}</span>
                    <span className="min-w-0 flex-1 break-all text-xs text-muted-foreground" data-testid="link-completo">{l.url}</span>
                    <Button size="sm" onClick={() => void copiar(l)}>{copiado === l.id ? "Copiado ✓" : "Copiar"}</Button>
                  </div>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
