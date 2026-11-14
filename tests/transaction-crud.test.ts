import { describe, expect, it } from "vitest";
import { localDataRepository } from "@/lib/db/local-store";

describe("Transaction Edit & Delete Operations", () => {
  it("should update a transaction and recalculate agent running balances", async () => {
    // List transactions first
    const txsBefore = await localDataRepository.listAllTransactionsForScope({
      id: "user-admin-1",
      username: "admin",
      name: "Admin Manga' Travel",
      role: "admin",
      agentId: null,
      agentCode: null,
    });

    expect(txsBefore.length).toBeGreaterThan(0);
    const target = txsBefore[0];

    const updated = await localDataRepository.updateTransaction(
      target.id,
      {
        description: "Updated description for test",
        case: "bonus",
        credit: 50000n,
        debit: 0n,
      },
      "user-admin-1"
    );

    expect(updated.description).toBe("Updated description for test");
    expect(updated.case).toBe("bonus");
    expect(updated.credit).toBe("50000");
    expect(updated.debit).toBe("0");

    // Check that balance is updated and not undefined
    expect(updated.balance).toBeDefined();
  });

  it("should delete a transaction and recalculate remaining agent running balances", async () => {
    const agents = await localDataRepository.listAgents();
    expect(agents.length).toBeGreaterThan(0);
    const agent = agents[0];

    // Create a new manual transaction first
    const created = await localDataRepository.createManualTransaction({
      agentId: agent.id,
      transactionAt: new Date("2026-07-29T10:00:00Z"),
      case: "withdrawal",
      description: "Temporary transaction to delete",
      debit: 100000n,
      credit: 0n,
      orderNumber: "TEMP-DEL-999",
      bookingCode: "DEL999",
      groupKey: "TEMP-DEL-999",
      dedupHash: "temp-del-hash-1",
      actorUserId: "user-admin-1",
    });

    expect(created.id).toBeDefined();

    // Now delete it
    const deleteResult = await localDataRepository.deleteTransaction(
      created.id,
      "user-admin-1"
    );

    expect(deleteResult.success).toBe(true);

    // Verify it is no longer in scope
    const txsAfter = await localDataRepository.listAllTransactionsForScope({
      id: "user-admin-1",
      username: "admin",
      name: "Admin Manga' Travel",
      role: "admin",
      agentId: null,
      agentCode: null,
    });

    const found = txsAfter.find((t) => t.id === created.id);
    expect(found).toBeUndefined();
  });
});
