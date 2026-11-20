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
interface Semana { inicio: string; fim: string; dias: DiaSemana[]; total: Contagens; por_vendedor: Record<string, Contagens>; taxas: { resposta_sobre_enviadas: number | null; agendamento_sobre_respostas: number | null } }
interface Meu extends Contagens { dia: string; obs: string }
interface Resposta { dia: string; semana: Semana; nomes: Record<string, string>; eu: { user_id: string; papel: string; pode_ver_todos: boolean; pode_lancar_de_todos: boolean }; meus: Meu[] }

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
  // Preenche o formulário com o que já foi lançado para o vendedor e o dia escolhidos.
  useEffect(() => {
    if (!dados) return;
    const doDia = dados.semana.dias.find((d) => d.dia === dia);
    const c = doDia?.por_vendedor[alvo];
    const meu = dados.meus.find((m) => m.dia === dia);
    setForm(c ? Object.fromEntries(CAMPOS.map(({ chave }) => [chave, String(c[chave])])) as Record<Chave, string> : vazio());
    setObs(alvo === dados.eu.user_id ? meu?.obs ?? "" : "");
  }, [dados, dia, alvo]);

  const colunasVendedor = useMemo(() => (dados?.eu.pode_ver_todos ? Object.keys(dados.semana.por_vendedor) : []), [dados]);
  const nome = (id: string) => (id === "equipe" ? "Equipe (planilha)" : dados?.nomes[id] ?? "Vendedor");

  async function salvar() {
    setSalvando(true); setAviso(null);
    const corpo = { dia, ...(vendedor && vendedor !== dados?.eu.user_id ? { user_id: vendedor } : {}), obs, ...Object.fromEntries(CAMPOS.map(({ chave }) => [chave, Number(form[chave] || 0)])) };
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
    </div>
  );
}
