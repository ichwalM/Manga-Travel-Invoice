"use client";

import * as React from "react";
import Link from "next/link";
import { FileText, Search, X } from "lucide-react";
import { AlertBanner } from "@/components/ui/alert-banner";
import { CaseBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTimeTable, formatRupiah } from "@/lib/domain/format";
import type { ReceiptTransactionRecord } from "@/lib/domain/receipt";
import { cn } from "@/lib/utils";

export interface InvoiceBuilderAgentOption {
  code: string;
  name: string;
}

export interface InvoiceBuilderProps {
  isAdmin: boolean;
  agents: InvoiceBuilderAgentOption[];
  agentCode: string;
  from: string;
  to: string;
  items: ReceiptTransactionRecord[];
  totalMatched: number;
  truncated: boolean;
  maxItems: number;
  validationError: string | null;
}

/**
 * Halaman "Buat Invoice": pilih agen + periode, centang transaksi yang ingin
 * dimasukkan, lalu buat satu invoice berisi rincian per baris + total.
 */
export function InvoiceBuilder({
  isAdmin,
  agents,
  agentCode,
  from,
  to,
  items,
  totalMatched,
  truncated,
  maxItems,
  validationError,
}: InvoiceBuilderProps) {
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const selectedSet = React.useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectAllRef = React.useRef<HTMLInputElement>(null);

  // Pilihan direset bila daftar transaksi berganti (agen/periode berubah)
  const itemsKey = items.map((tx) => tx.id).join(",");
  const [prevItemsKey, setPrevItemsKey] = React.useState(itemsKey);
  if (prevItemsKey !== itemsKey) {
    setPrevItemsKey(itemsKey);
    setSelectedIds([]);
  }

  const allSelected = items.length > 0 && selectedIds.length === items.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  React.useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  const totals = React.useMemo(() => {
    let debit = 0n;
    let credit = 0n;
    for (const tx of items) {
      if (!selectedSet.has(tx.id)) continue;
      debit += BigInt(tx.debit);
      credit += BigInt(tx.credit);
    }
    return { debit, credit, net: debit - credit };
  }, [items, selectedSet]);

  function toggle(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleAll() {
    setSelectedIds(allSelected ? [] : items.map((tx) => tx.id));
  }

  const createHref = `/transactions/receipts?${new URLSearchParams({
    ids: selectedIds.join(","),
    mode: "invoice",
  }).toString()}`;

  const selectedAgent = agents.find((a) => a.code === agentCode);
  const netIsCredit = totals.net < 0n;

  return (
    <div className="space-y-6">
      {/* Langkah 1: pilih agen & periode */}
      <form
        method="get"
        action="/invoices/new"
        className="rounded-lg border border-surface-border bg-surface-card p-5 shadow-card"
      >
        <h2 className="text-base font-semibold text-neutral-900">
          1. Pilih agen dan periode
        </h2>
        <p className="mt-0.5 text-xs text-neutral-500">
          Periode boleh dikosongkan untuk menampilkan semua transaksi agen.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
          <div>
            <label
              htmlFor="invoice-agent"
              className="mb-1 block text-xs font-medium text-neutral-700"
            >
              Agen
            </label>
            {isAdmin ? (
              <select
                id="invoice-agent"
                name="agent"
                defaultValue={agentCode}
                required
                className="h-10 w-full cursor-pointer rounded-md border border-neutral-200 bg-neutral-0 px-3 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="" disabled>
                  Pilih agen…
                </option>
                {agents.map((agent) => (
                  <option key={agent.code} value={agent.code}>
                    {agent.code} — {agent.name}
                  </option>
                ))}
              </select>
            ) : (
              <p
                id="invoice-agent"
                className="flex h-10 items-center rounded-md border border-neutral-200 bg-neutral-25 px-3 text-sm text-neutral-900"
              >
                {agentCode}
                {selectedAgent ? ` — ${selectedAgent.name}` : ""}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="invoice-from"
              className="mb-1 block text-xs font-medium text-neutral-700"
            >
              Tanggal awal
            </label>
            <input
              id="invoice-from"
              name="from"
              type="date"
              defaultValue={from}
              className="h-10 w-full rounded-md border border-neutral-200 bg-neutral-0 px-3 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label
              htmlFor="invoice-to"
              className="mb-1 block text-xs font-medium text-neutral-700"
            >
              Tanggal akhir
            </label>
            <input
              id="invoice-to"
              name="to"
              type="date"
              defaultValue={to}
              className="h-10 w-full rounded-md border border-neutral-200 bg-neutral-0 px-3 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <Button type="submit" variant="secondary" className="h-10">
            <Search className="h-4 w-4" aria-hidden="true" />
            Tampilkan
          </Button>
        </div>
      </form>

      {validationError && (
        <AlertBanner variant="error">{validationError}</AlertBanner>
      )}

      {/* Langkah 2: centang item */}
      {agentCode && !validationError && (
        <section
          aria-label="Pilih transaksi untuk invoice"
          className="rounded-lg border border-surface-border bg-surface-card shadow-card"
        >
          <div className="flex flex-col gap-1 border-b border-surface-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-neutral-900">
                2. Centang transaksi yang masuk ke invoice
              </h2>
              <p className="mt-0.5 text-xs text-neutral-500">
                {totalMatched} transaksi ditemukan untuk {agentCode}
                {truncated && ` · menampilkan ${maxItems} terbaru, persempit periode untuk melihat sisanya`}
                .
              </p>
            </div>
          </div>

          {items.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-neutral-500">
              Tidak ada transaksi pada periode ini.
            </p>
          ) : (
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-surface-table-header">
                  <tr>
                    <th scope="col" className="w-[44px] py-3 pl-5 pr-0">
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        aria-label="Pilih semua transaksi"
                        className="h-4 w-4 cursor-pointer rounded-xs accent-primary-600"
                      />
                    </th>
                    <th scope="col" className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      Tanggal
                    </th>
                    <th scope="col" className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      Case
                    </th>
                    <th scope="col" className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      Keterangan
                    </th>
                    <th scope="col" className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      Debet
                    </th>
                    <th scope="col" className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      Kredit
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {items.map((tx) => {
                    const checked = selectedSet.has(tx.id);
                    return (
                      <tr
                        key={tx.id}
                        onClick={() => toggle(tx.id)}
                        className={cn(
                          "cursor-pointer transition-colors hover:bg-surface-table-hover",
                          checked && "bg-primary-50"
                        )}
                      >
                        <td
                          className="py-3 pl-5 pr-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(tx.id)}
                            aria-label={`Masukkan transaksi ID ${tx.id} ke invoice`}
                            className="h-4 w-4 cursor-pointer rounded-xs accent-primary-600"
                          />
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 tabular-nums text-neutral-900">
                          {formatDateTimeTable(tx.transactionAt)}
                          <span className="block font-mono text-[11px] text-neutral-500">
                            #{tx.id}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <CaseBadge caseValue={tx.case} />
                        </td>
                        <td className="min-w-[220px] px-3 py-3 text-neutral-900">
                          {tx.description}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums text-debit-text">
                          {formatRupiah(tx.debit, { emptyAsDash: true })}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-right font-medium tabular-nums text-credit-text">
                          {formatRupiah(tx.credit, { emptyAsDash: true })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Langkah 3: ringkasan & buat invoice */}
      {agentCode && !validationError && items.length > 0 && (
        <div className="sticky bottom-2 z-20 flex flex-col gap-3 rounded-lg border border-primary-200 bg-primary-50 px-5 py-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:flex sm:gap-6">
            <div>
              <dt className="text-xs text-neutral-500">Item dipilih</dt>
              <dd className="font-semibold text-neutral-900">
                {selectedIds.length}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Total Debet</dt>
              <dd className="font-semibold tabular-nums text-neutral-900">
                {formatRupiah(totals.debit)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Total Kredit</dt>
              <dd className="font-semibold tabular-nums text-neutral-900">
                {formatRupiah(totals.credit)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">
                {netIsCredit ? "Total (kredit)" : "Total"}
              </dt>
              <dd className="font-bold tabular-nums text-primary-800">
                {formatRupiah(netIsCredit ? -totals.net : totals.net)}
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap items-center gap-2">
            {selectedIds.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIds([])}
              >
                <X className="h-4 w-4" aria-hidden="true" />
                Batalkan Pilihan
              </Button>
            )}
            {selectedIds.length > 0 ? (
              <Button asChild variant="primary">
                <Link href={createHref}>
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  Buat Invoice ({selectedIds.length} item)
                </Link>
              </Button>
            ) : (
              <Button type="button" variant="primary" disabled>
                <FileText className="h-4 w-4" aria-hidden="true" />
                Buat Invoice
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
