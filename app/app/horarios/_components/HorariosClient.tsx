"use client";

import { useCallback, useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const PERIODOS = [
  { id: "madrugada", rotulo: "Madrugada (0h–6h)" },
  { id: "manha", rotulo: "Manhã (6h–12h)" },
  { id: "tarde", rotulo: "Tarde (12h–18h)" },
  { id: "noite", rotulo: "Noite (18h–24h)" },
] as const;
const DIAS = [
  { id: "seg", rotulo: "Seg" },
  { id: "ter", rotulo: "Ter" },
  { id: "qua", rotulo: "Qua" },
  { id: "qui", rotulo: "Qui" },
  { id: "sex", rotulo: "Sex" },
  { id: "sab", rotulo: "Sáb" },
  { id: "dom", rotulo: "Dom" },
] as const;
const ATUALIZAR_A_CADA_MS = 5 * 60 * 1000;
const OPCOES_DIAS = [7, 14, 30, 60, 90];
const MINIMO_ENVIADAS_PARA_COR = 5;

interface Celula {
  recebidas: number;
  enviadas: number;
  respondidas: number;
  taxa: number | null;
}
interface Resposta {
  dias: number;
  vendedores: { user_id: string; nome: string }[];
  mensagens_lidas: number;
  horarios: {
    por_periodo: Record<string, Celula>;
    por_dia: Record<string, Celula>;
    mapa: Record<string, Record<string, Celula>>;
    totais: Celula;
  };
}

const pct = (t: number | null) => (t === null ? "·" : `${String(t).replace(".", ",")}%`);

// Verde mais forte quanto maior a taxa; célula com poucas mensagens fica neutra para não enganar.
function corDaTaxa(c: Celula, maior: number): string {
  if (c.taxa === null || c.enviadas < MINIMO_ENVIADAS_PARA_COR || maior <= 0) return "";
  return `rgba(34,197,94,${(0.12 + 0.6 * (c.taxa / maior)).toFixed(2)})`;
}

function Linha({ rotulo, c }: { rotulo: string; c: Celula }) {
  return (
    <tr className="border-t">
      <td className="px-2 py-1.5 text-left font-medium">{rotulo}</td>
      <td className="px-2 py-1.5">{c.recebidas}</td>
      <td className="px-2 py-1.5">{c.enviadas}</td>
      <td className="px-2 py-1.5">{c.respondidas}</td>
      <td className="px-2 py-1.5 font-semibold">{pct(c.taxa)}</td>
    </tr>
  );
}

function Tabela({ titulo, linhas }: { titulo: string; linhas: { rotulo: string; c: Celula }[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{titulo}</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-center text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="px-2 py-1 text-left font-normal" />
              <th className="px-2 py-1 font-normal">Recebidas</th>
              <th className="px-2 py-1 font-normal">Enviadas</th>
              <th className="px-2 py-1 font-normal">Respondidas em 24 h</th>
              <th className="px-2 py-1 font-normal">Taxa de resposta</th>
            </tr>
          </thead>
          <tbody>{linhas.map((l) => <Linha key={l.rotulo} rotulo={l.rotulo} c={l.c} />)}</tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function MapaDeCalor({ titulo, dica, mapa, valor, cor }: { titulo: string; dica: string; mapa: Resposta["horarios"]["mapa"]; valor: (c: Celula) => string; cor: (c: Celula) => string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{titulo}</CardTitle>
        <p className="text-xs text-muted-foreground">{dica}</p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-center text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="px-2 py-1 text-left font-normal" />
              {PERIODOS.map((p) => <th key={p.id} className="px-2 py-1 font-normal">{p.rotulo}</th>)}
            </tr>
          </thead>
          <tbody>
            {DIAS.map((d) => (
              <tr key={d.id} className="border-t">
                <td className="px-2 py-2 text-left font-medium">{d.rotulo}</td>
                {PERIODOS.map((p) => {
                  const c = mapa[d.id]![p.id]!;
                  return <td key={p.id} className="px-2 py-2 font-semibold" style={{ backgroundColor: cor(c) }}>{valor(c)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export function HorariosClient() {
  const [dias, setDias] = useState(30);
  const [vendedor, setVendedor] = useState("");
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const q = new URLSearchParams({ dias: String(dias) });
      if (vendedor) q.set("vendedor", vendedor);
      const r = await fetch(`/api/v1/metrics/horarios?${q}`, { cache: "no-store" });
      const corpo = await r.json();
      if (!r.ok) throw new Error(corpo?.error?.message ?? `erro ${r.status}`);
      setDados(corpo.data as Resposta);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui carregar.");
    }
  }, [dias, vendedor]);

  useEffect(() => {
    void carregar();
    const id = setInterval(() => void carregar(), ATUALIZAR_A_CADA_MS);
    return () => clearInterval(id);
  }, [carregar]);

  if (erro && !dados) return <p className="text-sm text-destructive">{erro}</p>;
  if (!dados) return <Skeleton className="h-48 w-full" />;

  const h = dados.horarios;
  const maiorTaxa = Math.max(0, ...DIAS.flatMap((d) => PERIODOS.map((p) => h.mapa[d.id]![p.id]!).filter((c) => c.enviadas >= MINIMO_ENVIADAS_PARA_COR).map((c) => c.taxa ?? 0)));
  const maiorRecebida = Math.max(0, ...DIAS.flatMap((d) => PERIODOS.map((p) => h.mapa[d.id]![p.id]!.recebidas)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          Período
          <select className="rounded-md border bg-background px-2 py-1" value={dias} onChange={(e) => setDias(Number(e.target.value))}>
            {OPCOES_DIAS.map((n) => <option key={n} value={n}>Últimos {n} dias</option>)}
          </select>
        </label>
        {dados.vendedores.length > 1 && (
          <label className="flex items-center gap-2">
            Vendedor
            <select className="rounded-md border bg-background px-2 py-1" value={vendedor} onChange={(e) => setVendedor(e.target.value)}>
              <option value="">Todos</option>
              {dados.vendedores.map((v) => <option key={v.user_id} value={v.user_id}>{v.nome}</option>)}
            </select>
          </label>
        )}
        <span className="text-muted-foreground">
          Atualiza sozinho a cada 5 min. {h.totais.recebidas} recebidas · {h.totais.enviadas} enviadas · {h.totais.respondidas} respondidas em 24 h ({pct(h.totais.taxa)})
        </span>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Tabela titulo="Por período do dia" linhas={PERIODOS.map((p) => ({ rotulo: p.rotulo, c: h.por_periodo[p.id]! }))} />
        <Tabela titulo="Por dia da semana" linhas={DIAS.map((d) => ({ rotulo: d.rotulo, c: h.por_dia[d.id]! }))} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <MapaDeCalor titulo="Quando o lead responde" dica="Mensagens recebidas por dia e período." mapa={h.mapa} valor={(c) => String(c.recebidas)} cor={(c) => (maiorRecebida > 0 && c.recebidas > 0 ? `rgba(59,130,246,${(0.1 + 0.6 * (c.recebidas / maiorRecebida)).toFixed(2)})` : "")} />
        <MapaDeCalor titulo="Melhor horário para abordar" dica={`Taxa de resposta em até 24 h conforme o horário em que enviamos. Células com menos de ${MINIMO_ENVIADAS_PARA_COR} envios ficam sem cor.`} mapa={h.mapa} valor={(c) => (c.enviadas ? `${pct(c.taxa)} (${c.respondidas}/${c.enviadas})` : "·")} cor={(c) => corDaTaxa(c, maiorTaxa)} />
      </div>
    </div>
  );
}
