"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const CAMPOS = [
  { chave: "mensagens_enviadas", rotulo: "Mensagens enviadas" },
  { chave: "respostas", rotulo: "Respostas" },
  { chave: "whatsapp", rotulo: "WhatsApp" },
  { chave: "agendamento", rotulo: "Agendamento" },
  { chave: "no_show", rotulo: "No-show" },
] as const;
type Chave = (typeof CAMPOS)[number]["chave"];
type Contagens = Record<Chave, number>;

interface DiaSemana { dia: string; total: Contagens; por_vendedor: Record<string, Contagens>; obs: string[] }
interface Taxas { resposta_sobre_enviadas: number | null; agendamento_sobre_respostas: number | null }
interface Semana { inicio: string; fim: string; dias: DiaSemana[]; total: Contagens; por_vendedor: Record<string, Contagens>; por_especialidade: { especialidade: string; total: Contagens; taxas: Taxas }[]; por_versao: { versao: string; total: Contagens; taxas: Taxas }[]; taxas: Taxas }
interface Lancamento extends Contagens { dia: string; user_id: string | null; especialidade: string; versao_roteiro: string; obs: string }
interface Resposta { dia: string; semana: Semana; nomes: Record<string, string>; especialidades: string[]; eu: { user_id: string; papel: string; pode_ver_todos: boolean; pode_lancar_de_todos: boolean }; lancamentos: Lancamento[] }

