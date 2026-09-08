"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import WorkspaceShell from "@/components/workspace/WorkspaceShell";
import ProviderMyDay from "@/components/workspace/ProviderMyDay";
import {
  amountMinor,
  loadDashboardData,
  resolveActiveWorkspace,
  type ActiveWorkspace,
  type Appointment,
  type OverviewReport,
  type QueueView,
  type RevenueReport,
  type SetupStatus,
  type StaffMember,
} from "@/lib/api/dashboard";

interface DashboardState {
  workspace: ActiveWorkspace;
  appointments?: Appointment[];
  queue?: QueueView;
  staff?: StaffMember[];
  overview?: OverviewReport;
  revenue?: RevenueReport;
  setup?: SetupStatus;
}

function formatMoney(minor: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}

function formatAppointmentTime(value: string) {
  try {
    return new Intl.DateTimeFormat("en-GH", {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function setupProgress(status: SetupStatus) {
  const steps = [
    status.organizationCreated,
    status.firstBranchCreated,
    status.businessProfileConfigured,
    status.serviceCreated,
    status.branchHoursConfigured,
    status.staffInvitationSent,
    status.profilePublicationEligible,
  ];

  const complete = steps.filter(Boolean).length;

  return Math.round((complete / steps.length) * 100);
}

function setupNext(status: SetupStatus) {
  if (!status.businessProfileConfigured) {
    return {
      label: "Complete your business profile",
      href: "/app/settings",
    };
  }

  if (!status.serviceCreated) {
    return {
      label: "Add your first service",
      href: "/app/services",
    };
  }

  if (!status.branchHoursConfigured) {
    return {
      label: "Set your business hours",
      href: "/app/settings",
    };
  }

  if (!status.staffInvitationSent) {
    return {
      label: "Invite your first team member",
      href: "/app/staff",
    };
  }

  if (!status.profilePublicationEligible) {
    return {
      label: "Finish marketplace setup",
      href: "/app/settings",
    };
  }

  return {
    label: "Your Kora setup is ready",
    href: "/app/settings",
  };
}

function buildWeekBars(report: RevenueReport | undefined) {
  const totals = new Map<string, number>();

  for (const bucket of report?.buckets ?? []) {
    totals.set(
      bucket.date,
      (totals.get(bucket.date) ?? 0) + bucket.totalMinor,
    );
  }

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));

    const key = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");

    return {
      key,
      label: new Intl.DateTimeFormat("en", {
        weekday: "short",
      }).format(date),
      value: totals.get(key) ?? 0,
    };
  });

  const max = Math.max(...days.map((day) => day.value), 1);

  return days.map((day) => ({
    ...day,
    height:
      day.value === 0
        ? 8
        : Math.max(12, Math.round((day.value / max) * 100)),
  }));
}

