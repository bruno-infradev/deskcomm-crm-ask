"use client";

import { useCallback, useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const ATUALIZAR_A_CADA_MS = 60 * 1000;

interface NumeroAbordagem {
  session_id: string;
  nome: string;
  final: string;
  abordados: number;
  mensagens_enviadas: number;
}
interface HoraAbordagem {
  hora: number;
  abordados: number;
  mensagens: number;
  respostas: number;
}
interface VendedorAbordagem {
  user_id: string;
  nome: string;
  abordados: number;
  meta: number;
  mensagens_enviadas: number;
  responderam: number;
  numeros: NumeroAbordagem[];
  por_hora: HoraAbordagem[];
}
interface RespostaAbordagem {
  dia: string;
  meta: number;
  vendedores: VendedorAbordagem[];
}

function dataBR(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function CartaoDoVendedor({ v }: { v: VendedorAbordagem }) {
  const pct = Math.min(100, Math.round((v.abordados / v.meta) * 100));
  const bateu = v.abordados >= v.meta;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-baseline justify-between gap-2">
          <span>{v.nome}</span>
          <span className={`text-2xl font-semibold tabular-nums ${bateu ? "text-green-600" : ""}`}>
            {v.abordados} <span className="text-base font-normal text-muted-foreground">/ {v.meta}</span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={v.abordados} aria-valuemin={0} aria-valuemax={v.meta}>
          <div className={`h-full ${bateu ? "bg-green-600" : "bg-primary"}`} style={{ width: `${pct}%` }} />
        </div>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div><dt className="text-muted-foreground">Mensagens enviadas</dt><dd className="tabular-nums">{v.mensagens_enviadas}</dd></div>
          <div><dt className="text-muted-foreground">Responderam hoje</dt><dd className="tabular-nums">{v.responderam}</dd></div>
        </dl>
        <ul className="divide-y text-sm">
          {v.numeros.map((n) => (
            <li key={n.session_id} className="flex items-center justify-between py-1.5">
              <span>{n.nome}{n.final ? <span className="text-muted-foreground"> · final {n.final}</span> : null}</span>
              <span className="tabular-nums">{n.abordados} pessoas · {n.mensagens_enviadas} msgs</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

const horaAtualEmSP = () => Number(new Date().toLocaleString("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false })) % 24;

function TabelaHoraAHora({ vendedores, dia, meta }: { vendedores: VendedorAbordagem[]; dia: string; meta: number }) {
  const agora = horaAtualEmSP();
  const ehHoje = dia === new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const horas = vendedores[0]?.por_hora.map((h) => h.hora) ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Hora a hora</CardTitle>
        <p className="text-xs text-muted-foreground">Cada célula: pessoas abordadas na hora (primeira mensagem do dia), mensagens enviadas e respostas. A linha de baixo é o acumulado contra a meta de {meta}.</p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full border-collapse text-center text-xs tabular-nums">
          <thead>
            <tr>
              <th className="sticky left-0 bg-card px-2 py-1 text-left font-medium">Vendedor</th>
              {horas.map((h) => (
                <th key={h} className={`px-2 py-1 font-medium ${ehHoje && h === agora ? "rounded bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{h}h</th>
              ))}
              <th className="px-2 py-1 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {vendedores.map((v) => {
              let acumulado = 0;
              return (
                <tr key={v.user_id} className="border-t align-top">
                  <td className="sticky left-0 bg-card px-2 py-1.5 text-left font-medium">{v.nome}</td>
                  {v.por_hora.map((h) => {
                    acumulado += h.abordados;
                    const vazio = h.mensagens === 0 && h.respostas === 0;
                    return (
                      <td key={h.hora} className={`px-2 py-1.5 ${ehHoje && h.hora === agora ? "bg-primary/10" : ""}`}>
                        <div className={`text-sm font-semibold ${vazio ? "text-muted-foreground/40" : ""}`}>{h.abordados}</div>
                        <div className="text-[10px] text-muted-foreground">{vazio ? "·" : `${h.mensagens}m ${h.respostas}r`}</div>
                        <div className={`text-[10px] ${acumulado >= meta ? "text-green-600" : "text-muted-foreground"}`}>{ehHoje && h.hora > agora ? "" : `${acumulado}/${meta}`}</div>
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5">
                    <div className="text-sm font-semibold">{v.abordados}</div>
                    <div className="text-[10px] text-muted-foreground">{v.mensagens_enviadas}m {v.responderam}r</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export function AbordagemClient() {
  const [dados, setDados] = useState<RespostaAbordagem | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/v1/metrics/abordagem", { cache: "no-store" });
      const corpo = await r.json();
      if (!r.ok) throw new Error(corpo?.error?.message ?? `erro ${r.status}`);
      setDados(corpo.data as RespostaAbordagem);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui carregar.");
    }
  }, []);

  useEffect(() => {
    void carregar();
    const id = setInterval(() => void carregar(), ATUALIZAR_A_CADA_MS);
    return () => clearInterval(id);
  }, [carregar]);

  if (erro && !dados) return <p className="text-sm text-destructive">{erro}</p>;
  if (!dados) return <Skeleton className="h-48 w-full" />;
  if (dados.vendedores.length === 0) return <p className="text-sm text-muted-foreground">Nenhum vendedor com número configurado.</p>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Hoje, {dataBR(dados.dia)} (horário de São Paulo). Atualiza sozinho a cada minuto.</p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {dados.vendedores.map((v) => <CartaoDoVendedor key={v.user_id} v={v} />)}
      </div>
      <TabelaHoraAHora vendedores={dados.vendedores} dia={dados.dia} meta={dados.meta} />
    </div>
  );
}
