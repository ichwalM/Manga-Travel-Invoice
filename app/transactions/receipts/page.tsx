import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { AppShell } from "@/components/layout/app-shell";
import { AppShellSkeleton } from "@/components/layout/app-shell-skeleton";
import {
  BulkReceiptWorkspace,
  type BulkPrintMode,
} from "@/components/receipts/bulk-receipt-workspace";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ReceiptPageSkeleton } from "@/components/ui/skeleton";
import { requireSessionUser } from "@/lib/auth/guards";
import type { ReceiptPaperSize } from "@/lib/domain/receipt";
import {
  getBulkReceiptsForSession,
  getCombinedInvoicesForSession,
  MAX_BULK_RECEIPTS,
} from "@/lib/services/transaction-service";

/**
 * Halaman cetak transaksi terpilih: /transactions/receipts?ids=1,2,3&mode=invoice&size=80
 * mode: invoice (default, 1 invoice gabungan) | individual (per transaksi) | group (per No. Pesanan)
 */
export default function BulkReceiptPage(
  props: PageProps<"/transactions/receipts">
) {
  return (
    <Suspense
      fallback={
        <AppShellSkeleton pageTitle="Cetak Transaksi Terpilih">
          <ReceiptPageSkeleton />
        </AppShellSkeleton>
      }
    >
      <BulkReceiptDynamicContent searchParamsPromise={props.searchParams} />
    </Suspense>
  );
}

function firstParam(val: string | string[] | undefined): string {
  if (Array.isArray(val)) return val[0] ?? "";
  return val ?? "";
}

function parseBulkReceiptIds(raw: string): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

async function BulkReceiptDynamicContent({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const rawSearchParams = await searchParamsPromise;
  const session = await requireSessionUser("/transactions/receipts");

  const allIds = parseBulkReceiptIds(firstParam(rawSearchParams.ids));
  const transactionIds = allIds.slice(0, MAX_BULK_RECEIPTS);
  const truncatedCount = allIds.length - transactionIds.length;

  const rawMode = firstParam(rawSearchParams.mode).toLowerCase();
  const mode: BulkPrintMode =
    rawMode === "group" || rawMode === "individual" ? rawMode : "invoice";

  const rawSize = firstParam(rawSearchParams.size).toLowerCase();
  const initialSizeFromUrl: ReceiptPaperSize | null =
    rawSize === "58" || rawSize === "80" || rawSize === "a4" ? rawSize : null;

  const breadcrumb = (
    <nav aria-label="Breadcrumb" className="text-xs text-neutral-500">
      <Link href="/transactions" className="hover:text-primary-600">
        Transaksi
      </Link>{" "}
      / <span>Cetak Transaksi Terpilih</span>
    </nav>
  );

  if (transactionIds.length === 0) {
    return (
      <AppShell
        session={session}
        pageTitle="Cetak Transaksi Terpilih"
        breadcrumb={breadcrumb}
      >
        <EmptyState
          variant="no_results"
          title="Belum ada transaksi yang dipilih."
          action={
            <Button asChild variant="secondary">
              <Link href="/transactions">Pilih di Daftar Transaksi</Link>
            </Button>
          }
        />
      </AppShell>
    );
  }

  const printedAt = new Date();
  const invoiceResult =
    mode === "invoice"
      ? await getCombinedInvoicesForSession({
          session,
          transactionIds,
          printedAt,
        })
      : null;
  const receiptResult =
    mode === "invoice"
      ? null
      : await getBulkReceiptsForSession({
          session,
          transactionIds,
          mode,
          printedAt,
        });

  const receipts = receiptResult?.receipts ?? [];
  const invoices = invoiceResult?.invoices ?? [];
  const missingIds =
    invoiceResult?.missingIds ?? receiptResult?.missingIds ?? [];
  const documentCount = mode === "invoice" ? invoices.length : receipts.length;

  return (
    <AppShell
      session={session}
      pageTitle="Cetak Transaksi Terpilih"
      breadcrumb={breadcrumb}
    >
      {documentCount === 0 ? (
        <EmptyState
          variant="no_results"
          title="Transaksi yang dipilih tidak ditemukan."
          action={
            <Button asChild variant="secondary">
              <Link href="/transactions">Kembali ke Transaksi</Link>
            </Button>
          }
        />
      ) : (
        <BulkReceiptWorkspace
          transactionIds={transactionIds}
          activeMode={mode}
          initialSizeFromUrl={initialSizeFromUrl}
          receipts={receipts}
          invoices={invoices}
          missingIds={missingIds}
          truncatedCount={truncatedCount}
          maxReceipts={MAX_BULK_RECEIPTS}
        />
      )}
    </AppShell>
  );
}
