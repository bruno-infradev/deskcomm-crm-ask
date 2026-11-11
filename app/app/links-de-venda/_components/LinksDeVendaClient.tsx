"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

interface Link {
  id: string;
  produto: string;
  rotulo: string;
  url: string;
  ordem: number;
}

const VAZIO = { produto: "", rotulo: "", url: "" };

export function LinksDeVendaClient() {
  const [links, setLinks] = useState<Link[] | null>(null);
  const [podeEditar, setPodeEditar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [form, setForm] = useState(VAZIO);
  const [editando, setEditando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/v1/links-de-venda", { cache: "no-store" });
      const corpo = await r.json();
      if (!r.ok) throw new Error(corpo?.error?.message ?? `erro ${r.status}`);
      setLinks(corpo.data.links as Link[]);
      setPodeEditar(Boolean(corpo.data.pode_editar));
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

  async function salvar() {
    const url = editando ? `/api/v1/links-de-venda/${editando}` : "/api/v1/links-de-venda";
    const r = await fetch(url, { method: editando ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok) {
      setErro(corpo?.error?.message ?? "Confira produto, nome e link.");
      return;
    }
    setForm(VAZIO);
    setEditando(null);
    void carregar();
  }

  async function apagar(l: Link) {
    if (!window.confirm(`Apagar "${l.rotulo}"?`)) return;
    const r = await fetch(`/api/v1/links-de-venda/${l.id}`, { method: "DELETE" });
    if (!r.ok) setErro("Não consegui apagar.");
    void carregar();
  }

  if (links === null && !erro) return <Skeleton className="h-40 w-full" />;
  return (
    <div className="flex flex-col gap-4" data-testid="links-de-venda">
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
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{l.url}</span>
                <Button size="sm" onClick={() => void copiar(l)}>{copiado === l.id ? "Copiado ✓" : "Copiar"}</Button>
                {podeEditar ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => { setEditando(l.id); setForm({ produto: l.produto, rotulo: l.rotulo, url: l.url }); }}>Editar</Button>
                    <Button size="sm" variant="ghost" onClick={() => void apagar(l)}>Apagar</Button>
                  </>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
      {podeEditar ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{editando ? "Editar link" : "Novo link"}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Input className="w-48" placeholder="Produto (ex.: Workshop)" value={form.produto} onChange={(e) => setForm({ ...form, produto: e.target.value })} />
            <Input className="w-56" placeholder="Nome (ex.: R$ 15 mil, Pix)" value={form.rotulo} onChange={(e) => setForm({ ...form, rotulo: e.target.value })} />
            <Input className="min-w-64 flex-1" placeholder="https://pay.hub.la/..." value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            <Button onClick={() => void salvar()}>{editando ? "Salvar" : "Adicionar"}</Button>
            {editando ? <Button variant="ghost" onClick={() => { setEditando(null); setForm(VAZIO); }}>Cancelar</Button> : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
