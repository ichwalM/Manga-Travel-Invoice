"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/client/api-client";
import { formatDateTimeTable, formatRupiah } from "@/lib/domain/format";
import type { ReceiptTransactionRecord } from "@/lib/domain/receipt";
import { cn } from "@/lib/utils";

export interface DeleteTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: ReceiptTransactionRecord;
  onSuccess?: () => void;
}

export function DeleteTransactionDialog({
  open,
  onOpenChange,
  transaction,
  onSuccess,
}: DeleteTransactionDialogProps) {
  const router = useRouter();
  const toast = useToast();
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const debit = BigInt(transaction.debit);
  const credit = BigInt(transaction.credit);

  async function handleDelete() {
    setIsDeleting(true);
    setErrorMsg(null);

    const res = await apiFetch(`/api/transactions/${transaction.id}`, {
      method: "DELETE",
    });

    setIsDeleting(false);

    if (res.ok) {
      toast.success(`Transaksi #${transaction.id} berhasil dihapus.`);
      onOpenChange(false);
      onSuccess?.();
      router.refresh();
    } else {
      setErrorMsg(res.message || "Gagal menghapus transaksi.");
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (!isDeleting) {
          setErrorMsg(null);
          onOpenChange(v);
        }
      }}
      title={`Hapus Transaksi #${transaction.id}?`}
      description="Tindakan ini tidak dapat dibatalkan. Transaksi ini akan dihapus secara permanen dan saldo berjalan agen akan dihitung ulang secara otomatis."
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Batal
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={handleDelete}
            isLoading={isDeleting}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Ya, Hapus Transaksi
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {errorMsg && (
          <div className="flex items-center gap-2 rounded-md border border-danger/20 bg-danger/10 p-3 text-xs text-danger">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Ringkasan Transaksi yang akan dihapus */}
        <div className="rounded-lg border border-surface-border bg-neutral-25 p-3.5 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-neutral-500">Nominal:</span>
            <span
              className={cn(
                "font-bold tabular-nums",
                debit > 0n ? "text-debit-text" : "text-credit-text"
              )}
            >
              {debit > 0n
                ? formatRupiah(debit, { signDisplay: "debit" })
                : formatRupiah(credit, { signDisplay: "credit" })}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-neutral-500">Waktu:</span>
            <span className="font-medium text-neutral-900">
              {formatDateTimeTable(transaction.transactionAt)}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-neutral-500">Agen:</span>
            <span className="font-medium text-neutral-900">
              {transaction.agentCode} ({transaction.agentName})
            </span>
          </div>

          <div className="border-t border-surface-border pt-2">
            <span className="text-neutral-500 block mb-1">Keterangan:</span>
            <p className="rounded bg-neutral-0 p-2 text-neutral-800 break-words border border-surface-border">
              {transaction.description}
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
