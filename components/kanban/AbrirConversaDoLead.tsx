"use client";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useConversaNovaComEscolhaDeCanal } from "@/components/channels/SeletorDeCanalParaConversa";

import { useT } from "@/hooks/i18n/useT";
import { ArrowRight, ChatCircle } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/**
 * A ação "Abrir conversa" — a porta que faltava para o lead sem conversa
 * (issue #1993: lead recebido por webhook chega ao funil com telefone e sem
 * thread nenhuma, e o card não oferecia jeito de começar o atendimento).
 *
 * ─── Mesma rota de sempre, nenhuma nova ─────────────────────────────────────
 *
 * Chama `POST /api/v1/conversations/open-with-contact` — a MESMA rota da
 * tabela de contatos (`ContactsTable.iniciarConversa`) e do cartão de contato
 * do inbox. Do lado de fora ela é conhecida; do lado de dentro ela reabre a
 * conversa que já existe (índice único por contato+sessão) e só cria quando não
 * há nenhuma, que é exatamente o contrato pedido: aproveitar a vinculada,
 * criar a que falta, nunca duplicar.
 *
 * ─── Conversa já vinculada não passa por aqui ───────────────────────────────
 *
 * Quando `conversa` existe, quem renderiza (ConversaSlot, ConversaNoDossie)
 * pinta o elo para `/app/inbox?id=…` e NÃO este botão: um clique que já tem
 * destino certo não precisa de ida ao servidor — e ida ao servidor seria uma
 * segunda chance de abrir a conversa errada.
 *
 * ─── Sem telefone: desabilitado E explicado ─────────────────────────────────
 *
 * Sem telefone a rota não tem o que resolver (o `contact_id` sozinho não acha
 * sessão de canal para conversa 1:1 com número novo), então o botão não sai do
 * navegador. Mas ele fica na linha, desabilitado, dizendo POR QUÊ — o motivo
 * invisível é o que faz o usuário achar que o sistema quebrou. Lead sem
 * contato NENHUM continua sem linha: a ausência é estado normal, e o card não
 * reserva altura para dizer que não há nada (mesma régua de sempre).
 *
 * ─── Carregamento é estado, não decoração ───────────────────────────────────
 *
 * Enquanto a rota não responde o botão some do teclado e do mouse (padrão da
 * tabela de contatos): sem isso um duplo clique — o gesto natural de quem está
 * ansioso pelo lead novo — pediria duas conversas.
 */
interface Props {
  contactId?: string | null;
  phone?: string | null;
  /** `card` = linha compacta do funil; `dossie` = bloco do painel do lead. */
  variante?: "card" | "dossie";
}

/**
 * Há ALVO para abrir: contato ou telefone. Exportado porque quem renderiza decide
 * se este componente MONTA — e montar sem alvo gastaria um router e um query
 * client para desenhar nada (o card continua vazio, só mais caro).
 */
export function temAlvoParaAbrir(contactId?: string | null, phone?: string | null): boolean {
  return Boolean(contactId) || Boolean(phone?.trim());
}

export function AbrirConversaDoLead({ contactId, phone, variante = "card" }: Props) {
  const t = useT();
  const router = useRouter();
  const qc = useQueryClient();
  // Fork ASK: o card abre a conversa pelo MESMO fluxo da tabela de contatos
  // (issue #2382): com mais de um número elegível, o vendedor escolhe por qual
  // número a conversa nasce; com um só, segue direto. Conversa que já existe
  // com o contato naquele número é reaberta pela rota (índice único).
  const { iniciarConversa, abrindo, seletor } = useConversaNovaComEscolhaDeCanal({
    aoAbrir: async (conversationId) => {
      await qc.invalidateQueries({ queryKey: ["board"] });
      router.push(`/app/inbox?id=${conversationId}`);
    },
  });

  const telefone = phone?.trim() ?? "";
  const temAlvo = temAlvoParaAbrir(contactId, phone);
  const podeAbrir = telefone.length > 0;
  const semTelefone = t(
    "Sem telefone no contato: cadastre um telefone para abrir a conversa.",
  );

  if (!temAlvo) return null;

  function abrir() {
    if (!podeAbrir || abrindo) return;
    void iniciarConversa({ contact_id: contactId || undefined, phone_number: telefone });
  }

  // O diálogo vive num portal, mas eventos do React sobem pela árvore de
  // componentes: sem a cerca, clicar no seletor abriria o dossiê do card.
  const dialogo = seletor ? (
    <span onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {seletor}
    </span>
  ) : null;

  if (variante === "dossie") {
    return (
      <>
      <button
        type="button"
        onClick={() => void abrir()}
        disabled={!podeAbrir || abrindo}
        aria-busy={abrindo}
        title={podeAbrir ? t("Abrir conversa no Inbox") : semTelefone}
        className="group mt-3 flex w-full items-center gap-2.5 rounded-md border border-border bg-muted/40 px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-70"
      >
        <ChatCircle size={16} weight="regular" className="shrink-0 text-text-muted" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium text-text">
            {abrindo
              ? t("Abrindo…")
              : podeAbrir
                ? t("Iniciar atendimento")
                : t("Iniciar atendimento")}
          </span>
          {!podeAbrir && (
            <span className="block text-[11px] text-text-muted">{semTelefone}</span>
          )}
        </span>
        {podeAbrir && !abrindo && (
          <ArrowRight
            size={14}
            weight="regular"
            className="shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        )}
      </button>
      {dialogo}
      </>
    );
  }

  return (
    <>
    <button
      type="button"
      // O card inteiro é arrastável e clicável (abre o dossiê): sem parar a
      // propagação, abrir a conversa também abriria o dossiê por baixo.
      onClick={(e) => {
        e.stopPropagation();
        void abrir();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      disabled={!podeAbrir || abrindo}
      aria-busy={abrindo}
      title={podeAbrir ? t("Abrir conversa no Inbox") : semTelefone}
      className={cn(
        "group/conversa mt-1 flex w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left text-[11px]",
        "transition-colors",
        podeAbrir
          ? "text-text-muted hover:bg-muted hover:text-foreground"
          : "cursor-not-allowed text-text-muted opacity-80",
        abrindo && "cursor-wait",
      )}
    >
      <ChatCircle size={12} weight="regular" className="shrink-0" aria-hidden />
      <span>{abrindo ? t("Abrindo…") : t("Iniciar atendimento")}</span>
      {!podeAbrir && (
        // O motivo visível: `title` some para quem não tem mouse, e o leitor de
        // tela não anuncia botão desabilitado.
        <span className="ml-auto shrink-0 text-text-muted">{t("sem telefone")}</span>
      )}
    </button>
    {dialogo}
    </>
  );
}
