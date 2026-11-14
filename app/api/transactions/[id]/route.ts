import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, zodErrorToApiResponse } from "@/lib/api/api-error";
import { requireApiAdmin, requireApiSession } from "@/lib/auth/api-guards";
import { getDataRepository } from "@/lib/db/repository";
import { getKnownTransactionCase } from "@/lib/domain/cases";
import { extractTransactionRefs } from "@/lib/domain/extraction";
import { parseJakartaDateTime } from "@/lib/domain/format";
import { parseRupiahToBigInt } from "@/lib/domain/money";
import { getTransactionDetailForSession } from "@/lib/services/transaction-service";

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/transactions/[id]">
) {
  try {
    const auth = await requireApiSession();
    if (!auth.ok) return auth.response;

    const { id } = await context.params;
    const detail = await getTransactionDetailForSession(auth.session, id);

    if (!detail) {
      return NextResponse.json(
        {
          code: "NOT_FOUND",
          message: "Transaksi tidak ditemukan.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json(detail);
  } catch (err) {
    return handleApiError(err, { context: "GET /api/transactions/[id]" });
  }
}

const updateTransactionSchema = z.object({
  agentId: z.string().trim().optional(),
  transactionAt: z.string().trim().optional(),
  case: z.string().trim().optional(),
  description: z
    .string()
    .trim()
    .min(1, "Keterangan transaksi tidak boleh kosong.")
    .optional(),
  amount: z.union([z.string(), z.number()]).optional(),
  debit: z.union([z.string(), z.number()]).optional(),
  credit: z.union([z.string(), z.number()]).optional(),
  orderNumber: z.string().trim().nullable().optional(),
  bookingCode: z.string().trim().nullable().optional(),
});

function parseTransactionDateTime(raw: string): Date | null {
  const normalized = raw.trim().replace("T", " ");
  const jakartaParsed = parseJakartaDateTime(normalized);
  if (jakartaParsed) return jakartaParsed;

  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/transactions/[id]">
) {
  try {
    const auth = await requireApiAdmin(request);
    if (!auth.ok) return auth.response;

    const { id } = await context.params;
    const repo = getDataRepository();

    const existing = await getTransactionDetailForSession(auth.session, id);
    if (!existing) {
      return NextResponse.json(
        { code: "NOT_FOUND", message: "Transaksi tidak ditemukan." },
        { status: 404 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { code: "INVALID_JSON", message: "Format permintaan tidak valid." },
        { status: 400 }
      );
    }

    const parsed = updateTransactionSchema.safeParse(body);
    if (!parsed.success) {
      return zodErrorToApiResponse(
        parsed.error,
        "Input pembaruan transaksi tidak valid."
      );
    }

    const data = parsed.data;
    let txDate: Date | undefined;
    if (data.transactionAt) {
      const parsedDate = parseTransactionDateTime(data.transactionAt);
      if (!parsedDate) {
        return NextResponse.json(
          {
            code: "VALIDATION_ERROR",
            message: "Format tanggal & jam tidak valid.",
            fields: { transactionAt: "Format tanggal & jam tidak valid." },
          },
          { status: 400 }
        );
      }
      txDate = parsedDate;
    }

    const currentCase = data.case ?? existing.transaction.case;
    const caseMeta = getKnownTransactionCase(currentCase);

    let debitBig: bigint | undefined;
    let creditBig: bigint | undefined;

    if (data.amount !== undefined) {
      const parsedAmt = parseRupiahToBigInt(data.amount.toString(), {
        allowNegative: false,
        emptyAsZero: true,
      });
      if (parsedAmt === null || parsedAmt < 0n) {
        return NextResponse.json(
          {
            code: "VALIDATION_ERROR",
            message: "Nominal tidak boleh negatif.",
            fields: { amount: "Nominal tidak boleh negatif." },
          },
          { status: 400 }
        );
      }
      if (caseMeta?.side === "debit") {
        debitBig = parsedAmt;
        creditBig = 0n;
      } else {
        creditBig = parsedAmt;
        debitBig = 0n;
      }
    } else {
      if (data.debit !== undefined) {
        debitBig =
          parseRupiahToBigInt(data.debit.toString(), { emptyAsZero: true }) ??
          0n;
      }
      if (data.credit !== undefined) {
        creditBig =
          parseRupiahToBigInt(data.credit.toString(), { emptyAsZero: true }) ??
          0n;
      }
    }

    let orderNum = data.orderNumber;
    let bookCode = data.bookingCode;
    const desc = data.description ?? existing.transaction.description;

    if (desc && (orderNum === undefined || bookCode === undefined)) {
      const refs = extractTransactionRefs(desc);
      if (orderNum === undefined) orderNum = refs.orderNumber;
      if (bookCode === undefined) bookCode = refs.bookingCode;
    }

    const updated = await repo.updateTransaction(
      id,
      {
        agentId: data.agentId,
        transactionAt: txDate,
        case: data.case,
        description: data.description,
        debit: debitBig,
        credit: creditBig,
        orderNumber: orderNum,
        bookingCode: bookCode,
      },
      auth.session.id
    );

    revalidatePath("/transactions");
    revalidatePath(`/transactions/${id}`);

    return NextResponse.json({
      success: true,
      transaction: updated,
    });
  } catch (err) {
    return handleApiError(err, { context: "PATCH /api/transactions/[id]" });
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext<"/api/transactions/[id]">
) {
  try {
    const auth = await requireApiAdmin(request);
    if (!auth.ok) return auth.response;

    const { id } = await context.params;
    const repo = getDataRepository();

    const existing = await getTransactionDetailForSession(auth.session, id);
    if (!existing) {
      return NextResponse.json(
        { code: "NOT_FOUND", message: "Transaksi tidak ditemukan." },
        { status: 404 }
      );
    }

    await repo.deleteTransaction(id, auth.session.id);
    revalidatePath("/transactions");
    revalidatePath(`/transactions/${id}`);

    return NextResponse.json({
      success: true,
      message: "Transaksi berhasil dihapus.",
    });
  } catch (err) {
    return handleApiError(err, { context: "DELETE /api/transactions/[id]" });
  }
}
