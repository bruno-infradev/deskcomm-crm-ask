"use client";

import { useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Contagem { abordados: number; responderam: number }
interface Vendedor { user_id: string; nome: string; hoje: Contagem; semana: Contagem; mes: Contagem }

export function PeriodosClient() {
  const [dados, setDados] = useState<Vendedor[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    void fetch("/api/v1/metrics/abordagem-periodo", { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j?.error?.message ?? "Não consegui carregar."); setDados(j.data.vendedores as Vendedor[]); })
      .catch((e: Error) => setErro(e.message));
  }, []);
  if (erro) return <p className="text-sm text-destructive">{erro}</p>;
  if (!dados) return null;
  const total = (campo: "hoje" | "semana" | "mes", chave: keyof Contagem) => dados.reduce((n, v) => n + v[campo][chave], 0);
  return (
    <Card>
      <CardHeader><CardTitle>Abordados por vendedor: hoje, semana e mês</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">
        <p className="mb-3 text-sm text-muted-foreground">Pessoas diferentes que receberam mensagem pelo número do vendedor (sem grupos). Semana de segunda até hoje; mês do dia 1 até hoje. Quem é abordado em dois dias conta nos dois.</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th rowSpan={2} className="py-2 pr-4">Vendedor</th>
              {["Hoje", "Semana", "Mês"].map((c) => <th key={c} colSpan={2} className="px-2 py-1 text-center">{c}</th>)}
            </tr>
            <tr className="border-b text-left">{[0, 1, 2].flatMap((i) => [<th key={`a${i}`} className="px-2 py-1 text-right">Abordados</th>, <th key={`r${i}`} className="px-2 py-1 text-right">Responderam</th>])}</tr>
          </thead>
          <tbody>
            {dados.map((v) => (
              <tr key={v.user_id} className="border-b">
                <td className="py-2 pr-4">{v.nome}</td>
                {(["hoje", "semana", "mes"] as const).flatMap((p) => [<td key={`${p}a`} className="px-2 py-2 text-right tabular-nums">{v[p].abordados}</td>, <td key={`${p}r`} className="px-2 py-2 text-right tabular-nums">{v[p].responderam}</td>])}
              </tr>
            ))}
            {dados.length > 1 && (
              <tr className="font-medium">
                <td className="py-2 pr-4">Time</td>
                {(["hoje", "semana", "mes"] as const).flatMap((p) => [<td key={`${p}a`} className="px-2 py-2 text-right tabular-nums">{total(p, "abordados")}</td>, <td key={`${p}r`} className="px-2 py-2 text-right tabular-nums">{total(p, "responderam")}</td>])}
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
