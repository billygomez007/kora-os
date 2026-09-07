"use client";

import { useCallback, useEffect, useState } from "react";
import WorkspaceShell from "@/components/workspace/WorkspaceShell";
import {
  resolveActiveWorkspace,
  type ActiveWorkspace,
} from "@/lib/api/dashboard";
import { koraData } from "@/lib/api/kora-api";

type RangeKey = "today" | "7d" | "30d";

type MoneyTotal = {
  currency: string;
  amountMinor: number;
};

type Overview = {
  from: string;
  to: string;
  branchId: string | null;
  postedRevenue: MoneyTotal[];
  transactionCount: number;
  averageTransactionValue: MoneyTotal[];
  completedServiceCount: number;
  commissionAccrued: MoneyTotal[];
  pendingPaymentClaimCount: number;
  disputedPaymentClaimCount: number;
  grossPostedSales: MoneyTotal[];
  refundAmount: MoneyTotal[];
  reversalAmount: MoneyTotal[];
  netPostedRevenue: MoneyTotal[];
  refundTransactionCount: number;
  reversalTransactionCount: number;
};

type RevenueBucket = {
  date?: string;
  localDate?: string;
  currency: string;
  amountMinor: number;
};

type RevenueReport = {
  from: string;
  to: string;
  branchId: string | null;
  timeZone: string;
  buckets: RevenueBucket[];
};

type StaffEntry = {
  staffProfileId: string;
  [key: string]: unknown;
};

type ServiceEntry = {
  serviceId: string;
  serviceName?: string;
  name?: string;
  [key: string]: unknown;
};

type PaymentMethodEntry = {
  method: string;
  [key: string]: unknown;
};

type ReportList<T> = {
  from: string;
  to: string;
  branchId: string | null;
  data: T[];
  page: {
    hasMore: boolean;
    nextCursor: string | null;
  };
};

const ranges: Array<{ key: RangeKey; label: string }> = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
];

function rangeDates(range: RangeKey) {
  const now = new Date();
  const start = new Date(now);

  if (range === "today") {
    start.setHours(0, 0, 0, 0);
  } else {
    const days = range === "7d" ? 7 : 30;
    start.setDate(start.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);
  }

  return {
    from: start.toISOString(),
    to: now.toISOString(),
  };
}

function money(amountMinor: number, currency = "GHS") {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amountMinor / 100);
}

function amountForCurrency(
  values: MoneyTotal[] | undefined,
  currency: string,
) {
  return (
    values?.find((item) => item.currency === currency)?.amountMinor ??
    values?.[0]?.amountMinor ??
    0
  );
}

function numberFrom(
  value: unknown,
  keys: string[],
) {
  if (!value || typeof value !== "object") return 0;
  const record = value as Record<string, unknown>;

  for (const key of keys) {
    if (typeof record[key] === "number") {
      return record[key] as number;
    }
  }

  return 0;
}

function textFrom(
  value: unknown,
  keys: string[],
  fallback: string,
) {
  if (!value || typeof value !== "object") return fallback;
  const record = value as Record<string, unknown>;

  for (const key of keys) {
    if (typeof record[key] === "string" && record[key]) {
      return record[key] as string;
    }
  }

  return fallback;
}

