"use client";

import { useCallback, useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ESPECIALIDADES = ["Dermatologia", "Medicina estética", "Emagrecimento e nutrologia", "Ginecologia", "Oftalmologia", "Otorrinolaringologia", "Urologia", "Cirurgia plástica", "Medicina do esporte"];
const STATUS = [
  { valor: "fila", rotulo: "Na fila" },
  { valor: "abordado", rotulo: "Abordado" },
  { valor: "respondeu", rotulo: "Respondeu" },
  { valor: "reuniao", rotulo: "Reunião marcada" },
  { valor: "descartado", rotulo: "Descartado" },
] as const;

interface Perfil { username: string; nome: string; bio: string; seguidores: number | null; especialidade: string; cidade: string; registro: string; nota: number; motivo: string; produto: string; link: string; ultimo_post: string | null; mensagem: string; versao_roteiro: string; privado: boolean }
interface Prospecto { id: string; user_id: string | null; username: string; nome: string; seguidores: number | null; especialidade: string; cidade: string; nota: number; produto: string; mensagem: string; versao_roteiro: string; origem: string; status: string }
interface Uso { limite: number; usados: number; restante: number }

const corDaNota = (n: number) => (n >= 8 ? "bg-green-600 text-white" : n >= 6 ? "bg-amber-500 text-white" : "bg-muted text-foreground");

export function BuscaPerfisClient() {
  const [uso, setUso] = useState<Uso | null>(null);
  const [form, setForm] = useState({ especialidade: "Dermatologia", cidade: "", palavra: "" });
  const [resultado, setResultado] = useState<Perfil[] | null>(null);
  const [rodape, setRodape] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [fila, setFila] = useState<Prospecto[]>([]);
  const [eu, setEu] = useState<string>("");
  const [aberto, setAberto] = useState<string | null>(null);

  const carregarFila = useCallback(async () => {
    const r = await fetch("/api/v1/social-selling/prospectos", { cache: "no-store" });
    const j = await r.json();
    if (r.ok) { setFila(j.data.prospectos as Prospecto[]); setEu(j.data.eu as string); }
  }, []);
  const carregarUso = useCallback(async () => {
    const r = await fetch("/api/v1/social-selling/busca", { cache: "no-store" });
    const j = await r.json();
    if (r.ok) setUso(j.data as Uso);
  }, []);
  useEffect(() => { void carregarFila(); void carregarUso(); }, [carregarFila, carregarUso]);

  async function buscar(atualizar = false) {
    setAviso(null); setBuscando(true); setResultado(null); setRodape(null);
    try {
      const r = await fetch("/api/v1/social-selling/busca", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, atualizar }) });
      const j = await r.json();
      if (!r.ok) { setAviso(j?.error?.message ?? "Não consegui buscar."); await carregarUso(); return; }
      setResultado(j.data.perfis as Perfil[]);
      setUso({ limite: j.data.limite, usados: j.data.usados, restante: j.data.restante });
      setRodape(`${j.data.do_cache ? "Resultado guardado de uma busca recente (sem custo). " : ""}${j.data.excluidos} perfis ficaram de fora (fora do público, grandes demais ou já abordados).`);
    } finally { setBuscando(false); }
  }
  async function adicionar(p: Perfil | { username: string; nome: string; seguidores: number | null; especialidade: string; cidade: string; nota: number; produto: string; mensagem: string; versao_roteiro: string }) {
    setAviso(null);
    const corpo = { username: p.username, nome: p.nome, bio: "bio" in p ? p.bio : "", seguidores: p.seguidores, especialidade: p.especialidade, cidade: p.cidade, registro: "registro" in p ? p.registro : "", nota: p.nota, motivo: "motivo" in p ? p.motivo : "", produto: p.produto, mensagem: p.mensagem, versao_roteiro: p.versao_roteiro };
    const r = await fetch("/api/v1/social-selling/prospectos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const j = await r.json();
    if (!r.ok) { setAviso(j?.error?.message ?? "Não consegui adicionar."); return; }
    setAviso(j.data.ja_estava ? "Esse perfil já estava na sua fila." : `@${p.username} entrou na sua fila.`);
    await carregarFila();
  }
  async function mudarStatus(id: string, status: string) {
    const r = await fetch("/api/v1/social-selling/prospectos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    const j = await r.json();
    if (!r.ok) { setAviso(j?.error?.message ?? "Não consegui atualizar."); return; }
    await carregarFila();
  }

  const minha = fila.filter((p) => p.user_id === eu);
  const base = fila.filter((p) => p.status === "base");
  const naFilaDeOutros = fila.filter((p) => p.user_id && p.user_id !== eu);
  const bloqueado = uso !== null && uso.restante === 0;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="text-xl font-semibold tracking-tight">Buscar perfis para social selling</h2>
        <p className="text-sm text-muted-foreground">Perfis públicos do Instagram, já pontuados pelo público da call de 20/11 (médicos com margem de crescimento, até 30 mil seguidores). Nada é enviado por aqui: você abre o perfil e manda a DM manualmente.</p>
      </header>

      <Card>
        <CardHeader><CardTitle>Buscar {uso && <span className="ml-2 text-sm font-normal text-muted-foreground">{uso.usados} de {uso.limite} usados hoje</span>}</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <label className="flex flex-col text-sm">Especialidade<select value={form.especialidade} onChange={(e) => setForm({ ...form, especialidade: e.target.value })} className="rounded-md border bg-background px-2 py-1">{ESPECIALIDADES.map((e) => <option key={e}>{e}</option>)}</select></label>
            <label className="flex flex-col text-sm">Cidade ou UF<input value={form.cidade} maxLength={60} placeholder="Maringá PR" onChange={(e) => setForm({ ...form, cidade: e.target.value })} className="rounded-md border bg-background px-2 py-1" /></label>
            <label className="flex flex-col text-sm md:col-span-2">Hashtag ou palavra-chave (opcional)<input value={form.palavra} maxLength={60} placeholder="botox, blefaroplastia, rejuvenescimento íntimo" onChange={(e) => setForm({ ...form, palavra: e.target.value })} className="rounded-md border bg-background px-2 py-1" /></label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={buscando || bloqueado} onClick={() => void buscar()} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">{buscando ? "Buscando..." : "Buscar"}</button>
            {resultado && !buscando && !bloqueado && <button type="button" onClick={() => void buscar(true)} className="rounded-md border px-3 py-2 text-sm">Buscar de novo (ignora o guardado)</button>}
            {bloqueado && <span className="text-sm text-destructive">Você usou os {uso?.limite} perfis de hoje. A cota volta à meia-noite (São Paulo).</span>}
            {aviso && <span className="text-sm text-muted-foreground">{aviso}</span>}
          </div>
        </CardContent>
      </Card>

      {resultado && (
        <div className="flex flex-col gap-3">
          {resultado.length === 0 && <p className="text-sm text-muted-foreground">Nenhum perfil novo dentro do público nessa busca. Tente outra cidade ou palavra.</p>}
          {resultado.map((p) => {
            const naFila = fila.some((f) => f.username === p.username && f.user_id === eu);
            return (
              <Card key={p.username}>
                <CardContent className="flex flex-col gap-2 pt-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`rounded-md px-2 py-1 text-sm font-semibold ${corDaNota(p.nota)}`}>Nota {p.nota}</span>
                    <a href={p.link} target="_blank" rel="noreferrer" className="font-medium underline">@{p.username}</a>
                    <span className="text-sm">{p.nome}</span>
                    <span className="text-sm text-muted-foreground">{p.seguidores ?? "?"} seguidores{p.registro ? ` · ${p.registro}` : ""}{p.cidade ? ` · ${p.cidade}` : ""}</span>
                    <span className="rounded-md border px-2 py-0.5 text-xs">{p.especialidade}</span>
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium">Produto: {p.produto}</span>
                    {p.privado && <span className="text-xs text-muted-foreground">perfil privado</span>}
                  </div>
                  <p className="whitespace-pre-line text-sm text-muted-foreground">{p.bio}</p>
                  <p className="text-xs text-muted-foreground">Por que a nota: {p.motivo}.{p.ultimo_post ? ` Último post: ${p.ultimo_post.slice(0, 10)}.` : ""}</p>
                  <button type="button" onClick={() => setAberto(aberto === p.username ? null : p.username)} className="self-start text-sm underline">{aberto === p.username ? "Esconder a primeira mensagem" : "Ver a primeira mensagem (3 passos)"}</button>
                  {aberto === p.username && <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">{p.mensagem}</pre>}
                  <div><button type="button" disabled={naFila} onClick={() => void adicionar(p)} className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">{naFila ? "Na sua fila" : "Adicionar à minha fila"}</button></div>
                </CardContent>
              </Card>
            );
          })}
          {rodape && <p className="text-xs text-muted-foreground">{rodape}</p>}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Minha fila de prospecção</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {minha.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum perfil na sua fila ainda. Cada passo que você marcar (abordado, respondeu, reunião) soma nos números do dia.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left"><th className="py-2 pr-4">Perfil</th><th className="px-2 py-2">Especialidade</th><th className="px-2 py-2">Produto</th><th className="px-2 py-2 text-right">Nota</th><th className="px-2 py-2">Status</th></tr></thead>
              <tbody>
                {minha.map((p) => (
                  <tr key={p.id} className="border-b">
                    <td className="py-2 pr-4"><a href={`https://www.instagram.com/${p.username}/`} target="_blank" rel="noreferrer" className="underline">@{p.username}</a> <span className="text-muted-foreground">{p.nome}</span></td>
                    <td className="px-2 py-2">{p.especialidade}</td>
                    <td className="px-2 py-2">{p.produto}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{p.nota}</td>
                    <td className="px-2 py-2"><select value={p.status} onChange={(e) => void mudarStatus(p.id, e.target.value)} className="rounded-md border bg-background px-2 py-1">{STATUS.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}</select></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {naFilaDeOutros.length > 0 && <p className="mt-3 text-xs text-muted-foreground">{naFilaDeOutros.length} perfis estão na fila de outros vendedores (só gerentes veem a lista).</p>}
        </CardContent>
      </Card>

      {base.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Base inicial de 20/11 ({base.length} perfis levantados à mão)</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {base.map((p) => (
                  <tr key={p.id} className="border-b">
                    <td className="py-2 pr-4"><a href={`https://www.instagram.com/${p.username}/`} target="_blank" rel="noreferrer" className="underline">@{p.username}</a> <span className="text-muted-foreground">{p.nome}</span></td>
                    <td className="px-2 py-2">{p.especialidade}</td>
                    <td className="px-2 py-2">{p.produto}</td>
                    <td className="px-2 py-2 text-right"><button type="button" onClick={() => void adicionar({ username: p.username, nome: p.nome, seguidores: p.seguidores, especialidade: p.especialidade, cidade: p.cidade, nota: p.nota, produto: p.produto, mensagem: p.mensagem, versao_roteiro: p.versao_roteiro })} className="rounded-md border px-3 py-1 text-sm">Adicionar à minha fila</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
