"use client";

import { useCallback, useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const ATUALIZAR_A_CADA_MS = 60 * 1000;
const OPCOES_DIAS = [7, 14, 30, 60];
const ROTULOS: Record<string, string> = {
  "anuncio-fios": "Anúncio fios",
  "anuncio-abdomen": "Anúncio abdômen",
  "sem-origem-de-anuncio": "Sem origem de anúncio",
};

interface Resposta {
  funil: string;
  dias: { dia: string; total: number; por_origem: Record<string, number> }[];
  origens: string[];
  total: number;
  por_origem: Record<string, number>;
  por_etapa: Record<string, number>;
}

const rotulo = (o: string) => ROTULOS[o] ?? o;
const dataBR = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");

export function LeadsPorOrigemClient() {
  const [dias, setDias] = useState(14);
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/v1/metrics/origem?dias=${dias}`, { cache: "no-store" });
      const corpo = await r.json();
      if (!r.ok) throw new Error(corpo?.error?.message ?? `erro ${r.status}`);
      setDados(corpo.data as Resposta);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui carregar.");
    }
  }, [dias]);

  useEffect(() => {
    void carregar();
    const id = setInterval(() => void carregar(), ATUALIZAR_A_CADA_MS);
    return () => clearInterval(id);
  }, [carregar]);

  if (erro && !dados) return <p className="text-sm text-destructive">{erro}</p>;
  if (!dados) return <Skeleton className="h-48 w-full" />;

  const origens = dados.origens;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          Período
          <select className="rounded-md border bg-background px-2 py-1" value={dias} onChange={(e) => setDias(Number(e.target.value))}>
            {OPCOES_DIAS.map((n) => <option key={n} value={n}>Últimos {n} dias</option>)}
          </select>
        </label>
        <span className="text-muted-foreground">Atualiza sozinho a cada minuto. Funil {dados.funil}: {dados.total} leads no período.</span>
      </div>
      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader><CardTitle className="text-base">Leads por dia e por origem</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-center text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="px-2 py-1 text-left font-normal">Dia</th>
                  {origens.map((o) => <th key={o} className="px-2 py-1 font-normal">{rotulo(o)}</th>)}
                  <th className="px-2 py-1 font-normal">Total</th>
                </tr>
              </thead>
              <tbody>
                {[...dados.dias].reverse().map((d) => (
                  <tr key={d.dia} className="border-t">
                    <td className="px-2 py-1.5 text-left font-medium">{dataBR(d.dia)}</td>
                    {origens.map((o) => <td key={o} className="px-2 py-1.5">{d.por_origem[o] ?? 0}</td>)}
                    <td className="px-2 py-1.5 font-semibold">{d.total}</td>
                  </tr>
                ))}
                <tr className="border-t-2 font-semibold">
                  <td className="px-2 py-1.5 text-left">Total</td>
                  {origens.map((o) => <td key={o} className="px-2 py-1.5">{dados.por_origem[o] ?? 0}</td>)}
                  <td className="px-2 py-1.5">{dados.total}</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Onde estão agora (por etapa)</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-center text-xs">
              <tbody>
                {Object.entries(dados.por_etapa).map(([etapa, n]) => (
                  <tr key={etapa} className="border-t first:border-t-0">
                    <td className="px-2 py-1.5 text-left font-medium">{etapa}</td>
                    <td className="px-2 py-1.5 font-semibold">{n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
