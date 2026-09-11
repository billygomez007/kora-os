"use client";

import { useCallback, useEffect, useState } from "react";
import WorkspaceShell from "@/components/workspace/WorkspaceShell";
import { resolveActiveWorkspace, type ActiveWorkspace } from "@/lib/api/dashboard";
import { koraEnvelope } from "@/lib/api/kora-api";

interface TransactionRow {
  id: string;
  reference: string;
  kind: string;
  status: string;
  currency: string;
  totalMinor: number;
  postedAt: string;
}

function formatMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amountMinor / 100);
}

export default function TransactionsPage() {
  const [workspace, setWorkspace] = useState<ActiveWorkspace | null>(null);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const active = await resolveActiveWorkspace();
      const result = await koraEnvelope<TransactionRow[]>(
        `/organizations/${active.organizationId}/transactions?branchId=${encodeURIComponent(active.branchId)}&limit=100`,
      );
      setWorkspace(active);
      setTransactions(result.data ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load transactions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <WorkspaceShell title="Transactions">
      <section className="workspace-panel">
        <div className="workspace-panel-head">
          <div>
            <span>POSTED ACTIVITY</span>
            <h1>Transactions</h1>
          </div>
          <button type="button" className="workspace-secondary-button" onClick={() => void load()}>
            Refresh
          </button>
        </div>
        {loading && <p>Loading transactions…</p>}
        {!loading && error && <p className="workspace-error">{error}</p>}
        {!loading && !error && transactions.length === 0 && <p>No posted transactions yet.</p>}
        {!loading && !error && transactions.length > 0 && (
          <div className="dashboard-appointment-list">
            {transactions.map((transaction) => (
              <div key={transaction.id} className="dashboard-appointment-row">
                <div>
                  <strong>{transaction.reference}</strong>
                  <span>{transaction.kind} · {new Date(transaction.postedAt).toLocaleString()}</span>
                </div>
                <strong>{formatMoney(transaction.totalMinor, transaction.currency || workspace?.currency || "GHS")}</strong>
              </div>
            ))}
          </div>
        )}
      </section>
    </WorkspaceShell>
  );
}
