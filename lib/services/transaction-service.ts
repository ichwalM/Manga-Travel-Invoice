/**
 * Layanan server untuk membaca, menyaring, mencari, merangkum, dan membentuk struk transaksi.
 * Terhubung ke AppDataRepository (otomatis mendukung MySQL XAMPP via Prisma maupun Local Store).
 * WAJIB: Pembatasan data per agen dilakukan di SERVER (docs/app-spec.json > roles.security_rule).
 */

import { getDataRepository } from "@/lib/db/repository";
import type { AppAgentRecord, SessionUser } from "@/lib/db/types";
import { getTransactionCaseMeta } from "@/lib/domain/cases";
import {
  buildCombinedInvoices,
  type CombinedInvoicePayload,
} from "@/lib/domain/invoice";
import {
  buildGroupReceipt,
  buildIndividualReceipt,
  type BuildReceiptResult,
  type ReceiptBusinessSettings,
  type ReceiptMode,
  type ReceiptPayload,
  type ReceiptTransactionRecord,
} from "@/lib/domain/receipt";
import type { ParsedTransactionQuery } from "@/lib/validation/transaction-query";

export interface TransactionSummaryDto {
  /** Null jika hasil mencakup 0 agen atau > 1 agen (tampilkan '—' sesuai F-02 > summary_cards) */
  latestBalance: string | null;
  totalCredit: string;
  totalDebit: string;
  totalCount: number;
}

export interface TransactionListResult {
  items: ReceiptTransactionRecord[];
  summary: TransactionSummaryDto;
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    fromIndex: number;
    toIndex: number;
  };
  emptyReason:
    | null
    | "no_transactions"
    | "filter_no_result"
    | "search_no_result"
    | "validation_error";
  validationError: string | null;
}

export interface TransactionDetailResult {
  transaction: ReceiptTransactionRecord;
  relatedTransactions: ReceiptTransactionRecord[];
}

function filterDatasetForSession(
  session: SessionUser,
  dataset: readonly ReceiptTransactionRecord[]
): ReceiptTransactionRecord[] {
  if (session.role === "agent") {
    return dataset.filter((tx) => tx.agentId === session.agentId);
  }
  return [...dataset];
}

/**
 * Fungsi murni penyaringan & pencarian transaksi (dipakai oleh repository live maupun unit test).
 */