export default function ReportsPage() {
  const [workspace, setWorkspace] = useState<ActiveWorkspace | null>(null);
  const [range, setRange] = useState<RangeKey>("7d");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [revenue, setRevenue] = useState<RevenueReport | null>(null);
  const [staff, setStaff] = useState<StaffEntry[]>([]);
  const [services, setServices] = useState<ServiceEntry[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const active = await resolveActiveWorkspace();
      const dates = rangeDates(range);

      const params = new URLSearchParams({
        from: dates.from,
        to: dates.to,
        branchId: active.branchId,
        limit: "100",
      });

      const base = `/organizations/${active.organizationId}/reports`;
      const query = params.toString();

      const [
        overviewData,
        revenueData,
        staffData,
        servicesData,
        paymentData,
      ] = await Promise.all([
        koraData<Overview>(`${base}/overview?${query}`),
        koraData<RevenueReport>(`${base}/revenue?${query}`),
        koraData<ReportList<StaffEntry>>(
          `${base}/staff-performance?${query}`,
        ),
        koraData<ReportList<ServiceEntry>>(
          `${base}/services?${query}`,
        ),
        koraData<ReportList<PaymentMethodEntry>>(
          `${base}/payment-methods?${query}`,
        ),
      ]);

      setWorkspace(active);
      setOverview(overviewData);
      setRevenue(revenueData);
      setStaff(staffData.data ?? []);
      setServices(servicesData.data ?? []);
      setPaymentMethods(paymentData.data ?? []);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load Kora reports.",
      );
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [load]);

  const currency =
    overview?.netPostedRevenue?.[0]?.currency ??
    overview?.grossPostedSales?.[0]?.currency ??
    workspace?.currency ??
    "GHS";

  const gross = amountForCurrency(
    overview?.grossPostedSales,
    currency,
  );

  const refunds = amountForCurrency(
    overview?.refundAmount,
    currency,
  );

  const reversals = amountForCurrency(
    overview?.reversalAmount,
    currency,
  );

  const net = amountForCurrency(
    overview?.netPostedRevenue,
    currency,
  );

  const average = amountForCurrency(
    overview?.averageTransactionValue,
    currency,
  );

  const maxRevenue = Math.max(
    1,
    ...(revenue?.buckets ?? []).map((item) => item.amountMinor),
  );

  return (
    <WorkspaceShell
      title="Reports"
      actions={
        <>
          <div className="workspace-range-toggle">
            {ranges.map((item) => (
              <button
                key={item.key}
                type="button"
                className={range === item.key ? "active" : ""}
                onClick={() => setRange(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="workspace-secondary-button"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </>
      }
    >
      <div className="reports">
      <section className="reportsHero">
        <div>
          <div className="eyebrow">KORA INTELLIGENCE</div>
          <h1>Reports</h1>
          <p>
            Understand how your business is performing from completed,
            financially posted activity.
          </p>

          <div className="context">
            <span>{workspace?.branchName ?? "Loading branch"}</span>
            <span className="dot">•</span>
            <span>Posted transactions only</span>
          </div>
        </div>
      </section>

      <section className="integrity">
        <div className="integrityIcon">◆</div>
        <div>
          <strong>Financially verified reporting</strong>
          <p>
            Revenue comes from Kora&apos;s posted transaction ledger.
            Recorded or unconfirmed payment claims are never counted as
            revenue.
          </p>
        </div>
      </section>

      {error ? (
        <section className="error">
          <strong>Reports could not load</strong>
          <span>{error}</span>
          <button type="button" onClick={() => void load()}>
            Try again
          </button>
        </section>
      ) : null}

      <section className="metrics">
        <article className="metric primary">
          <span>Net revenue</span>
          <strong>{money(net, currency)}</strong>
          <small>Sales less refunds and reversals</small>
        </article>

        <article className="metric">
          <span>Gross sales</span>
          <strong>{money(gross, currency)}</strong>
          <small>{overview?.transactionCount ?? 0} posted sales</small>
        </article>

        <article className="metric">
          <span>Refunds &amp; reversals</span>
          <strong>{money(refunds + reversals, currency)}</strong>
          <small>
            {(overview?.refundTransactionCount ?? 0) +
              (overview?.reversalTransactionCount ?? 0)}{" "}
            corrections
          </small>
        </article>

        <article className="metric">
          <span>Average sale</span>
          <strong>{money(average, currency)}</strong>
          <small>Average posted sale value</small>
        </article>
      </section>

      <section className="grid">
        <article className="panel trendPanel">
          <header>
            <div>
              <span className="sectionLabel">PERFORMANCE</span>
              <h2>Revenue trend</h2>
            </div>
            <strong>{money(gross, currency)}</strong>
          </header>

          {(revenue?.buckets ?? []).length ? (
            <div className="chart">
              {(revenue?.buckets ?? []).map((bucket, index) => {
                const height = Math.max(
                  7,
                  Math.round((bucket.amountMinor / maxRevenue) * 100),
                );

                return (
                  <div
                    className="barColumn"
                    key={`${bucket.date ?? bucket.localDate ?? index}-${bucket.currency}`}
                  >
                    <div className="barTrack">
                      <div
                        className="bar"
                        style={{ height: `${height}%` }}
                        title={money(bucket.amountMinor, bucket.currency)}
                      />
                    </div>
                    <span>
                      {bucket.date ??
                        bucket.localDate ??
                        `Day ${index + 1}`}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty">
              <strong>{money(0, currency)}</strong>
              <span>No posted revenue yet</span>
            </div>
          )}
        </article>

        <article className="panel snapshot">
          <span className="sectionLabel">OPERATIONS</span>
          <h2>Financial snapshot</h2>

          <div className="snapshotRows">
            <div>
              <span>Completed services</span>
              <strong>{overview?.completedServiceCount ?? 0}</strong>
            </div>
            <div>
              <span>Pending payment confirmations</span>
              <strong>{overview?.pendingPaymentClaimCount ?? 0}</strong>
            </div>
            <div>
              <span>Disputed payments</span>
              <strong>{overview?.disputedPaymentClaimCount ?? 0}</strong>
            </div>
            <div>
              <span>Commission accrued</span>
              <strong>
                {money(
                  amountForCurrency(
                    overview?.commissionAccrued,
                    currency,
                  ),
                  currency,
                )}
              </strong>
            </div>
          </div>
        </article>
      </section>

      <section className="grid lower">
        <article className="panel">
          <header>
            <div>
              <span className="sectionLabel">SERVICES</span>
              <h2>Top services</h2>
            </div>
          </header>

          {services.length ? (
            <div className="ranking">
              {services.slice(0, 6).map((service, index) => {
                const value = numberFrom(service, [
                  "netRevenueMinor",
                  "revenueMinor",
                  "grossRevenueMinor",
                  "amountMinor",
                ]);

                return (
                  <div className="rank" key={service.serviceId}>
                    <span className="rankNumber">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <strong>
                        {service.serviceName ??
                          service.name ??
                          "Service"}
                      </strong>
                      <span>
                        {numberFrom(service, [
                          "serviceCount",
                          "count",
                          "completedCount",
                        ])}{" "}
                        completed
                      </span>
                    </div>
                    <b>{money(value, currency)}</b>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="smallEmpty">
              No posted service activity for this period.
            </div>
          )}
        </article>

        <article className="panel">
          <header>
            <div>
              <span className="sectionLabel">TEAM</span>
              <h2>Provider contribution</h2>
            </div>
          </header>

          {staff.length ? (
            <div className="ranking">
              {staff.slice(0, 6).map((member, index) => (
                <div className="rank" key={member.staffProfileId}>
                  <span className="rankNumber">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <strong>
                      {textFrom(
                        member,
                        ["staffName", "displayName", "name"],
                        "Team member",
                      )}
                    </strong>
                    <span>
                      {numberFrom(member, [
                        "serviceCount",
                        "completedServiceCount",
                        "count",
                      ])}{" "}
                      services
                    </span>
                  </div>
                  <b>
                    {money(
                      numberFrom(member, [
                        "netRevenueMinor",
                        "revenueMinor",
                        "grossRevenueMinor",
                        "amountMinor",
                      ]),
                      currency,
                    )}
                  </b>
                </div>
              ))}
            </div>
          ) : (
            <div className="smallEmpty">
              No posted staff activity for this period.
            </div>
          )}
        </article>
      </section>

      <section className="panel paymentPanel">
        <header>
          <div>
            <span className="sectionLabel">COLLECTION MIX</span>
            <h2>Recorded payment methods</h2>
          </div>
        </header>

        {paymentMethods.length ? (
          <div className="methods">
            {paymentMethods.map((method) => (
              <div className="method" key={method.method}>
                <div>
                  <strong>{method.method.replaceAll("_", " ")}</strong>
                  <span>
                    {numberFrom(method, [
                      "paymentCount",
                      "count",
                      "transactionCount",
                    ])}{" "}
                    payments
                  </span>
                </div>
                <b>
                  {money(
                    numberFrom(method, [
                      "netAmountMinor",
                      "amountMinor",
                      "totalMinor",
                    ]),
                    currency,
                  )}
                </b>
              </div>
            ))}
          </div>
        ) : (
          <div className="smallEmpty">
            No posted payment-method activity for this period.
          </div>
        )}
      </section>

      <style jsx>{`
        .reports {
          max-width: 1500px;
          margin: 0 auto;
          padding: 16px 42px 70px;
          color: var(--ws-text);
        }

        .reportsHero {
          margin: 0;
          padding: 18px 0 24px;
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 28px;
        }

        .eyebrow,
        .sectionLabel {
          color: var(--ws-gold);
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.18em;
        }

        h1 {
          margin: 7px 0 7px;
          font-size: clamp(34px, 4vw, 55px);
          line-height: 0.98;
          letter-spacing: -0.045em;
          color: var(--ws-text);
        }

        .reportsHero p {
          max-width: 650px;
          margin: 0;
          color: var(--ws-text-secondary);
          font-size: 15px;
          line-height: 1.6;
        }

        .context {
          display: flex;
          gap: 8px;
          margin-top: 12px;
          color: var(--ws-text-secondary);
          font-size: 12px;
          font-weight: 700;
        }

        .dot {
          color: var(--ws-gold);
        }

        .error button {
          border: 0;
          cursor: pointer;
          font: inherit;
        }

        .integrity {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 16px 18px;
          margin-bottom: 18px;
          border: 1px solid var(--ws-gold-soft);
          border-radius: 14px;
          background: var(--ws-surface);
        }

        .integrityIcon {
          display: grid;
          width: 36px;
          height: 36px;
          place-items: center;
          border-radius: 10px;
          background: var(--ws-gold-soft);
          color: var(--ws-gold);
        }

        .integrity strong {
          font-size: 13px;
          color: var(--ws-text);
        }

        .integrity p {
          margin: 3px 0 0;
          color: var(--ws-text-secondary);
          font-size: 12px;
          line-height: 1.45;
        }

        .error {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 18px;
          padding: 14px 16px;
          border: 1px solid rgba(255, 128, 128, 0.25);
          border-radius: 12px;
          background: var(--ws-error-soft);
          color: var(--ws-error);
          font-size: 13px;
        }

        .error span {
          flex: 1;
        }

        .error button {
          padding: 8px 12px;
          border-radius: 8px;
          background: var(--ws-error);
          color: #2a0a0a;
          font-weight: 800;
        }

        .metrics {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
          margin-bottom: 14px;
        }

        .metric {
          min-height: 126px;
          padding: 21px;
          border: 1px solid var(--ws-border);
          border-radius: 17px;
          background: var(--ws-surface);
          box-shadow: 0 8px 30px rgba(16, 25, 39, 0.035);
        }

        .metric.primary {
          background: var(--ws-gold-soft);
          border-color: rgba(244, 169, 0, 0.3);
        }

        .metric span {
          display: block;
          color: var(--ws-text-secondary);
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .metric strong {
          display: block;
          margin-top: 13px;
          color: var(--ws-text);
          font-size: clamp(23px, 2vw, 32px);
          letter-spacing: -0.035em;
        }

        .metric small {
          display: block;
          margin-top: 7px;
          color: var(--ws-text-secondary);
          font-size: 11px;
        }

        .metric.primary span,
        .metric.primary small {
          color: var(--ws-text-secondary);
        }

        .metric.primary strong {
          color: var(--ws-gold);
        }

        .grid {
          display: grid;
          grid-template-columns: minmax(0, 1.65fr) minmax(300px, 0.85fr);
          gap: 14px;
          margin-bottom: 14px;
        }

        .grid.lower {
          grid-template-columns: 1fr 1fr;
        }

        .panel {
          padding: 23px;
          border: 1px solid var(--ws-border);
          border-radius: 17px;
          background: var(--ws-surface);
          box-shadow: 0 8px 30px rgba(16, 25, 39, 0.03);
        }

        .panel header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 22px;
        }

        h2 {
          margin: 6px 0 0;
          color: var(--ws-text);
          font-size: 19px;
          letter-spacing: -0.025em;
        }

        .panel header > strong {
          color: var(--ws-gold);
          font-size: 17px;
        }

        .chart {
          display: flex;
          align-items: flex-end;
          gap: 10px;
          height: 220px;
          padding-top: 10px;
        }

        .barColumn {
          display: flex;
          flex: 1;
          min-width: 18px;
          height: 100%;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        .barTrack {
          display: flex;
          width: 100%;
          height: 178px;
          align-items: flex-end;
          overflow: hidden;
          border-radius: 7px;
          background: var(--ws-surface-2);
        }

        .bar {
          width: 100%;
          min-height: 7px;
          border-radius: 7px;
          background: linear-gradient(180deg, #edc36a, #b48224);
        }

        .barColumn span {
          max-width: 80px;
          overflow: hidden;
          color: var(--ws-text-secondary);
          font-size: 9px;
          white-space: nowrap;
          text-overflow: ellipsis;
        }

        .empty {
          display: grid;
          min-height: 190px;
          place-content: center;
          text-align: center;
        }

        .empty strong {
          color: var(--ws-text-muted);
          font-size: 28px;
        }

        .empty span,
        .smallEmpty {
          margin-top: 8px;
          color: var(--ws-text-muted);
          font-size: 12px;
        }

        .snapshotRows {
          display: grid;
          gap: 4px;
        }

        .snapshotRows div {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          padding: 15px 0;
          border-bottom: 1px solid var(--ws-border);
        }

        .snapshotRows div:last-child {
          border-bottom: 0;
        }

        .snapshotRows span {
          color: var(--ws-text-secondary);
          font-size: 12px;
        }

        .snapshotRows strong {
          color: var(--ws-text);
          font-size: 15px;
        }

        .ranking {
          display: grid;
        }

        .rank {
          display: grid;
          grid-template-columns: 34px minmax(0, 1fr) auto;
          align-items: center;
          gap: 12px;
          padding: 13px 0;
          border-bottom: 1px solid var(--ws-border);
        }

        .rank:last-child {
          border-bottom: 0;
        }

        .rankNumber {
          color: var(--ws-gold);
          font-size: 11px;
          font-weight: 900;
        }

        .rank div {
          display: grid;
          gap: 3px;
        }

        .rank strong {
          color: var(--ws-text);
          font-size: 13px;
        }

        .rank div span {
          color: var(--ws-text-muted);
          font-size: 10px;
        }

        .rank b {
          color: var(--ws-text);
          font-size: 12px;
        }

        .smallEmpty {
          display: grid;
          min-height: 140px;
          place-content: center;
          text-align: center;
        }

        .paymentPanel {
          margin-bottom: 20px;
        }

        .methods {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 10px;
        }

        .method {
          padding: 16px;
          border: 1px solid var(--ws-border);
          border-radius: 12px;
          background: var(--ws-surface);
        }

        .method div {
          display: grid;
          gap: 4px;
        }

        .method strong {
          color: var(--ws-text);
          font-size: 11px;
          text-transform: capitalize;
        }

        .method span {
          color: var(--ws-text-muted);
          font-size: 9px;
        }

        .method b {
          display: block;
          margin-top: 14px;
          color: var(--ws-gold);
          font-size: 14px;
        }

        @media (max-width: 1050px) {
          .metrics {
            grid-template-columns: repeat(2, 1fr);
          }

          .grid,
          .grid.lower {
            grid-template-columns: 1fr;
          }

          .methods {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 720px) {
          .reports {
            padding: 10px 16px 55px;
          }

          .reportsHero {
            align-items: stretch;
            flex-direction: column;
          }

          .metrics {
            grid-template-columns: 1fr;
          }

          .methods {
            grid-template-columns: 1fr;
          }

          .error {
            align-items: stretch;
            flex-direction: column;
          }
        }
      `}</style>
      </div>
    </WorkspaceShell>
  );
}
