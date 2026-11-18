"use client";

import { useCallback, useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const ATUALIZAR_A_CADA_MS = 60 * 1000;
const OPCOES_DIAS = [7, 14, 30, 60];
const ROTULOS: Record<string, string> = { "anuncio-fios": "Anúncio fios", "anuncio-abdomen": "Anúncio abdômen", "sem-origem-de-anuncio": "Sem origem de anúncio" };

interface Resumo {
  leads: number;
  respondidos: number;
  sem_resposta: number;
  taxa_resposta: number | null;
  media_minutos: number | null;
  mediana_minutos: number | null;
  ate_5_min: number | null;
  ate_30_min: number | null;
  ate_60_min: number | null;
}
interface Resposta {
  dias: number;
  numero: { nome: string; telefone: string; status: string };
  resumo: Resumo;
  por_origem: Record<string, Resumo>;
  mais_demorados: { nome: string; origem: string; primeira_em: string; respondido: boolean; espera_minutos: number }[];
}

const pct = (v: number | null) => (v === null ? "·" : `${String(v).replace(".", ",")}%`);
const MIN_POR_HORA = 60;
const MIN_POR_DIA = 24 * MIN_POR_HORA;
function duracao(min: number | null): string {
  if (min === null) return "·";
  if (min < MIN_POR_HORA) return `${min} min`;
  if (min < MIN_POR_DIA) return `${Math.floor(min / MIN_POR_HORA)} h ${min % MIN_POR_HORA} min`;
  return `${Math.floor(min / MIN_POR_DIA)} d ${Math.floor((min % MIN_POR_DIA) / MIN_POR_HORA)} h`;
}
const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function Cartao({ titulo, valor, dica }: { titulo: string; valor: string; dica?: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <div className="text-xs text-muted-foreground">{titulo}</div>
        <div className="text-2xl font-semibold">{valor}</div>
        {dica ? <div className="text-[11px] text-muted-foreground">{dica}</div> : null}
      </CardContent>
    </Card>
  );
}

export function AtendimentoClient() {
  const [dias, setDias] = useState(14);
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/v1/metrics/atendimento?dias=${dias}`, { cache: "no-store" });
      const corpo = await r.json();
      if (!r.ok) throw new Error(r.status === 403 ? "Só administradores veem esta tela." : (corpo?.error?.message ?? `erro ${r.status}`));
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
  const r = dados.resumo;
  const origens = Object.entries(dados.por_origem);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          Período
          <select className="rounded-md border bg-background px-2 py-1" value={dias} onChange={(e) => setDias(Number(e.target.value))}>
            {OPCOES_DIAS.map((n) => <option key={n} value={n}>Últimos {n} dias</option>)}
          </select>
        </label>
        <span className="text-muted-foreground">Número {dados.numero.nome} ({dados.numero.status}). Atualiza sozinho a cada minuto. Mede só o que passa pelo WhatsApp conectado, não o texto.</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Cartao titulo="Leads novos" valor={String(r.leads)} dica="Contatos que escreveram primeiro" />
        <Cartao titulo="Taxa de resposta" valor={pct(r.taxa_resposta)} dica={`${r.respondidos} respondidos · ${r.sem_resposta} sem resposta`} />
        <Cartao titulo="Tempo da 1ª resposta" valor={duracao(r.mediana_minutos)} dica={`mediana · média ${duracao(r.media_minutos)}`} />
        <Cartao titulo="Respondidos em até" valor={`${pct(r.ate_5_min)} · ${pct(r.ate_30_min)} · ${pct(r.ate_60_min)}`} dica="5 min · 30 min · 1 h (sobre todos os leads)" />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Por origem do anúncio</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-center text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="px-2 py-1 text-left font-normal">Origem</th>
                <th className="px-2 py-1 font-normal">Leads</th>
                <th className="px-2 py-1 font-normal">Sem resposta</th>
                <th className="px-2 py-1 font-normal">Taxa de resposta</th>
                <th className="px-2 py-1 font-normal">Mediana 1ª resposta</th>
                <th className="px-2 py-1 font-normal">Até 5 min</th>
                <th className="px-2 py-1 font-normal">Até 1 h</th>
              </tr>
            </thead>
            <tbody>
              {origens.map(([origem, o]) => (
                <tr key={origem} className="border-t">
                  <td className="px-2 py-1.5 text-left font-medium">{ROTULOS[origem] ?? origem}</td>
                  <td className="px-2 py-1.5">{o.leads}</td>
                  <td className="px-2 py-1.5">{o.sem_resposta}</td>
                  <td className="px-2 py-1.5 font-semibold">{pct(o.taxa_resposta)}</td>
                  <td className="px-2 py-1.5">{duracao(o.mediana_minutos)}</td>
                  <td className="px-2 py-1.5">{pct(o.ate_5_min)}</td>
                  <td className="px-2 py-1.5">{pct(o.ate_60_min)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Leads que mais esperaram</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-center text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="px-2 py-1 text-left font-normal">Lead</th>
                <th className="px-2 py-1 font-normal">Origem</th>
                <th className="px-2 py-1 font-normal">Escreveu em</th>
                <th className="px-2 py-1 font-normal">Espera</th>
                <th className="px-2 py-1 font-normal">Situação</th>
              </tr>
            </thead>
            <tbody>
              {dados.mais_demorados.map((l, i) => (
                <tr key={`${l.primeira_em}-${i}`} className="border-t">
                  <td className="px-2 py-1.5 text-left font-medium">{l.nome}</td>
                  <td className="px-2 py-1.5">{ROTULOS[l.origem] ?? l.origem}</td>
                  <td className="px-2 py-1.5">{quando(l.primeira_em)}</td>
                  <td className="px-2 py-1.5 font-semibold">{duracao(l.espera_minutos)}</td>
                  <td className={`px-2 py-1.5 ${l.respondido ? "" : "font-semibold text-destructive"}`}>{l.respondido ? "Respondido" : "Sem resposta"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
