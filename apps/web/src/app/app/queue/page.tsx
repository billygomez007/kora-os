"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import WorkspaceShell from "@/components/workspace/WorkspaceShell";
import {
  resolveActiveWorkspace,
  type ActiveWorkspace,
  type StaffMember,
} from "@/lib/api/dashboard";
import {
  koraData,
  koraEnvelope,
} from "@/lib/api/kora-api";

type QueueEntryService = {
  serviceId: string;
  serviceName: string;
  displayOrder: number;
};

type QueueEntry = {
  id: string;
  organizationId: string;
  branchId: string;
  businessDate: string;
  ticketNumber: number;
  source: string;
  appointmentId: string | null;
  customerRecordId: string;
  customerName: string;
  customerPhoneE164: string | null;
  status: string;
  priority: string;
  assignedStaffProfileId: string | null;
  notes: string | null;
  joinedAt: string;
  calledAt: string | null;
  serviceStartedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  noShowAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  services: QueueEntryService[];
};

type QueueView = {
  branchId: string;
  businessDate: string;
  revision: number;
  serverTime: string;
  entries: QueueEntry[];
  counts: {
    waiting: number;
    called: number;
    in_service: number;
    completed: number;
    cancelled: number;
    no_show: number;
  };
};

type Customer = {
  id: string;
  name: string;
  phoneE164: string | null;
  email: string | null;
  archivedAt: string | null;
};

type Service = {
  id: string;
  name: string;
  archivedAt?: string | null;
};

type BranchService = {
  serviceId: string;
  isEnabled?: boolean;
};

type ServiceSessionItem = {
  serviceId: string;
  staffProfileId: string;
  serviceName: string;
  durationMinutes: number;
  priceMinor: number;
  currency: string;
  displayOrder: number;
};

type ServiceSession = {
  id: string;
  organizationId: string;
  branchId: string;
  queueEntryId: string;
  appointmentId: string | null;
  customerRecordId: string;
  assignedStaffProfileId: string;
  status: string;
  currency: string;
  serviceTotalMinor: number;
  startedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelDisposition: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  items: ServiceSessionItem[];
};

type CustomerMode = "existing" | "new";

function ticketLabel(ticketNumber: number) {
  return `A${String(ticketNumber).padStart(3, "0")}`;
}

