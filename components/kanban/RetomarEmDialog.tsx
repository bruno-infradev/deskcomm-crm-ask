"use client";
import { useState } from "react";
import { useT } from "@/hooks/i18n/useT";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ATALHOS_DE_RETOMADA, somaMeses } from "@/lib/leads/follow-up-futuro";

/** Ao mover um lead para "Follow up futuro": quando retomar. Atalhos de 3 meses, 6 meses e 1 ano; data livre também vale. */
export function RetomarEmDialog({
  open,
  onOpenChange,
  submitting,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  submitting?: boolean;
  onConfirm: (dataIso: string) => void;
}) {
  const t = useT();
  const hoje = new Date();
  const amanha = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1);
  const minimo = `${amanha.getFullYear()}-${String(amanha.getMonth() + 1).padStart(2, "0")}-${String(amanha.getDate()).padStart(2, "0")}`;
  const [data, setData] = useState("");
  const valida = data >= minimo;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="retomar-em-dialog">
        <DialogHeader>
          <DialogTitle>{t("Quando retomar este lead?")}</DialogTitle>
          <DialogDescription>
            {t("Nessa data o lead volta para Follow up e o responsável é avisado.")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {ATALHOS_DE_RETOMADA.map((a) => (
            <Button
              key={a.meses}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setData(somaMeses(new Date(), a.meses))}
            >
              {t(a.rotulo)}
            </Button>
          ))}
        </div>
        <div className="space-y-1">
          <Label htmlFor="retomar-em">{t("Data de retomada")}</Label>
          <Input id="retomar-em" type="date" min={minimo} value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("Cancelar")}
          </Button>
          <Button type="button" disabled={!valida || submitting} onClick={() => onConfirm(data)}>
            {t("Confirmar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
