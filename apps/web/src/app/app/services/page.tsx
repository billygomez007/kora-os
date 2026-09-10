"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import WorkspaceShell from "@/components/workspace/WorkspaceShell";
import {
  resolveActiveWorkspace,
  type StaffMember,
} from "@/lib/api/dashboard";
import {
  koraApi,
  koraData,
} from "@/lib/api/kora-api";

interface Service {
  id: string;
  organizationId: string;
  name: string;
  description?: string | null;
  durationMinutes: number;
  priceMinor: number;
  currency: string;
  isBookableByCustomer: boolean;
  archivedAt?: string | null;
}

interface BranchService {
  id: string;
  organizationId: string;
  branchId: string;
  serviceId: string;
  isEnabled: boolean;
  priceOverrideMinor?: number | null;
  durationOverrideMinutes?: number | null;
  isBookableByCustomerOverride?: boolean | null;
  service?: Service;
}

interface StaffServiceAssignment {
  id: string;
  organizationId: string;
  staffProfileId: string;
  branchId: string;
  serviceId: string;
  isBookable: boolean;
  durationOverrideMinutes?: number | null;
  staffProfile?: {
    id: string;
    membership?: {
      user?: {
        email?: string | null;
        displayName?: string | null;
      };
    };
  };
}

interface ServiceState {
  service: Service;
  branchService?: BranchService;
  assignments: StaffServiceAssignment[];
}

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

function staffName(member: StaffMember) {
  return member.displayName || member.email || "Kora provider";
}