export function filterAndPaginateTransactions(
  session: SessionUser,
  parsed: ParsedTransactionQuery,
  dataset: readonly ReceiptTransactionRecord[]
): TransactionListResult {
  const scoped = filterDatasetForSession(session, dataset);

  const effectiveAgentCode =
    session.role === "admin" ? parsed.query.agentCode : "";
  const effectiveFilterCount =
    parsed.activeFilterCount -
    (session.role === "agent" && parsed.query.agentCode ? 1 : 0);

  if (parsed.validationError) {
    return {
      items: [],
      summary: {
        latestBalance: null,
        totalCredit: "0",
        totalDebit: "0",
        totalCount: 0,
      },
      pagination: {
        page: 1,
        pageSize: parsed.query.pageSize,
        totalItems: 0,
        totalPages: 0,
        fromIndex: 0,
        toIndex: 0,
      },
      emptyReason: "validation_error",
      validationError: parsed.validationError,
    };
  }

  if (scoped.length === 0) {
    return {
      items: [],
      summary: {
        latestBalance: null,
        totalCredit: "0",
        totalDebit: "0",
        totalCount: 0,
      },
      pagination: {
        page: 1,
        pageSize: parsed.query.pageSize,
        totalItems: 0,
        totalPages: 0,
        fromIndex: 0,
        toIndex: 0,
      },
      emptyReason: "no_transactions",
      validationError: null,
    };
  }

  const fromTimestamp = parsed.query.from
    ? new Date(`${parsed.query.from}T00:00:00.000+07:00`).getTime()
    : null;
  const toTimestamp = parsed.query.to
    ? new Date(`${parsed.query.to}T23:59:59.999+07:00`).getTime()
    : null;

  const caseSet =
    parsed.query.cases.length > 0 ? new Set(parsed.query.cases) : null;
  const normalizedAgentFilter = effectiveAgentCode.toLowerCase();
  const normalizedDescFilter = parsed.query.desc.toLowerCase();

  const qRaw = parsed.query.q.trim();
  const qLower = qRaw.toLowerCase();
  const qIsNumeric = /^\d+$/.test(qRaw);

  const filtered = scoped.filter((tx) => {
    const txTime = new Date(tx.transactionAt).getTime();

    if (fromTimestamp !== null && txTime < fromTimestamp) return false;
    if (toTimestamp !== null && txTime > toTimestamp) return false;

    if (caseSet && !caseSet.has(tx.case.toLowerCase())) return false;

    const debit = BigInt(tx.debit);
    const credit = BigInt(tx.credit);
    const balance = BigInt(tx.balance);
    const activeNominal = debit > 0n ? debit : credit;

    if (parsed.query.type === "debit" && debit <= 0n) return false;
    if (parsed.query.type === "credit" && credit <= 0n) return false;

    if (
      normalizedAgentFilter &&
      tx.agentCode.toLowerCase() !== normalizedAgentFilter
    ) {
      return false;
    }

    if (
      parsed.amountMinBigInt !== null &&
      activeNominal < parsed.amountMinBigInt
    ) {
      return false;
    }
    if (
      parsed.amountMaxBigInt !== null &&
      activeNominal > parsed.amountMaxBigInt
    ) {
      return false;
    }

    if (
      parsed.balanceMinBigInt !== null &&
      balance < parsed.balanceMinBigInt
    ) {
      return false;
    }
    if (
      parsed.balanceMaxBigInt !== null &&
      balance > parsed.balanceMaxBigInt
    ) {
      return false;
    }

    if (
      normalizedDescFilter &&
      !tx.description.toLowerCase().includes(normalizedDescFilter)
    ) {
      return false;
    }

    if (qLower) {
      const caseLabel = getTransactionCaseMeta(tx.case).label.toLowerCase();
      const matchesId = qIsNumeric && tx.id === qRaw;
      const matchesOrder =
        tx.orderNumber?.toLowerCase().includes(qLower) ?? false;
      const matchesBooking =
        tx.bookingCode?.toLowerCase().includes(qLower) ?? false;
      const matchesAgent = tx.agentCode.toLowerCase().includes(qLower);
      const matchesCase =
        tx.case.toLowerCase().includes(qLower) || caseLabel.includes(qLower);
      const matchesDesc = tx.description.toLowerCase().includes(qLower);

      if (
        !matchesId &&
        !matchesOrder &&
        !matchesBooking &&
        !matchesAgent &&
        !matchesCase &&
        !matchesDesc
      ) {
        return false;
      }
    }

    return true;
  });

  let totalCredit = 0n;
  let totalDebit = 0n;
  const agentIdsInResult = new Set<string>();
  let newestTx: ReceiptTransactionRecord | null = null;

  for (const tx of filtered) {
    totalCredit += BigInt(tx.credit);
    totalDebit += BigInt(tx.debit);
    agentIdsInResult.add(tx.agentId);

    if (!newestTx) {
      newestTx = tx;
    } else {
      const currTime = new Date(tx.transactionAt).getTime();
      const newestTime = new Date(newestTx.transactionAt).getTime();
      if (
        currTime > newestTime ||
        (currTime === newestTime && BigInt(tx.id) > BigInt(newestTx.id))
      ) {
        newestTx = tx;
      }
    }
  }

  const latestBalance =
    agentIdsInResult.size === 1 && newestTx ? newestTx.balance : null;

  const sorted = [...filtered].sort((a, b) => {
    const diff =
      new Date(a.transactionAt).getTime() - new Date(b.transactionAt).getTime();
    const idDiff =
      BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0;
    const ascResult = diff !== 0 ? diff : idDiff;
    return parsed.query.sort === "date_asc" ? ascResult : -ascResult;
  });

  const totalItems = sorted.length;
  const pageSize = parsed.query.pageSize;
  const totalPages = totalItems > 0 ? Math.ceil(totalItems / pageSize) : 0;
  const safePage =
    totalPages > 0 ? Math.min(parsed.query.page, totalPages) : 1;

  const startIdx = (safePage - 1) * pageSize;
  const pagedItems = sorted.slice(startIdx, startIdx + pageSize);

  let emptyReason: TransactionListResult["emptyReason"] = null;
  if (totalItems === 0) {
    emptyReason =
      effectiveFilterCount > 0 ? "filter_no_result" : "search_no_result";
  }

  return {
    items: pagedItems,
    summary: {
      latestBalance,
      totalCredit: totalCredit.toString(),
      totalDebit: totalDebit.toString(),
      totalCount: totalItems,
    },
    pagination: {
      page: safePage,
      pageSize,
      totalItems,
      totalPages,
      fromIndex: totalItems > 0 ? startIdx + 1 : 0,
      toIndex: totalItems > 0 ? startIdx + pagedItems.length : 0,
    },
    emptyReason,
    validationError: null,
  };
}

