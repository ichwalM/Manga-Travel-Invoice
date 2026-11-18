"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import {
  A4ReceiptTemplate,
  getServerReceiptSize,
  getStoredReceiptSize,
  RECEIPT_SIZE_CHANGE_EVENT,
  RECEIPT_SIZE_STORAGE_KEY,
  subscribeReceiptSize,
  ThermalReceiptTemplate,
} from "@/components/receipts/receipt-workspace";
import { AlertBanner } from "@/components/ui/alert-banner";
import { Button } from "@/components/ui/button";
import { IndeterminateProgressBar } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/client/api-client";
import type {
  ReceiptMode,
  ReceiptPaperSize,
  ReceiptPayload,
} from "@/lib/domain/receipt";
import { cn } from "@/lib/utils";

export interface BulkReceiptWorkspaceProps {
  transactionIds: string[];
  activeMode: ReceiptMode;
  initialSizeFromUrl: ReceiptPaperSize | null;
  receipts: ReceiptPayload[];
  missingIds: string[];
  truncatedCount: number;
  maxReceipts: number;
}

/**
 * Cetak massal struk (F-06): beberapa transaksi terpilih dicetak dalam satu kali
 * dialog cetak, setiap struk dimulai pada halaman/potongan kertas baru.
 */
export function BulkReceiptWorkspace({
  transactionIds,
  activeMode,
  initialSizeFromUrl,
  receipts,
  missingIds,
  truncatedCount,
  maxReceipts,
}: BulkReceiptWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isModePending, startModeTransition] = React.useTransition();

  const storedSize = React.useSyncExternalStore(
    subscribeReceiptSize,
    getStoredReceiptSize,
    getServerReceiptSize
  );
  const [manualSize, setManualSize] = React.useState<ReceiptPaperSize | null>(
    initialSizeFromUrl
  );
  const size: ReceiptPaperSize =
    manualSize ?? initialSizeFromUrl ?? storedSize;

  const [showThermalLogo, setShowThermalLogo] = React.useState(
    receipts[0]?.header.showThermalLogo ?? true
  );

  React.useEffect(() => {
    if (initialSizeFromUrl) {
      window.localStorage.setItem(RECEIPT_SIZE_STORAGE_KEY, initialSizeFromUrl);
    }
  }, [initialSizeFromUrl]);

  function buildUrl(nextMode: ReceiptMode, nextSize: ReceiptPaperSize) {
    const params = new URLSearchParams();
    params.set("ids", transactionIds.join(","));
    params.set("mode", nextMode);
    params.set("size", nextSize);
    return `${pathname}?${params.toString()}`;
  }

  function handleSelectSize(nextSize: ReceiptPaperSize) {
    setManualSize(nextSize);
    window.localStorage.setItem(RECEIPT_SIZE_STORAGE_KEY, nextSize);
    window.dispatchEvent(new Event(RECEIPT_SIZE_CHANGE_EVENT));
    router.replace(buildUrl(activeMode, nextSize), { scroll: false });
  }

  function handleSelectMode(nextMode: ReceiptMode) {
    if (nextMode === activeMode || isModePending) return;
    startModeTransition(() => {
      router.push(buildUrl(nextMode, size));
    });
  }

  function handlePrint() {
    // Catat seluruh transaksi yang dicetak ke audit_logs (asinkron)
    void apiFetch("/api/receipts", {
      method: "POST",
      body: { transactionIds, mode: activeMode, size },
      redirectOnUnauthorized: false,
    });
    window.print();
  }

  const pageCssRule =
    size === "58"
      ? "@media print { @page { size: 58mm auto; margin: 0; } }"
      : size === "80"
        ? "@media print { @page { size: 80mm auto; margin: 0; } }"
        : "@media print { @page { size: A4; margin: 16mm; } }";

  const modeOptions: { id: ReceiptMode; label: string }[] = [
    { id: "individual", label: "Per Transaksi" },
    { id: "group", label: "Per No. Pesanan" },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <style>{pageCssRule}</style>

      <aside className="no-print space-y-5 lg:col-span-4">
        <div className="space-y-5 rounded-lg border border-surface-border bg-surface-card p-5 shadow-card lg:sticky lg:top-4">
          <div>
            <h2 className="text-base font-semibold text-neutral-900">
              Cetak Banyak Struk
            </h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              {transactionIds.length} transaksi dipilih ·{" "}
              <strong className="font-semibold text-neutral-700">
                {receipts.length} struk
              </strong>{" "}
              akan dicetak. Setiap struk dimulai di halaman baru.
            </p>
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Mode Cetak
            </span>
            <div
              className="grid grid-cols-2 rounded-md border border-neutral-200 bg-neutral-25 p-1"
              role="group"
              aria-label="Pilih mode struk"
            >
              {modeOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={isModePending}
                  onClick={() => handleSelectMode(opt.id)}
                  className={cn(
                    "inline-flex h-9 items-center justify-center gap-1.5 rounded-sm text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-60",
                    activeMode === opt.id
                      ? "bg-neutral-0 font-semibold text-primary-700 shadow-2xs"
                      : "text-neutral-700 hover:text-neutral-900"
                  )}
                >
                  {isModePending && activeMode !== opt.id && (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin text-primary-600"
                      aria-hidden="true"
                    />
                  )}
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-neutral-500">
              {activeMode === "group"
                ? "Transaksi dengan No. Pesanan yang sama digabung jadi satu struk (tiket + bonus). Transaksi tanpa No. Pesanan tetap dicetak satu per satu."
                : "Setiap transaksi terpilih dicetak sebagai struk sendiri."}
            </p>
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Ukuran Kertas
            </span>
            <div
              className="grid grid-cols-3 rounded-md border border-neutral-200 bg-neutral-25 p-1"
              role="group"
              aria-label="Pilih ukuran kertas struk"
            >
              {(
                [
                  { id: "58", label: "58mm" },
                  { id: "80", label: "80mm" },
                  { id: "a4", label: "A4" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSelectSize(opt.id)}
                  className={cn(
                    "h-9 rounded-sm text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
                    size === opt.id
                      ? "bg-neutral-0 font-semibold text-primary-700 shadow-2xs"
                      : "text-neutral-700 hover:text-neutral-900"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {size !== "a4" && (
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-surface-border bg-neutral-25 px-3 py-2.5 text-xs font-medium text-neutral-700">
              <span>Tampilkan logo pada struk thermal</span>
              <input
                type="checkbox"
                checked={showThermalLogo}
                onChange={(e) => setShowThermalLogo(e.target.checked)}
                className="h-4 w-4 rounded-xs accent-primary-600"
              />
            </label>
          )}

          {truncatedCount > 0 && (
            <AlertBanner variant="warning">
              Hanya {maxReceipts} transaksi pertama yang diproses.{" "}
              {truncatedCount} transaksi lainnya tidak ikut dicetak.
            </AlertBanner>
          )}

          {missingIds.length > 0 && (
            <AlertBanner variant="warning">
              {missingIds.length} transaksi tidak ditemukan atau di luar akses
              Anda dan dilewati: #{missingIds.join(", #")}.
            </AlertBanner>
          )}

          <div className="flex flex-col gap-2.5 pt-2">
            <Button
              type="button"
              variant="primary"
              size="lg"
              disabled={isModePending || receipts.length === 0}
              onClick={handlePrint}
              className="w-full"
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              Cetak {receipts.length} Struk
            </Button>

            <Button asChild variant="ghost" className="w-full">
              <Link href="/transactions">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Kembali ke Transaksi
              </Link>
            </Button>
          </div>
        </div>
      </aside>

      <section
        aria-label="Pratinjau struk"
        aria-busy={isModePending}
        className="relative overflow-hidden rounded-lg border border-surface-border bg-neutral-100/70 p-4 sm:p-8 lg:col-span-8 print:block print:overflow-visible print:border-none print:bg-transparent print:p-0"
      >
        {isModePending && (
          <IndeterminateProgressBar
            label="Memuat mode struk..."
            className="absolute inset-x-0 top-0"
          />
        )}

        <div
          className={cn(
            "flex flex-col items-center gap-6 transition-opacity print:block",
            isModePending && "opacity-60"
          )}
        >
          {receipts.map((receipt, idx) => (
            <div
              key={`${idx}-${receipt.mode}-${receipt.meta.transactionId}`}
              className={cn(
                "flex w-full justify-center print:block",
                idx < receipts.length - 1 && "print:break-after-page"
              )}
            >
              {size === "a4" ? (
                <A4ReceiptTemplate receipt={receipt} />
              ) : (
                <ThermalReceiptTemplate
                  receipt={receipt}
                  paperWidth={size}
                  showLogo={showThermalLogo}
                />
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
