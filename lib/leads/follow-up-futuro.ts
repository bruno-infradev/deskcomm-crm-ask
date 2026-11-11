/**
 * Follow up futuro (fork ASK, T-20261111-02): etapa do funil Comercial onde o time guarda o lead para retomar daqui a
 * meses. A data de retomada mora em `custom_fields.retomar_em` (AAAA-MM-DD), gravada no MESMO update do move (a rota de
 * move já faz o merge de `custom_fields`). Sem migração.
 */
export const SLUG_FOLLOW_UP_FUTURO = "follow_up_futuro";
export const CHAVE_RETOMAR_EM = "retomar_em";

export const ATALHOS_DE_RETOMADA = [
  { rotulo: "3 meses", meses: 3 },
  { rotulo: "6 meses", meses: 6 },
  { rotulo: "1 ano", meses: 12 },
] as const;

const AAAA_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

export const ehEtapaFollowUpFuturo = (etapa: { slug?: string } | undefined | null): boolean =>
  etapa?.slug === SLUG_FOLLOW_UP_FUTURO;

/** Hoje + N meses em AAAA-MM-DD (dia 31 + 1 mês cai no último dia do mês seguinte, sem pular de mês). */
export function somaMeses(hoje: Date, meses: number): string {
  const alvo = new Date(hoje.getFullYear(), hoje.getMonth() + meses, 1);
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  alvo.setDate(Math.min(hoje.getDate(), ultimo));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${alvo.getFullYear()}-${p(alvo.getMonth() + 1)}-${p(alvo.getDate())}`;
}

export function dataDeRetomada(lead: { custom_fields?: Record<string, unknown> | null }): string | null {
  const v = lead.custom_fields?.[CHAVE_RETOMAR_EM];
  return typeof v === "string" && AAAA_MM_DD.test(v) ? v : null;
}

/** AAAA-MM-DD → DD/MM/AAAA. */
export const dataBr = (iso: string): string => iso.split("-").reverse().join("/");