export function findTransactionDetailInDataset(
  session: SessionUser,
  transactionId: string,
  dataset: readonly ReceiptTransactionRecord[]
): TransactionDetailResult | null {
  const scoped = filterDatasetForSession(session, dataset);
  const transaction = scoped.find((tx) => tx.id === transactionId);
  if (!transaction) {
    return null;
  }

  const relatedTransactions = transaction.groupKey
    ? scoped
        .filter(
          (tx) =>
            tx.groupKey === transaction.groupKey &&
            tx.agentId === transaction.agentId &&
            tx.id !== transaction.id
        )
        .sort(
          (a, b) =>
            new Date(a.transactionAt).getTime() -
            new Date(b.transactionAt).getTime()
        )
    : [];

  return {
    transaction,
    relatedTransactions,
  };
}

export function buildReceiptFromDataset(params: {
  session: SessionUser;
  transactionId: string;
  mode: ReceiptMode;
  printedAt: Date;
  settings: ReceiptBusinessSettings;
  dataset: readonly ReceiptTransactionRecord[];
}): BuildReceiptResult {
  const { session, transactionId, mode, printedAt, settings, dataset } = params;
  const scoped = filterDatasetForSession(session, dataset);
  const transaction = scoped.find((tx) => tx.id === transactionId);

  if (!transaction) {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: "Transaksi tidak ditemukan.",
    };
  }

  if (mode === "individual") {
    return buildIndividualReceipt({
      transaction,
      settings,
      printedBy: session.name,
      printedAt,
    });
  }

  const groupMembers = transaction.groupKey
    ? scoped.filter(
        (tx) =>
          tx.groupKey === transaction.groupKey &&
          tx.agentId === transaction.agentId
      )
    : [];

  return buildGroupReceipt({
    anchorTransaction: transaction,
    groupMembers,
    settings,
    printedBy: session.name,
    printedAt,
  });
}

/** Batas jumlah transaksi yang dapat dicetak sekaligus dalam satu permintaan. */
export const MAX_BULK_RECEIPTS = 100;

export interface BulkReceiptResult {
  receipts: ReceiptPayload[];
  /** ID yang tidak ditemukan / di luar ruang lingkup agen pengguna. */
  missingIds: string[];
  /** ID transaksi yang benar-benar tercakup oleh struk yang dihasilkan. */
  coveredIds: string[];
}

/**
 * Membentuk banyak struk sekaligus dari satu dataset (cetak massal).
 * - mode "individual": satu struk per transaksi terpilih.
 * - mode "group": transaksi yang memiliki No. Pesanan digabung menjadi satu
 *   struk grup per pesanan (tidak diulang walau beberapa anggotanya dipilih);
 *   transaksi tanpa No. Pesanan tetap dicetak sebagai struk individual.
 * Urutan struk mengikuti urutan ID yang dipilih.
 */
export function buildBulkReceiptsFromDataset(params: {
  session: SessionUser;
  transactionIds: readonly string[];
  mode: ReceiptMode;
  printedAt: Date;
  settings: ReceiptBusinessSettings;
  dataset: readonly ReceiptTransactionRecord[];
}): BulkReceiptResult {
  const { session, mode, printedAt, settings, dataset } = params;
  const scoped = filterDatasetForSession(session, dataset);
  const byId = new Map(scoped.map((tx) => [tx.id, tx]));

  const receipts: ReceiptPayload[] = [];
  const missingIds: string[] = [];
  const coveredIds: string[] = [];
  const seenIds = new Set<string>();
  const printedGroups = new Set<string>();

  for (const rawId of params.transactionIds) {
    const id = rawId.trim();
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);

    const transaction = byId.get(id);
    if (!transaction) {
      missingIds.push(id);
      continue;
    }

    const useGroup = mode === "group" && Boolean(transaction.groupKey);
    if (useGroup) {
      const groupId = `${transaction.agentId}::${transaction.groupKey}`;
      if (printedGroups.has(groupId)) {
        coveredIds.push(id);
        continue;
      }
      printedGroups.add(groupId);
    }

    const built = buildReceiptFromDataset({
      session,
      transactionId: id,
      mode: useGroup ? "group" : "individual",
      printedAt,
      settings,
      dataset,
    });

    if (built.ok) {
      receipts.push(built.receipt);
      coveredIds.push(id);
    } else {
      missingIds.push(id);
    }
  }

  return { receipts, missingIds, coveredIds };
}

