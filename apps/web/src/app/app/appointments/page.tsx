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
  type Appointment,
  type StaffMember,
} from "@/lib/api/dashboard";
import { koraData, koraEnvelope } from "@/lib/api/kora-api";

interface Service {
  id: string;
  name: string;
  description?: string | null;
  durationMinutes: number;
  priceMinor: number;
  currency: string;
  archivedAt?: string | null;
}

interface BranchService {
  id: string;
  serviceId: string;
  isEnabled: boolean;
  priceOverrideMinor?: number | null;
  durationOverrideMinutes?: number | null;
  service?: Service;
}

interface StaffAssignment {
  id: string;
  staffProfileId: string;
  branchId: string;
  serviceId: string;
  isBookable: boolean;
}

type AppointmentFilter =
  | "ALL"
  | "CONFIRMED"
  | "CANCELLED"
  | "NO_SHOW";

function money(minor: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency,
    }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-GH", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function toLocalInput(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function statusClass(status: string) {
  switch (status) {
    case "CONFIRMED":
      return "appointment-status confirmed";
    case "CANCELLED":
      return "appointment-status cancelled";
    case "NO_SHOW":
      return "appointment-status no-show";
    default:
      return "appointment-status";
  }
}

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [branchServices, setBranchServices] = useState<BranchService[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [serviceAssignments, setServiceAssignments] = useState<
    Record<string, StaffAssignment[]>
  >({});

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [canManageAppointments, setCanManageAppointments] = useState(false);

  const [filter, setFilter] = useState<AppointmentFilter>("ALL");

  const [showCreate, setShowCreate] = useState(false);
  const [selectedAppointment, setSelectedAppointment] =
    useState<Appointment | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [selectedServiceIds, setSelectedServiceIds] =
    useState<string[]>([]);
  const [staffProfileId, setStaffProfileId] = useState("");
  const [startAt, setStartAt] = useState("");

  const [rescheduleAt, setRescheduleAt] = useState("");
  const [rescheduleStaffId, setRescheduleStaffId] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  const load = useCallback(async () => {
    setError("");

    try {
      const workspace = await resolveActiveWorkspace();

      setCanManageAppointments(
        workspace.permissionCodes.includes("appointments.manage"),
      );

      const from = new Date();
      from.setDate(from.getDate() - 15);
      from.setHours(0, 0, 0, 0);

      const to = new Date();
      to.setDate(to.getDate() + 75);
      to.setHours(23, 59, 59, 999);

      const query = new URLSearchParams({
        from: from.toISOString(),
        to: to.toISOString(),
        limit: "100",
      });

      const canManage =
        workspace.permissionCodes.includes("appointments.manage");

      const appointmentEnvelope = await koraEnvelope<Appointment[]>(
        `/organizations/${workspace.organizationId}/branches/${workspace.branchId}/appointments?${query.toString()}`,
      );

      setAppointments(appointmentEnvelope.data ?? []);

      if (canManage) {
        const [
          organizationServices,
          branchServiceData,
          staffData,
        ] = await Promise.all([
          koraData<Service[]>(
            `/organizations/${workspace.organizationId}/services`,
          ),
          koraData<BranchService[]>(
            `/organizations/${workspace.organizationId}/branches/${workspace.branchId}/services`,
          ),
          koraData<StaffMember[]>(
            `/organizations/${workspace.organizationId}/staff`,
          ),
        ]);

        const activeBranchServices = branchServiceData.filter(
          (item) => item.isEnabled !== false,
        );

        const assignmentEntries = await Promise.all(
          activeBranchServices.map(async (branchService) => {
            const assignments = await koraData<StaffAssignment[]>(
              `/organizations/${workspace.organizationId}/branches/${workspace.branchId}/services/${branchService.serviceId}/staff`,
            );

            return [
              branchService.serviceId,
              assignments.filter(
                (assignment) => assignment.isBookable !== false,
              ),
            ] as const;
          }),
        );

        setServices(
          organizationServices.filter(
            (service) => !service.archivedAt,
          ),
        );
        setBranchServices(activeBranchServices);
        setStaff(staffData);
        setServiceAssignments(Object.fromEntries(assignmentEntries));
      } else {
        setServices([]);
        setBranchServices([]);
        setStaff([]);
        setServiceAssignments({});
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load appointments.",
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

  const enabledServices = useMemo(() => {
    const enabledIds = new Set(
      branchServices.map((item) => item.serviceId),
    );

    return services.filter((service) =>
      enabledIds.has(service.id),
    );
  }, [services, branchServices]);

  const eligibleProviderIds = useMemo(() => {
    if (selectedServiceIds.length === 0) {
      return new Set<string>();
    }

    const assignmentSets = selectedServiceIds.map(
      (serviceId) =>
        new Set(
          (serviceAssignments[serviceId] ?? []).map(
            (assignment) => assignment.staffProfileId,
          ),
        ),
    );

    const [first, ...rest] = assignmentSets;

    return new Set(
      [...first].filter((staffId) =>
        rest.every((set) => set.has(staffId)),
      ),
    );
  }, [selectedServiceIds, serviceAssignments]);

  const eligibleStaff = useMemo(
    () =>
      staff.filter(
        (member) =>
          member.status === "ACTIVE" &&
          member.staffProfileId &&
          eligibleProviderIds.has(member.staffProfileId),
      ),
    [staff, eligibleProviderIds],
  );

  const filteredAppointments = useMemo(() => {
    const rows =
      filter === "ALL"
        ? appointments
        : appointments.filter(
            (appointment) => appointment.status === filter,
          );

    return rows.slice().sort(
      (a, b) =>
        new Date(a.startAt).getTime() -
        new Date(b.startAt).getTime(),
    );
  }, [appointments, filter]);

  const counts = useMemo(
    () => ({
      all: appointments.length,
      confirmed: appointments.filter(
        (item) => item.status === "CONFIRMED",
      ).length,
      cancelled: appointments.filter(
        (item) => item.status === "CANCELLED",
      ).length,
      noShow: appointments.filter(
        (item) => item.status === "NO_SHOW",
      ).length,
    }),
    [appointments],
  );

  const selectedTotal = useMemo(
    () =>
      selectedServiceIds.reduce((sum, serviceId) => {
        const service = enabledServices.find(
          (item) => item.id === serviceId,
        );

        const branch = branchServices.find(
          (item) => item.serviceId === serviceId,
        );

        return (
          sum +
          (branch?.priceOverrideMinor ??
            service?.priceMinor ??
            0)
        );
      }, 0),
    [selectedServiceIds, enabledServices, branchServices],
  );

  function toggleService(serviceId: string) {
    setSelectedServiceIds((current) => {
      const next = current.includes(serviceId)
        ? current.filter((id) => id !== serviceId)
        : [...current, serviceId];

      return next;
    });

    setStaffProfileId("");
  }

  async function createAppointment(event: FormEvent) {
    event.preventDefault();

    if (!canManageAppointments) {
      setError("You do not have permission to create appointments.");
      return;
    }

    if (!customerName.trim()) {
      setError("Enter the customer's name.");
      return;
    }

    if (selectedServiceIds.length === 0) {
      setError("Choose at least one service.");
      return;
    }

    if (!staffProfileId) {
      setError("Choose an eligible provider.");
      return;
    }

    if (!startAt) {
      setError("Choose the appointment date and time.");
      return;
    }

    if (
      customerPhone.trim() &&
      !/^\+[1-9]\d{6,14}$/.test(customerPhone.trim())
    ) {
      setError(
        "Enter the phone number in international format, for example +233...",
      );
      return;
    }

    setWorking(true);
    setError("");
    setNotice("");

    try {
      const workspace = await resolveActiveWorkspace();

      await koraData<Appointment>(
        `/organizations/${workspace.organizationId}/branches/${workspace.branchId}/appointments`,
        {
          method: "POST",
          body: JSON.stringify({
            serviceIds: selectedServiceIds,
            staffProfileId,
            startAt: new Date(startAt).toISOString(),
            newCustomer: {
              name: customerName.trim(),
              ...(customerPhone.trim()
                ? { phoneE164: customerPhone.trim() }
                : {}),
              ...(customerEmail.trim()
                ? { email: customerEmail.trim() }
                : {}),
            },
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      );

      setCustomerName("");
      setCustomerPhone("");
      setCustomerEmail("");
      setSelectedServiceIds([]);
      setStaffProfileId("");
      setStartAt("");
      setShowCreate(false);

      setNotice("Appointment created successfully.");
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Kora could not create this appointment.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function cancelAppointment() {
    if (!selectedAppointment) return;

    setWorking(true);
    setError("");
    setNotice("");

    try {
      const workspace = await resolveActiveWorkspace();

      await koraData(
        `/organizations/${workspace.organizationId}/branches/${workspace.branchId}/appointments/${selectedAppointment.id}/cancel`,
        {
          method: "POST",
          body: JSON.stringify({
            ...(cancelReason.trim()
              ? { reason: cancelReason.trim() }
              : {}),
          }),
        },
      );

      setSelectedAppointment(null);
      setCancelReason("");
      setNotice("Appointment cancelled.");
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to cancel this appointment.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function markNoShow() {
    if (!selectedAppointment) return;

    setWorking(true);
    setError("");
    setNotice("");

    try {
      const workspace = await resolveActiveWorkspace();

      await koraData(
        `/organizations/${workspace.organizationId}/branches/${workspace.branchId}/appointments/${selectedAppointment.id}/no-show`,
        {
          method: "POST",
        },
      );

      setSelectedAppointment(null);
      setNotice("Appointment marked as no-show.");
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to mark this appointment as no-show.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function rescheduleAppointment() {
    if (!selectedAppointment || !rescheduleAt) return;

    setWorking(true);
    setError("");
    setNotice("");

    try {
      const workspace = await resolveActiveWorkspace();

      await koraData(
        `/organizations/${workspace.organizationId}/branches/${workspace.branchId}/appointments/${selectedAppointment.id}/reschedule`,
        {
          method: "POST",
          body: JSON.stringify({
            startAt: new Date(rescheduleAt).toISOString(),
            ...(rescheduleStaffId
              ? { staffProfileId: rescheduleStaffId }
              : {}),
          }),
        },
      );

      setSelectedAppointment(null);
      setRescheduleAt("");
      setRescheduleStaffId("");
      setNotice("Appointment rescheduled.");
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to reschedule this appointment.",
      );
    } finally {
      setWorking(false);
    }
  }

  function openAppointment(appointment: Appointment) {
    setSelectedAppointment(appointment);
    setRescheduleAt(toLocalInput(appointment.startAt));
    setRescheduleStaffId(appointment.assignedStaffProfileId);
    setCancelReason("");
  }

  return (
    <WorkspaceShell
      title="Appointments"
      actions={
        canManageAppointments ? (
          <button
            type="button"
            className="workspace-primary-button"
            onClick={() => setShowCreate(true)}
          >
            + New appointment
          </button>
        ) : undefined
      }
    >
      <section className="workspace-feature-heading appointments-heading">
        <div>
          <span>APPOINTMENTS</span>
          <h1>Your booking calendar.</h1>
          <p>
            Create bookings, manage upcoming appointments,
            reschedule customers and keep your team organised.
          </p>
        </div>
      </section>

      {error && (
        <div className="workspace-feature-error">
          {error}
        </div>
      )}

      {notice && (
        <div className="workspace-feature-success">
          {notice}
        </div>
      )}

      <section className="appointment-metrics">
        <article>
          <span>TOTAL</span>
          <strong>{counts.all}</strong>
          <small>In current view</small>
        </article>

        <article>
          <span>CONFIRMED</span>
          <strong>{counts.confirmed}</strong>
          <small>Active bookings</small>
        </article>

        <article>
          <span>CANCELLED</span>
          <strong>{counts.cancelled}</strong>
          <small>Cancelled bookings</small>
        </article>

        <article>
          <span>NO-SHOW</span>
          <strong>{counts.noShow}</strong>
          <small>Did not arrive</small>
        </article>
      </section>

      <section className="workspace-feature-card">
        <div className="appointment-toolbar">
          <div className="appointment-tabs">
            {(
              [
                ["ALL", `All ${counts.all}`],
                ["CONFIRMED", `Confirmed ${counts.confirmed}`],
                ["CANCELLED", `Cancelled ${counts.cancelled}`],
                ["NO_SHOW", `No-show ${counts.noShow}`],
              ] as Array<[AppointmentFilter, string]>
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={filter === value ? "active" : ""}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="appointment-refresh"
            onClick={() => void load()}
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="workspace-feature-empty">
            Loading appointments…
          </div>
        ) : filteredAppointments.length === 0 ? (
          <div className="appointment-empty">
            <div>▧</div>
            <strong>No appointments here yet.</strong>
            <p>
              Create your first appointment when a customer
              calls, walks in or books with your team.
            </p>
            {canManageAppointments && (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
              >
                Create appointment
              </button>
            )}
          </div>
        ) : (
          <div className="appointments-table-wrap">
            <div className="appointments-table appointments-table-head">
              <span>Date & time</span>
              <span>Services</span>
              <span>Provider</span>
              <span>Reference</span>
              <span>Status</span>
              <span>Value</span>
              <span>Action</span>
            </div>

            {filteredAppointments.map((appointment) => (
              <div
                className="appointments-table appointments-table-row"
                key={appointment.id}
              >
                <div className="appointment-date-cell">
                  <strong>
                    {formatTime(appointment.startAt)}
                  </strong>
                  <span>
                    {formatDate(appointment.startAt)}
                  </span>
                </div>

                <div className="appointment-service-cell">
                  <strong>
                    {appointment.items
                      .map((item) => item.serviceName)
                      .join(", ")}
                  </strong>
                  <span>
                    {appointment.items.reduce(
                      (total, item) =>
                        total + item.durationMinutes,
                      0,
                    )}{" "}
                    min
                  </span>
                </div>

                <span>
                  {appointment.providerDisplayName ||
                    "Assigned provider"}
                </span>

                <span className="appointment-reference">
                  {appointment.reference}
                </span>

                <span className={statusClass(appointment.status)}>
                  {appointment.status.replaceAll("_", " ")}
                </span>

                <strong>
                  {money(
                    appointment.totalPriceMinor,
                    appointment.currency,
                  )}
                </strong>

                <button
                  type="button"
                  className="appointment-manage"
                  onClick={() =>
                    openAppointment(appointment)
                  }
                >
                  {canManageAppointments ? "Manage" : "View"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {showCreate && canManageAppointments && (
        <div className="services-drawer-backdrop">
          <aside className="services-drawer appointment-drawer">
            <div className="services-drawer-head">
              <div>
                <span>NEW APPOINTMENT</span>
                <h2>Create booking</h2>
              </div>

              <button
                type="button"
                aria-label="Close appointment"
                onClick={() => setShowCreate(false)}
              >
                ×
              </button>
            </div>

            <form
              className="appointment-create-form"
              onSubmit={createAppointment}
            >
              <section className="appointment-form-section">
                <span className="appointment-step">01</span>
                <h3>Customer</h3>

                <label>
                  Customer name
                  <input
                    value={customerName}
                    onChange={(event) =>
                      setCustomerName(event.target.value)
                    }
                    placeholder="Customer name"
                    required
                  />
                </label>

                <div className="appointment-form-two">
                  <label>
                    Phone
                    <input
                      value={customerPhone}
                      onChange={(event) =>
                        setCustomerPhone(event.target.value)
                      }
                      placeholder="+233..."
                    />
                  </label>

                  <label>
                    Email
                    <input
                      type="email"
                      value={customerEmail}
                      onChange={(event) =>
                        setCustomerEmail(event.target.value)
                      }
                      placeholder="customer@email.com"
                    />
                  </label>
                </div>
              </section>

              <section className="appointment-form-section">
                <span className="appointment-step">02</span>
                <h3>Services</h3>

                {enabledServices.length === 0 ? (
                  <div className="appointment-form-warning">
                    No enabled branch services are available.
                    Go to Services and enable a service first.
                  </div>
                ) : (
                  <div className="appointment-service-picker">
                    {enabledServices.map((service) => {
                      const branchService =
                        branchServices.find(
                          (item) =>
                            item.serviceId === service.id,
                        );

                      const selected =
                        selectedServiceIds.includes(
                          service.id,
                        );

                      return (
                        <button
                          key={service.id}
                          type="button"
                          className={
                            selected ? "selected" : ""
                          }
                          onClick={() =>
                            toggleService(service.id)
                          }
                        >
                          <div>
                            <strong>
                              {service.name}
                            </strong>
                            <span>
                              {branchService
                                ?.durationOverrideMinutes ??
                                service.durationMinutes}{" "}
                              min
                            </span>
                          </div>

                          <b>
                            {money(
                              branchService
                                ?.priceOverrideMinor ??
                                service.priceMinor,
                              service.currency,
                            )}
                          </b>
                        </button>
                      );
                    })}
                  </div>
                )}

                {selectedServiceIds.length > 0 && (
                  <div className="appointment-total">
                    <span>
                      {selectedServiceIds.length} service
                      {selectedServiceIds.length === 1
                        ? ""
                        : "s"}
                    </span>
                    <strong>
                      {money(
                        selectedTotal,
                        enabledServices.find((service) =>
                          selectedServiceIds.includes(
                            service.id,
                          ),
                        )?.currency ?? "GHS",
                      )}
                    </strong>
                  </div>
                )}
              </section>

              <section className="appointment-form-section">
                <span className="appointment-step">03</span>
                <h3>Provider & time</h3>

                <label>
                  Provider
                  <select
                    value={staffProfileId}
                    onChange={(event) =>
                      setStaffProfileId(event.target.value)
                    }
                    disabled={
                      selectedServiceIds.length === 0
                    }
                    required
                  >
                    <option value="">
                      {selectedServiceIds.length === 0
                        ? "Choose services first"
                        : eligibleStaff.length === 0
                          ? "No eligible provider"
                          : "Choose provider"}
                    </option>

                    {eligibleStaff.map((member) => (
                      <option
                        key={member.membershipId}
                        value={member.staffProfileId ?? ""}
                      >
                        {member.displayName ||
                          member.email ||
                          "Kora provider"}
                      </option>
                    ))}
                  </select>
                </label>

                {selectedServiceIds.length > 0 &&
                  eligibleStaff.length === 0 && (
                    <div className="appointment-form-warning">
                      No provider can perform all selected
                      services. Assign providers from the
                      Services page first.
                    </div>
                  )}

                <label>
                  Date and time
                  <input
                    type="datetime-local"
                    value={startAt}
                    onChange={(event) =>
                      setStartAt(event.target.value)
                    }
                    required
                  />
                </label>
              </section>

              {error && (
                <div className="workspace-feature-error">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="appointment-create-submit"
                disabled={working}
              >
                {working
                  ? "Creating appointment…"
                  : "Create appointment"}
              </button>
            </form>
          </aside>
        </div>
      )}

      {selectedAppointment && (
        <div className="services-drawer-backdrop">
          <aside className="services-drawer appointment-drawer">
            <div className="services-drawer-head">
              <div>
                <span>APPOINTMENT</span>
                <h2>{selectedAppointment.reference}</h2>
              </div>

              <button
                type="button"
                aria-label="Close appointment details"
                onClick={() =>
                  setSelectedAppointment(null)
                }
              >
                ×
              </button>
            </div>

            <div className="appointment-manage-content">
              <section className="appointment-summary-card">
                <div>
                  <small>STATUS</small>
                  <span
                    className={statusClass(
                      selectedAppointment.status,
                    )}
                  >
                    {selectedAppointment.status.replaceAll(
                      "_",
                      " ",
                    )}
                  </span>
                </div>

                <div>
                  <small>DATE</small>
                  <strong>
                    {formatDate(
                      selectedAppointment.startAt,
                    )}
                  </strong>
                </div>

                <div>
                  <small>TIME</small>
                  <strong>
                    {formatTime(
                      selectedAppointment.startAt,
                    )}
                  </strong>
                </div>

                <div>
                  <small>VALUE</small>
                  <strong>
                    {money(
                      selectedAppointment.totalPriceMinor,
                      selectedAppointment.currency,
                    )}
                  </strong>
                </div>
              </section>

              <section className="appointment-manage-section">
                <small>CUSTOMER</small>

                <div className="appointment-manage-service">
                  <strong>
                    {selectedAppointment.customer?.name || "Customer"}
                  </strong>
                  <span>
                    {selectedAppointment.customer?.phone ||
                      "No phone number provided"}
                  </span>
                </div>

                {selectedAppointment.customer?.phone && (
                  <a
                    href={`tel:${selectedAppointment.customer.phone}`}
                    className="workspace-primary-button"
                  >
                    Call customer
                  </a>
                )}

                {selectedAppointment.customer?.email && (
                  <div className="appointment-manage-service">
                    <strong>Email</strong>
                    <span>{selectedAppointment.customer.email}</span>
                  </div>
                )}

                {selectedAppointment.customer?.notes && (
                  <div className="appointment-manage-service">
                    <strong>Customer notes</strong>
                    <span>{selectedAppointment.customer.notes}</span>
                  </div>
                )}
              </section>

              <section className="appointment-manage-section">
                <small>BOOKING DETAILS</small>

                <div className="appointment-manage-service">
                  <strong>Provider</strong>
                  <span>
                    {selectedAppointment.providerDisplayName ||
                      "Assigned provider"}
                  </span>
                </div>

                <div className="appointment-manage-service">
                  <strong>Duration</strong>
                  <span>
                    {selectedAppointment.items.reduce(
                      (total, item) => total + item.durationMinutes,
                      0,
                    )} min
                  </span>
                </div>

                <div className="appointment-manage-service">
                  <strong>Reference</strong>
                  <span>{selectedAppointment.reference}</span>
                </div>

                <div className="appointment-manage-service">
                  <strong>Source</strong>
                  <span>
                    {selectedAppointment.source.replaceAll("_", " ")}
                  </span>
                </div>
              </section>

              <section className="appointment-manage-section">
                <small>SERVICES</small>
                {selectedAppointment.items.map((item) => (
                  <div
                    className="appointment-manage-service"
                    key={item.serviceId}
                  >
                    <strong>{item.serviceName}</strong>
                    <span>
                      {item.durationMinutes} min ·{" "}
                      {money(
                        item.priceMinor,
                        item.currency,
                      )}
                    </span>
                  </div>
                ))}
              </section>

              {selectedAppointment.status === "CONFIRMED" &&
                canManageAppointments && (
                <>
                  <section className="appointment-manage-section">
                    <small>RESCHEDULE</small>

                    <label>
                      New date and time
                      <input
                        type="datetime-local"
                        value={rescheduleAt}
                        onChange={(event) =>
                          setRescheduleAt(
                            event.target.value,
                          )
                        }
                      />
                    </label>

                    <label>
                      Provider
                      <select
                        value={rescheduleStaffId}
                        onChange={(event) =>
                          setRescheduleStaffId(
                            event.target.value,
                          )
                        }
                      >
                        <option value="">
                          Keep current provider
                        </option>

                        {staff
                          .filter(
                            (member) =>
                              member.status === "ACTIVE" &&
                              member.staffProfileId,
                          )
                          .map((member) => (
                            <option
                              key={member.membershipId}
                              value={
                                member.staffProfileId ??
                                ""
                              }
                            >
                              {member.displayName ||
                                member.email ||
                                "Kora provider"}
                            </option>
                          ))}
                      </select>
                    </label>

                    <button
                      type="button"
                      className="workspace-primary-button"
                      disabled={
                        working || !rescheduleAt
                      }
                      onClick={() =>
                        void rescheduleAppointment()
                      }
                    >
                      Save new schedule
                    </button>
                  </section>

                  <section className="appointment-manage-section">
                    <small>APPOINTMENT ACTIONS</small>

                    <label>
                      Cancellation reason
                      <textarea
                        value={cancelReason}
                        onChange={(event) =>
                          setCancelReason(
                            event.target.value,
                          )
                        }
                        placeholder="Optional reason"
                      />
                    </label>

                    <div className="appointment-danger-actions">
                      <button
                        type="button"
                        disabled={working}
                        onClick={() =>
                          void markNoShow()
                        }
                      >
                        Mark no-show
                      </button>

                      <button
                        type="button"
                        disabled={working}
                        onClick={() =>
                          void cancelAppointment()
                        }
                      >
                        Cancel appointment
                      </button>
                    </div>
                  </section>
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </WorkspaceShell>
  );
}