export default function KoraWorkspacePage() {
  const [dashboard, setDashboard] =
    useState<DashboardState | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (manual = false) => {
    if (manual) {
      setRefreshing(true);
    }

    setError("");

    try {
      const workspace = await resolveActiveWorkspace();

      const canLoadBusinessOverview =
        workspace.permissionCodes.includes("reports.read") ||
        workspace.permissionCodes.includes("reports.basic") ||
        workspace.permissionCodes.includes("reports.advanced");

      if (!canLoadBusinessOverview) {
        setDashboard({ workspace });
        return;
      }

      const data = await loadDashboardData(workspace);

      setDashboard({
        workspace,
        ...data,
      });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Kora could not load your dashboard.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [load]);

  const progress = dashboard?.setup
    ? setupProgress(dashboard.setup)
    : 0;

  const nextSetup = dashboard?.setup
    ? setupNext(dashboard.setup)
    : {
        label: "Complete your business setup",
        href: "/app/settings",
      };

  const activeStaff =
    dashboard?.staff?.filter(
      (member) => member.status === "ACTIVE",
    ).length ?? 0;

  const confirmedAppointments =
    dashboard?.appointments?.filter(
      (appointment) =>
        appointment.status === "CONFIRMED",
    ) ?? [];

  const queueCounts = dashboard?.queue?.counts;

  const waiting =
    queueCounts?.waiting ?? 0;

  const inService =
    queueCounts?.inService ??
    queueCounts?.in_service ??
    0;

  const completed =
    queueCounts?.completed ?? 0;

  const currency =
    dashboard?.workspace.currency ?? "GHS";

  const todayRevenue = amountMinor(
    dashboard?.overview?.netPostedRevenue?.length
      ? dashboard.overview!.netPostedRevenue
      : dashboard?.overview?.postedRevenue,
    currency,
  );

  const weekBars = useMemo(
    () => buildWeekBars(dashboard?.revenue),
    [dashboard?.revenue],
  );

  const weekRevenue = dashboard?.revenue?.buckets
    .filter((bucket) => bucket.currency === currency)
    .reduce((sum, bucket) => sum + bucket.totalMinor, 0) ?? 0;

  const upcomingAppointments =
    confirmedAppointments
      .slice()
      .sort(
        (a, b) =>
          new Date(a.startAt).getTime() -
          new Date(b.startAt).getTime(),
      )
      .slice(0, 4);

  const canLoadBusinessOverview =
    dashboard?.workspace.permissionCodes.includes("reports.read") ||
    dashboard?.workspace.permissionCodes.includes("reports.basic") ||
    dashboard?.workspace.permissionCodes.includes("reports.advanced") ||
    false;

  if (
    !loading &&
    !error &&
    dashboard &&
    !canLoadBusinessOverview
  ) {
    return (
      <WorkspaceShell title="My Day">
        <ProviderMyDay workspace={dashboard.workspace} />
      </WorkspaceShell>
    );
  }

  return (
    <WorkspaceShell
      title="Overview"
      actions={
        <>
          <button
            type="button"
            className="workspace-refresh-button"
            onClick={() => void load(true)}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>

          <Link
            href="/app/queue?new=walk-in"
            className="workspace-secondary-button"
          >
            + Add walk-in
          </Link>

          <Link
            href="/app/appointments?new=appointment"
            className="workspace-primary-button"
          >
            New appointment
          </Link>
        </>
      }
    >
          {loading && (
            <div className="workspace-system-state">
              <div className="workspace-spinner" />
              <strong>Loading your Kora workspace</strong>
              <span>
                Syncing appointments, queue, staff and business
                performance…
              </span>
            </div>
          )}

          {!loading && error && (
            <div className="workspace-system-state error">
              <strong>We couldn&apos;t load the dashboard.</strong>
              <span>{error}</span>

              <div className="workspace-state-actions">
                <button
                  type="button"
                  onClick={() => void load(true)}
                >
                  Try again
                </button>

                <Link href="/login">
                  Sign in again
                </Link>
              </div>
            </div>
          )}

          {!loading && !error && dashboard && (
            <>
              <section className="workspace-welcome">
                <div>
                  <span className="workspace-kicker">
                    WELCOME TO KORA
                  </span>

                  <h1>
                    Your business.
                    <br />
                    <em>One clear view.</em>
                  </h1>

                  <p>
                    Track appointments, queues, customers,
                    staff and business performance from one
                    workspace.
                  </p>
                </div>

                <div className="workspace-setup-card">
                  <div className="setup-card-top">
                    <div>
                      <span>SETUP PROGRESS</span>
                      <strong>
                        {progress === 100
                          ? "Your business is ready"
                          : "Keep building your Kora workspace"}
                      </strong>
                    </div>

                    <div className="setup-percent">
                      {progress}%
                    </div>
                  </div>

                  <div className="setup-progress">
                    <i
                      style={{
                        width: `${progress}%`,
                      }}
                    />
                  </div>

                  <div className="setup-next">
                    <span>Next recommended step</span>
                    <strong>{nextSetup.label}</strong>
                    <Link href={nextSetup.href}>
                      Continue setup →
                    </Link>
                  </div>
                </div>
              </section>

              <section className="workspace-metrics">
                <article>
                  <span>Today&apos;s appointments</span>
                  <strong>
                    {confirmedAppointments.length}
                  </strong>
                  <small>
                    {confirmedAppointments.length === 0
                      ? "No confirmed appointments yet"
                      : `${confirmedAppointments.length} confirmed today`}
                  </small>
                </article>

                <article>
                  <span>Live queue</span>
                  <strong>{waiting + inService}</strong>
                  <small>
                    {waiting} waiting · {inService} in service
                  </small>
                </article>

                <article>
                  <span>Today&apos;s revenue</span>
                  <strong>
                    {formatMoney(todayRevenue, currency)}
                  </strong>
                  <small>
                    {dashboard.overview!.transactionCount} posted
                    transaction
                    {dashboard.overview!.transactionCount === 1
                      ? ""
                      : "s"}
                  </small>
                </article>

                <article>
                  <span>Active staff</span>
                  <strong>{activeStaff}</strong>
                  <small>
                    {activeStaff === 1
                      ? "1 active team member"
                      : `${activeStaff} active team members`}
                  </small>
                </article>
              </section>

              <section className="workspace-grid">
                <article className="workspace-panel appointments-panel">
                  <div className="workspace-panel-head">
                    <div>
                      <span>TODAY</span>
                      <h2>Appointments</h2>
                    </div>

                    <Link href="/app/appointments">
                      View all →
                    </Link>
                  </div>

                  {upcomingAppointments.length === 0 ? (
                    <div className="workspace-empty-state">
                      <div>▧</div>
                      <strong>No appointments yet</strong>

                      <p>
                        New appointments will appear here when
                        customers book or when your team creates
                        them.
                      </p>

                      <Link href="/app/appointments?new=appointment">
                        Create appointment
                      </Link>
                    </div>
                  ) : (
                    <div className="dashboard-appointment-list">
                      {upcomingAppointments.map(
                        (appointment) => (
                          <Link
                            key={appointment.id}
                            href={`/app/appointments?id=${appointment.id}`}
                            className="dashboard-appointment-row"
                          >
                            <div className="dashboard-appointment-time">
                              {formatAppointmentTime(
                                appointment.startAt,
                              )}
                            </div>

                            <div className="dashboard-appointment-main">
                              <strong>
                                {appointment.items
                                  .map(
                                    (item) =>
                                      item.serviceName,
                                  )
                                  .join(", ")}
                              </strong>

                              <span>
                                {appointment.providerDisplayName ||
                                  "Assigned provider"}{" "}
                                · {appointment.reference}
                              </span>
                            </div>

                            <div className="dashboard-appointment-price">
                              {formatMoney(
                                appointment.totalPriceMinor,
                                appointment.currency,
                              )}
                            </div>
                          </Link>
                        ),
                      )}
                    </div>
                  )}
                </article>

                <article className="workspace-panel">
                  <div className="workspace-panel-head">
                    <div>
                      <span>LIVE</span>
                      <h2>Queue</h2>
                    </div>

                    <Link href="/app/queue">
                      Open queue →
                    </Link>
                  </div>

                  <div className="queue-summary">
                    <div>
                      <strong>{waiting}</strong>
                      <span>Waiting</span>
                    </div>

                    <div>
                      <strong>{inService}</strong>
                      <span>In service</span>
                    </div>

                    <div>
                      <strong>{completed}</strong>
                      <span>Completed</span>
                    </div>
                  </div>

                  {dashboard.queue!.entries.length === 0 ? (
                    <div className="workspace-empty-small">
                      No queue activity yet today.
                    </div>
                  ) : (
                    <div className="dashboard-live-queue">
                      {dashboard.queue!.entries
                        .filter((entry) =>
                          [
                            "WAITING",
                            "CALLED",
                            "IN_SERVICE",
                          ].includes(entry.status),
                        )
                        .slice(0, 4)
                        .map((entry) => (
                          <Link
                            key={entry.id}
                            href={`/app/queue?id=${entry.id}`}
                          >
                            <b>#{entry.ticketNumber}</b>

                            <div>
                              <strong>
                                {entry.customerName ||
                                  "Walk-in customer"}
                              </strong>

                              <span>
                                {entry.services
                                  .map(
                                    (service) =>
                                      service.serviceName,
                                  )
                                  .join(", ")}
                              </span>
                            </div>

                            <em>
                              {entry.status
                                .replaceAll("_", " ")
                                .toLowerCase()}
                            </em>
                          </Link>
                        ))}
                    </div>
                  )}
                </article>

                <article className="workspace-panel">
                  <div className="workspace-panel-head">
                    <div>
                      <span>BUSINESS</span>
                      <h2>Quick setup</h2>
                    </div>
                  </div>

                  <div className="workspace-quick-links">
                    <Link href="/app/services">
                      <span>01</span>
                      <div>
                        <strong>Add services</strong>
                        <small>
                          Create the services customers can book.
                        </small>
                      </div>
                      <b>→</b>
                    </Link>

                    <Link href="/app/staff">
                      <span>02</span>
                      <div>
                        <strong>Add your team</strong>
                        <small>
                          Invite staff and assign responsibilities.
                        </small>
                      </div>
                      <b>→</b>
                    </Link>

                    <Link href="/app/settings">
                      <span>03</span>
                      <div>
                        <strong>Business settings</strong>
                        <small>
                          Configure hours, bookings and preferences.
                        </small>
                      </div>
                      <b>→</b>
                    </Link>
                  </div>
                </article>

                <article className="workspace-panel">
                  <div className="workspace-panel-head">
                    <div>
                      <span>PERFORMANCE</span>
                      <h2>Revenue</h2>
                    </div>

                    <Link href="/app/reports">
                      Reports →
                    </Link>
<Link href="/app/products">
                      Products & Inventory →
                    </Link>
                  </div>

                  <div className="workspace-chart">
                    <div className="chart-value">
                      <strong>
                        {formatMoney(
                          weekRevenue,
                          currency,
                        )}
                      </strong>
                      <span>Last 7 days</span>
                    </div>

                    <div className="workspace-bars">
                      {weekBars.map((day, index) => (
                        <i
                          key={day.key}
                          className={
                            index === weekBars.length - 1
                              ? "today"
                              : ""
                          }
                          style={{
                            height: `${day.height}%`,
                          }}
                          title={`${day.label}: ${formatMoney(
                            day.value,
                            currency,
                          )}`}
                        />
                      ))}
                    </div>

                    <div className="workspace-days">
                      {weekBars.map((day) => (
                        <span key={day.key}>
                          {day.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </article>
              </section>
            </>
          )}
    </WorkspaceShell>
  );
}