export interface CombinedInvoiceResult {
  invoices: CombinedInvoicePayload[];
  missingIds: string[];
  coveredIds: string[];
}

/**
 * Menggabungkan transaksi terpilih menjadi invoice (satu per agen) berisi
 * rincian per baris + total. Transaksi di luar akses pengguna dilaporkan
 * sebagai missingIds.
 */
export function buildCombinedInvoicesFromDataset(params: {
  session: SessionUser;
  transactionIds: readonly string[];
  printedAt: Date;
  settings: ReceiptBusinessSettings;
  dataset: readonly ReceiptTransactionRecord[];
}): CombinedInvoiceResult {
  const scoped = filterDatasetForSession(params.session, params.dataset);
  const byId = new Map(scoped.map((tx) => [tx.id, tx]));

  const picked: ReceiptTransactionRecord[] = [];
  const missingIds: string[] = [];
  const coveredIds: string[] = [];
  const seen = new Set<string>();

  for (const rawId of params.transactionIds) {
    const id = rawId.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const tx = byId.get(id);
    if (tx) {
      picked.push(tx);
      coveredIds.push(id);
    } else {
      missingIds.push(id);
    }
  }

  const invoices = buildCombinedInvoices({
    transactions: picked,
    settings: params.settings,
    printedBy: params.session.name,
    printedAt: params.printedAt,
  });

  return { invoices, missingIds, coveredIds };
}

/** Batas jumlah transaksi yang ditampilkan sebagai pilihan di halaman Buat Invoice. */
export const MAX_INVOICE_CANDIDATES = 500;

export interface InvoiceCandidateQuery {
  agentCode: string;
  /** YYYY-MM-DD (zona waktu aplikasi), opsional */
  from: string;
  /** YYYY-MM-DD (zona waktu aplikasi), opsional */
  to: string;
}

