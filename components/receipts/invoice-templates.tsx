import { BrandLogo } from "@/components/brand/brand-logo";
import {
  formatDateTimeReceipt,
  formatDateTimeTable,
  formatRupiah,
} from "@/lib/domain/format";
import type { CombinedInvoicePayload } from "@/lib/domain/invoice";
import { cn } from "@/lib/utils";

function periodLabel(invoice: CombinedInvoicePayload): string {
  const start = formatDateTimeReceipt(invoice.periodStart).split(" ").slice(0, 3).join(" ");
  const end = formatDateTimeReceipt(invoice.periodEnd).split(" ").slice(0, 3).join(" ");
  return start === end ? start : `${start} – ${end}`;
}

function netLabel(netTotal: string): string {
  return BigInt(netTotal) >= 0n ? "TOTAL" : "TOTAL (KREDIT)";
}

function absAmount(value: string): bigint {
  const n = BigInt(value);
  return n < 0n ? -n : n;
}

/**
 * Invoice gabungan untuk kertas thermal 58mm / 80mm.
 */
export function ThermalInvoiceTemplate({
  invoice,
  paperWidth,
  showLogo,
}: {
  invoice: CombinedInvoicePayload;
  paperWidth: "58" | "80";
  showLogo: boolean;
}) {
  return (
    <article
      className={cn(
        "print-area bg-neutral-0 text-neutral-900 font-mono shadow-card print:text-black",
        paperWidth === "58"
          ? "w-[58mm] px-[5mm] py-[4mm] text-[10px] leading-[14px]"
          : "w-[80mm] px-[4mm] py-[5mm] text-[11px] leading-[16px]"
      )}
    >
      <header className="space-y-1 text-center">
        {showLogo && (
          <div
            className={cn(
              "mx-auto mb-1",
              paperWidth === "58" ? "w-[60%]" : "w-[50%]"
            )}
          >
            <BrandLogo
              variant="thermal"
              logoSrc={invoice.header.logoPath}
              businessName={invoice.header.businessName}
            />
          </div>
        )}
        <p className="text-xs font-bold">{invoice.header.businessName}</p>
        <p className="break-words">
          CP: {invoice.header.contactPersonName} -{" "}
          {invoice.header.contactPersonPhone}
        </p>
        {invoice.header.address && (
          <p className="break-words">{invoice.header.address}</p>
        )}
      </header>

      <div className="my-2 border-t border-dashed border-neutral-900" />
      <h2 className="text-center font-bold tracking-wide">{invoice.title}</h2>
      <div className="my-2 border-t border-dashed border-neutral-900" />

      <dl className="space-y-0.5">
        <div className="flex justify-between gap-2">
          <dt className="shrink-0">Agen</dt>
          <dd className="text-right">{invoice.agentCode}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="shrink-0">Periode</dt>
          <dd className="text-right">{periodLabel(invoice)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="shrink-0">Jumlah</dt>
          <dd className="text-right">{invoice.items.length} transaksi</dd>
        </div>
      </dl>

      <div className="my-2 border-t border-dashed border-neutral-900" />

      <ol className="space-y-2">
        {invoice.items.map((item, idx) => {
          const debit = BigInt(item.debit);
          return (
            <li key={item.id} className="space-y-0.5">
              <div className="flex justify-between gap-2">
                <span className="font-bold">
                  {idx + 1}. {item.caseLabel}
                </span>
                <span className="shrink-0 tabular-nums">
                  {debit > 0n
                    ? formatRupiah(item.debit)
                    : `(${formatRupiah(item.credit)})`}
                </span>
              </div>
              <p className="tabular-nums">
                #{item.id} · {formatDateTimeReceipt(item.transactionAt)}
              </p>
              <p className="break-words">{item.description}</p>
            </li>
          );
        })}
      </ol>

      <div className="my-2 border-t border-dashed border-neutral-900" />

      <div className="space-y-0.5">
        <div className="flex justify-between gap-2">
          <span>Total Debet</span>
          <span className="tabular-nums">{formatRupiah(invoice.totalDebit)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>Total Kredit</span>
          <span className="tabular-nums">
            ({formatRupiah(invoice.totalCredit)})
          </span>
        </div>
        <div className="my-1.5 border-t border-dashed border-neutral-900" />
        <div className="flex justify-between gap-2 font-bold">
          <span>{netLabel(invoice.netTotal)}</span>
          <span className="tabular-nums">
            {formatRupiah(absAmount(invoice.netTotal))}
          </span>
        </div>
      </div>

      <div className="my-2 border-t border-dashed border-neutral-900" />

      <footer className="space-y-0.5 text-center">
        <p className="tabular-nums">
          Dicetak: {formatDateTimeReceipt(invoice.footer.printedAt)}
        </p>
        <p>Oleh: {invoice.footer.printedBy}</p>
        {invoice.footer.note && (
          <p className="break-words pt-1 font-medium">{invoice.footer.note}</p>
        )}
      </footer>
    </article>
  );
}

/**
 * Invoice gabungan ukuran A4 dengan tabel rincian per baris.
 */
export function A4InvoiceTemplate({
  invoice,
}: {
  invoice: CombinedInvoicePayload;
}) {
  return (
    <article className="print-area w-full max-w-[210mm] rounded-sm bg-neutral-0 p-8 text-xs leading-5 text-neutral-900 shadow-card sm:p-12 print:max-w-none print:p-0">
      <header className="flex flex-col justify-between gap-4 border-b-2 border-primary-700 pb-6 sm:flex-row sm:items-start">
        <BrandLogo
          variant="horizontal"
          logoSrc={invoice.header.logoPath}
          businessName={invoice.header.businessName}
        />
        <div className="space-y-0.5 text-left sm:text-right">
          <p className="text-base font-bold text-primary-800">
            {invoice.header.businessName}
          </p>
          <p className="text-neutral-700">
            Contact Person: {invoice.header.contactPersonName} (
            {invoice.header.contactPersonPhone})
          </p>
          {invoice.header.address && (
            <p className="text-neutral-500">{invoice.header.address}</p>
          )}
        </div>
      </header>

      <div className="my-6 text-center">
        <h2 className="text-lg font-bold uppercase tracking-wide text-primary-800">
          {invoice.title}
        </h2>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 rounded-md border border-neutral-200 bg-neutral-25 p-4 sm:grid-cols-2">
        <div className="space-y-1">
          <div className="flex justify-between sm:justify-start sm:gap-3">
            <span className="w-32 text-neutral-500">Kode Agen:</span>
            <span className="font-semibold">{invoice.agentCode}</span>
          </div>
          <div className="flex justify-between sm:justify-start sm:gap-3">
            <span className="w-32 text-neutral-500">Nama Agen:</span>
            <span className="font-semibold">{invoice.agentName}</span>
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between sm:justify-start sm:gap-3">
            <span className="w-32 text-neutral-500">Periode:</span>
            <span className="font-semibold tabular-nums">
              {periodLabel(invoice)}
            </span>
          </div>
          <div className="flex justify-between sm:justify-start sm:gap-3">
            <span className="w-32 text-neutral-500">Jumlah Transaksi:</span>
            <span className="font-semibold">{invoice.items.length}</span>
          </div>
        </div>
      </div>

      <table className="w-full border-collapse border border-neutral-200">
        <thead>
          <tr className="bg-neutral-50 text-left">
            <th className="border-b border-neutral-200 px-3 py-2.5 font-semibold text-neutral-700">
              No
            </th>
            <th className="border-b border-neutral-200 px-3 py-2.5 font-semibold text-neutral-700">
              Tanggal
            </th>
            <th className="border-b border-neutral-200 px-3 py-2.5 font-semibold text-neutral-700">
              Jenis
            </th>
            <th className="border-b border-neutral-200 px-3 py-2.5 font-semibold text-neutral-700">
              Keterangan
            </th>
            <th className="border-b border-neutral-200 px-3 py-2.5 text-right font-semibold text-neutral-700">
              Debet
            </th>
            <th className="border-b border-neutral-200 px-3 py-2.5 text-right font-semibold text-neutral-700">
              Kredit
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200">
          {invoice.items.map((item, idx) => (
            <tr key={item.id} className="break-inside-avoid">
              <td className="px-3 py-2.5 align-top text-neutral-500">
                {idx + 1}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 align-top tabular-nums">
                {formatDateTimeTable(item.transactionAt)}
                <span className="block font-mono text-[10px] text-neutral-500">
                  #{item.id}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 align-top font-medium">
                {item.caseLabel}
              </td>
              <td className="break-words px-3 py-2.5 align-top">
                {item.description}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right align-top font-semibold tabular-nums">
                {formatRupiah(item.debit, { emptyAsDash: true })}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right align-top font-semibold tabular-nums">
                {formatRupiah(item.credit, { emptyAsDash: true })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex justify-end break-inside-avoid">
        <div className="w-full max-w-xs space-y-2 rounded-md border border-neutral-200 bg-neutral-25 p-4">
          <div className="flex justify-between text-neutral-700">
            <span>Total Debet</span>
            <span className="tabular-nums">
              {formatRupiah(invoice.totalDebit)}
            </span>
          </div>
          <div className="flex justify-between text-neutral-700">
            <span>Total Kredit</span>
            <span className="tabular-nums">
              - {formatRupiah(invoice.totalCredit)}
            </span>
          </div>
          <div className="flex justify-between border-t border-neutral-200 pt-2 text-sm font-bold text-primary-800">
            <span>{netLabel(invoice.netTotal)}</span>
            <span className="tabular-nums">
              {formatRupiah(absAmount(invoice.netTotal))}
            </span>
          </div>
        </div>
      </div>

      <footer className="mt-10 flex flex-col justify-between gap-2 border-t border-neutral-200 pt-4 text-[11px] text-neutral-500 sm:flex-row">
        <div>
          {invoice.footer.note && (
            <p className="font-medium text-neutral-700">{invoice.footer.note}</p>
          )}
        </div>
        <div className="sm:text-right">
          <p className="tabular-nums">
            Waktu cetak: {formatDateTimeTable(invoice.footer.printedAt)}
          </p>
          <p>Dicetak oleh: {invoice.footer.printedBy}</p>
        </div>
      </footer>
    </article>
  );
}
