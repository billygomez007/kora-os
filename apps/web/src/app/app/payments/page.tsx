"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import WorkspaceShell from "@/components/workspace/WorkspaceShell";
import {
  resolveActiveWorkspace,
  type ActiveWorkspace,
} from "@/lib/api/dashboard";
import { koraData, koraEnvelope } from "@/lib/api/kora-api";

type Checkout = {
  id: string;
  organizationId: string;
  branchId: string;
  serviceSessionId: string;
  customerRecordId: string;
  assignedStaffProfileId: string;
  reference: string;
  status: string;
  currency: string;
  subtotalMinor: number;
  adjustmentTotalMinor: number;
  totalMinor: number;
  createdAt: string;
  settledAt: string | null;
};

type PaymentRecord = {
  id: string;
  checkoutId: string;
  method: string;
  status: string;
  appliedAmountMinor: number;
  tenderedAmountMinor: number | null;
  currency: string;
  externalReference: string | null;
  note: string | null;
  recordedByMembershipId: string;
  confirmationRequiredByStaffProfileId: string;
  confirmedByMembershipId: string | null;
  recordedAt: string;
  confirmedAt: string | null;
};

type Customer = {
  id: string;
  name: string;
  phoneE164: string | null;
  email: string | null;
};

type PaymentMethod =
  | "CASH"
  | "MOBILE_MONEY"
  | "CARD"
  | "BANK_TRANSFER"
  | "OTHER";

const methods: Array<{ value: PaymentMethod; label: string }> = [
  { value: "CASH", label: "Cash" },
  { value: "MOBILE_MONEY", label: "Mobile Money" },
  { value: "CARD", label: "Card / POS" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "OTHER", label: "Other" },
];

function money(amount: number, currency = "GHS") {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount / 100);
}

function checkoutStatus(status: string) {
  if (status === "OPEN") return "Awaiting payment";
  if (status === "AWAITING_VERIFICATION") return "Awaiting confirmation";
  if (status === "SETTLED") return "Paid";
  if (status === "DISPUTED") return "Disputed";
  if (status === "VOIDED") return "Voided";
  return status.replaceAll("_", " ");
}