export interface InvoiceCandidateResult {
  /** Kode agen yang benar-benar dipakai (agen login selalu agennya sendiri). */
  agentCode: string;
  items: ReceiptTransactionRecord[];
  totalMatched: number;
  truncated: boolean;
  validationError: string | null;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Daftar transaksi satu agen (opsional dalam rentang tanggal) yang bisa dipilih
 * untuk dimasukkan ke invoice. Diurutkan terbaru lebih dulu.
 */
export function listInvoiceCandidatesFromDataset(params: {
  session: SessionUser;
  query: InvoiceCandidateQuery;
  dataset: readonly ReceiptTransactionRecord[];
}): InvoiceCandidateResult {
  const { session, query } = params;
  const agentCode =
    session.role === "agent" ? (session.agentCode ?? "") : query.agentCode.trim();

  const empty = (validationError: string | null): InvoiceCandidateResult => ({
    agentCode,
    items: [],
    totalMatched: 0,
    truncated: false,
    validationError,
  });

  if (!agentCode) return empty(null);
  if (query.from && !ISO_DATE_RE.test(query.from)) {
    return empty("Format tanggal awal tidak valid.");
  }
  if (query.to && !ISO_DATE_RE.test(query.to)) {
    return empty("Format tanggal akhir tidak valid.");
  }
  if (query.from && query.to && query.from > query.to) {
    return empty("Tanggal awal tidak boleh lebih besar dari tanggal akhir.");
  }

  const fromTs = query.from
    ? new Date(`${query.from}T00:00:00.000+07:00`).getTime()
    : null;
  const toTs = query.to
    ? new Date(`${query.to}T23:59:59.999+07:00`).getTime()
    : null;

  const matched = filterDatasetForSession(session, params.dataset)
    .filter((tx) => tx.agentCode === agentCode)
    .filter((tx) => {
      const ts = new Date(tx.transactionAt).getTime();
      if (fromTs !== null && ts < fromTs) return false;
      if (toTs !== null && ts > toTs) return false;
      return true;
    })
    .sort((a, b) => {
      const diff =
        new Date(b.transactionAt).getTime() -
        new Date(a.transactionAt).getTime();
      if (diff !== 0) return diff;
      return BigInt(b.id) > BigInt(a.id) ? 1 : -1;
    });

  return {
    agentCode,
    items: matched.slice(0, MAX_INVOICE_CANDIDATES),
    totalMatched: matched.length,
    truncated: matched.length > MAX_INVOICE_CANDIDATES,
    validationError: null,
  };
}

// ============================================================================
// Fungsi Live Async yang membaca dari Repository Aktif (MySQL Prisma / Local Store)
// ============================================================================

export async function listAvailableAgentsForSession(
  session: SessionUser
): Promise<AppAgentRecord[]> {
  const repo = getDataRepository();
  const agents = await repo.listAgents();
  if (session.role === "agent") {
    return agents.filter((a) => a.id === session.agentId);
  }
  return agents;
}

export async function queryTransactionsForSession(
  session: SessionUser,
  parsed: ParsedTransactionQuery
): Promise<TransactionListResult> {
  const repo = getDataRepository();
  const dataset = await repo.listAllTransactionsForScope(session);
  return filterAndPaginateTransactions(session, parsed, dataset);
}

export async function getTransactionDetailForSession(
  session: SessionUser,
  transactionId: string
): Promise<TransactionDetailResult | null> {
  const repo = getDataRepository();
  const dataset = await repo.listAllTransactionsForScope(session);
  return findTransactionDetailInDataset(session, transactionId, dataset);
}

export async function getReceiptForSession(params: {
  session: SessionUser;
  transactionId: string;
  mode: ReceiptMode;
  printedAt: Date;
  recordAudit?: boolean;
}): Promise<BuildReceiptResult> {
  const repo = getDataRepository();
  const [dataset, settings] = await Promise.all([
    repo.listAllTransactionsForScope(params.session),
    repo.getSettings(),
  ]);

  const built = buildReceiptFromDataset({
    session: params.session,
    transactionId: params.transactionId,
    mode: params.mode,
    printedAt: params.printedAt,
    settings,
    dataset,
  });

  if (built.ok && params.recordAudit) {
    await repo.writeAuditLog({
      userId: params.session.id,
      action: "print_receipt",
      entity: "transactions",
      entityId: params.transactionId,
      metadata: { mode: params.mode },
    });
  }

  return built;
}

export async function getBulkReceiptsForSession(params: {
  session: SessionUser;
  transactionIds: readonly string[];
  mode: ReceiptMode;
  printedAt: Date;
}): Promise<BulkReceiptResult> {
  const repo = getDataRepository();
  const [dataset, settings] = await Promise.all([
    repo.listAllTransactionsForScope(params.session),
    repo.getSettings(),
  ]);

  return buildBulkReceiptsFromDataset({
    session: params.session,
    transactionIds: params.transactionIds.slice(0, MAX_BULK_RECEIPTS),
    mode: params.mode,
    printedAt: params.printedAt,
    settings,
    dataset,
  });
}

export async function getCombinedInvoicesForSession(params: {
  session: SessionUser;
  transactionIds: readonly string[];
  printedAt: Date;
}): Promise<CombinedInvoiceResult> {
  const repo = getDataRepository();
  const [dataset, settings] = await Promise.all([
    repo.listAllTransactionsForScope(params.session),
    repo.getSettings(),
  ]);

  return buildCombinedInvoicesFromDataset({
    session: params.session,
    transactionIds: params.transactionIds.slice(0, MAX_BULK_RECEIPTS),
    printedAt: params.printedAt,
    settings,
    dataset,
  });
}


export async function listInvoiceCandidatesForSession(
  session: SessionUser,
  query: InvoiceCandidateQuery
): Promise<InvoiceCandidateResult> {
  const repo = getDataRepository();
  const dataset = await repo.listAllTransactionsForScope(session);
  return listInvoiceCandidatesFromDataset({ session, query, dataset });
}