export default function ServicesPage() {
  const [services, setServices] = useState<ServiceState[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedServiceId, setSelectedServiceId] =
    useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceDescription, setNewServiceDescription] = useState("");
  const [newServiceDuration, setNewServiceDuration] = useState("30");
  const [newServicePrice, setNewServicePrice] = useState("");
  const [newServiceCurrency, setNewServiceCurrency] = useState("GHS");
  const [newServiceBookable, setNewServiceBookable] = useState(true);

  const load = useCallback(async () => {
    setError("");

    try {
      const workspace = await resolveActiveWorkspace();
      const canReadStaff = workspace.permissionCodes.includes("staff.read");

      const [
        organizationServices,
        branchServices,
        staffMembers,
      ] = await Promise.all([
        koraData<Service[]>(
          `/organizations/${workspace.organizationId}/services`,
        ),
        koraData<BranchService[]>(
          `/organizations/${workspace.organizationId}/branches/${workspace.branchId}/services`,
        ),
        canReadStaff
          ? koraData<StaffMember[]>(
              `/organizations/${workspace.organizationId}/staff`,
            )
          : Promise.resolve([] as StaffMember[]),
      ]);

      const activeServices = organizationServices.filter(
        (service) => !service.archivedAt,
      );

      const serviceStates = await Promise.all(
        activeServices.map(async (service) => {
          const branchService = branchServices.find(
            (item) => item.serviceId === service.id,
          );

          let assignments: StaffServiceAssignment[] = [];

          if (branchService) {
            assignments =
              await koraData<StaffServiceAssignment[]>(
                `/organizations/${workspace.organizationId}/branches/${workspace.branchId}/services/${service.id}/staff`,
              );
          }

          return {
            service,
            branchService,
            assignments,
          };
        }),
      );

      setServices(serviceStates);
      setStaff(staffMembers);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load Kora services.",
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

  const providers = useMemo(
    () =>
      staff.filter(
        (member) =>
          member.status === "ACTIVE" &&
          Boolean(member.staffProfileId),
      ),
    [staff],
  );

  const selectedService = useMemo(
    () =>
      services.find(
        (item) =>
          item.service.id === selectedServiceId,
      ) ?? null,
    [services, selectedServiceId],
  );

  async function createService(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = newServiceName.trim();
    const durationMinutes = Number(newServiceDuration);
    const price = Number(newServicePrice);

    if (!name) {
      setError("Enter the service name.");
      return;
    }

    if (!Number.isInteger(durationMinutes) || durationMinutes < 1) {
      setError("Enter a valid service duration.");
      return;
    }

    if (!Number.isFinite(price) || price < 0) {
      setError("Enter a valid service price.");
      return;
    }

    setCreating(true);
    setError("");
    setNotice("");

    try {
      const workspace = await resolveActiveWorkspace();

      const created = await koraData<Service>(
        `/organizations/${workspace.organizationId}/services`,
        {
          method: "POST",
          body: JSON.stringify({
            name,
            ...(newServiceDescription.trim()
              ? { description: newServiceDescription.trim() }
              : {}),
            durationMinutes,
            priceMinor: Math.round(price * 100),
            currency: newServiceCurrency.toUpperCase(),
            isBookableByCustomer: newServiceBookable,
          }),
        },
      );

      await koraData(
        `/organizations/${workspace.organizationId}/branches/${workspace.branchId}/services/${created.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            isEnabled: true,
            isBookableByCustomerOverride: newServiceBookable,
          }),
        },
      );

      setNewServiceName("");
      setNewServiceDescription("");
      setNewServiceDuration("30");
      setNewServicePrice("");
      setNewServiceCurrency(workspace.currency || "GHS");
      setNewServiceBookable(true);
      setShowCreate(false);

      setNotice(
        `${created.name} was created and enabled at ${workspace.branchName}.`,
      );

      await load();
      setSelectedServiceId(created.id);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Kora could not create this service.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function enableAtBranch(serviceId: string) {
    setWorking(`enable:${serviceId}`);
    setError("");
    setNotice("");

    try {
      const workspace = await resolveActiveWorkspace();

      await koraData(
        `/organizations/${workspace.organizationId}/branches/${workspace.branchId}/services/${serviceId}`,
        {
          method: "PUT",
          body: JSON.stringify({
            isEnabled: true,
          }),
        },
      );

      setNotice("Service enabled at this branch.");
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to enable this service.",
      );
    } finally {
      setWorking(null);
    }
  }

  async function assignProvider(
    serviceId: string,
    staffProfileId: string,
  ) {
    if (!staffProfileId) return;

    setWorking(
      `assign:${serviceId}:${staffProfileId}`,
    );
    setError("");
    setNotice("");

    try {
      const workspace = await resolveActiveWorkspace();

      await koraData(
        `/organizations/${workspace.organizationId}/branches/${workspace.branchId}/services/${serviceId}/staff`,
        {
          method: "POST",
          body: JSON.stringify({
            staffProfileId,
          }),
        },
      );

      setNotice("Provider assigned to service.");
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to assign this provider.",
      );
    } finally {
      setWorking(null);
    }
  }

  async function removeProvider(
    serviceId: string,
    staffProfileId: string,
  ) {
    setWorking(
      `remove:${serviceId}:${staffProfileId}`,
    );
    setError("");
    setNotice("");

    try {
      const workspace = await resolveActiveWorkspace();

      await koraApi(
        `/organizations/${workspace.organizationId}/branches/${workspace.branchId}/services/${serviceId}/staff/${staffProfileId}`,
        {
          method: "DELETE",
        },
      );

      setNotice("Provider removed from service.");
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to remove this provider.",
      );
    } finally {
      setWorking(null);
    }
  }

  return (
    <WorkspaceShell
      title="Services"
      actions={
        <button
          type="button"
          className="workspace-primary-button"
          onClick={() => {
            setError("");
            setNotice("");
            setShowCreate(true);
          }}
        >
          + New service
        </button>
      }
    >
      <section className="workspace-feature-heading">
        <div>
          <span>SERVICES</span>
          <h1>Services your business offers.</h1>
          <p>
            Manage pricing, duration, branch availability
            and the providers who can perform each service.
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

      <section className="workspace-feature-card">
        <div className="workspace-feature-card-head">
          <div>
            <span>SERVICE CATALOG</span>
            <h2>All services</h2>
          </div>

          <button
            type="button"
            onClick={() => void load()}
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="workspace-feature-empty">
            Loading services…
          </div>
        ) : services.length === 0 ? (
          <div className="services-empty-catalog">
            <div className="services-empty-icon">＋</div>

            <strong>Create your first service</strong>

            <p>
              Add what your business offers, including the price,
              duration and whether customers can book it themselves.
            </p>

            <button
              type="button"
              onClick={() => setShowCreate(true)}
            >
              + Add first service
            </button>
          </div>
        ) : (
          <div className="services-table-wrap">
            <div className="services-table services-table-head">
              <span>Service</span>
              <span>Price</span>
              <span>Duration</span>
              <span>Branch</span>
              <span>Providers</span>
              <span>Booking</span>
              <span>Action</span>
            </div>

            {services.map(
              ({
                service,
                branchService,
                assignments,
              }) => {
                const enabled =
                  Boolean(branchService) &&
                  branchService?.isEnabled !== false;

                const effectivePrice =
                  branchService?.priceOverrideMinor ??
                  service.priceMinor;

                const effectiveDuration =
                  branchService?.durationOverrideMinutes ??
                  service.durationMinutes;

                const customerBookable =
                  branchService?.isBookableByCustomerOverride ??
                  service.isBookableByCustomer;

                return (
                  <div
                    className="services-table services-table-row"
                    key={service.id}
                  >
                    <div className="services-name-cell">
                      <div className="services-name-icon">
                        {service.name
                          .slice(0, 1)
                          .toUpperCase()}
                      </div>

                      <div>
                        <strong>
                          {service.name}
                        </strong>
                        <span>
                          {service.description ||
                            "No description"}
                        </span>
                      </div>
                    </div>

                    <strong>
                      {money(
                        effectivePrice,
                        service.currency,
                      )}
                    </strong>

                    <span>
                      {effectiveDuration} min
                    </span>

                    <span
                      className={
                        enabled
                          ? "services-pill active"
                          : "services-pill"
                      }
                    >
                      {enabled
                        ? "Enabled"
                        : "Disabled"}
                    </span>

                    <span>
                      {assignments.length}
                    </span>

                    <span
                      className={
                        customerBookable
                          ? "services-pill bookable"
                          : "services-pill"
                      }
                    >
                      {customerBookable
                        ? "On"
                        : "Off"}
                    </span>

                    <button
                      type="button"
                      className="services-manage-button"
                      onClick={() =>
                        setSelectedServiceId(
                          service.id,
                        )
                      }
                    >
                      Manage
                    </button>
                  </div>
                );
              },
            )}
          </div>
        )}
      </section>

      {showCreate && (
        <div className="services-drawer-backdrop">
          <aside className="services-drawer">
            <div className="services-drawer-head">
              <div>
                <span>NEW SERVICE</span>
                <h2>Add a service</h2>
              </div>

              <button
                type="button"
                aria-label="Close new service"
                onClick={() => setShowCreate(false)}
              >
                ×
              </button>
            </div>

            <form
              className="service-create-form"
              onSubmit={createService}
            >
              <div className="service-create-intro">
                <span>SERVICE DETAILS</span>
                <strong>
                  What can customers book with your business?
                </strong>
                <p>
                  This service will be enabled automatically at
                  your current branch.
                </p>
              </div>

              <label>
                Service name
                <input
                  value={newServiceName}
                  onChange={(event) =>
                    setNewServiceName(event.target.value)
                  }
                  placeholder="e.g. Men's Haircut"
                  maxLength={160}
                  required
                />
              </label>

              <label>
                Description
                <textarea
                  value={newServiceDescription}
                  onChange={(event) =>
                    setNewServiceDescription(event.target.value)
                  }
                  placeholder="Briefly describe this service"
                  rows={4}
                />
              </label>

              <div className="service-create-two">
                <label>
                  Duration
                  <div className="service-input-suffix">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={newServiceDuration}
                      onChange={(event) =>
                        setNewServiceDuration(event.target.value)
                      }
                      required
                    />
                    <span>minutes</span>
                  </div>
                </label>

                <label>
                  Price
                  <div className="service-price-input">
                    <span>{newServiceCurrency}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={newServicePrice}
                      onChange={(event) =>
                        setNewServicePrice(event.target.value)
                      }
                      placeholder="0.00"
                      required
                    />
                  </div>
                </label>
              </div>

              <label>
                Currency
                <select
                  value={newServiceCurrency}
                  onChange={(event) =>
                    setNewServiceCurrency(event.target.value)
                  }
                >
                  <option value="GHS">GHS — Ghana Cedi</option>
                  <option value="NGN">NGN — Nigerian Naira</option>
                  <option value="KES">KES — Kenyan Shilling</option>
                  <option value="ZAR">ZAR — South African Rand</option>
                  <option value="XAF">XAF — Central African CFA</option>
                  <option value="USD">USD — US Dollar</option>
                  <option value="GBP">GBP — British Pound</option>
                </select>
              </label>

              <label className="service-bookable-toggle">
                <div>
                  <strong>Customer booking</strong>
                  <span>
                    Allow customers to book this service through Kora.
                  </span>
                </div>

                <input
                  type="checkbox"
                  checked={newServiceBookable}
                  onChange={(event) =>
                    setNewServiceBookable(event.target.checked)
                  }
                />
              </label>

              {error && (
                <div className="workspace-feature-error">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="service-create-submit"
                disabled={creating}
              >
                {creating
                  ? "Creating service..."
                  : "Create & enable service"}
              </button>
            </form>
          </aside>
        </div>
      )}

      {selectedService && (
        <div className="services-drawer-backdrop">
          <aside className="services-drawer">
            <div className="services-drawer-head">
              <div>
                <span>MANAGE SERVICE</span>
                <h2>
                  {selectedService.service.name}
                </h2>
              </div>

              <button
                type="button"
                aria-label="Close service"
                onClick={() =>
                  setSelectedServiceId(null)
                }
              >
                ×
              </button>
            </div>

            <div className="services-drawer-content">
              <section>
                <small>PRICE</small>
                <strong>
                  {money(
                    selectedService.branchService
                      ?.priceOverrideMinor ??
                      selectedService.service
                        .priceMinor,
                    selectedService.service.currency,
                  )}
                </strong>
              </section>

              <section>
                <small>DURATION</small>
                <strong>
                  {selectedService.branchService
                    ?.durationOverrideMinutes ??
                    selectedService.service
                      .durationMinutes}{" "}
                  min
                </strong>
              </section>

              <section>
                <small>BRANCH STATUS</small>

                {selectedService.branchService &&
                selectedService.branchService
                  .isEnabled !== false ? (
                  <span className="services-pill active">
                    Enabled
                  </span>
                ) : (
                  <button
                    type="button"
                    className="workspace-primary-button"
                    disabled={
                      working ===
                      `enable:${selectedService.service.id}`
                    }
                    onClick={() =>
                      void enableAtBranch(
                        selectedService.service.id,
                      )
                    }
                  >
                    {working ===
                    `enable:${selectedService.service.id}`
                      ? "Enabling…"
                      : "Enable at this branch"}
                  </button>
                )}
              </section>

              <section className="services-drawer-provider-section">
                <div>
                  <small>
                    ASSIGNED PROVIDERS
                  </small>
                  <strong>
                    {
                      selectedService
                        .assignments.length
                    }
                  </strong>
                </div>

                {selectedService.assignments
                  .length === 0 ? (
                  <p className="workspace-provider-empty">
                    No provider assigned yet.
                    Appointments cannot be booked
                    for this service until a
                    provider is assigned.
                  </p>
                ) : (
                  <div className="workspace-provider-list">
                    {selectedService.assignments.map(
                      (assignment) => {
                        const provider =
                          providers.find(
                            (item) =>
                              item.staffProfileId ===
                              assignment.staffProfileId,
                          );

                        return (
                          <div
                            className="workspace-provider-row"
                            key={assignment.id}
                          >
                            <div className="workspace-provider-avatar">
                              {(provider
                                ? staffName(
                                    provider,
                                  )
                                : "K"
                              )
                                .slice(0, 1)
                                .toUpperCase()}
                            </div>

                            <div>
                              <strong>
                                {provider
                                  ? staffName(
                                      provider,
                                    )
                                  : assignment
                                      .staffProfile
                                      ?.membership
                                      ?.user
                                      ?.displayName ||
                                    assignment
                                      .staffProfile
                                      ?.membership
                                      ?.user
                                      ?.email ||
                                    "Kora provider"}
                              </strong>

                              <span>
                                Can perform{" "}
                                {
                                  selectedService
                                    .service.name
                                }
                              </span>
                            </div>

                            <button
                              type="button"
                              disabled={
                                working ===
                                `remove:${selectedService.service.id}:${assignment.staffProfileId}`
                              }
                              onClick={() =>
                                void removeProvider(
                                  selectedService
                                    .service.id,
                                  assignment.staffProfileId,
                                )
                              }
                            >
                              Remove
                            </button>
                          </div>
                        );
                      },
                    )}
                  </div>
                )}

                <div className="workspace-provider-add">
                  <label>
                    Assign provider

                    <select
                      defaultValue=""
                      disabled={
                        working !== null ||
                        !selectedService
                          .branchService
                      }
                      onChange={(event) => {
                        const value =
                          event.target.value;

                        if (!value) return;

                        void assignProvider(
                          selectedService
                            .service.id,
                          value,
                        );

                        event.target.value = "";
                      }}
                    >
                      <option value="">
                        Choose staff member
                      </option>

                      {providers
                        .filter(
                          (provider) =>
                            provider.staffProfileId &&
                            !selectedService.assignments.some(
                              (
                                assignment,
                              ) =>
                                assignment.staffProfileId ===
                                provider.staffProfileId,
                            ),
                        )
                        .map((provider) => (
                          <option
                            key={
                              provider.membershipId
                            }
                            value={
                              provider.staffProfileId ??
                              ""
                            }
                          >
                            {staffName(
                              provider,
                            )}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
              </section>
            </div>
          </aside>
        </div>
      )}
    </WorkspaceShell>
  );
}
