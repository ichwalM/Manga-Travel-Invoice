"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, RefreshCw } from "lucide-react";
import { CaseBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/client/api-client";
import { getKnownTransactionCase, TRANSACTION_CASES } from "@/lib/domain/cases";
import { extractTransactionRefs } from "@/lib/domain/extraction";
import { parseRupiahToBigInt } from "@/lib/domain/money";
import type { ReceiptTransactionRecord } from "@/lib/domain/receipt";
import { cn } from "@/lib/utils";

export interface EditTransactionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: ReceiptTransactionRecord;
  onSuccess?: (updated: ReceiptTransactionRecord) => void;
}

function toDatetimeLocal(isoString: string): string {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "";
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(d);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const hour = map.hour === "24" ? "00" : map.hour;
  return `${map.year}-${map.month}-${map.day}T${hour}:${map.minute}:${map.second}`;
}

function formatNumber(val: bigint): string {
  return val.toLocaleString("id-ID");
}

export function EditTransactionModal({
  open,
  onOpenChange,
  transaction,
  onSuccess,
}: EditTransactionModalProps) {
  const router = useRouter();
  const toast = useToast();

  const debit = BigInt(transaction.debit);
  const credit = BigInt(transaction.credit);
  const initialNominal = debit > 0n ? debit : credit;

  const [transactionAt, setTransactionAt] = React.useState("");
  const [caseValue, setCaseValue] = React.useState(transaction.case);
  const [amountRaw, setAmountRaw] = React.useState("");
  const [description, setDescription] = React.useState(transaction.description);
  const [orderNumber, setOrderNumber] = React.useState(
    transaction.orderNumber ?? ""
  );
  const [bookingCode, setBookingCode] = React.useState(
    transaction.bookingCode ?? ""
  );

  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>(
    {}
  );
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Inisialisasi form setiap kali modal dibuka / transaksi berganti
  React.useEffect(() => {
    if (open) {
      setTransactionAt(toDatetimeLocal(transaction.transactionAt));
      setCaseValue(transaction.case);
      setAmountRaw(
        initialNominal > 0n ? formatNumber(initialNominal) : ""
      );
      setDescription(transaction.description);
      setOrderNumber(transaction.orderNumber ?? "");
      setBookingCode(transaction.bookingCode ?? "");
      setFieldErrors({});
      setFormError(null);
    }
  }, [open, transaction, initialNominal]);

  const caseMeta = getKnownTransactionCase(caseValue);
  const isDebit = caseMeta?.side === "debit";

  function handleAutoExtract() {
    const refs = extractTransactionRefs(description);
    if (refs.orderNumber) setOrderNumber(refs.orderNumber);
    if (refs.bookingCode) setBookingCode(refs.bookingCode);
    toast.info("No. Pesanan & Kode Booking diekstrak dari keterangan.");
  }

  function handleAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^0-9]/g, "");
    if (!raw) {
      setAmountRaw("");
      return;
    }
    const val = BigInt(raw);
    setAmountRaw(formatNumber(val));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const errors: Record<string, string> = {};
    if (!transactionAt.trim()) {
      errors.transactionAt = "Waktu transaksi wajib diisi.";
    }
    if (!description.trim()) {
      errors.description = "Keterangan transaksi wajib diisi.";
    }

    const parsedNominal = parseRupiahToBigInt(amountRaw, {
      allowNegative: false,
      emptyAsZero: false,
    });

    if (parsedNominal === null || parsedNominal <= 0n) {
      errors.amount = "Nominal harus lebih dari 0.";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);

    const res = await apiFetch<{
      success: boolean;
      transaction: ReceiptTransactionRecord;
    }>(`/api/transactions/${transaction.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transactionAt,
        case: caseValue,
        description: description.trim(),
        amount: parsedNominal?.toString(),
        orderNumber: orderNumber.trim() || null,
        bookingCode: bookingCode.trim() || null,
      }),
    });

    setIsSubmitting(false);

    if (res.ok && res.data?.transaction) {
      toast.success(`Transaksi #${transaction.id} berhasil diperbarui.`);
      onOpenChange(false);
      onSuccess?.(res.data.transaction);
      router.refresh();
    } else if (!res.ok) {
      if (res.fields) {
        setFieldErrors(res.fields);
      }
      setFormError(res.message || "Gagal menyimpan perubahan transaksi.");
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (!isSubmitting) {
          onOpenChange(v);
        }
      }}
      title={`Edit Transaksi #${transaction.id}`}
      description={`Ubah data transaksi agen ${transaction.agentCode}. Saldo berjalan agen akan disinkronkan otomatis.`}
      className="max-w-[540px]"
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Batal
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleSubmit}
            isLoading={isSubmitting}
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            Simpan Perubahan
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {formError && (
          <div className="flex items-center gap-2 rounded-md border border-danger/20 bg-danger/10 p-3 text-xs text-danger">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {/* Tanggal & Waktu */}
        <div>
          <label className="block text-xs font-semibold text-neutral-700 mb-1">
            Tanggal &amp; Waktu Transaksi (WIB)
          </label>
          <input
            type="datetime-local"
            step="1"
            value={transactionAt}
            onChange={(e) => {
              setTransactionAt(e.target.value);
              setFieldErrors((prev) => ({ ...prev, transactionAt: "" }));
            }}
            className={cn(
              "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none",
              fieldErrors.transactionAt && "border-danger focus:border-danger"
            )}
          />
          {fieldErrors.transactionAt && (
            <p className="mt-1 text-xs text-danger">
              {fieldErrors.transactionAt}
            </p>
          )}
        </div>

        {/* Case & Sisi Arus */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">
              Jenis Transaksi (Case)
            </label>
            <select
              value={caseValue}
              onChange={(e) => setCaseValue(e.target.value)}
              className="w-full rounded-md border border-neutral-300 bg-neutral-0 px-3 py-2 text-sm text-neutral-900 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
            >
              {TRANSACTION_CASES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label} ({c.side === "debit" ? "Debet / Keluar" : "Kredit / Masuk"})
                </option>
              ))}
              {/* Pertahankan custom case jika ada */}
              {!TRANSACTION_CASES.some((c) => c.value === caseValue) && (
                <option value={caseValue}>
                  {caseValue} (Kustom)
                </option>
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">
              Status Aliran Dana
            </label>
            <div className="flex h-10 items-center justify-between rounded-md border border-surface-border bg-neutral-25 px-3">
              <span className="text-xs text-neutral-600">
                {isDebit ? "Debet (Uang Keluar)" : "Kredit (Uang Masuk)"}
              </span>
              <CaseBadge caseValue={caseValue} />
            </div>
          </div>
        </div>

        {/* Nominal */}
        <div>
          <label className="block text-xs font-semibold text-neutral-700 mb-1">
            Nominal {isDebit ? "Debet" : "Kredit"} (Rupiah)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-neutral-500">
              Rp
            </span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={amountRaw}
              onChange={handleAmountChange}
              className={cn(
                "w-full rounded-md border border-neutral-300 pl-10 pr-3 py-2 text-sm font-semibold tabular-nums text-neutral-900 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none",
                isDebit ? "text-debit-text" : "text-credit-text",
                fieldErrors.amount && "border-danger focus:border-danger"
              )}
            />
          </div>
          {fieldErrors.amount && (
            <p className="mt-1 text-xs text-danger">{fieldErrors.amount}</p>
          )}
        </div>

        {/* Keterangan */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-semibold text-neutral-700">
              Keterangan Lengkap
            </label>
            <button
              type="button"
              onClick={handleAutoExtract}
              title="Ekstrak No. Pesanan & Booking dari keterangan"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-600 hover:text-primary-700 cursor-pointer"
            >
              <RefreshCw className="h-3 w-3" />
              Deteksi No. Pesanan
            </button>
          </div>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setFieldErrors((prev) => ({ ...prev, description: "" }));
            }}
            placeholder="Keterangan transaksi..."
            className={cn(
              "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none resize-none",
              fieldErrors.description && "border-danger focus:border-danger"
            )}
          />
          {fieldErrors.description && (
            <p className="mt-1 text-xs text-danger">
              {fieldErrors.description}
            </p>
          )}
        </div>

        {/* No. Pesanan & Kode Booking */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">
              No. Pesanan (Opsional)
            </label>
            <input
              type="text"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              placeholder="Contoh: 920019906"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm font-mono text-neutral-900 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">
              Kode Booking (Opsional)
            </label>
            <input
              type="text"
              value={bookingCode}
              onChange={(e) => setBookingCode(e.target.value)}
              placeholder="Contoh: EQNMYK"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm font-mono text-neutral-900 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
            />
          </div>
        </div>
      </form>
    </Modal>
  );
}
