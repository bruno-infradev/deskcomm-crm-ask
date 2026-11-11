"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { linkComUtm } from "@/lib/leads/link-de-venda";

interface Link {
  id: string;
  produto: string;
  rotulo: string;
  url: string;
  ordem: number;
}

export function LinksDeVendaClient() {
  const [links, setLinks] = useState<Link[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [eu, setEu] = useState<{ slug: string; nome: string } | null>(null);
  const [vendedores, setVendedores] = useState<Array<{ slug: string; nome: string }>>([]);
  const [vendedorEscolhido, setVendedorEscolhido] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/v1/links-de-venda", { cache: "no-store" });
      const corpo = await r.json();
      if (!r.ok) throw new Error(corpo?.error?.message ?? `erro ${r.status}`);
      setLinks(corpo.data.links as Link[]);
      setEu(corpo.data.eu ?? null);
      setVendedores((corpo.data.vendedores ?? []) as Array<{ slug: string; nome: string }>);
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
    const grupos = new Map<string, Link[]>();
    for (const l of links ?? []) grupos.set(l.produto, [...(grupos.get(l.produto) ?? []), l]);
    return Array.from(grupos.entries());
  }, [links]);

  // De quem é o UTM: o vendedor logado; o admin escolhe (padrão: ele mesmo se for vendedor, senão o primeiro da lista).
  const slugDoUtm = vendedorEscolhido ?? (vendedores.length > 0 && !vendedores.some((v) => v.slug === eu?.slug) ? (vendedores[0]?.slug ?? "") : (eu?.slug ?? ""));
  const linkFinal = (l: Link) => (slugDoUtm ? linkComUtm(l.url, l.produto, l.rotulo, slugDoUtm) : l.url);

  async function copiar(l: Link) {
    const texto = linkFinal(l);
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      const area = document.createElement("textarea");
      area.value = texto;
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
      {vendedores.length > 0 ? (
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Copiar com o UTM de:</span>
          <select
            data-testid="vendedor-do-utm"
            className="rounded-md border bg-background px-2 py-1"
            value={slugDoUtm}
            onChange={(e) => setVendedorEscolhido(e.target.value)}
          >
            {vendedores.map((v) => (
              <option key={v.slug} value={v.slug}>{v.nome}</option>
            ))}
          </select>
        </label>
      ) : null}
      {erro ? <p role="alert" className="text-sm text-destructive">{erro}</p> : null}
      {links?.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum link cadastrado ainda.</p> : null}
      {porProduto.map(([produto, itens]) => (
        <Card key={produto}>
          <CardHeader>
            <CardTitle className="text-base">{produto}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {itens.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-2" data-testid="link-de-venda">
                <span className="min-w-40 text-sm font-medium">{l.rotulo}</span>
                <span className="min-w-0 flex-1 break-all text-xs text-muted-foreground" data-testid="link-completo">{linkFinal(l)}</span>
                <Button size="sm" onClick={() => void copiar(l)}>{copiado === l.id ? "Copiado ✓" : "Copiar"}</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
