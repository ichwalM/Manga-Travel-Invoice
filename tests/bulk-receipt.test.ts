import { describe, expect, it, vi } from "vitest";

// Fungsi yang diuji murni (tanpa database); repository di-mock agar test tidak butuh Prisma Client.
vi.mock("@/lib/db/repository", () => ({ getDataRepository: vi.fn() }));

import type { SessionUser } from "@/lib/db/types";
import type {
  ReceiptBusinessSettings,
  ReceiptTransactionRecord,
} from "@/lib/domain/receipt";
import { buildBulkReceiptsFromDataset } from "@/lib/services/transaction-service";

const settings: ReceiptBusinessSettings = {
  businessName: "Manga' Travel",
  logoPath: "/logo.png",
  contactPersonName: "Admin",
  contactPersonPhone: "08123456789",
  address: null,
  receiptFooterNote: null,
  showBalanceOnReceipt: true,
  showThermalLogo: true,
};

const admin: SessionUser = {
  id: "u-admin",
  username: "admin",
  name: "Admin Manga' Travel",
  role: "admin",
  agentId: null,
  agentCode: null,
};

const agentEman: SessionUser = {
  id: "u-eman",
  username: "eman",
  name: "Eman",
  role: "agent",
  agentId: "agent-jkt",
  agentCode: "JKT-37287",
};

function tx(
  partial: Partial<ReceiptTransactionRecord> & { id: string }
): ReceiptTransactionRecord {
  return {
    agentId: "agent-jkt",
    agentCode: "JKT-37287",
    agentName: "Eman Travel",
    transactionAt: "2026-07-29T02:15:00.000Z",
    case: "withdrawal",
    description: `Transaksi ${partial.id}`,
    debit: "0",
    credit: "0",
    balance: "0",
    orderNumber: null,
    bookingCode: null,
    groupKey: null,
    source: "manual",
    ...partial,
  };
}

const dataset: ReceiptTransactionRecord[] = [
  tx({
    id: "28",
    case: "withdrawal",
    description: "Issued Flight No. Pesanan 920025501",
    debit: "1850000",
    orderNumber: "920025501",
    groupKey: "920025501",
  }),
  tx({
    id: "29",
    case: "bonus",
    description: "Bonus Issued Flight No. Pesanan 920025501 (Kode Booking MNGTRV)",
    credit: "25000",
    orderNumber: "920025501",
    bookingCode: "MNGTRV",
    groupKey: "920025501",
  }),
  tx({ id: "27", case: "deposit", description: "92000189", credit: "2000000" }),
  tx({
    id: "50",
    agentId: "agent-mks",
    agentCode: "MKS-20819",
    case: "deposit",
    credit: "500000",
  }),
];

const printedAt = new Date("2026-11-18T06:00:00.000Z");

describe("Cetak massal struk (buildBulkReceiptsFromDataset)", () => {
  it("mode individual: satu struk per transaksi sesuai urutan pilihan, ID ganda diabaikan", () => {
    const res = buildBulkReceiptsFromDataset({
      session: admin,
      transactionIds: ["29", "27", "28", "29"],
      mode: "individual",
      printedAt,
      settings,
      dataset,
    });

    expect(res.missingIds).toEqual([]);
    expect(res.coveredIds).toEqual(["29", "27", "28"]);
    expect(res.receipts.map((r) => r.mode)).toEqual([
      "individual",
      "individual",
      "individual",
    ]);
    expect(res.receipts.map((r) => r.meta.transactionId)).toEqual([
      "29",
      "27",
      "28",
    ]);
  });

  it("mode grup: anggota No. Pesanan yang sama digabung jadi satu struk, transaksi tanpa grup tetap individual", () => {
    const res = buildBulkReceiptsFromDataset({
      session: admin,
      transactionIds: ["28", "29", "27"],
      mode: "group",
      printedAt,
      settings,
      dataset,
    });

    expect(res.receipts).toHaveLength(2);
    expect(res.receipts[0].mode).toBe("group");
    expect(res.receipts[0].group?.items.map((i) => i.id).sort()).toEqual([
      "28",
      "29",
    ]);
    expect(res.receipts[1].mode).toBe("individual");
    expect(res.receipts[1].meta.transactionId).toBe("27");
    expect(res.coveredIds).toEqual(["28", "29", "27"]);
  });

  it("agen hanya bisa mencetak transaksi miliknya; ID lain dilaporkan sebagai tidak ditemukan", () => {
    const res = buildBulkReceiptsFromDataset({
      session: agentEman,
      transactionIds: ["27", "50", "999"],
      mode: "individual",
      printedAt,
      settings,
      dataset,
    });

    expect(res.receipts.map((r) => r.meta.transactionId)).toEqual(["27"]);
    expect(res.missingIds).toEqual(["50", "999"]);
  });
});
