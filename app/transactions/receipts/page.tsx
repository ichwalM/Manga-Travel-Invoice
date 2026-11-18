import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { AppShell } from "@/components/layout/app-shell";
import { AppShellSkeleton } from "@/components/layout/app-shell-skeleton";
import { BulkReceiptWorkspace } from "@/components/receipts/bulk-receipt-workspace";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ReceiptPageSkeleton } from "@/components/ui/skeleton";
import { requireSessionUser } from "@/lib/auth/guards";
import type { ReceiptMode, ReceiptPaperSize } from "@/lib/domain/receipt";
import {
  getBulkReceiptsForSession,
  MAX_BULK_RECEIPTS,
} from "@/lib/services/transaction-service";

/**
 * Halaman cetak massal struk: /transactions/receipts?ids=1,2,3&mode=individual&size=80
 */
export default function BulkReceiptPage(
  props: PageProps<"/transactions/receipts">
) {
  return (
    <Suspense
      fallback={
        <AppShellSkeleton pageTitle="Cetak Banyak Struk">
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
  const mode: ReceiptMode = rawMode === "group" ? "group" : "individual";

  const rawSize = firstParam(rawSearchParams.size).toLowerCase();
  const initialSizeFromUrl: ReceiptPaperSize | null =
    rawSize === "58" || rawSize === "80" || rawSize === "a4" ? rawSize : null;

  const breadcrumb = (
    <nav aria-label="Breadcrumb" className="text-xs text-neutral-500">
      <Link href="/transactions" className="hover:text-primary-600">
        Transaksi
      </Link>{" "}
      / <span>Cetak Banyak Struk</span>
    </nav>
  );

  if (transactionIds.length === 0) {
    return (
      <AppShell
        session={session}
        pageTitle="Cetak Banyak Struk"
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

  const result = await getBulkReceiptsForSession({
    session,
    transactionIds,
    mode,
    printedAt: new Date(),
  });

  return (
    <AppShell
      session={session}
      pageTitle="Cetak Banyak Struk"
      breadcrumb={breadcrumb}
    >
      {result.receipts.length === 0 ? (
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
          receipts={result.receipts}
          missingIds={result.missingIds}
          truncatedCount={truncatedCount}
          maxReceipts={MAX_BULK_RECEIPTS}
        />
      )}
    </AppShell>
  );
}
