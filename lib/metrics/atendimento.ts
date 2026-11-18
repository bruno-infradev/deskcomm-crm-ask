/**
 * Atendimento de um número de WhatsApp (pedido do Bruno em 18/11/2026, WhatsApp da Kath, Clínica ASK).
 * "Lead" = contato que escreveu primeiro (a 1ª mensagem dele na janela é de entrada). Tempo da 1ª resposta = da 1ª mensagem do
 * lead até a 1ª mensagem de saída seguinte (humano ou automação, o CRM não distingue). Sem saída depois = sem resposta (a espera
 * dele conta até agora). Só mede o que passa pelo WhatsApp conectado; não avalia o texto.
 */
export interface MensagemDeAtendimento {
  contact_id: string | null;
  direction: string;
  created_at: string;
}
export interface LeadAtendido {
  contact_id: string;
  primeira_em: string;
  respondido: boolean;
  espera_minutos: number;
}
export interface ResumoAtendimento {
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

const MS_POR_MINUTO = 60_000;
const pct = (parte: number, base: number): number | null => (base > 0 ? Math.round((parte / base) * 1000) / 10 : null);

export function leadsAtendidos(mensagens: readonly MensagemDeAtendimento[], agoraMs: number = Date.now()): LeadAtendido[] {
  const porContato = new Map<string, MensagemDeAtendimento[]>();
  for (const m of mensagens) {
    if (!m.contact_id) continue;
    const lista = porContato.get(m.contact_id);
    if (lista) lista.push(m);
    else porContato.set(m.contact_id, [m]);
  }
  const leads: LeadAtendido[] = [];
  for (const [contact_id, lista] of porContato) {
    const ordenada = [...lista].filter((m) => m.direction === "inbound" || m.direction === "outbound").sort((a, b) => a.created_at.localeCompare(b.created_at));
    const primeira = ordenada[0];
    if (!primeira || primeira.direction !== "inbound") continue;
    const t0 = new Date(primeira.created_at).getTime();
    const resposta = ordenada.find((m) => m.direction === "outbound");
    const fim = resposta ? new Date(resposta.created_at).getTime() : agoraMs;
    leads.push({ contact_id, primeira_em: primeira.created_at, respondido: !!resposta, espera_minutos: Math.max(0, Math.round((fim - t0) / MS_POR_MINUTO)) });
  }
  return leads;
}

export function resumirAtendimento(leads: readonly LeadAtendido[]): ResumoAtendimento {
  const respondidos = leads.filter((l) => l.respondido);
  const esperas = respondidos.map((l) => l.espera_minutos).sort((a, b) => a - b);
  const meio = Math.floor(esperas.length / 2);
  const mediana = esperas.length === 0 ? null : esperas.length % 2 ? esperas[meio]! : Math.round((esperas[meio - 1]! + esperas[meio]!) / 2);
  const ate = (min: number) => pct(esperas.filter((e) => e <= min).length, leads.length);
  return {
    leads: leads.length,
    respondidos: respondidos.length,
    sem_resposta: leads.length - respondidos.length,
    taxa_resposta: pct(respondidos.length, leads.length),
    media_minutos: esperas.length ? Math.round(esperas.reduce((s, e) => s + e, 0) / esperas.length) : null,
    mediana_minutos: mediana,
    ate_5_min: ate(5),
    ate_30_min: ate(30),
    ate_60_min: ate(60),
  };
}