function formatTime(value: string | null) {
  if (!value) return "—";

  try {
    return new Intl.DateTimeFormat("en-GH", {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function minutesWaiting(joinedAt: string, serverTime?: string) {
  const start = new Date(joinedAt).getTime();
  const end = new Date(serverTime || Date.now()).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;

  return Math.max(0, Math.floor((end - start) / 60000));
}

function statusLabel(status: string) {
  switch (status) {
    case "WAITING":
      return "Waiting";
    case "CALLED":
      return "Called";
    case "IN_SERVICE":
      return "In service";
    case "COMPLETED":
      return "Completed";
    case "CANCELLED":
      return "Cancelled";
    case "NO_SHOW":
      return "No show";
    default:
      return status;
  }
}

function activeProviderName(
  staff: StaffMember[],
  staffProfileId: string | null,
) {
  if (!staffProfileId) return "Unassigned";

  const member = staff.find(
    (item) => item.staffProfileId === staffProfileId,
  );

  return (
    member?.displayName ||
    member?.email ||
    "Assigned provider"
  );
}

export default function QueuePage() {
  const [workspace, setWorkspace] =
    useState<ActiveWorkspace | null>(null);

  const [queue, setQueue] = useState<QueueView | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [serviceSessions, setServiceSessions] =
    useState<ServiceSession[]>([]);

  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [statusFilter, setStatusFilter] = useState("ALL");

  const [showWalkIn, setShowWalkIn] = useState(false);
  const [customerMode, setCustomerMode] =
    useState<CustomerMode>("existing");

  const [existingCustomerId, setExistingCustomerId] =
    useState("");

  const [newCustomerName, setNewCustomerName] =
    useState("");
  const [newCustomerPhone, setNewCustomerPhone] =
    useState("");
  const [newCustomerEmail, setNewCustomerEmail] =
    useState("");

  const [selectedServiceIds, setSelectedServiceIds] =
    useState<string[]>([]);
  const [walkInNotes, setWalkInNotes] = useState("");

  const [selectedEntry, setSelectedEntry] =
    useState<QueueEntry | null>(null);
  const [assignStaffId, setAssignStaffId] =
    useState("");

  const load = useCallback(async () => {
    setError("");

    try {
      const active = await resolveActiveWorkspace();

      const [
        queueData,
        customerData,
        serviceData,
        branchServiceData,
        staffData,
      ] = await Promise.all([
        koraData<QueueView>(
          `/organizations/${active.organizationId}/branches/${active.branchId}/queue`,
        ),
        koraData<Customer[]>(
          `/organizations/${active.organizationId}/customers`,
        ),
        koraData<Service[]>(
          `/organizations/${active.organizationId}/services`,
        ),
        koraData<BranchService[]>(
          `/organizations/${active.organizationId}/branches/${active.branchId}/services`,
        ),
        koraData<StaffMember[]>(
          `/organizations/${active.organizationId}/staff`,
        ),
      ]);

      const enabledServiceIds = new Set(
        branchServiceData
          .filter((item) => item.isEnabled !== false)
          .map((item) => item.serviceId),
      );

      setWorkspace(active);
      setQueue(queueData);
      setCustomers(
        customerData.filter((item) => !item.archivedAt),
      );
      setServices(
        serviceData.filter(
          (item) =>
            !item.archivedAt &&
            enabledServiceIds.has(item.id),
        ),
      );
      setStaff(
        staffData.filter(
          (item) =>
            item.status === "ACTIVE" &&
            Boolean(item.staffProfileId),
        ),
      );

      try {
        const sessionQuery = new URLSearchParams({
          branchId: active.branchId,
          status: "IN_PROGRESS",
          limit: "100",
        });

        const sessionEnvelope =
          await koraEnvelope<ServiceSession[]>(
            `/organizations/${active.organizationId}/service-sessions?${sessionQuery.toString()}`,
          );

        setServiceSessions(sessionEnvelope.data ?? []);
      } catch {
        // Queue remains usable for roles that can operate the queue
        // but do not have service_sessions.read permission.
        setServiceSessions([]);
      }

      setSelectedEntry((current) => {
        if (!current) return current;

        return (
          queueData.entries.find(
            (item) => item.id === current.id,
          ) ?? null
        );
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load today's queue.",
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

  useEffect(() => {
    const timer = window.setInterval(() => {
      void load();
    }, 15000);

    return () => window.clearInterval(timer);
  }, [load]);

  const visibleEntries = useMemo(() => {
    if (!queue) return [];

    if (statusFilter === "ALL") {
      return queue.entries;
    }

    return queue.entries.filter(
      (entry) => entry.status === statusFilter,
    );
  }, [queue, statusFilter]);

  const providers = useMemo(
    () =>
      staff.filter(
        (member) => Boolean(member.staffProfileId),
      ),
    [staff],
  );

  const activeSessionByQueueEntry = useMemo(() => {
    const map = new Map<string, ServiceSession>();

    for (const session of serviceSessions) {
      if (session.status === "IN_PROGRESS") {
        map.set(session.queueEntryId, session);
      }
    }

    return map;
  }, [serviceSessions]);

  function resetWalkInForm() {
    setCustomerMode("existing");
    setExistingCustomerId("");
    setNewCustomerName("");
    setNewCustomerPhone("");
    setNewCustomerEmail("");
    setSelectedServiceIds([]);
    setWalkInNotes("");
  }

  function toggleService(serviceId: string) {
    setSelectedServiceIds((current) =>
      current.includes(serviceId)
        ? current.filter((id) => id !== serviceId)
        : [...current, serviceId],
    );
  }

  async function createWalkIn(event: FormEvent) {
    event.preventDefault();

    if (!workspace || selectedServiceIds.length === 0) {
      return;
    }

    if (
      customerMode === "existing" &&
      !existingCustomerId
    ) {
      setError("Select a customer for this walk-in.");
      return;
    }

    if (
      customerMode === "new" &&
      !newCustomerName.trim()
    ) {
      setError("Enter the customer's name.");
      return;
    }

    setWorkingId("walk-in");
    setError("");
    setNotice("");

    try {
      const payload =
        customerMode === "existing"
          ? {
              customerRecordId: existingCustomerId,
              serviceIds: selectedServiceIds,
              ...(walkInNotes.trim()
                ? { notes: walkInNotes.trim() }
                : {}),
            }
          : {
              newCustomer: {
                name: newCustomerName.trim(),
                ...(newCustomerPhone.trim()
                  ? {
                      phoneE164:
                        newCustomerPhone.trim(),
                    }
                  : {}),
                ...(newCustomerEmail.trim()
                  ? {
                      email:
                        newCustomerEmail
                          .trim()
                          .toLowerCase(),
                    }
                  : {}),
              },
              serviceIds: selectedServiceIds,
              ...(walkInNotes.trim()
                ? { notes: walkInNotes.trim() }
                : {}),
            };

      await koraData<QueueEntry>(
        `/organizations/${workspace.organizationId}/branches/${workspace.branchId}/queue/walk-ins`,
        {
          method: "POST",
          headers: {
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify(payload),
        },
      );

      setShowWalkIn(false);
      resetWalkInForm();
      setNotice("Walk-in added to today's queue.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to add walk-in.",
      );
    } finally {
      setWorkingId("");
    }
  }

  async function runEntryAction(
    entry: QueueEntry,
    action:
      | "call"
      | "return-to-waiting"
      | "no-show",
  ) {
    if (!workspace) return;

    setWorkingId(entry.id);
    setError("");
    setNotice("");

    try {
      await koraData<QueueEntry>(
        `/organizations/${workspace.organizationId}/queue-entries/${entry.id}/${action}`,
        {
          method: "POST",
        },
      );

      setNotice(
        action === "call"
          ? `${entry.customerName} has been called.`
          : action === "return-to-waiting"
            ? `${entry.customerName} returned to waiting.`
            : `${entry.customerName} marked as no-show.`,
      );

      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to update queue entry.",
      );
    } finally {
      setWorkingId("");
    }
  }

  async function assignProvider() {
    if (
      !workspace ||
      !selectedEntry ||
      !assignStaffId
    ) {
      return;
    }

    setWorkingId(selectedEntry.id);
    setError("");
    setNotice("");

    try {
      await koraData<QueueEntry>(
        `/organizations/${workspace.organizationId}/queue-entries/${selectedEntry.id}/assign`,
        {
          method: "POST",
          body: JSON.stringify({
            staffProfileId: assignStaffId,
          }),
        },
      );

      setNotice("Provider assigned successfully.");
      setAssignStaffId("");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to assign provider.",
      );
    } finally {
      setWorkingId("");
    }
  }

  async function startService(entry: QueueEntry) {
    if (!workspace) return;

    if (!entry.assignedStaffProfileId) {
      setError(
        "Assign a provider before starting the service.",
      );
      return;
    }

    setWorkingId(entry.id);
    setError("");
    setNotice("");

    try {
      const session = await koraData<ServiceSession>(
        `/organizations/${workspace.organizationId}/queue-entries/${entry.id}/start-service`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      );

      setServiceSessions((current) => [
        ...current.filter(
          (item) => item.queueEntryId !== entry.id,
        ),
        session,
      ]);

      setNotice(
        `Service started for ${entry.customerName}.`,
      );

      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to start service.",
      );
    } finally {
      setWorkingId("");
    }
  }

  async function completeService(entry: QueueEntry) {
    if (!workspace) return;

    const session =
      activeSessionByQueueEntry.get(entry.id);

    if (!session) {
      setError(
        "Kora could not find the active service session for this queue entry. Refresh the queue and try again.",
      );
      return;
    }

    setWorkingId(entry.id);
    setError("");
    setNotice("");

    try {
      await koraData<ServiceSession>(
        `/organizations/${workspace.organizationId}/service-sessions/${session.id}/complete`,
        {
          method: "POST",
        },
      );

      setServiceSessions((current) =>
        current.filter((item) => item.id !== session.id),
      );

      setNotice(
        `Service completed for ${entry.customerName}.`,
      );

      setSelectedEntry(null);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to complete service.",
      );
    } finally {
      setWorkingId("");
    }
  }

  async function cancelEntry(entry: QueueEntry) {
    if (!workspace) return;

    const reason =
      window.prompt(
        "Optional cancellation reason:",
        "",
      ) ?? null;

    if (reason === null) return;

    setWorkingId(entry.id);
    setError("");
    setNotice("");

    try {
      await koraData<QueueEntry>(
        `/organizations/${workspace.organizationId}/queue-entries/${entry.id}/cancel`,
        {
          method: "POST",
          body: JSON.stringify({
            ...(reason.trim()
              ? { reason: reason.trim() }
              : {}),
          }),
        },
      );

      setNotice(`${entry.customerName} removed from queue.`);
      setSelectedEntry(null);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to cancel queue entry.",
      );
    } finally {
      setWorkingId("");
    }
  }

  return (
    <WorkspaceShell
      title="Queue"
      actions={
        <>
          <button
            type="button"
            className="workspace-secondary-button"
            onClick={() => void load()}
          >
            Refresh
          </button>

          <button
            type="button"
            className="workspace-primary-button"
            onClick={() => {
              resetWalkInForm();
              setShowWalkIn(true);
            }}
          >
            + Add walk-in
          </button>
        </>
      }
    >
      <div className="queue-page">
      <section className="queue-hero">
        <div>
          <span className="queue-eyebrow">
            LIVE FRONT DESK
          </span>

          <h1>Queue</h1>

          <p>
            Run today&apos;s front desk from one live
            operational board.
          </p>

          <div className="queue-context">
            <span>
              {workspace?.branchName || "Loading branch"}
            </span>
            <span>•</span>
            <span>
              {queue?.businessDate || "Today"}
            </span>
            <span>•</span>
            <span>
              {queue
                ? `Updated ${formatTime(queue.serverTime)}`
                : "Loading"}
            </span>
          </div>
        </div>
      </section>

      {error ? (
        <div className="queue-alert error">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="queue-alert success">
          {notice}
        </div>
      ) : null}

      <section className="queue-flow-guide">
        <div className="queue-flow-copy">
          <span className="queue-eyebrow">TODAY&apos;S SERVICE FLOW</span>
          <h2>From arrival to completion</h2>
          <p>
            Kora moves every customer through the same operational journey.
          </p>
        </div>

        <div className="queue-flow-steps">
          <div>
            <span>1</span>
            <strong>Add walk-in</strong>
            <small>Customer joins queue</small>
          </div>

          <b>→</b>

          <div>
            <span>2</span>
            <strong>Assign provider</strong>
            <small>Choose who will serve</small>
          </div>

          <b>→</b>

          <div>
            <span>3</span>
            <strong>Start service</strong>
            <small>Moves to In service</small>
          </div>

          <b>→</b>

          <div>
            <span>4</span>
            <strong>Complete</strong>
            <small>Finish the service</small>
          </div>

          <b>→</b>

          <div>
            <span>5</span>
            <strong>Checkout</strong>
            <small>Payment comes next</small>
          </div>
        </div>
      </section>

      <section className="queue-metrics">
        <button
          onClick={() => setStatusFilter("WAITING")}
          className={
            statusFilter === "WAITING"
              ? "active"
              : ""
          }
        >
          <span>Waiting</span>
          <strong>{queue?.counts.waiting ?? 0}</strong>
        </button>

        <button
          onClick={() => setStatusFilter("CALLED")}
          className={
            statusFilter === "CALLED"
              ? "active"
              : ""
          }
        >
          <span>Called</span>
          <strong>{queue?.counts.called ?? 0}</strong>
        </button>

        <button
          onClick={() =>
            setStatusFilter("IN_SERVICE")
          }
          className={
            statusFilter === "IN_SERVICE"
              ? "active"
              : ""
          }
        >
          <span>In service</span>
          <strong>
            {queue?.counts.in_service ?? 0}
          </strong>
        </button>

        <button
          onClick={() =>
            setStatusFilter("COMPLETED")
          }
          className={
            statusFilter === "COMPLETED"
              ? "active"
              : ""
          }
        >
          <span>Completed</span>
          <strong>
            {queue?.counts.completed ?? 0}
          </strong>
        </button>
      </section>

      <section className="queue-board">
        <div className="queue-board-head">
          <div>
            <h2>Today&apos;s queue</h2>
            <p>
              {visibleEntries.length} customer
              {visibleEntries.length === 1 ? "" : "s"} shown
            </p>
          </div>

          <div className="queue-filter">
            <button
              onClick={() => setStatusFilter("ALL")}
              className={
                statusFilter === "ALL" ? "active" : ""
              }
            >
              All
            </button>
            <button
              onClick={() =>
                setStatusFilter("WAITING")
              }
            >
              Waiting
            </button>
            <button
              onClick={() =>
                setStatusFilter("CALLED")
              }
            >
              Called
            </button>
            <button
              onClick={() =>
                setStatusFilter("IN_SERVICE")
              }
            >
              In service
            </button>
          </div>
        </div>

        {loading ? (
          <div className="queue-empty">
            <div className="queue-empty-icon">Q</div>
            <h3>Loading today&apos;s queue</h3>
            <p>
              Kora is bringing your front desk together.
            </p>
          </div>
        ) : visibleEntries.length === 0 ? (
          <div className="queue-empty">
            <div className="queue-empty-icon">◎</div>
            <h3>
              {statusFilter === "ALL"
                ? "The queue is clear"
                : `No ${statusLabel(
                    statusFilter,
                  ).toLowerCase()} customers`}
            </h3>
            <p>
              Add a walk-in or check in a confirmed
              appointment to start today&apos;s queue.
            </p>

            <button
              className="queue-primary"
              onClick={() => setShowWalkIn(true)}
            >
              ＋ Add walk-in
            </button>
          </div>
        ) : (
          <div className="queue-list">
            {visibleEntries.map((entry) => (
              <article
                key={entry.id}
                className={`queue-row queue-${entry.status.toLowerCase()}`}
                onClick={() => {
                  setSelectedEntry(entry);
                  setAssignStaffId(
                    entry.assignedStaffProfileId || "",
                  );
                }}
              >
                <div className="queue-ticket">
                  <span>Ticket</span>
                  <strong>
                    {ticketLabel(entry.ticketNumber)}
                  </strong>
                </div>

                <div className="queue-customer">
                  <strong>{entry.customerName}</strong>
                  <span>
                    {entry.customerPhoneE164 ||
                      "No phone"}
                  </span>
                </div>

                <div className="queue-services">
                  {entry.services.map((service) => (
                    <span key={service.serviceId}>
                      {service.serviceName}
                    </span>
                  ))}
                </div>

                <div className="queue-provider">
                  <span>Provider</span>
                  <strong>
                    {activeProviderName(
                      staff,
                      entry.assignedStaffProfileId,
                    )}
                  </strong>
                </div>

                <div className="queue-wait">
                  <span>Wait</span>
                  <strong>
                    {entry.status === "WAITING" ||
                    entry.status === "CALLED"
                      ? `${minutesWaiting(
                          entry.joinedAt,
                          queue?.serverTime,
                        )} min`
                      : "—"}
                  </strong>
                </div>

                <div>
                  <span
                    className={`queue-status queue-status-${entry.status.toLowerCase()}`}
                  >
                    {statusLabel(entry.status)}
                  </span>
                </div>

                <div
                  className="queue-row-actions"
                  onClick={(event) =>
                    event.stopPropagation()
                  }
                >
                  {entry.status === "WAITING" ? (
                    <button
                      disabled={
                        workingId === entry.id
                      }
                      onClick={() =>
                        void runEntryAction(
                          entry,
                          "call",
                        )
                      }
                    >
                      Call
                    </button>
                  ) : null}

                  {entry.status === "CALLED" ? (
                    <button
                      disabled={
                        workingId === entry.id
                      }
                      onClick={() =>
                        void runEntryAction(
                          entry,
                          "return-to-waiting",
                        )
                      }
                    >
                      Return
                    </button>
                  ) : null}

                  {["WAITING", "CALLED"].includes(
                    entry.status,
                  ) ? (
                    <button
                      disabled={
                        workingId === entry.id ||
                        !entry.assignedStaffProfileId
                      }
                      title={
                        entry.assignedStaffProfileId
                          ? "Start service"
                          : "Assign a provider first"
                      }
                      onClick={() =>
                        void startService(entry)
                      }
                    >
                      Start
                    </button>
                  ) : null}

                  {entry.status === "IN_SERVICE" ? (
                    <button
                      disabled={
                        workingId === entry.id ||
                        !activeSessionByQueueEntry.has(entry.id)
                      }
                      title={
                        activeSessionByQueueEntry.has(entry.id)
                          ? "Complete service"
                          : "Active service session is still loading"
                      }
                      onClick={() =>
                        void completeService(entry)
                      }
                    >
                      Complete
                    </button>
                  ) : null}

                  <button
                    className="queue-more"
                    onClick={() => {
                      setSelectedEntry(entry);
                      setAssignStaffId(
                        entry.assignedStaffProfileId ||
                          "",
                      );
                    }}
                  >
                    •••
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {showWalkIn ? (
        <div className="queue-overlay">
          <section className="queue-modal">
            <div className="queue-modal-head">
              <div>
                <span className="queue-eyebrow">
                  FRONT DESK INTAKE
                </span>
                <h2>Add walk-in</h2>
                <p>
                  Add a customer directly to today&apos;s
                  live queue.
                </p>
              </div>

              <button
                className="queue-close"
                onClick={() => setShowWalkIn(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={createWalkIn}>
              <div className="queue-mode-tabs">
                <button
                  type="button"
                  className={
                    customerMode === "existing"
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    setCustomerMode("existing")
                  }
                >
                  Existing customer
                </button>

                <button
                  type="button"
                  className={
                    customerMode === "new"
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    setCustomerMode("new")
                  }
                >
                  New customer
                </button>
              </div>

              {customerMode === "existing" ? (
                <label>
                  Customer
                  <select
                    required
                    value={existingCustomerId}
                    onChange={(event) =>
                      setExistingCustomerId(
                        event.target.value,
                      )
                    }
                  >
                    <option value="">
                      Select customer
                    </option>

                    {customers.map((customer) => (
                      <option
                        key={customer.id}
                        value={customer.id}
                      >
                        {customer.name}
                        {customer.phoneE164
                          ? ` — ${customer.phoneE164}`
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <>
                  <label>
                    Customer name
                    <input
                      required
                      value={newCustomerName}
                      onChange={(event) =>
                        setNewCustomerName(
                          event.target.value,
                        )
                      }
                      placeholder="e.g. Ama Mensah"
                    />
                  </label>

                  <div className="queue-form-row">
                    <label>
                      Phone
                      <input
                        value={newCustomerPhone}
                        onChange={(event) =>
                          setNewCustomerPhone(
                            event.target.value,
                          )
                        }
                        placeholder="+233..."
                      />
                    </label>

                    <label>
                      Email
                      <input
                        type="email"
                        value={newCustomerEmail}
                        onChange={(event) =>
                          setNewCustomerEmail(
                            event.target.value,
                          )
                        }
                        placeholder="customer@example.com"
                      />
                    </label>
                  </div>
                </>
              )}

              <fieldset>
                <legend>Services</legend>

                <div className="queue-service-grid">
                  {services.length === 0 ? (
                    <p className="queue-muted">
                      No enabled services are available at
                      this branch yet.
                    </p>
                  ) : (
                    services.map((service) => (
                      <label
                        key={service.id}
                        className={
                          selectedServiceIds.includes(
                            service.id,
                          )
                            ? "queue-service-option active"
                            : "queue-service-option"
                        }
                      >
                        <input
                          type="checkbox"
                          checked={selectedServiceIds.includes(
                            service.id,
                          )}
                          onChange={() =>
                            toggleService(service.id)
                          }
                        />
                        <span>{service.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </fieldset>

              <label>
                Notes
                <textarea
                  value={walkInNotes}
                  onChange={(event) =>
                    setWalkInNotes(event.target.value)
                  }
                  placeholder="Optional front-desk notes..."
                  maxLength={500}
                />
              </label>

              <div className="queue-modal-actions">
                <button
                  type="button"
                  className="queue-secondary"
                  onClick={() =>
                    setShowWalkIn(false)
                  }
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="queue-primary"
                  disabled={
                    workingId === "walk-in" ||
                    selectedServiceIds.length === 0
                  }
                >
                  {workingId === "walk-in"
                    ? "Adding..."
                    : "Add to queue"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {selectedEntry ? (
        <div
          className="queue-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedEntry(null);
            }
          }}
        >
          <aside className="queue-drawer">
            <div className="queue-drawer-head">
              <div>
                <span className="queue-eyebrow">
                  {ticketLabel(
                    selectedEntry.ticketNumber,
                  )}
                </span>
                <h2>{selectedEntry.customerName}</h2>
                <p>
                  Joined{" "}
                  {formatTime(selectedEntry.joinedAt)}
                </p>
              </div>

              <button
                className="queue-close"
                onClick={() =>
                  setSelectedEntry(null)
                }
              >
                ×
              </button>
            </div>

            <div className="queue-detail-status">
              <span
                className={`queue-status queue-status-${selectedEntry.status.toLowerCase()}`}
              >
                {statusLabel(selectedEntry.status)}
              </span>

              <span>
                {selectedEntry.source === "APPOINTMENT"
                  ? "Appointment check-in"
                  : "Walk-in"}
              </span>
            </div>

            <section className="queue-detail-section">
              <span className="queue-detail-label">
                SERVICES
              </span>

              <div className="queue-detail-services">
                {selectedEntry.services.map(
                  (service) => (
                    <div key={service.serviceId}>
                      {service.serviceName}
                    </div>
                  ),
                )}
              </div>
            </section>

            <section className="queue-detail-section">
              <span className="queue-detail-label">
                ASSIGNED PROVIDER
              </span>

              <select
                value={assignStaffId}
                disabled={
                  !["WAITING", "CALLED"].includes(
                    selectedEntry.status,
                  )
                }
                onChange={(event) =>
                  setAssignStaffId(
                    event.target.value,
                  )
                }
              >
                <option value="">
                  Select provider
                </option>

                {providers.map((member) => (
                  <option
                    key={member.staffProfileId!}
                    value={member.staffProfileId!}
                  >
                    {member.displayName ||
                      member.email ||
                      "Kora team member"}
                  </option>
                ))}
              </select>

              {["WAITING", "CALLED"].includes(
                selectedEntry.status,
              ) && !selectedEntry.assignedStaffProfileId ? (
                <p className="queue-action-help">
                  Select and assign a provider before starting this service.
                </p>
              ) : null}

              {["WAITING", "CALLED"].includes(
                selectedEntry.status,
              ) ? (
                <button
                  className="queue-primary full"
                  disabled={
                    !assignStaffId ||
                    workingId === selectedEntry.id
                  }
                  onClick={() =>
                    void assignProvider()
                  }
                >
                  Assign provider
                </button>
              ) : null}
            </section>

            {selectedEntry.notes ? (
              <section className="queue-detail-section">
                <span className="queue-detail-label">
                  NOTES
                </span>
                <p className="queue-detail-note">
                  {selectedEntry.notes}
                </p>
              </section>
            ) : null}

            <section className="queue-detail-section">
              <span className="queue-detail-label">
                FRONT DESK ACTIONS
              </span>

              <div className="queue-command-grid">
                {selectedEntry.status ===
                "WAITING" ? (
                  <button
                    onClick={() =>
                      void runEntryAction(
                        selectedEntry,
                        "call",
                      )
                    }
                  >
                    Call customer
                  </button>
                ) : null}

                {selectedEntry.status ===
                "CALLED" ? (
                  <button
                    onClick={() =>
                      void runEntryAction(
                        selectedEntry,
                        "return-to-waiting",
                      )
                    }
                  >
                    Return to waiting
                  </button>
                ) : null}

                {["WAITING", "CALLED"].includes(
                  selectedEntry.status,
                ) ? (
                  <button
                    className="primary-command"
                    disabled={
                      workingId === selectedEntry.id ||
                      !selectedEntry.assignedStaffProfileId
                    }
                    title={
                      selectedEntry.assignedStaffProfileId
                        ? "Start service"
                        : "Assign a provider first"
                    }
                    onClick={() =>
                      void startService(selectedEntry)
                    }
                  >
                    Start service
                  </button>
                ) : null}

                {selectedEntry.status === "IN_SERVICE" ? (
                  <button
                    className="primary-command"
                    disabled={
                      workingId === selectedEntry.id ||
                      !activeSessionByQueueEntry.has(selectedEntry.id)
                    }
                    title={
                      activeSessionByQueueEntry.has(selectedEntry.id)
                        ? "Complete service"
                        : "Active service session is still loading"
                    }
                    onClick={() =>
                      void completeService(
                        selectedEntry,
                      )
                    }
                  >
                    Complete service
                  </button>
                ) : null}

                {["WAITING", "CALLED"].includes(
                  selectedEntry.status,
                ) ? (
                  <button
                    onClick={() =>
                      void runEntryAction(
                        selectedEntry,
                        "no-show",
                      )
                    }
                  >
                    Mark no-show
                  </button>
                ) : null}

                {["WAITING", "CALLED"].includes(
                  selectedEntry.status,
                ) ? (
                  <button
                    className="danger"
                    onClick={() =>
                      void cancelEntry(selectedEntry)
                    }
                  >
                    Cancel entry
                  </button>
                ) : null}
              </div>
            </section>

            <section className="queue-detail-section">
              <span className="queue-detail-label">
                TIMELINE
              </span>

              <div className="queue-timeline">
                <div>
                  <span>Joined</span>
                  <strong>
                    {formatTime(
                      selectedEntry.joinedAt,
                    )}
                  </strong>
                </div>
                <div>
                  <span>Called</span>
                  <strong>
                    {formatTime(
                      selectedEntry.calledAt,
                    )}
                  </strong>
                </div>
                <div>
                  <span>Service started</span>
                  <strong>
                    {formatTime(
                      selectedEntry.serviceStartedAt,
                    )}
                  </strong>
                </div>
                <div>
                  <span>Completed</span>
                  <strong>
                    {formatTime(
                      selectedEntry.completedAt,
                    )}
                  </strong>
                </div>
              </div>
            </section>
          </aside>
        </div>
      ) : null}

      <style jsx>{`
        .queue-page {
          max-width: 1500px;
          margin: 0 auto;
          padding: 38px 42px 70px;
          color: var(--ws-text);
        }

        .queue-hero {
          display: flex;
          justify-content: space-between;
          gap: 24px;
          align-items: flex-end;
          margin-bottom: 26px;
        }

        .queue-eyebrow,
        .queue-detail-label {
          color: var(--ws-gold);
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.16em;
        }

        .queue-hero h1 {
          margin: 6px 0 8px;
          font-size: clamp(36px, 5vw, 56px);
          letter-spacing: -0.05em;
          color: var(--ws-text);
        }

        .queue-hero p {
          margin: 0;
          color: var(--ws-text);
          line-height: 1.6;
        }

        .queue-context {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 14px;
          color: var(--ws-text-secondary);
          font-size: 11px;
        }

        .queue-primary,
        .queue-secondary,
        .queue-row-actions button,
        .queue-command-grid button {
          border: 0;
          border-radius: 11px;
          min-height: 42px;
          padding: 0 16px;
          font-weight: 800;
          cursor: pointer;
        }

        .queue-primary {
          background: linear-gradient(
            135deg,
            #f1cb5d,
            #c79821
          );
          color: #101820;
          box-shadow: 0 10px 28px
            rgba(185, 139, 27, 0.18);
        }

        .queue-primary.full {
          width: 100%;
          margin-top: 10px;
        }

        .queue-secondary {
          border: 1px solid var(--ws-border-strong);
          background: var(--ws-surface-2);
          color: var(--ws-text);
        }

        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .queue-alert {
          margin-bottom: 16px;
          padding: 13px 15px;
          border-radius: 11px;
          font-size: 13px;
        }

        .queue-alert.error {
          border: 1px solid rgba(255, 128, 128, 0.25);
          background: var(--ws-error-soft);
          color: var(--ws-error);
        }

        .queue-alert.success {
          border: 1px solid rgba(61, 220, 132, 0.3);
          background: var(--ws-success-soft);
          color: var(--ws-success);
        }

        .queue-flow-guide {
          margin-bottom: 18px;
          padding: 20px;
          border: 1px solid var(--ws-border);
          border-radius: 17px;
          background:
            linear-gradient(135deg, #111f2f 0%, #172b3e 100%);
          color: var(--ws-text-muted);
          box-shadow: 0 12px 34px rgba(13, 27, 40, 0.11);
        }

        .queue-flow-copy {
          margin-bottom: 17px;
        }

        .queue-flow-copy h2 {
          margin: 5px 0 4px;
          font-size: 18px;
          color: var(--ws-text-muted);
        }

        .queue-flow-copy p {
          margin: 0;
          color: rgba(255, 255, 255, 0.62);
          font-size: 11px;
        }

        .queue-flow-steps {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .queue-flow-steps > div {
          flex: 1;
          min-height: 82px;
          padding: 13px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.045);
        }

        .queue-flow-steps > div > span {
          width: 24px;
          height: 24px;
          display: grid;
          place-items: center;
          margin-bottom: 8px;
          border-radius: 8px;
          background: linear-gradient(135deg, #f1ca5c, #c79720);
          color: #101820;
          font-size: 10px;
          font-weight: 900;
        }

        .queue-flow-steps strong {
          display: block;
          color: var(--ws-text-muted);
          font-size: 11px;
        }

        .queue-flow-steps small {
          display: block;
          margin-top: 4px;
          color: rgba(255, 255, 255, 0.48);
          font-size: 9px;
        }

        .queue-flow-steps b {
          color: var(--ws-gold);
          font-size: 15px;
        }

        .queue-action-help {
          margin: 8px 0 0;
          color: var(--ws-gold);
          font-size: 10px;
          line-height: 1.5;
        }

        .queue-metrics {
          display: grid;
          grid-template-columns:
            repeat(4, minmax(0, 1fr));
          gap: 14px;
          margin-bottom: 18px;
        }

        .queue-metrics button {
          display: flex;
          align-items: center;
          justify-content: space-between;
          min-height: 86px;
          padding: 18px 20px;
          border: 1px solid var(--ws-border);
          border-radius: 16px;
          background: var(--ws-surface);
          color: var(--ws-text);
          cursor: pointer;
          box-shadow: 0 7px 26px
            rgba(14, 26, 38, 0.035);
        }

        .queue-metrics button.active {
          border-color: #d2a63d;
          box-shadow: 0 0 0 3px
            rgba(210, 166, 61, 0.08);
        }

        .queue-metrics strong {
          color: var(--ws-text);
          font-size: 29px;
        }

        .queue-board {
          overflow: hidden;
          border: 1px solid var(--ws-border);
          border-radius: 18px;
          background: var(--ws-surface);
          box-shadow: 0 12px 40px
            rgba(14, 26, 38, 0.045);
        }

        .queue-board-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          padding: 20px;
          border-bottom: 1px solid var(--ws-border);
        }

        .queue-board-head h2 {
          margin: 0;
          color: var(--ws-text);
          font-size: 17px;
        }

        .queue-board-head p {
          margin: 4px 0 0;
          color: var(--ws-text-secondary);
          font-size: 11px;
        }

        .queue-filter {
          display: flex;
          gap: 5px;
          padding: 4px;
          border-radius: 10px;
          background: var(--ws-surface-2);
        }

        .queue-filter button {
          border: 0;
          border-radius: 8px;
          padding: 7px 10px;
          background: transparent;
          color: var(--ws-text-secondary);
          font-size: 11px;
          cursor: pointer;
        }

        .queue-filter button.active {
          background: var(--ws-surface-hover);
          color: var(--ws-text);
          box-shadow: 0 2px 8px
            rgba(0, 0, 0, 0.2);
        }

        .queue-list {
          display: flex;
          flex-direction: column;
        }

        .queue-row {
          display: grid;
          grid-template-columns:
            90px minmax(150px, 1.3fr)
            minmax(180px, 1.5fr)
            minmax(140px, 1fr)
            70px 100px 120px;
          gap: 15px;
          align-items: center;
          padding: 17px 20px;
          border-top: 1px solid var(--ws-border);
          cursor: pointer;
          transition: background 0.15s ease;
        }

        .queue-row:hover {
          background: var(--ws-surface-2);
        }

        .queue-ticket span,
        .queue-provider span,
        .queue-wait span {
          display: block;
          margin-bottom: 4px;
          color: var(--ws-text-secondary);
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .queue-ticket strong {
          color: var(--ws-gold);
          font-size: 16px;
        }

        .queue-customer strong,
        .queue-provider strong,
        .queue-wait strong {
          display: block;
          color: var(--ws-text);
          font-size: 12px;
        }

        .queue-customer span {
          display: block;
          margin-top: 4px;
          color: var(--ws-text-secondary);
          font-size: 10px;
        }

        .queue-services {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
        }

        .queue-services span {
          padding: 5px 8px;
          border-radius: 999px;
          background: var(--ws-surface-2);
          color: var(--ws-text);
          font-size: 10px;
        }

        .queue-status {
          display: inline-flex;
          border-radius: 999px;
          padding: 6px 9px;
          font-size: 9px;
          font-weight: 900;
          white-space: nowrap;
        }

        .queue-status-waiting {
          background: var(--ws-gold-soft);
          color: var(--ws-gold);
        }

        .queue-status-called {
          background: var(--ws-info-soft);
          color: var(--ws-info);
        }

        .queue-status-in_service {
          background: var(--ws-info-soft);
          color: var(--ws-info);
        }

        .queue-status-completed {
          background: var(--ws-success-soft);
          color: var(--ws-success);
        }

        .queue-status-cancelled,
        .queue-status-no_show {
          background: var(--ws-surface-2);
          color: var(--ws-text-secondary);
        }

        .queue-row-actions {
          display: flex;
          justify-content: flex-end;
          gap: 5px;
        }

        .queue-row-actions button {
          min-height: 34px;
          padding: 0 10px;
          border: 1px solid var(--ws-border-strong);
          background: var(--ws-surface-2);
          color: var(--ws-text);
          font-size: 10px;
        }

        .queue-more {
          min-width: 36px;
        }

        .queue-empty {
          min-height: 390px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 35px;
          text-align: center;
        }

        .queue-empty-icon {
          width: 64px;
          height: 64px;
          display: grid;
          place-items: center;
          margin-bottom: 17px;
          border-radius: 20px;
          background: var(--ws-gold-soft);
          color: var(--ws-gold);
          font-weight: 900;
          font-size: 21px;
        }

        .queue-empty h3 {
          margin: 0 0 7px;
          color: var(--ws-text);
        }

        .queue-empty p {
          max-width: 450px;
          margin: 0 0 20px;
          color: var(--ws-text-secondary);
          line-height: 1.6;
          font-size: 13px;
        }

        .queue-overlay {
          position: fixed;
          inset: 0;
          z-index: 90;
          display: grid;
          place-items: center;
          padding: 20px;
          background: rgba(8, 16, 25, 0.48);
          backdrop-filter: blur(5px);
        }

        .queue-modal {
          width: min(680px, 100%);
          max-height: 92vh;
          overflow-y: auto;
          padding: 28px;
          border-radius: 20px;
          background: var(--ws-surface);
          box-shadow: 0 30px 90px
            rgba(8, 16, 25, 0.3);
        }

        .queue-modal-head,
        .queue-drawer-head {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          align-items: flex-start;
        }

        .queue-modal-head {
          margin-bottom: 22px;
        }

        .queue-modal-head h2,
        .queue-drawer-head h2 {
          margin: 5px 0 4px;
          color: var(--ws-text);
          font-size: 25px;
        }

        .queue-modal-head p,
        .queue-drawer-head p {
          margin: 0;
          color: var(--ws-text-secondary);
          font-size: 11px;
        }

        .queue-close {
          width: 38px;
          height: 38px;
          border: 1px solid var(--ws-border-strong);
          border-radius: 10px;
          background: var(--ws-surface-2);
          color: var(--ws-text);
          font-size: 22px;
          cursor: pointer;
        }

        .queue-modal form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .queue-modal label {
          display: flex;
          flex-direction: column;
          gap: 7px;
          color: var(--ws-text);
          font-size: 11px;
          font-weight: 800;
        }

        .queue-modal input,
        .queue-modal select,
        .queue-modal textarea,
        .queue-drawer select {
          width: 100%;
          border: 1px solid var(--ws-border);
          border-radius: 10px;
          padding: 12px;
          outline: none;
          background: var(--ws-surface);
          color: var(--ws-text);
          font: inherit;
        }

        .queue-modal textarea {
          min-height: 95px;
          resize: vertical;
        }

        .queue-form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .queue-mode-tabs {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 5px;
          padding: 4px;
          border-radius: 11px;
          background: var(--ws-surface-2);
        }

        .queue-mode-tabs button {
          min-height: 40px;
          border: 0;
          border-radius: 8px;
          background: transparent;
          color: var(--ws-text-secondary);
          font-weight: 800;
          cursor: pointer;
        }

        .queue-mode-tabs button.active {
          background: var(--ws-surface-hover);
          color: var(--ws-text);
          box-shadow: 0 2px 8px
            rgba(20, 31, 44, 0.08);
        }

        fieldset {
          margin: 0;
          padding: 0;
          border: 0;
        }

        legend {
          margin-bottom: 8px;
          color: var(--ws-text);
          font-size: 11px;
          font-weight: 800;
        }

        .queue-service-grid {
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          gap: 8px;
        }

        .queue-service-option {
          display: flex !important;
          flex-direction: row !important;
          align-items: center;
          gap: 9px !important;
          min-height: 48px;
          padding: 10px 12px;
          border: 1px solid var(--ws-border);
          border-radius: 10px;
          background: var(--ws-surface-2);
          cursor: pointer;
        }

        .queue-service-option.active {
          border-color: #d0a43a;
          background: var(--ws-gold-soft);
        }

        .queue-service-option input {
          width: auto;
        }

        .queue-modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          padding-top: 5px;
        }

        .queue-muted {
          color: var(--ws-text-secondary);
          font-size: 12px;
        }

        .queue-drawer {
          position: absolute;
          top: 0;
          right: 0;
          width: min(500px, 100%);
          height: 100%;
          overflow-y: auto;
          padding: 28px;
          background: var(--ws-surface);
          box-shadow: -25px 0 80px
            rgba(8, 16, 25, 0.2);
        }

        .queue-detail-status {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 15px;
          padding: 22px 0;
          color: var(--ws-text-secondary);
          font-size: 11px;
        }

        .queue-detail-section {
          padding: 22px 0;
          border-top: 1px solid var(--ws-border);
        }

        .queue-detail-services {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          margin-top: 10px;
        }

        .queue-detail-services div {
          padding: 8px 10px;
          border-radius: 9px;
          background: var(--ws-surface-2);
          color: var(--ws-text);
          font-size: 11px;
        }

        .queue-detail-note {
          margin: 10px 0 0;
          padding: 14px;
          border-radius: 11px;
          background: var(--ws-surface-2);
          color: var(--ws-text);
          line-height: 1.6;
          font-size: 12px;
        }

        .queue-command-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-top: 10px;
        }

        .queue-command-grid button {
          border: 1px solid var(--ws-border-strong);
          background: var(--ws-surface-2);
          color: var(--ws-text);
        }

        .queue-command-grid button.danger {
          border: 1px solid rgba(255, 128, 128, 0.25);
          background: var(--ws-error-soft);
          color: var(--ws-error);
        }

        .queue-command-grid button.primary-command {
          background: linear-gradient(
            135deg,
            #f1cb5d,
            #c79821
          );
          color: #101820;
        }

        .queue-timeline {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-top: 10px;
        }

        .queue-timeline div {
          padding: 12px;
          border: 1px solid var(--ws-border);
          border-radius: 10px;
          background: var(--ws-surface-2);
        }

        .queue-timeline span {
          display: block;
          color: var(--ws-text-secondary);
          font-size: 9px;
          text-transform: uppercase;
        }

        .queue-timeline strong {
          display: block;
          margin-top: 5px;
          color: var(--ws-text);
          font-size: 12px;
        }

        @media (max-width: 1100px) {
          .queue-row {
            grid-template-columns:
              80px 1fr 1.2fr 110px 90px;
          }

          .queue-provider,
          .queue-wait {
            display: none;
          }
        }

        @media (max-width: 760px) {
          .queue-page {
            padding: 24px 17px 60px;
          }

          .queue-hero {
            align-items: stretch;
            flex-direction: column;
          }

          .queue-flow-steps {
            align-items: stretch;
            flex-direction: column;
          }

          .queue-flow-steps b {
            transform: rotate(90deg);
            align-self: center;
          }

          .queue-flow-steps > div {
            width: 100%;
          }

          .queue-metrics {
            grid-template-columns: 1fr 1fr;
          }

          .queue-board-head {
            align-items: flex-start;
            flex-direction: column;
          }

          .queue-filter {
            width: 100%;
            overflow-x: auto;
          }

          .queue-row {
            grid-template-columns: 70px 1fr 100px;
          }

          .queue-services,
          .queue-provider,
          .queue-wait,
          .queue-row-actions {
            display: none;
          }

          .queue-form-row,
          .queue-service-grid,
          .queue-command-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
      </div>
    </WorkspaceShell>
  );
}