export default function PaymentsPage() {
  const [workspace, setWorkspace] = useState<ActiveWorkspace | null>(null);
  const [checkouts, setCheckouts] = useState<Checkout[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [payments, setPayments] = useState<Record<string, PaymentRecord[]>>({});
  const [selected, setSelected] = useState<Checkout | null>(null);

  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setError("");

    try {
      const active = await resolveActiveWorkspace();

      const params = new URLSearchParams({
        branchId: active.branchId,
        limit: "100",
      });

      const [checkoutResult, customerResult] = await Promise.all([
        koraEnvelope<Checkout[]>(
          `/organizations/${active.organizationId}/checkouts?${params.toString()}`,
        ),
        koraData<Customer[]>(
          `/organizations/${active.organizationId}/customers`,
        ),
      ]);

      const checkoutRows = checkoutResult.data ?? [];

      setWorkspace(active);
      setCheckouts(checkoutRows);
      setCustomers(customerResult);

      const results = await Promise.all(
        checkoutRows.map(async (checkout) => {
          try {
            const rows = await koraData<PaymentRecord[]>(
              `/organizations/${active.organizationId}/checkouts/${checkout.id}/payments`,
            );

            return [checkout.id, rows] as const;
          } catch {
            return [checkout.id, []] as const;
          }
        }),
      );

      setPayments(Object.fromEntries(results));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load payment records.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [load]);

  const customerMap = useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer])),
    [customers],
  );

  function recordedTotal(checkout: Checkout) {
    return (payments[checkout.id] ?? [])
      .filter((payment) => payment.status !== "VOIDED")
      .reduce((sum, payment) => sum + payment.appliedAmountMinor, 0);
  }

  function confirmedTotal(checkout: Checkout) {
    return (payments[checkout.id] ?? [])
      .filter((payment) => payment.status === "CONFIRMED")
      .reduce((sum, payment) => sum + payment.appliedAmountMinor, 0);
  }

  function outstanding(checkout: Checkout) {
    return Math.max(0, checkout.totalMinor - confirmedTotal(checkout));
  }

  const stats = (() => {
    const awaitingPayment = checkouts.filter(
      (checkout) => checkout.status === "OPEN",
    ).length;

    const awaitingConfirmation = checkouts.filter(
      (checkout) => checkout.status === "AWAITING_VERIFICATION",
    ).length;

    const paid = checkouts.filter(
      (checkout) => checkout.status === "SETTLED",
    ).length;

    const outstandingMinor = checkouts
      .filter((checkout) => checkout.status !== "SETTLED")
      .reduce((sum, checkout) => sum + outstanding(checkout), 0);

    return {
      awaitingPayment,
      awaitingConfirmation,
      paid,
      outstandingMinor,
    };
  })();

  function beginPayment(checkout: Checkout) {
    const remainingToRecord = Math.max(
      0,
      checkout.totalMinor - recordedTotal(checkout),
    );

    setSelected(checkout);
    setMethod("CASH");
    setAmount((remainingToRecord / 100).toFixed(2));
    setReference("");
    setNote("");
    setError("");
    setSuccess("");
  }

  async function submitPayment(event: FormEvent) {
    event.preventDefault();

    if (!workspace || !selected) return;

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("Enter a valid payment amount.");
      return;
    }

    const appliedAmountMinor = Math.round(numericAmount * 100);

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await koraData<PaymentRecord>(
        `/organizations/${workspace.organizationId}/checkouts/${selected.id}/payments`,
        {
          method: "POST",
          headers: {
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            method,
            appliedAmountMinor,
            currency: selected.currency,
            ...(reference.trim()
              ? { externalReference: reference.trim() }
              : {}),
            ...(note.trim() ? { note: note.trim() } : {}),
          }),
        },
      );

      setSelected(null);

      setSuccess(
        "Payment received was recorded successfully. It will count as paid after confirmation.",
      );

      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to record payment.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <WorkspaceShell
      title="Payments"
      actions={
        <button
          type="button"
          className="workspace-secondary-button"
          onClick={() => void load()}
        >
          Refresh
        </button>
      }
    >
      <div className="pay-page">
      <section className="pay-header">
        <div>
          <span className="eyebrow">KORA CASHIER</span>
          <h1>Payments</h1>
          <p>
            Record money your business has already received and keep every
            completed service financially accountable.
          </p>

          <div className="branch">
            {workspace?.branchName ?? "Loading branch"}
            <span>•</span>
            Manual payment recording
          </div>
        </div>
      </section>

      <section className="gateway-note">
        <div className="shield">✓</div>
        <div>
          <strong>No online payment gateway is connected</strong>
          <p>
            Customers pay your business directly by cash, Mobile Money, POS,
            bank transfer or another method. Kora records the payment; Kora
            does not hold or move the customer&apos;s money.
          </p>
        </div>
      </section>

      {error ? <div className="alert error">{error}</div> : null}
      {success ? <div className="alert success">{success}</div> : null}

      <section className="stats">
        <article>
          <span>Awaiting payment</span>
          <strong>{stats.awaitingPayment}</strong>
          <small>Completed services</small>
        </article>

        <article>
          <span>Awaiting confirmation</span>
          <strong>{stats.awaitingConfirmation}</strong>
          <small>Recorded claims</small>
        </article>

        <article>
          <span>Paid</span>
          <strong>{stats.paid}</strong>
          <small>Settled checkouts</small>
        </article>

        <article>
          <span>Outstanding</span>
          <strong>
            {money(stats.outstandingMinor, workspace?.currency ?? "GHS")}
          </strong>
          <small>Confirmed balance due</small>
        </article>
      </section>

      <section className="flow">
        <div>
          <span>1</span>
          <strong>Service completed</strong>
        </div>
        <i>→</i>
        <div>
          <span>2</span>
          <strong>Record payment</strong>
        </div>
        <i>→</i>
        <div>
          <span>3</span>
          <strong>Confirm</strong>
        </div>
        <i>→</i>
        <div>
          <span>4</span>
          <strong>Paid</strong>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">TODAY&apos;S CASHIER WORKSPACE</span>
            <h2>Service checkouts</h2>
            <p>
              Record payment only after the customer has actually paid your
              business.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="empty">
            <h3>Loading checkouts...</h3>
          </div>
        ) : checkouts.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">₵</div>
            <h3>No checkouts waiting</h3>
            <p>
              Complete a customer&apos;s service from the Queue. Once a checkout
              exists, it will appear here for the cashier.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Checkout</th>
                  <th>Total</th>
                  <th>Recorded</th>
                  <th>Balance</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {checkouts.map((checkout) => {
                  const customer = customerMap.get(checkout.customerRecordId);
                  const canRecord =
                    checkout.status !== "SETTLED" &&
                    checkout.status !== "VOIDED" &&
                    checkout.status !== "DISPUTED" &&
                    recordedTotal(checkout) < checkout.totalMinor;

                  return (
                    <tr key={checkout.id}>
                      <td>
                        <strong>{customer?.name ?? "Customer"}</strong>
                        <small>
                          {customer?.phoneE164 ??
                            customer?.email ??
                            "No contact"}
                        </small>
                      </td>

                      <td>{checkout.reference}</td>

                      <td className="money">
                        {money(checkout.totalMinor, checkout.currency)}
                      </td>

                      <td className="money">
                        {money(recordedTotal(checkout), checkout.currency)}
                      </td>

                      <td className="money">
                        {money(outstanding(checkout), checkout.currency)}
                      </td>

                      <td>
                        <span
                          className={`status ${checkout.status.toLowerCase()}`}
                        >
                          {checkoutStatus(checkout.status)}
                        </span>
                      </td>

                      <td>
                        {canRecord ? (
                          <button
                            className="primary compact"
                            onClick={() => beginPayment(checkout)}
                          >
                            Record payment
                          </button>
                        ) : checkout.status === "SETTLED" ? (
                          <strong className="paid">✓ Paid</strong>
                        ) : checkout.status === "AWAITING_VERIFICATION" ? (
                          <span className="waiting">Awaiting confirmation</span>
                        ) : (
                          <span className="waiting">No action</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected ? (
        <div className="overlay">
          <section className="modal">
            <div className="modal-head">
              <div>
                <span className="eyebrow">PAYMENT RECEIVED</span>
                <h2>Record payment</h2>
                <p>
                  Enter what the customer has already paid to the business.
                </p>
              </div>

              <button className="close" onClick={() => setSelected(null)}>
                ×
              </button>
            </div>

            <div className="summary">
              <div>
                <span>Bill total</span>
                <strong>{money(selected.totalMinor, selected.currency)}</strong>
              </div>

              <div>
                <span>Already recorded</span>
                <strong>
                  {money(recordedTotal(selected), selected.currency)}
                </strong>
              </div>

              <div>
                <span>Still due</span>
                <strong>{money(outstanding(selected), selected.currency)}</strong>
              </div>
            </div>

            <form onSubmit={submitPayment}>
              <label>
                Amount received
                <div className="amount-field">
                  <span>{selected.currency}</span>
                  <input
                    required
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </label>

              <label>
                Payment method
                <select
                  value={method}
                  onChange={(event) =>
                    setMethod(event.target.value as PaymentMethod)
                  }
                >
                  {methods.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              {method !== "CASH" ? (
                <label>
                  Payment reference
                  <input
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    placeholder="Optional MoMo, POS or transfer reference"
                  />
                </label>
              ) : null}

              <label>
                Note
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Optional payment note"
                />
              </label>

              <div className="warning">
                <strong>This button does not charge the customer.</strong>
                <span>
                  By continuing, you are recording that your business has
                  already received this money.
                </span>
              </div>

              <div className="actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setSelected(null)}
                >
                  Cancel
                </button>

                <button type="submit" className="primary" disabled={saving}>
                  {saving ? "Recording..." : "Record payment received"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      <style jsx>{`
        .pay-page {
          max-width: 1500px;
          margin: 0 auto;
          padding: 38px 42px 70px;
          color: var(--ws-text);
        }

        .pay-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 24px;
          margin-bottom: 20px;
        }

        .eyebrow {
          color: var(--ws-gold);
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.16em;
        }

        h1 {
          margin: 6px 0 8px;
          color: var(--ws-text);
          font-size: clamp(38px, 5vw, 58px);
          letter-spacing: -0.055em;
        }

        .pay-header p {
          max-width: 680px;
          margin: 0;
          color: var(--ws-text-secondary);
          font-size: 13px;
          line-height: 1.65;
        }

        .branch {
          display: flex;
          gap: 8px;
          margin-top: 12px;
          color: var(--ws-text-secondary);
          font-size: 10px;
        }

        .primary,
        .secondary {
          min-height: 42px;
          border: 0;
          border-radius: 11px;
          padding: 0 16px;
          font-weight: 850;
          cursor: pointer;
        }

        .primary {
          background: linear-gradient(135deg, #f4d066, #c69720);
          color: #101820;
          box-shadow: 0 8px 20px rgba(188, 143, 27, 0.18);
        }

        .primary:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .secondary {
          border: 1px solid var(--ws-border-strong);
          background: var(--ws-surface);
          color: var(--ws-text);
        }

        .compact {
          min-height: 34px;
          padding: 0 11px;
          font-size: 10px;
        }

        .gateway-note {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 17px;
          padding: 17px 19px;
          border: 1px solid var(--ws-gold-soft);
          border-radius: 16px;
          background:
            radial-gradient(circle at 10% 10%, rgba(217, 174, 55, 0.1), transparent 28%),
            var(--ws-surface);
          color: var(--ws-text);
        }

        .shield {
          flex: 0 0 auto;
          width: 40px;
          height: 40px;
          display: grid;
          place-items: center;
          border-radius: 12px;
          background: linear-gradient(135deg, #f4d369, #c7941e);
          color: #101820;
          font-size: 17px;
          font-weight: 900;
        }

        .gateway-note strong {
          font-size: 12px;
        }

        .gateway-note p {
          margin: 4px 0 0;
          color: var(--ws-text-secondary);
          font-size: 10px;
          line-height: 1.5;
        }

        .alert {
          margin-bottom: 15px;
          padding: 13px 15px;
          border-radius: 11px;
          font-size: 11px;
          font-weight: 700;
        }

        .error {
          border: 1px solid rgba(255, 128, 128, 0.25);
          background: var(--ws-error-soft);
          color: var(--ws-error);
        }

        .success {
          border: 1px solid rgba(61, 220, 132, 0.3);
          background: var(--ws-success-soft);
          color: var(--ws-success);
        }

        .stats {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
          margin-bottom: 17px;
        }

        .stats article {
          padding: 19px;
          border: 1px solid var(--ws-border);
          border-radius: 16px;
          background: var(--ws-surface);
          box-shadow: 0 5px 20px rgba(22, 34, 46, 0.025);
        }

        .stats span,
        .stats small {
          display: block;
        }

        .stats span {
          margin-bottom: 8px;
          color: var(--ws-text-secondary);
          font-size: 10px;
          font-weight: 700;
        }

        .stats strong {
          color: var(--ws-text);
          font-size: 24px;
        }

        .stats small {
          margin-top: 5px;
          color: var(--ws-text-muted);
          font-size: 9px;
        }

        .flow {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 17px;
          padding: 14px 18px;
          border: 1px solid var(--ws-border);
          border-radius: 14px;
          background: var(--ws-surface);
        }

        .flow div {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .flow div span {
          width: 24px;
          height: 24px;
          display: grid;
          place-items: center;
          border-radius: 8px;
          background: var(--ws-gold-soft);
          color: var(--ws-gold);
          font-size: 9px;
          font-weight: 900;
        }

        .flow strong {
          font-size: 10px;
          white-space: nowrap;
        }

        .flow i {
          color: var(--ws-text-muted);
          font-style: normal;
        }

        .panel {
          overflow: hidden;
          border: 1px solid var(--ws-border);
          border-radius: 18px;
          background: var(--ws-surface);
        }

        .panel-head {
          padding: 20px;
          border-bottom: 1px solid var(--ws-border);
        }

        .panel-head h2 {
          margin: 5px 0 3px;
          font-size: 18px;
        }

        .panel-head p {
          margin: 0;
          color: var(--ws-text-secondary);
          font-size: 10px;
        }

        .table-wrap {
          overflow-x: auto;
        }

        table {
          width: 100%;
          border-collapse: collapse;
        }

        th {
          padding: 12px 17px;
          background: var(--ws-surface);
          color: var(--ws-text-secondary);
          text-align: left;
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        td {
          padding: 16px 17px;
          border-top: 1px solid var(--ws-border);
          color: var(--ws-text);
          font-size: 10px;
        }

        td strong,
        td small {
          display: block;
        }

        td strong {
          color: var(--ws-text);
          font-size: 11px;
        }

        td small {
          margin-top: 3px;
          color: var(--ws-text-secondary);
          font-size: 9px;
        }

        td.money {
          color: var(--ws-text);
          font-weight: 800;
        }

        .status {
          display: inline-flex;
          padding: 5px 8px;
          border-radius: 999px;
          font-size: 9px;
          font-weight: 850;
        }

        .status.open {
          background: var(--ws-gold-soft);
          color: var(--ws-gold);
        }

        .status.awaiting_verification {
          background: var(--ws-info-soft);
          color: var(--ws-info);
        }

        .status.settled {
          background: var(--ws-success-soft);
          color: var(--ws-success);
        }

        .status.disputed {
          background: var(--ws-error-soft);
          color: var(--ws-error);
        }

        .paid {
          color: var(--ws-success);
          font-size: 10px;
        }

        .waiting {
          color: var(--ws-text-secondary);
          font-size: 9px;
        }

        .empty {
          min-height: 330px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 30px;
          text-align: center;
        }

        .empty-icon {
          width: 64px;
          height: 64px;
          display: grid;
          place-items: center;
          margin-bottom: 16px;
          border-radius: 20px;
          background: var(--ws-gold-soft);
          color: var(--ws-gold);
          font-size: 26px;
          font-weight: 900;
        }

        .empty h3 {
          margin: 0 0 7px;
        }

        .empty p {
          max-width: 460px;
          margin: 0;
          color: var(--ws-text-secondary);
          font-size: 11px;
          line-height: 1.65;
        }

        .overlay {
          position: fixed;
          inset: 0;
          z-index: 100;
          display: grid;
          place-items: center;
          padding: 20px;
          background: rgba(8, 16, 25, 0.5);
          backdrop-filter: blur(6px);
        }

        .modal {
          width: min(610px, 100%);
          max-height: 92vh;
          overflow-y: auto;
          padding: 28px;
          border-radius: 21px;
          background: var(--ws-surface);
          box-shadow: 0 30px 90px rgba(8, 17, 27, 0.28);
        }

        .modal-head {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 20px;
        }

        .modal-head h2 {
          margin: 5px 0;
          font-size: 25px;
          letter-spacing: -0.03em;
        }

        .modal-head p {
          margin: 0;
          color: var(--ws-text-secondary);
          font-size: 10px;
        }

        .close {
          width: 38px;
          height: 38px;
          border: 1px solid var(--ws-border-strong);
          border-radius: 11px;
          background: var(--ws-surface-2);
          color: var(--ws-text);
          font-size: 21px;
          cursor: pointer;
        }

        .summary {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-bottom: 19px;
        }

        .summary div {
          padding: 13px;
          border-radius: 11px;
          background: var(--ws-surface-2);
        }

        .summary span,
        .summary strong {
          display: block;
        }

        .summary span {
          margin-bottom: 5px;
          color: var(--ws-text-secondary);
          font-size: 9px;
        }

        .summary strong {
          color: var(--ws-text);
          font-size: 12px;
        }

        form,
        label {
          display: flex;
          flex-direction: column;
        }

        form {
          gap: 15px;
        }

        label {
          gap: 6px;
          color: var(--ws-text);
          font-size: 10px;
          font-weight: 850;
        }

        input,
        select,
        textarea {
          width: 100%;
          border: 1px solid var(--ws-border);
          border-radius: 10px;
          padding: 12px;
          background: var(--ws-surface);
          color: var(--ws-text);
          font: inherit;
          outline: none;
        }

        input:focus,
        select:focus,
        textarea:focus {
          border-color: #c99b29;
          box-shadow: 0 0 0 3px rgba(201, 155, 41, 0.09);
        }

        textarea {
          min-height: 80px;
          resize: vertical;
        }

        .amount-field {
          display: flex;
          align-items: center;
          overflow: hidden;
          border: 1px solid var(--ws-border);
          border-radius: 10px;
          background: var(--ws-surface);
        }

        .amount-field span {
          padding: 0 12px;
          color: var(--ws-gold);
          font-size: 10px;
          font-weight: 900;
        }

        .amount-field input {
          border: 0;
          border-left: 1px solid var(--ws-border);
          border-radius: 0;
          box-shadow: none;
        }

        .warning {
          padding: 13px 14px;
          border-radius: 11px;
          background: var(--ws-gold-soft);
          color: var(--ws-gold);
        }

        .warning strong,
        .warning span {
          display: block;
        }

        .warning strong {
          font-size: 10px;
        }

        .warning span {
          margin-top: 4px;
          font-size: 9px;
          line-height: 1.5;
        }

        .actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 3px;
        }

        @media (max-width: 800px) {
          .pay-page {
            padding: 24px 17px 60px;
          }

          .pay-header {
            flex-direction: column;
            align-items: stretch;
          }

          .stats {
            grid-template-columns: 1fr 1fr;
          }

          .flow {
            align-items: stretch;
            flex-direction: column;
          }

          .flow i {
            display: none;
          }

          .summary {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
      </div>
    </WorkspaceShell>
  );
}
