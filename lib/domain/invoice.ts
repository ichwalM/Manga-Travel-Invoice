/**
 * Invoice gabungan: beberapa transaksi terpilih dicetak menjadi satu invoice
 * berisi rincian per baris + total. Invoice dipisah per agen, karena satu
 * invoice hanya boleh ditujukan ke satu agen.
 */

import { getTransactionCaseMeta } from "./cases";
import type {
  ReceiptBusinessSettings,
  ReceiptTransactionRecord,
} from "./receipt";

export interface CombinedInvoiceLine {
  id: string;
  transactionAt: string;
  caseValue: string;
  caseLabel: string;
  description: string;
  orderNumber: string | null;
  bookingCode: string | null;
  debit: string; // serialized bigint
  credit: string; // serialized bigint
}

export interface CombinedInvoicePayload {
  title: string;
  header: {
    businessName: string;
    logoPath: string;
    contactPersonName: string;
    contactPersonPhone: string;
    address: string | null;
    showThermalLogo: boolean;
  };
  agentId: string;
  agentCode: string;
  agentName: string;
  periodStart: string;
  periodEnd: string;
  items: CombinedInvoiceLine[];
  totalDebit: string;
  totalCredit: string;
  /** Total debet dikurangi total kredit (boleh negatif). */
  netTotal: string;
  footer: {
    printedAt: string;
    printedBy: string;
    note: string | null;
  };
}

function compareChronologically(
  a: ReceiptTransactionRecord,
  b: ReceiptTransactionRecord
): number {
  const diff =
    new Date(a.transactionAt).getTime() - new Date(b.transactionAt).getTime();
  if (diff !== 0) return diff;
  return BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0;
}

/**
 * Membentuk invoice gabungan dari transaksi yang sudah tersaring (sesuai akses
 * pengguna). Menghasilkan satu invoice per agen, urut sesuai kemunculan agen
 * pada daftar pilihan; baris di dalam invoice diurutkan kronologis.
 */
export function buildCombinedInvoices(params: {
  transactions: readonly ReceiptTransactionRecord[];
  settings: ReceiptBusinessSettings;
  printedBy: string;
  printedAt: Date;
}): CombinedInvoicePayload[] {
  const { transactions, settings, printedBy, printedAt } = params;

  const byAgent = new Map<string, ReceiptTransactionRecord[]>();
  for (const tx of transactions) {
    const list = byAgent.get(tx.agentId) ?? [];
    list.push(tx);
    byAgent.set(tx.agentId, list);
  }

  const invoices: CombinedInvoicePayload[] = [];
  for (const [, agentTxs] of byAgent) {
    const sorted = [...agentTxs].sort(compareChronologically);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    let totalDebit = 0n;
    let totalCredit = 0n;
    const items: CombinedInvoiceLine[] = sorted.map((tx) => {
      totalDebit += BigInt(tx.debit);
      totalCredit += BigInt(tx.credit);
      return {
        id: tx.id,
        transactionAt: tx.transactionAt,
        caseValue: tx.case,
        caseLabel: getTransactionCaseMeta(tx.case).label,
        description: tx.description,
        orderNumber: tx.orderNumber,
        bookingCode: tx.bookingCode,
        debit: tx.debit,
        credit: tx.credit,
      };
    });

    invoices.push({
      title: "INVOICE",
      header: {
        businessName: settings.businessName,
        logoPath: settings.logoPath,
        contactPersonName: settings.contactPersonName,
        contactPersonPhone: settings.contactPersonPhone,
        address: settings.address,
        showThermalLogo: settings.showThermalLogo,
      },
      agentId: first.agentId,
      agentCode: first.agentCode,
      agentName: first.agentName,
      periodStart: first.transactionAt,
      periodEnd: last.transactionAt,
      items,
      totalDebit: totalDebit.toString(),
      totalCredit: totalCredit.toString(),
      netTotal: (totalDebit - totalCredit).toString(),
      footer: {
        printedAt: printedAt.toISOString(),
        printedBy,
        note: settings.receiptFooterNote,
      },
    });
  }

  return invoices;
}
