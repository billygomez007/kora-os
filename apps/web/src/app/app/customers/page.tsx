"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import WorkspaceShell from "@/components/workspace/WorkspaceShell";
import { koraData } from "@/lib/api/kora-api";
import { resolveActiveWorkspace } from "@/lib/api/dashboard";

type CustomerActivity = {
  appointments: number;
  queueVisits: number;
  serviceSessions: number;
  transactions: number;
  receipts: number;
};

type Customer = {
  id: string;
  organizationId: string;
  customerProfileId: string | null;
  name: string;
  phoneE164: string | null;
  email: string | null;
  notes: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  activity: CustomerActivity;
};

type CustomerForm = {
  name: string;
  phoneE164: string;
  email: string;
  notes: string;
};

const EMPTY_FORM: CustomerForm = {
  name: "",
  phoneE164: "",
  email: "",
  notes: "",
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function totalActivity(customer: Customer) {
  return (
    customer.activity.appointments +
    customer.activity.queueVisits +
    customer.activity.serviceSessions
  );
}

export default function CustomersPage() {
  const [organizationId, setOrganizationId] = useState("");
  const [canManageCustomers, setCanManageCustomers] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const workspace = await resolveActiveWorkspace();
          setOrganizationId(workspace.organizationId);
          setCanManageCustomers(
            workspace.permissionCodes.includes("customers.manage"),
          );
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Your Kora workspace could not be found.",
          );
          setLoading(false);
        }
      })();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const loadCustomers = useCallback(async () => {
    if (!organizationId) return;

    setLoading(true);
    setError("");

    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set("search", search.trim());
      if (showArchived) query.set("includeArchived", "true");

      const suffix = query.toString() ? `?${query.toString()}` : "";
      const data = await koraData<Customer[]>(
        `/organizations/${organizationId}/customers${suffix}`,
      );
      setCustomers(data);

      setSelected((current) => {
        if (!current) return current;

        return (
          data.find((item) => item.id === current.id) ??
          null
        );
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load customers.",
      );
    } finally {
      setLoading(false);
    }
  }, [organizationId, search, showArchived]);

  useEffect(() => {
    if (!organizationId) return;
    const timer = window.setTimeout(() => {
      void loadCustomers();
    }, search ? 250 : 0);

    return () => window.clearTimeout(timer);
  }, [organizationId, search, showArchived, loadCustomers]);

  const metrics = useMemo(() => {
    const active = customers.filter((customer) => !customer.archivedAt);
    return {
      total: active.length,
      appointments: active.reduce(
        (sum, customer) => sum + customer.activity.appointments,
        0,
      ),
      visits: active.reduce(
        (sum, customer) => sum + customer.activity.serviceSessions,
        0,
      ),
      linked: active.filter((customer) => customer.customerProfileId).length,
    };
  }, [customers]);

  function openCreate() {
    if (!canManageCustomers) return;
    setForm(EMPTY_FORM);
    setModal("create");
  }

  function openEdit(customer: Customer) {
    if (!canManageCustomers) return;
    setSelected(customer);
    setForm({
      name: customer.name,
      phoneE164: customer.phoneE164 ?? "",
      email: customer.email ?? "",
      notes: customer.notes ?? "",
    });
    setModal("edit");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      !canManageCustomers ||
      !organizationId ||
      !form.name.trim()
    ) return;

    setSaving(true);
    setError("");

    try {
      const payload = {
        name: form.name.trim(),
        phoneE164: form.phoneE164.trim() || undefined,
        email: form.email.trim() || undefined,
        notes: form.notes.trim() || undefined,
      };

      if (modal === "edit" && selected) {
        const updated = await koraData<Customer>(
          `/organizations/${organizationId}/customers/${selected.id}`,
          {
            method: "PATCH",
            body: JSON.stringify(payload),
          },
        );
        setSelected(updated);
      } else {
        const created = await koraData<Customer>(
          `/organizations/${organizationId}/customers`,
          {
            method: "POST",
            body: JSON.stringify(payload),
          },
        );
        setSelected(created);
      }

      setModal(null);
      setForm(EMPTY_FORM);
      await loadCustomers();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to save customer.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleArchive(customer: Customer) {
    if (!canManageCustomers || !organizationId) return;

    setSaving(true);
    setError("");

    try {
      const action = customer.archivedAt ? "restore" : "archive";
      const updated = await koraData<Customer>(
        `/organizations/${organizationId}/customers/${customer.id}/${action}`,
        { method: "POST" },
      );
      setSelected(updated);
      await loadCustomers();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to update customer.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <WorkspaceShell
      title="Customers"
      actions={
        canManageCustomers ? (
          <button
            type="button"
            className="workspace-primary-button"
            onClick={openCreate}
          >
            + Add customer
          </button>
        ) : null
      }
    >
      <div className="kora-customers-page">
      <section className="kora-customers-hero">
        <div>
          <div className="kora-eyebrow">CUSTOMER RELATIONSHIPS</div>
          <h1>Customers</h1>
          <p>
            Know every customer, remember every visit, and build relationships
            that keep people coming back.
          </p>
        </div>
      </section>

      <section className="kora-customer-metrics">
        <article>
          <span className="metric-icon">◎</span>
          <div>
            <strong>{metrics.total}</strong>
            <span>Active customers</span>
          </div>
        </article>

        <article>
          <span className="metric-icon">◇</span>
          <div>
            <strong>{metrics.appointments}</strong>
            <span>Total appointments</span>
          </div>
        </article>

        <article>
          <span className="metric-icon">✓</span>
          <div>
            <strong>{metrics.visits}</strong>
            <span>Completed services</span>
          </div>
        </article>

        <article>
          <span className="metric-icon">K</span>
          <div>
            <strong>{metrics.linked}</strong>
            <span>Kora-linked customers</span>
          </div>
        </article>
      </section>

      <section className="kora-customer-panel">
        <div className="kora-customer-toolbar">
          <div className="kora-customer-search">
            <span>⌕</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, phone or email"
              aria-label="Search customers"
            />
          </div>

          <label className="kora-archive-toggle">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
            />
            <span>Show archived</span>
          </label>
        </div>

        {error ? <div className="kora-customer-error">{error}</div> : null}

        {loading ? (
          <div className="kora-customer-empty">
            <div className="kora-empty-mark">K</div>
            <h2>Loading your customers</h2>
            <p>Bringing your customer relationships together.</p>
          </div>
        ) : customers.length === 0 ? (
          <div className="kora-customer-empty">
            <div className="kora-empty-mark">◎</div>
            <h2>
              {search
                ? "No customers match your search"
                : "Your customer book starts here"}
            </h2>
            <p>
              {search
                ? "Try another name, phone number or email address."
                : "Add your first customer, or create an appointment or walk-in. Kora will keep the relationship history together automatically."}
            </p>
            {!search && canManageCustomers ? (
              <button className="kora-gold-button" onClick={openCreate}>
                ＋ Add your first customer
              </button>
            ) : null}
          </div>
        ) : (
          <div className="kora-customer-table-wrap">
            <table className="kora-customer-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Contact</th>
                  <th>Appointments</th>
                  <th>Services</th>
                  <th>Relationship</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr
                    key={customer.id}
                    onClick={() => setSelected(customer)}
                    className={customer.archivedAt ? "is-archived" : ""}
                  >
                    <td>
                      <div className="customer-identity">
                        <div className="customer-avatar">
                          {initials(customer.name) || "K"}
                        </div>
                        <div>
                          <strong>{customer.name}</strong>
                          <span>
                            {customer.customerProfileId
                              ? "Kora customer"
                              : "Business customer"}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="customer-contact">
                        <span>{customer.phoneE164 || "No phone"}</span>
                        <small>{customer.email || "No email"}</small>
                      </div>
                    </td>
                    <td>{customer.activity.appointments}</td>
                    <td>{customer.activity.serviceSessions}</td>
                    <td>
                      <span
                        className={
                          customer.archivedAt
                            ? "customer-status archived"
                            : "customer-status active"
                        }
                      >
                        {customer.archivedAt ? "Archived" : "Active"}
                      </span>
                    </td>
                    <td className="customer-chevron">›</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected ? (
        <div
          className="kora-drawer-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelected(null);
          }}
        >
          <aside className="kora-customer-drawer">
            <div className="drawer-top">
              <button
                className="drawer-close"
                onClick={() => setSelected(null)}
                aria-label="Close customer"
              >
                ×
              </button>
              {canManageCustomers ? (
                <div className="drawer-actions">
                  <button onClick={() => openEdit(selected)}>Edit</button>
                  <button
                    onClick={() => void toggleArchive(selected)}
                    disabled={saving}
                  >
                    {selected.archivedAt ? "Restore" : "Archive"}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="drawer-profile">
              <div className="drawer-avatar">
                {initials(selected.name) || "K"}
              </div>
              <div>
                <span className="drawer-label">CUSTOMER PROFILE</span>
                <h2>{selected.name}</h2>
                <p>
                  Customer since {formatDate(selected.createdAt)}
                </p>
              </div>
            </div>

            <div className="drawer-contact-grid">
              <div>
                <span>Phone</span>
                <strong>{selected.phoneE164 || "Not provided"}</strong>
              </div>
              <div>
                <span>Email</span>
                <strong>{selected.email || "Not provided"}</strong>
              </div>
            </div>

            <div className="drawer-section">
              <div className="drawer-section-heading">
                <span>RELATIONSHIP ACTIVITY</span>
                <strong>{totalActivity(selected)} touchpoints</strong>
              </div>

              <div className="drawer-stat-grid">
                <div>
                  <strong>{selected.activity.appointments}</strong>
                  <span>Appointments</span>
                </div>
                <div>
                  <strong>{selected.activity.queueVisits}</strong>
                  <span>Queue visits</span>
                </div>
                <div>
                  <strong>{selected.activity.serviceSessions}</strong>
                  <span>Services</span>
                </div>
                <div>
                  <strong>{selected.activity.receipts}</strong>
                  <span>Receipts</span>
                </div>
              </div>
            </div>

            <div className="drawer-section">
              <span className="drawer-label">NOTES</span>
              <div className="customer-notes">
                {selected.notes ||
                  "No customer notes yet. Add preferences, important details or relationship context here."}
              </div>
            </div>

            <div className="drawer-section">
              <span className="drawer-label">ACCOUNT CONNECTION</span>
              <div className="customer-link-card">
                <div>
                  <strong>
                    {selected.customerProfileId
                      ? "Connected to Kora"
                      : "Business-only customer"}
                  </strong>
                  <p>
                    {selected.customerProfileId
                      ? "This customer is linked to a registered Kora customer profile."
                      : "This record can be used for appointments and walk-ins without requiring the customer to create a Kora account."}
                  </p>
                </div>
                <span>{selected.customerProfileId ? "✓" : "○"}</span>
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {modal ? (
        <div className="kora-modal-backdrop">
          <div className="kora-customer-modal">
            <div className="customer-modal-head">
              <div>
                <span className="drawer-label">
                  {modal === "create" ? "NEW RELATIONSHIP" : "CUSTOMER DETAILS"}
                </span>
                <h2>
                  {modal === "create" ? "Add customer" : "Edit customer"}
                </h2>
              </div>
              <button
                className="drawer-close"
                onClick={() => setModal(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <form onSubmit={submit}>
              <label>
                Customer name
                <input
                  required
                  maxLength={160}
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  placeholder="e.g. Ama Mensah"
                />
              </label>

              <div className="customer-form-row">
                <label>
                  Phone
                  <input
                    maxLength={32}
                    value={form.phoneE164}
                    onChange={(event) =>
                      setForm({ ...form, phoneE164: event.target.value })
                    }
                    placeholder="+233..."
                  />
                </label>

                <label>
                  Email
                  <input
                    type="email"
                    maxLength={254}
                    value={form.email}
                    onChange={(event) =>
                      setForm({ ...form, email: event.target.value })
                    }
                    placeholder="customer@example.com"
                  />
                </label>
              </div>

              <label>
                Notes
                <textarea
                  maxLength={4000}
                  value={form.notes}
                  onChange={(event) =>
                    setForm({ ...form, notes: event.target.value })
                  }
                  placeholder="Preferences, relationship notes, important details..."
                />
              </label>

              <div className="customer-modal-actions">
                <button
                  type="button"
                  className="kora-secondary-button"
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="kora-gold-button"
                  disabled={saving || !form.name.trim()}
                >
                  {saving
                    ? "Saving..."
                    : modal === "create"
                      ? "Add customer"
                      : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .kora-customers-page {
          padding: 38px 42px 70px;
          max-width: 1500px;
          margin: 0 auto;
        }

        .kora-customers-hero {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 28px;
          margin-bottom: 30px;
        }

        .kora-eyebrow,
        .drawer-label {
          color: var(--ws-gold);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.16em;
        }

        .kora-customers-hero h1 {
          margin: 8px 0 8px;
          font-size: clamp(34px, 4vw, 54px);
          letter-spacing: -0.045em;
          color: var(--ws-text);
        }

        .kora-customers-hero p {
          margin: 0;
          max-width: 650px;
          color: var(--ws-text);
          font-size: 15px;
          line-height: 1.7;
        }

        .kora-gold-button,
        .kora-secondary-button,
        .drawer-actions button {
          border: 0;
          border-radius: 11px;
          min-height: 44px;
          padding: 0 18px;
          font-weight: 800;
          cursor: pointer;
        }

        .kora-gold-button {
          background: linear-gradient(135deg, #f0c85a, #c99722);
          color: #101923;
          box-shadow: 0 10px 30px rgba(184, 137, 25, 0.18);
        }

        .kora-gold-button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .kora-customer-metrics {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
          margin-bottom: 18px;
        }

        .kora-customer-metrics article {
          background: var(--ws-surface);
          border: 1px solid var(--ws-border);
          border-radius: 16px;
          padding: 20px;
          display: flex;
          align-items: center;
          gap: 14px;
          box-shadow: 0 6px 25px rgba(16, 29, 44, 0.035);
        }

        .metric-icon {
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          border-radius: 11px;
          background: var(--ws-gold-soft);
          color: var(--ws-gold);
          font-weight: 900;
        }

        .kora-customer-metrics strong {
          display: block;
          font-size: 25px;
          color: var(--ws-text);
          line-height: 1;
        }

        .kora-customer-metrics article div span {
          display: block;
          margin-top: 6px;
          color: var(--ws-text);
          font-size: 12px;
        }

        .kora-customer-panel {
          background: var(--ws-surface);
          border: 1px solid var(--ws-border);
          border-radius: 18px;
          overflow: hidden;
          box-shadow: 0 12px 40px rgba(18, 31, 45, 0.045);
        }

        .kora-customer-toolbar {
          display: flex;
          justify-content: space-between;
          gap: 18px;
          padding: 18px;
          border-bottom: 1px solid var(--ws-border);
        }

        .kora-customer-search {
          flex: 1;
          max-width: 520px;
          height: 44px;
          display: flex;
          align-items: center;
          gap: 10px;
          border: 1px solid var(--ws-border);
          border-radius: 11px;
          padding: 0 14px;
          background: var(--ws-surface-2);
        }

        .kora-customer-search span {
          color: var(--ws-gold);
          font-size: 20px;
        }

        .kora-customer-search input {
          width: 100%;
          border: 0;
          outline: 0;
          background: transparent;
          color: var(--ws-text);
          font: inherit;
        }

        .kora-archive-toggle {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--ws-text);
          font-size: 13px;
          cursor: pointer;
        }

        .kora-customer-error {
          margin: 18px;
          padding: 13px 15px;
          border: 1px solid rgba(255, 128, 128, 0.25);
          border-radius: 10px;
          background: var(--ws-error-soft);
          color: var(--ws-error);
          font-size: 13px;
        }

        .kora-customer-empty {
          min-height: 390px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 40px 24px;
        }

        .kora-empty-mark {
          width: 66px;
          height: 66px;
          display: grid;
          place-items: center;
          border-radius: 20px;
          background: var(--ws-gold-soft);
          color: var(--ws-gold);
          font-size: 25px;
          font-weight: 900;
          margin-bottom: 20px;
        }

        .kora-customer-empty h2 {
          margin: 0 0 8px;
          color: var(--ws-text);
          font-size: 21px;
        }

        .kora-customer-empty p {
          max-width: 540px;
          margin: 0 0 22px;
          color: var(--ws-text);
          line-height: 1.65;
          font-size: 14px;
        }

        .kora-customer-table-wrap {
          overflow-x: auto;
        }

        .kora-customer-table {
          width: 100%;
          border-collapse: collapse;
        }

        .kora-customer-table th {
          padding: 13px 20px;
          text-align: left;
          color: var(--ws-text-secondary);
          font-size: 10px;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          background: var(--ws-surface-2);
        }

        .kora-customer-table td {
          padding: 17px 20px;
          border-top: 1px solid var(--ws-border);
          color: var(--ws-text);
          font-size: 13px;
        }

        .kora-customer-table tbody tr {
          cursor: pointer;
          transition: background 0.16s ease;
        }

        .kora-customer-table tbody tr:hover {
          background: var(--ws-surface-2);
        }

        .kora-customer-table tbody tr.is-archived {
          opacity: 0.6;
        }

        .customer-identity {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .customer-avatar,
        .drawer-avatar {
          display: grid;
          place-items: center;
          border-radius: 13px;
          background: #142335;
          color: var(--ws-gold);
          font-weight: 900;
        }

        .customer-avatar {
          width: 40px;
          height: 40px;
          font-size: 12px;
        }

        .customer-identity strong {
          display: block;
          color: var(--ws-text);
          font-size: 13px;
        }

        .customer-identity span,
        .customer-contact small {
          display: block;
          margin-top: 4px;
          color: var(--ws-text-secondary);
          font-size: 11px;
        }

        .customer-contact span {
          color: var(--ws-text);
        }

        .customer-status {
          display: inline-flex;
          padding: 5px 9px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 800;
        }

        .customer-status.active {
          background: var(--ws-success-soft);
          color: var(--ws-success);
        }

        .customer-status.archived {
          background: var(--ws-surface-2);
          color: var(--ws-text-secondary);
        }

        .customer-chevron {
          text-align: right;
          font-size: 23px !important;
          color: var(--ws-text-muted) !important;
        }

        .kora-drawer-backdrop,
        .kora-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 80;
          background: rgba(8, 16, 25, 0.46);
          backdrop-filter: blur(4px);
        }

        .kora-customer-drawer {
          position: absolute;
          top: 0;
          right: 0;
          width: min(520px, 100%);
          height: 100%;
          overflow-y: auto;
          background: var(--ws-surface);
          box-shadow: -25px 0 70px rgba(8, 16, 25, 0.18);
          padding: 26px;
        }

        .drawer-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .drawer-close {
          width: 38px;
          height: 38px;
          border: 1px solid var(--ws-border-strong);
          border-radius: 10px;
          background: var(--ws-surface-2);
          color: var(--ws-text);
          font-size: 22px;
          cursor: pointer;
        }

        .drawer-actions {
          display: flex;
          gap: 8px;
        }

        .drawer-actions button {
          min-height: 38px;
          border: 1px solid var(--ws-border-strong);
          background: var(--ws-surface-2);
          color: var(--ws-text);
        }

        .drawer-profile {
          display: flex;
          align-items: center;
          gap: 18px;
          padding: 34px 0 28px;
        }

        .drawer-avatar {
          width: 68px;
          height: 68px;
          border-radius: 20px;
          font-size: 19px;
        }

        .drawer-profile h2 {
          margin: 5px 0;
          color: var(--ws-text);
          font-size: 26px;
        }

        .drawer-profile p {
          margin: 0;
          color: var(--ws-text-secondary);
          font-size: 12px;
        }

        .drawer-contact-grid,
        .drawer-stat-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .drawer-contact-grid > div,
        .drawer-stat-grid > div,
        .customer-link-card {
          border: 1px solid var(--ws-border);
          border-radius: 13px;
          padding: 15px;
          background: var(--ws-surface-2);
        }

        .drawer-contact-grid span,
        .drawer-stat-grid span {
          display: block;
          color: var(--ws-text-secondary);
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .drawer-contact-grid strong {
          display: block;
          margin-top: 7px;
          color: var(--ws-text);
          font-size: 12px;
          word-break: break-word;
        }

        .drawer-section {
          padding: 25px 0;
          border-top: 1px solid var(--ws-border);
        }

        .drawer-section-heading {
          display: flex;
          justify-content: space-between;
          margin-bottom: 13px;
          color: var(--ws-text-secondary);
          font-size: 10px;
          letter-spacing: 0.08em;
        }

        .drawer-section-heading strong {
          color: var(--ws-gold);
        }

        .drawer-stat-grid strong {
          display: block;
          margin-bottom: 6px;
          color: var(--ws-text);
          font-size: 22px;
        }

        .customer-notes {
          margin-top: 10px;
          min-height: 86px;
          padding: 15px;
          border-radius: 13px;
          background: var(--ws-surface-2);
          color: var(--ws-text);
          line-height: 1.6;
          font-size: 13px;
        }

        .customer-link-card {
          margin-top: 10px;
          display: flex;
          justify-content: space-between;
          gap: 20px;
          align-items: center;
        }

        .customer-link-card strong {
          color: var(--ws-text);
          font-size: 13px;
        }

        .customer-link-card p {
          margin: 5px 0 0;
          color: var(--ws-text-secondary);
          font-size: 11px;
          line-height: 1.55;
        }

        .customer-link-card > span {
          color: var(--ws-gold);
          font-size: 24px;
        }

        .kora-modal-backdrop {
          display: grid;
          place-items: center;
          padding: 20px;
        }

        .kora-customer-modal {
          width: min(620px, 100%);
          max-height: 92vh;
          overflow-y: auto;
          background: var(--ws-surface);
          border-radius: 20px;
          padding: 28px;
          box-shadow: 0 30px 90px rgba(8, 16, 25, 0.28);
        }

        .customer-modal-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 24px;
        }

        .customer-modal-head h2 {
          margin: 5px 0 0;
          color: var(--ws-text);
          font-size: 26px;
        }

        .kora-customer-modal form,
        .kora-customer-modal label {
          display: flex;
          flex-direction: column;
        }

        .kora-customer-modal form {
          gap: 16px;
        }

        .kora-customer-modal label {
          gap: 7px;
          color: var(--ws-text);
          font-size: 12px;
          font-weight: 700;
        }

        .kora-customer-modal input,
        .kora-customer-modal textarea {
          width: 100%;
          border: 1px solid var(--ws-border);
          border-radius: 11px;
          outline: none;
          padding: 12px 13px;
          background: var(--ws-surface);
          color: var(--ws-text);
          font: inherit;
        }

        .kora-customer-modal input:focus,
        .kora-customer-modal textarea:focus {
          border-color: #c89a2a;
          box-shadow: 0 0 0 3px rgba(200, 154, 42, 0.09);
        }

        .kora-customer-modal textarea {
          min-height: 110px;
          resize: vertical;
        }

        .customer-form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .customer-modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          padding-top: 6px;
        }

        .kora-secondary-button {
          border: 1px solid var(--ws-border-strong);
          background: var(--ws-surface-2);
          color: var(--ws-text);
        }

        @media (max-width: 1000px) {
          .kora-customer-metrics {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 700px) {
          .kora-customers-page {
            padding: 24px 18px 60px;
          }

          .kora-customer-toolbar {
            align-items: stretch;
            flex-direction: column;
          }

          .kora-customer-metrics {
            grid-template-columns: 1fr;
          }

          .customer-form-row {
            grid-template-columns: 1fr;
          }

          .kora-customer-table th:nth-child(3),
          .kora-customer-table th:nth-child(4),
          .kora-customer-table td:nth-child(3),
          .kora-customer-table td:nth-child(4) {
            display: none;
          }
        }
      `}</style>
      </div>
    </WorkspaceShell>
  );
}
