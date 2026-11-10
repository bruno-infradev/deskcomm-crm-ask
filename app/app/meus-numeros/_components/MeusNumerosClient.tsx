"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const ATUALIZAR_MS = 5000;

interface MeuNumero {
  id: string;
  nome: string;
  final: string;
  status: string;
  motivo: string;
  desde: string | null;
}

const conectado = (s: string) => s === "WORKING";
const rotulo = (s: string) => (conectado(s) ? "Conectado" : s === "SCAN_QR_CODE" ? "Esperando o QR" : s === "STARTING" ? "Iniciando" : "Desconectado");

export function MeusNumerosClient() {
  const [numeros, setNumeros] = useState<MeuNumero[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [qrDe, setQrDe] = useState<string | null>(null);
  const [tique, setTique] = useState(0);
  const [enviando, setEnviando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/v1/channel-sessions/meus", { cache: "no-store" });
      const corpo = await r.json();
      if (!r.ok) throw new Error(corpo?.error?.message ?? `erro ${r.status}`);
      setNumeros(corpo.data.numeros as MeuNumero[]);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui carregar.");
    }
  }, []);

  useEffect(() => {
    const primeiro = setTimeout(() => void carregar(), 0);
    const id = setInterval(() => { void carregar(); setTique((n) => n + 1); }, ATUALIZAR_MS);
    return () => { clearTimeout(primeiro); clearInterval(id); };
  }, [carregar]);

  async function reconectar(n: MeuNumero) {
    setEnviando(n.id);
    try {
      const r = await fetch(`/api/v1/channel-sessions/${n.id}/reconnect`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const corpo = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(corpo?.error?.message ?? `erro ${r.status}`);
      setQrDe(n.id);
      void carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui reconectar.");
    } finally {
      setEnviando(null);
    }
  }

  if (erro && !numeros) return <p className="text-sm text-destructive">{erro}</p>;
  if (!numeros) return <Skeleton className="h-40 w-full" />;
  if (numeros.length === 0) return <p className="text-sm text-muted-foreground">Nenhum número tem você como responsável. Peça ao administrador para ligar o seu número a você no roteamento.</p>;
  return (
    <div className="space-y-3">
      {erro ? <p className="text-sm text-destructive">{erro}</p> : null}
      <div className="grid gap-4 md:grid-cols-2">
        {numeros.map((n) => (
          <Card key={n.id}>
            <CardHeader>
              <CardTitle className="flex items-baseline justify-between gap-2">
                <span>{n.nome}{n.final ? <span className="text-base font-normal text-muted-foreground"> · final {n.final}</span> : null}</span>
                <span className={`text-sm font-medium ${conectado(n.status) ? "text-green-600" : "text-destructive"}`}>{rotulo(n.status)}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {conectado(n.status) ? (
                <p className="text-sm text-muted-foreground">Funcionando. Não precisa fazer nada.</p>
              ) : (
                <Button onClick={() => void reconectar(n)} disabled={enviando === n.id}>
                  {enviando === n.id ? "Reconectando…" : "Reconectar com QR"}
                </Button>
              )}
              {qrDe === n.id && !conectado(n.status) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/v1/channel-sessions/${n.id}/qr?t=${tique}`} alt="QR para ler no WhatsApp do celular" className="h-64 w-64 rounded-md border bg-white p-2" />
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