const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const rotuloDia = (iso: string) => `${DIAS[new Date(`${iso}T00:00:00Z`).getUTCDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const pct = (v: number | null) => (v === null ? "-" : `${v}%`);
const vazio = (): Record<Chave, string> => ({ mensagens_enviadas: "", respostas: "", whatsapp: "", agendamento: "", no_show: "" });

export function SocialSellingClient() {
  const [dia, setDia] = useState(hojeSP());
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<Record<Chave, string>>(vazio());
  const [obs, setObs] = useState("");
  const [vendedor, setVendedor] = useState<string>("");
  const [especialidade, setEspecialidade] = useState<string>("Dermatologia");
  const [versao, setVersao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async (d: string) => {
    setErro(null);
    const r = await fetch(`/api/v1/social-selling?dia=${d}`, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) { setErro(j?.error?.message ?? "Não consegui carregar."); return; }
    setDados(j.data as Resposta);
  }, []);

  useEffect(() => { void carregar(dia); }, [dia, carregar]);

  const alvo = vendedor || dados?.eu.user_id || "";
  // Preenche o formulário com o que já foi lançado para o vendedor, o dia e a especialidade escolhidos.
  useEffect(() => {
    if (!dados) return;
    const l = dados.lancamentos.find((x) => x.dia === dia && x.user_id === alvo && x.especialidade === especialidade && x.versao_roteiro === versao.trim());
    setForm(l ? Object.fromEntries(CAMPOS.map(({ chave }) => [chave, String(l[chave])])) as Record<Chave, string> : vazio());
    setObs(l?.obs ?? "");
  }, [dados, dia, alvo, especialidade, versao]);

  const colunasVendedor = useMemo(() => (dados?.eu.pode_ver_todos ? Object.keys(dados.semana.por_vendedor) : []), [dados]);
  const nome = (id: string) => (id === "equipe" ? "Equipe (planilha)" : dados?.nomes[id] ?? "Vendedor");

  async function salvar() {
    setSalvando(true); setAviso(null);
    const corpo = { dia, especialidade, versao_roteiro: versao.trim(), ...(vendedor && vendedor !== dados?.eu.user_id ? { user_id: vendedor } : {}), obs, ...Object.fromEntries(CAMPOS.map(({ chave }) => [chave, Number(form[chave] || 0)])) };
    const r = await fetch("/api/v1/social-selling", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const j = await r.json();
    setSalvando(false);
    if (!r.ok) { setAviso(j?.error?.message ?? "Não consegui salvar."); return; }
    setAviso("Salvo.");
    await carregar(dia);
  }

  if (erro) return <p className="text-sm text-destructive">{erro}</p>;
  if (!dados) return <Skeleton className="h-64 w-full" />;
  const { semana } = dados;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader><CardTitle>Lançar o dia</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col text-sm">Data
              <input type="date" value={dia} max={hojeSP()} onChange={(e) => setDia(e.target.value)} className="rounded-md border bg-background px-2 py-1" />
            </label>
            {dados.eu.pode_lancar_de_todos && (
              <label className="flex flex-col text-sm">Vendedor
                <select value={alvo} onChange={(e) => setVendedor(e.target.value)} className="rounded-md border bg-background px-2 py-1">
                  {Object.entries(dados.nomes).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
                </select>
              </label>
            )}
          </div>
          <label className="flex flex-col text-sm">Especialidade abordada
            <select value={especialidade} onChange={(e) => setEspecialidade(e.target.value)} className="max-w-xs rounded-md border bg-background px-2 py-1">
              {dados.especialidades.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
            <span className="mt-1 text-xs text-muted-foreground">Lance um bloco por especialidade (e por versão do roteiro) que você abordou no dia.</span>
          </label>
          <label className="flex flex-col text-sm">Versão do roteiro (ex.: C1, P2, A1)
            <input value={versao} maxLength={20} onChange={(e) => setVersao(e.target.value)} className="max-w-[10rem] rounded-md border bg-background px-2 py-1" />
          </label>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {CAMPOS.map(({ chave, rotulo }) => (
              <label key={chave} className="flex flex-col text-sm">{rotulo}
                <input inputMode="numeric" type="number" min={0} value={form[chave]} onChange={(e) => setForm({ ...form, [chave]: e.target.value })} className="rounded-md border bg-background px-2 py-1" />
              </label>
            ))}
          </div>
          <label className="flex flex-col text-sm">Observação
            <textarea value={obs} maxLength={1000} onChange={(e) => setObs(e.target.value)} className="min-h-16 rounded-md border bg-background px-2 py-1" />
          </label>
          <div className="flex items-center gap-3">
            <button type="button" disabled={salvando} onClick={salvar} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">{salvando ? "Salvando..." : "Salvar o dia"}</button>
            {aviso && <span className="text-sm text-muted-foreground">{aviso}</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Semana de {rotuloDia(semana.inicio)} a {rotuloDia(semana.fim)}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4">Dia</th>
                {CAMPOS.map(({ chave, rotulo }) => <th key={chave} className="px-2 py-2 text-right">{rotulo}</th>)}
                {colunasVendedor.map((id) => <th key={id} className="px-2 py-2 text-right">Msg env {nome(id)}</th>)}
              </tr>
            </thead>
            <tbody>
              {semana.dias.map((d) => (
                <tr key={d.dia} className="border-b">
                  <td className="py-2 pr-4">{rotuloDia(d.dia)}{d.obs.length > 0 && <span title={d.obs.join(" | ")} className="ml-1 text-muted-foreground">•</span>}</td>
                  {CAMPOS.map(({ chave }) => <td key={chave} className="px-2 py-2 text-right tabular-nums">{d.total[chave]}</td>)}
                  {colunasVendedor.map((id) => <td key={id} className="px-2 py-2 text-right tabular-nums">{d.por_vendedor[id]?.mensagens_enviadas ?? 0}</td>)}
                </tr>
              ))}
              <tr className="font-medium">
                <td className="py-2 pr-4">Total da semana</td>
                {CAMPOS.map(({ chave }) => <td key={chave} className="px-2 py-2 text-right tabular-nums">{semana.total[chave]}</td>)}
                {colunasVendedor.map((id) => <td key={id} className="px-2 py-2 text-right tabular-nums">{semana.por_vendedor[id]?.mensagens_enviadas ?? 0}</td>)}
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-sm text-muted-foreground">Respostas sobre enviadas: <b>{pct(semana.taxas.resposta_sobre_enviadas)}</b> · Agendamento sobre respostas: <b>{pct(semana.taxas.agendamento_sobre_respostas)}</b></p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Por especialidade na semana (a que mais agenda primeiro)</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {semana.por_especialidade.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum lançamento nesta semana.</p> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-4">Especialidade</th>
                  {CAMPOS.map(({ chave, rotulo }) => <th key={chave} className="px-2 py-2 text-right">{rotulo}</th>)}
                  <th className="px-2 py-2 text-right">% resposta</th>
                  <th className="px-2 py-2 text-right">% agendamento</th>
                </tr>
              </thead>
              <tbody>
                {semana.por_especialidade.map((e) => (
                  <tr key={e.especialidade} className="border-b">
                    <td className="py-2 pr-4">{e.especialidade}</td>
                    {CAMPOS.map(({ chave }) => <td key={chave} className="px-2 py-2 text-right tabular-nums">{e.total[chave]}</td>)}
                    <td className="px-2 py-2 text-right tabular-nums">{pct(e.taxas.resposta_sobre_enviadas)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{pct(e.taxas.agendamento_sobre_respostas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Por versão do roteiro na semana</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4">Versão</th>
                {CAMPOS.map(({ chave, rotulo }) => <th key={chave} className="px-2 py-2 text-right">{rotulo}</th>)}
                <th className="px-2 py-2 text-right">% resposta</th>
                <th className="px-2 py-2 text-right">% agendamento</th>
              </tr>
            </thead>
            <tbody>
              {semana.por_versao.map((v) => (
                <tr key={v.versao} className="border-b">
                  <td className="py-2 pr-4">{v.versao}</td>
                  {CAMPOS.map(({ chave }) => <td key={chave} className="px-2 py-2 text-right tabular-nums">{v.total[chave]}</td>)}
                  <td className="px-2 py-2 text-right tabular-nums">{pct(v.taxas.resposta_sobre_enviadas)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{pct(v.taxas.agendamento_sobre_respostas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
