import { Suspense } from "react";
import { connection } from "next/server";
import { InvoiceBuilder } from "@/components/invoices/invoice-builder";
import { AppShell } from "@/components/layout/app-shell";
import { AppShellSkeleton } from "@/components/layout/app-shell-skeleton";
import { TransactionsPageSkeleton } from "@/components/ui/skeleton";
import { requireSessionUser } from "@/lib/auth/guards";
import {
  listAvailableAgentsForSession,
  listInvoiceCandidatesForSession,
  MAX_INVOICE_CANDIDATES,
} from "@/lib/services/transaction-service";

/**
 * Buat Invoice: /invoices/new?agent=JKT-37287&from=2026-07-01&to=2026-07-31
 */
export default function NewInvoicePage(props: PageProps<"/invoices/new">) {
  return (
    <Suspense
      fallback={
        <AppShellSkeleton pageTitle="Buat Invoice">
          <TransactionsPageSkeleton />
        </AppShellSkeleton>
      }
    >
      <NewInvoiceContent searchParamsPromise={props.searchParams} />
    </Suspense>
  );
}

function firstParam(val: string | string[] | undefined): string {
  if (Array.isArray(val)) return val[0] ?? "";
  return val ?? "";
}

async function NewInvoiceContent({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const [session, rawSearchParams] = await Promise.all([
    requireSessionUser("/invoices/new"),
    searchParamsPromise,
  ]);

  const query = {
    agentCode: firstParam(rawSearchParams.agent).trim(),
    from: firstParam(rawSearchParams.from).trim(),
    to: firstParam(rawSearchParams.to).trim(),
  };

  const [agents, candidates] = await Promise.all([
    listAvailableAgentsForSession(session),
    listInvoiceCandidatesForSession(session, query),
  ]);

  return (
    <AppShell session={session} pageTitle="Buat Invoice">
      <InvoiceBuilder
        isAdmin={session.role === "admin"}
        agents={agents.map((a) => ({ code: a.code, name: a.name }))}
        agentCode={candidates.agentCode}
        from={query.from}
        to={query.to}
        items={candidates.items}
        totalMatched={candidates.totalMatched}
        truncated={candidates.truncated}
        maxItems={MAX_INVOICE_CANDIDATES}
        validationError={candidates.validationError}
      />
    </AppShell>
  );
}
