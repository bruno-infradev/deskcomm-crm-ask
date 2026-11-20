"use client";

import { useCallback, useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const RESULTADOS = [
  { valor: "marcada", rotulo: "Marcada" },
  { valor: "no_show", rotulo: "No-show" },
  { valor: "feita", rotulo: "Feita, sem proposta" },
  { valor: "proposta", rotulo: "Proposta enviada" },
  { valor: "venda", rotulo: "Venda" },
] as const;
type Resultado = (typeof RESULTADOS)[number]["valor"];

interface Resumo { marcadas: number; feitas: number; no_show: number; propostas: number; vendas: number; gravadas: number; comparecimento: number | null }
interface Grupo { chave: string; resumo: Resumo }
interface Reuniao { id: string; user_id: string | null; dia: string; lead: string; especialidade: string; versao_roteiro: string; gravada: boolean; link_gravacao: string; resultado: Resultado; obs: string }
interface Resposta { inicio: string; fim: string; reunioes: Reuniao[]; nomes: Record<string, string>; resumo: Resumo; por_especialidade: Grupo[]; por_versao: Grupo[]; por_vendedor: Grupo[]; eu: { user_id: string; pode_editar_de_todos: boolean } }

const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const pct = (v: number | null) => (v === null ? "-" : `${v}%`);
const ESPECIALIDADES = ["Dermatologia", "Medicina estética", "Emagrecimento e nutrologia", "Ginecologia", "Oftalmologia", "Otorrinolaringologia", "Urologia", "Cirurgia plástica", "Medicina do esporte", "Plantão ou convênio", "Outra"];

function TabelaDeGrupos({ titulo, rotulo, grupos, nome }: { titulo: string; rotulo: string; grupos: Grupo[]; nome?: (k: string) => string }) {
  return (
    <Card>
      <CardHeader><CardTitle>{titulo}</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">
        {grupos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma reunião lançada nesta semana.</p> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4">{rotulo}</th>
                {["Reuniões", "Feitas", "No-show", "Propostas", "Vendas", "Gravadas", "% compareceu"].map((c) => <th key={c} className="px-2 py-2 text-right">{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => (
                <tr key={g.chave} className="border-b">
                  <td className="py-2 pr-4">{nome ? nome(g.chave) : g.chave}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{g.resumo.marcadas}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{g.resumo.feitas}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{g.resumo.no_show}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{g.resumo.propostas}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{g.resumo.vendas}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{g.resumo.gravadas}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{pct(g.resumo.comparecimento)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

export function ReunioesClient() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [form, setForm] = useState({ dia: hojeSP(), lead: "", especialidade: "Dermatologia", versao_roteiro: "", gravada: false, link_gravacao: "", resultado: "marcada" as Resultado, obs: "" });

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/v1/social-selling/reunioes?dia=${hojeSP()}`, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) { setErro(j?.error?.message ?? "Não consegui carregar as reuniões."); return; }
    setErro(null); setDados(j.data as Resposta);
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  async function salvar() {
    setAviso(null);
    const r = await fetch("/api/v1/social-selling/reunioes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const j = await r.json();
    if (!r.ok) { setAviso(j?.error?.message ?? "Não consegui salvar."); return; }
    setAviso("Reunião lançada."); setForm({ ...form, lead: "", link_gravacao: "", obs: "", gravada: false, resultado: "marcada" });
    await carregar();
  }
  async function mudar(id: string, mudancas: Partial<Reuniao>) {
    const r = await fetch("/api/v1/social-selling/reunioes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...mudancas }) });
    const j = await r.json();
    if (!r.ok) { setAviso(j?.error?.message ?? "Não consegui atualizar."); return; }
    await carregar();
  }

  if (erro) return <p className="text-sm text-destructive">{erro}</p>;
  if (!dados) return null;
  const nome = (id: string) => (id === "equipe" ? "Equipe" : dados.nomes[id] ?? "Vendedor");
  const podeMexer = (r: Reuniao) => r.user_id === dados.eu.user_id || dados.eu.pode_editar_de_todos;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="text-xl font-semibold tracking-tight">Reuniões do social selling</h2>
        <p className="text-sm text-muted-foreground">Cada reunião marcada pelo social selling: quem fez, com que especialidade e versão do roteiro, se foi gravada e o resultado. Semana de {dados.inicio.slice(8)}/{dados.inicio.slice(5, 7)} a {dados.fim.slice(8)}/{dados.fim.slice(5, 7)}.</p>
      </header>

      <Card>
        <CardHeader><CardTitle>Lançar reunião</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <label className="flex flex-col text-sm">Data<input type="date" value={form.dia} max={hojeSP()} onChange={(e) => setForm({ ...form, dia: e.target.value })} className="rounded-md border bg-background px-2 py-1" /></label>
            <label className="flex flex-col text-sm md:col-span-2">Lead (nome ou @ do perfil)<input value={form.lead} maxLength={200} onChange={(e) => setForm({ ...form, lead: e.target.value })} className="rounded-md border bg-background px-2 py-1" /></label>
            <label className="flex flex-col text-sm">Especialidade<select value={form.especialidade} onChange={(e) => setForm({ ...form, especialidade: e.target.value })} className="rounded-md border bg-background px-2 py-1">{ESPECIALIDADES.map((e) => <option key={e}>{e}</option>)}</select></label>
            <label className="flex flex-col text-sm">Versão do roteiro<input value={form.versao_roteiro} maxLength={20} onChange={(e) => setForm({ ...form, versao_roteiro: e.target.value })} className="rounded-md border bg-background px-2 py-1" /></label>
            <label className="flex flex-col text-sm">Resultado<select value={form.resultado} onChange={(e) => setForm({ ...form, resultado: e.target.value as Resultado })} className="rounded-md border bg-background px-2 py-1">{RESULTADOS.map((r) => <option key={r.valor} value={r.valor}>{r.rotulo}</option>)}</select></label>
            <label className="flex items-end gap-2 text-sm"><input type="checkbox" checked={form.gravada} onChange={(e) => setForm({ ...form, gravada: e.target.checked })} /> Reunião gravada</label>
            <label className="flex flex-col text-sm">Link da gravação<input value={form.link_gravacao} maxLength={500} onChange={(e) => setForm({ ...form, link_gravacao: e.target.value })} className="rounded-md border bg-background px-2 py-1" /></label>
          </div>
          <label className="flex flex-col text-sm">Observação<textarea value={form.obs} maxLength={1000} onChange={(e) => setForm({ ...form, obs: e.target.value })} className="min-h-14 rounded-md border bg-background px-2 py-1" /></label>
          <div className="flex items-center gap-3">
            <button type="button" disabled={!form.lead.trim()} onClick={salvar} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">Lançar reunião</button>
            {aviso && <span className="text-sm text-muted-foreground">{aviso}</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Reuniões da semana: {dados.resumo.marcadas} · feitas {dados.resumo.feitas} · no-show {dados.resumo.no_show} · propostas {dados.resumo.propostas} · vendas {dados.resumo.vendas}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {dados.reunioes.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma reunião lançada nesta semana.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left"><th className="py-2 pr-3">Dia</th><th className="px-2 py-2">Vendedor</th><th className="px-2 py-2">Lead</th><th className="px-2 py-2">Especialidade</th><th className="px-2 py-2">Versão</th><th className="px-2 py-2">Gravada</th><th className="px-2 py-2">Resultado</th></tr></thead>
              <tbody>
                {dados.reunioes.map((r) => (
                  <tr key={r.id} className="border-b">
                    <td className="py-2 pr-3">{r.dia.slice(8)}/{r.dia.slice(5, 7)}</td>
                    <td className="px-2 py-2">{r.user_id ? dados.nomes[r.user_id] ?? "Vendedor" : "Equipe"}</td>
                    <td className="px-2 py-2">{r.lead}</td>
                    <td className="px-2 py-2">{r.especialidade || "-"}</td>
                    <td className="px-2 py-2">{r.versao_roteiro || "-"}</td>
                    <td className="px-2 py-2">{r.gravada ? (r.link_gravacao ? <a className="underline" href={r.link_gravacao} target="_blank" rel="noreferrer">Sim, ver</a> : "Sim") : "Não"}</td>
                    <td className="px-2 py-2">
                      {podeMexer(r)
                        ? <select value={r.resultado} onChange={(e) => void mudar(r.id, { resultado: e.target.value as Resultado })} className="rounded-md border bg-background px-1 py-0.5">{RESULTADOS.map((x) => <option key={x.valor} value={x.valor}>{x.rotulo}</option>)}</select>
                        : RESULTADOS.find((x) => x.valor === r.resultado)?.rotulo}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <TabelaDeGrupos titulo="Reuniões por especialidade (a que mais vende primeiro)" rotulo="Especialidade" grupos={dados.por_especialidade} />
      <TabelaDeGrupos titulo="Reuniões por versão do roteiro" rotulo="Versão" grupos={dados.por_versao} />
      <TabelaDeGrupos titulo="Reuniões por vendedor" rotulo="Vendedor" grupos={dados.por_vendedor} nome={nome} />
    </div>
  );
}
