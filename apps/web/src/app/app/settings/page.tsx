"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import WorkspaceShell from "@/components/workspace/WorkspaceShell";
import {
  type ActiveWorkspace,
  resolveActiveWorkspace,
} from "@/lib/api/dashboard";
import { koraApi, koraData } from "@/lib/api/kora-api";
import { clearKoraSession } from "@/lib/auth/session";

type Tab =
  | "profile"
  | "hours"
  | "booking"
  | "marketplace"
  | "subscription"
  | "account";

interface BusinessProfile {
  id?: string;
  slug?: string;
  displayName: string;
  description?: string | null;
  logoImageUrl?: string | null;
  coverImageUrl?: string | null;
  visibility?: string;
  searchKeywords?: string | null;
  publishedAt?: string | null;
}

interface BusinessHour {
  dayOfWeek: number;
  startLocalTime: string;
  endLocalTime: string;
}

interface BookingPolicy {
  slotIntervalMinutes: number;
  minBookingLeadTimeMinutes: number;
  maxBookingHorizonDays: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  cancellationCutoffMinutes: number;
  allowCustomerProviderSelection: boolean;
  allowAnyProvider: boolean;
}

interface BranchDetail {
  id: string;
  name: string;
  code: string;
  countryCode: string;
  timeZone: string;
  currency: string;
  status: string;
  latitude?: number | null;
  longitude?: number | null;
  publicPhone?: string | null;
  publicEmail?: string | null;
  openingHoursNote?: string | null;
  isDiscoverable?: boolean;
}

interface SubscriptionDetail {
  status?: string;
  planCode?: string;
  planName?: string;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  trialEndsAt?: string | null;
  entitlements?: unknown[];
  [key: string]: unknown;
}

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const DEFAULT_POLICY: BookingPolicy = {
  slotIntervalMinutes: 15,
  minBookingLeadTimeMinutes: 0,
  maxBookingHorizonDays: 30,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  cancellationCutoffMinutes: 0,
  allowCustomerProviderSelection: true,
  allowAnyProvider: true,
};

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("profile");
  const [workspace, setWorkspace] = useState<ActiveWorkspace | null>(null);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [hours, setHours] = useState<BusinessHour[]>([]);
  const [policy, setPolicy] = useState<BookingPolicy>(DEFAULT_POLICY);
  const [branch, setBranch] = useState<BranchDetail | null>(null);
  const [subscription, setSubscription] =
    useState<SubscriptionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const active = await resolveActiveWorkspace();
      setWorkspace(active);

      const [profileResult, hoursResult, policyResult, branches, subscriptionResult] =
        await Promise.all([
          koraData<BusinessProfile | null>(
            `/organizations/${active.organizationId}/business-profile`,
          ),
          koraData<BusinessHour[]>(
            `/organizations/${active.organizationId}/branches/${active.branchId}/business-hours`,
          ),
          koraData<BookingPolicy>(
            `/organizations/${active.organizationId}/branches/${active.branchId}/booking-policy`,
          ),
          koraData<BranchDetail[]>(
            `/organizations/${active.organizationId}/branches`,
          ),
          koraData<SubscriptionDetail>(
            `/organizations/${active.organizationId}/subscription`,
          ).catch(() => null),
        ]);

      setProfile(
        profileResult ?? {
          displayName: active.organizationName,
          visibility: "PRIVATE",
        },
      );
      setHours(hoursResult);
      setPolicy(policyResult);
      setBranch(
        branches.find((item) => item.id === active.branchId) ?? null,
      );
      setSubscription(subscriptionResult);
    } catch (err) {
      setError(messageOf(err));
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

  async function handleLogout() {
    if (loggingOut) return;

    const confirmed = window.confirm(
      "Log out of Kora OS on this device? You will need to sign in again to access your workspace.",
    );

    if (!confirmed) return;

    setLoggingOut(true);
    setError("");
    setNotice("");

    try {
      await koraApi<void>("/auth/logout", {
        method: "POST",
      });
    } catch {
      // Always clear the local session. If the server session has already
      // expired or the network is unavailable, the browser must still log out.
    } finally {
      clearKoraSession();
      window.location.replace("/login");
    }
  }

  const hoursByDay = useMemo(() => {
    const map = new Map<number, BusinessHour>();
    for (const item of hours) {
      if (!map.has(item.dayOfWeek)) map.set(item.dayOfWeek, item);
    }
    return map;
  }, [hours]);

  async function saveProfile() {
    if (!workspace || !profile) return;

    try {
      setSaving("profile");
      setError("");
      setNotice("");

      const payload = {
        ...(profile.slug?.trim() ? { slug: profile.slug.trim() } : {}),
        displayName: profile.displayName.trim(),
        ...(profile.description?.trim()
          ? { description: profile.description.trim() }
          : {}),
        ...(profile.logoImageUrl?.trim()
          ? { logoImageUrl: profile.logoImageUrl.trim() }
          : {}),
        ...(profile.coverImageUrl?.trim()
          ? { coverImageUrl: profile.coverImageUrl.trim() }
          : {}),
        ...(profile.visibility ? { visibility: profile.visibility } : {}),
        ...(profile.searchKeywords?.trim()
          ? { searchKeywords: profile.searchKeywords.trim() }
          : {}),
      };

      const saved = await koraData<BusinessProfile>(
        `/organizations/${workspace.organizationId}/business-profile`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
        },
      );

      setProfile(saved);
      setNotice("Business profile saved.");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSaving("");
    }
  }

  async function saveHours() {
    if (!workspace) return;

    try {
      setSaving("hours");
      setError("");
      setNotice("");

      const saved = await koraData<BusinessHour[]>(
        `/organizations/${workspace.organizationId}/branches/${workspace.branchId}/business-hours`,
        {
          method: "PUT",
          body: JSON.stringify({ intervals: hours }),
        },
      );

      setHours(saved);
      setNotice("Business hours saved.");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSaving("");
    }
  }

  function toggleDay(dayOfWeek: number) {
    const existing = hoursByDay.get(dayOfWeek);

    if (existing) {
      setHours((current) =>
        current.filter((item) => item.dayOfWeek !== dayOfWeek),
      );
      return;
    }

    setHours((current) => [
      ...current,
      {
        dayOfWeek,
        startLocalTime: "09:00",
        endLocalTime: "18:00",
      },
    ]);
  }

  function updateHour(
    dayOfWeek: number,
    field: "startLocalTime" | "endLocalTime",
    value: string,
  ) {
    setHours((current) =>
      current.map((item) =>
        item.dayOfWeek === dayOfWeek
          ? { ...item, [field]: value }
          : item,
      ),
    );
  }

  async function savePolicy() {
    if (!workspace) return;

    try {
      setSaving("policy");
      setError("");
      setNotice("");

      const saved = await koraData<BookingPolicy>(
        `/organizations/${workspace.organizationId}/branches/${workspace.branchId}/booking-policy`,
        {
          method: "PUT",
          body: JSON.stringify(policy),
        },
      );

      setPolicy(saved);
      setNotice("Booking rules saved.");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSaving("");
    }
  }

  async function saveDiscovery() {
    if (!workspace || !branch) return;

    try {
      setSaving("discovery");
      setError("");
      setNotice("");

      const payload = {
        ...(branch.latitude != null ? { latitude: branch.latitude } : {}),
        ...(branch.longitude != null ? { longitude: branch.longitude } : {}),
        ...(branch.publicPhone?.trim()
          ? { publicPhone: branch.publicPhone.trim() }
          : {}),
        ...(branch.publicEmail?.trim()
          ? { publicEmail: branch.publicEmail.trim() }
          : {}),
        ...(branch.openingHoursNote?.trim()
          ? { openingHoursNote: branch.openingHoursNote.trim() }
          : {}),
        isDiscoverable: Boolean(branch.isDiscoverable),
      };

      const saved = await koraData<BranchDetail>(
        `/organizations/${workspace.organizationId}/branches/${workspace.branchId}/discovery`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
        },
      );

      setBranch((current) => ({ ...current!, ...saved }));
      setNotice("Marketplace settings saved.");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSaving("");
    }
  }

  async function togglePublication() {
    if (!workspace || !profile) return;

    const published = Boolean(profile.publishedAt);

    try {
      setSaving("publish");
      setError("");
      setNotice("");

      await koraData(
        `/organizations/${workspace.organizationId}/business-profile/${
          published ? "unpublish" : "publish"
        }`,
        { method: "POST" },
      );

      await load();
      setNotice(
        published
          ? "Marketplace profile unpublished."
          : "Marketplace profile published.",
      );
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSaving("");
    }
  }

  if (loading) {
    return (
      <WorkspaceShell title="Settings">
        <div className="settingsShell">
          <div className="settingsLoading">Loading Kora settings…</div>
        </div>
      </WorkspaceShell>
    );
  }

  return (
    <WorkspaceShell title="Settings">
      <div className="settingsShell">
      <section className="settingsHeader">
        <div>
          <span className="settingsEyebrow">KORA CONTROL CENTER</span>
          <h1>Settings</h1>
          <p>
            Configure how {workspace?.organizationName ?? "your business"} works,
            books customers and appears on Kora.
          </p>
        </div>

        <div className="settingsBranchPill">
          <small>ACTIVE BRANCH</small>
          <strong>{workspace?.branchName ?? "Branch"}</strong>
          <span>
            {workspace?.currency} · {workspace?.timeZone}
          </span>
        </div>
      </section>

      {(error || notice) && (
        <div className={error ? "settingsAlert error" : "settingsAlert success"}>
          {error || notice}
        </div>
      )}

      <section className="settingsLayout">
        <nav className="settingsNav">
          <button
            className={tab === "profile" ? "active" : ""}
            onClick={() => setTab("profile")}
          >
            <span>01</span>
            <div>
              <strong>Business profile</strong>
              <small>Identity & public presence</small>
            </div>
          </button>

          <button
            className={tab === "hours" ? "active" : ""}
            onClick={() => setTab("hours")}
          >
            <span>02</span>
            <div>
              <strong>Business hours</strong>
              <small>Weekly operating schedule</small>
            </div>
          </button>

          <button
            className={tab === "booking" ? "active" : ""}
            onClick={() => setTab("booking")}
          >
            <span>03</span>
            <div>
              <strong>Booking rules</strong>
              <small>Appointments & availability</small>
            </div>
          </button>

          <button
            className={tab === "marketplace" ? "active" : ""}
            onClick={() => setTab("marketplace")}
          >
            <span>04</span>
            <div>
              <strong>Marketplace</strong>
              <small>Discovery & publishing</small>
            </div>
          </button>

          <button
            className={tab === "subscription" ? "active" : ""}
            onClick={() => setTab("subscription")}
          >
            <span>05</span>
            <div>
              <strong>Subscription</strong>
              <small>Plan & access</small>
            </div>
          </button>

          <button
            className={tab === "account" ? "active" : ""}
            onClick={() => setTab("account")}
          >
            <span>06</span>
            <div>
              <strong>Account & security</strong>
              <small>Session & account access</small>
            </div>
          </button>
        </nav>

        <div className="settingsContent">
          {tab === "profile" && profile && (
            <section className="settingsPanel">
              <div className="settingsPanelHead">
                <div>
                  <span>BUSINESS IDENTITY</span>
                  <h2>Business profile</h2>
                  <p>
                    The information customers see when they discover your
                    business on Kora.
                  </p>
                </div>
                <div className="settingsStatus">
                  {profile.publishedAt ? "Published" : "Not published"}
                </div>
              </div>

              <div className="settingsGrid two">
                <label>
                  <span>Display name</span>
                  <input
                    value={profile.displayName ?? ""}
                    maxLength={160}
                    onChange={(e) =>
                      setProfile({ ...profile, displayName: e.target.value })
                    }
                  />
                </label>

                <label>
                  <span>Marketplace slug</span>
                  <input
                    value={profile.slug ?? ""}
                    placeholder="your-business"
                    maxLength={80}
                    onChange={(e) =>
                      setProfile({ ...profile, slug: e.target.value })
                    }
                  />
                </label>
              </div>

              <label className="settingsField">
                <span>Business description</span>
                <textarea
                  value={profile.description ?? ""}
                  maxLength={2000}
                  rows={6}
                  placeholder="Tell customers what makes your business special."
                  onChange={(e) =>
                    setProfile({ ...profile, description: e.target.value })
                  }
                />
              </label>

              <div className="settingsGrid two">
                <label>
                  <span>Logo image URL</span>
                  <input
                    type="url"
                    value={profile.logoImageUrl ?? ""}
                    placeholder="https://..."
                    onChange={(e) =>
                      setProfile({ ...profile, logoImageUrl: e.target.value })
                    }
                  />
                </label>

                <label>
                  <span>Cover image URL</span>
                  <input
                    type="url"
                    value={profile.coverImageUrl ?? ""}
                    placeholder="https://..."
                    onChange={(e) =>
                      setProfile({ ...profile, coverImageUrl: e.target.value })
                    }
                  />
                </label>
              </div>

              <label className="settingsField">
                <span>Search keywords</span>
                <input
                  value={profile.searchKeywords ?? ""}
                  maxLength={500}
                  placeholder="barber, haircut, grooming, Accra"
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      searchKeywords: e.target.value,
                    })
                  }
                />
                <small>
                  Help customers find the business through relevant search terms.
                </small>
              </label>

              <div className="settingsActions">
                <button
                  className="settingsPrimary"
                  disabled={saving === "profile"}
                  onClick={() => void saveProfile()}
                >
                  {saving === "profile" ? "Saving…" : "Save business profile"}
                </button>
              </div>
            </section>
          )}

          {tab === "hours" && (
            <section className="settingsPanel">
              <div className="settingsPanelHead">
                <div>
                  <span>OPERATING SCHEDULE</span>
                  <h2>Business hours</h2>
                  <p>
                    Set the regular weekly hours for {workspace?.branchName}.
                  </p>
                </div>
              </div>

              <div className="hoursList">
                {DAYS.map((day, dayOfWeek) => {
                  const item = hoursByDay.get(dayOfWeek);
                  const open = Boolean(item);

                  return (
                    <div className="hoursRow" key={day}>
                      <div className="hoursDay">
                        <button
                          type="button"
                          className={`settingsSwitch ${open ? "on" : ""}`}
                          onClick={() => toggleDay(dayOfWeek)}
                          aria-label={`${open ? "Close" : "Open"} ${day}`}
                        >
                          <i />
                        </button>
                        <strong>{day}</strong>
                      </div>

                      {item ? (
                        <div className="hoursTimes">
                          <input
                            type="time"
                            value={item.startLocalTime}
                            onChange={(e) =>
                              updateHour(
                                dayOfWeek,
                                "startLocalTime",
                                e.target.value,
                              )
                            }
                          />
                          <span>to</span>
                          <input
                            type="time"
                            value={item.endLocalTime}
                            onChange={(e) =>
                              updateHour(
                                dayOfWeek,
                                "endLocalTime",
                                e.target.value,
                              )
                            }
                          />
                        </div>
                      ) : (
                        <span className="hoursClosed">Closed</span>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="settingsActions">
                <button
                  className="settingsPrimary"
                  disabled={saving === "hours"}
                  onClick={() => void saveHours()}
                >
                  {saving === "hours" ? "Saving…" : "Save business hours"}
                </button>
              </div>
            </section>
          )}

          {tab === "booking" && (
            <section className="settingsPanel">
              <div className="settingsPanelHead">
                <div>
                  <span>APPOINTMENT CONTROL</span>
                  <h2>Booking rules</h2>
                  <p>
                    Control when customers can book and how Kora builds the
                    appointment calendar.
                  </p>
                </div>
              </div>

              <div className="settingsGrid three">
                <NumberField
                  label="Slot interval"
                  suffix="minutes"
                  value={policy.slotIntervalMinutes}
                  min={1}
                  onChange={(value) =>
                    setPolicy({ ...policy, slotIntervalMinutes: value })
                  }
                />
                <NumberField
                  label="Minimum lead time"
                  suffix="minutes"
                  value={policy.minBookingLeadTimeMinutes}
                  min={0}
                  onChange={(value) =>
                    setPolicy({
                      ...policy,
                      minBookingLeadTimeMinutes: value,
                    })
                  }
                />
                <NumberField
                  label="Booking horizon"
                  suffix="days"
                  value={policy.maxBookingHorizonDays}
                  min={1}
                  onChange={(value) =>
                    setPolicy({ ...policy, maxBookingHorizonDays: value })
                  }
                />
                <NumberField
                  label="Buffer before"
                  suffix="minutes"
                  value={policy.bufferBeforeMinutes}
                  min={0}
                  onChange={(value) =>
                    setPolicy({ ...policy, bufferBeforeMinutes: value })
                  }
                />
                <NumberField
                  label="Buffer after"
                  suffix="minutes"
                  value={policy.bufferAfterMinutes}
                  min={0}
                  onChange={(value) =>
                    setPolicy({ ...policy, bufferAfterMinutes: value })
                  }
                />
                <NumberField
                  label="Cancellation cutoff"
                  suffix="minutes"
                  value={policy.cancellationCutoffMinutes}
                  min={0}
                  onChange={(value) =>
                    setPolicy({
                      ...policy,
                      cancellationCutoffMinutes: value,
                    })
                  }
                />
              </div>

              <div className="settingsToggleCard">
                <div>
                  <strong>Customer provider selection</strong>
                  <p>
                    Allow customers to choose a specific staff member while
                    booking.
                  </p>
                </div>
                <button
                  className={`settingsSwitch ${
                    policy.allowCustomerProviderSelection ? "on" : ""
                  }`}
                  onClick={() =>
                    setPolicy({
                      ...policy,
                      allowCustomerProviderSelection:
                        !policy.allowCustomerProviderSelection,
                    })
                  }
                >
                  <i />
                </button>
              </div>

              <div className="settingsToggleCard">
                <div>
                  <strong>Allow any available provider</strong>
                  <p>
                    Customers may book without selecting a specific provider.
                  </p>
                </div>
                <button
                  className={`settingsSwitch ${
                    policy.allowAnyProvider ? "on" : ""
                  }`}
                  onClick={() =>
                    setPolicy({
                      ...policy,
                      allowAnyProvider: !policy.allowAnyProvider,
                    })
                  }
                >
                  <i />
                </button>
              </div>

              <div className="settingsActions">
                <button
                  className="settingsPrimary"
                  disabled={saving === "policy"}
                  onClick={() => void savePolicy()}
                >
                  {saving === "policy" ? "Saving…" : "Save booking rules"}
                </button>
              </div>
            </section>
          )}

          {tab === "marketplace" && branch && profile && (
            <section className="settingsPanel">
              <div className="settingsPanelHead">
                <div>
                  <span>KORA MARKETPLACE</span>
                  <h2>Discovery & publishing</h2>
                  <p>
                    Control whether customers can discover this branch and
                    contact your business.
                  </p>
                </div>
                <div
                  className={`settingsStatus ${
                    profile.publishedAt ? "live" : ""
                  }`}
                >
                  {profile.publishedAt ? "Live" : "Private"}
                </div>
              </div>

              <div className="settingsToggleCard highlight">
                <div>
                  <strong>Make this branch discoverable</strong>
                  <p>
                    Eligible branches can appear in Kora customer discovery.
                  </p>
                </div>
                <button
                  className={`settingsSwitch ${
                    branch.isDiscoverable ? "on" : ""
                  }`}
                  onClick={() =>
                    setBranch({
                      ...branch,
                      isDiscoverable: !branch.isDiscoverable,
                    })
                  }
                >
                  <i />
                </button>
              </div>

              <div className="settingsGrid two">
                <label>
                  <span>Public phone</span>
                  <input
                    value={branch.publicPhone ?? ""}
                    maxLength={40}
                    placeholder="+233..."
                    onChange={(e) =>
                      setBranch({ ...branch, publicPhone: e.target.value })
                    }
                  />
                </label>

                <label>
                  <span>Public email</span>
                  <input
                    value={branch.publicEmail ?? ""}
                    maxLength={160}
                    placeholder="hello@business.com"
                    onChange={(e) =>
                      setBranch({ ...branch, publicEmail: e.target.value })
                    }
                  />
                </label>

                <label>
                  <span>Latitude</span>
                  <input
                    type="number"
                    step="any"
                    value={branch.latitude ?? ""}
                    onChange={(e) =>
                      setBranch({
                        ...branch,
                        latitude:
                          e.target.value === ""
                            ? null
                            : Number(e.target.value),
                      })
                    }
                  />
                </label>

                <label>
                  <span>Longitude</span>
                  <input
                    type="number"
                    step="any"
                    value={branch.longitude ?? ""}
                    onChange={(e) =>
                      setBranch({
                        ...branch,
                        longitude:
                          e.target.value === ""
                            ? null
                            : Number(e.target.value),
                      })
                    }
                  />
                </label>
              </div>

              <label className="settingsField">
                <span>Opening-hours note</span>
                <textarea
                  rows={3}
                  maxLength={500}
                  value={branch.openingHoursNote ?? ""}
                  placeholder="Walk-ins welcome. Public holidays may vary."
                  onChange={(e) =>
                    setBranch({
                      ...branch,
                      openingHoursNote: e.target.value,
                    })
                  }
                />
              </label>

              <div className="settingsActions split">
                <button
                  className="settingsSecondary"
                  disabled={saving === "discovery"}
                  onClick={() => void saveDiscovery()}
                >
                  {saving === "discovery"
                    ? "Saving…"
                    : "Save marketplace settings"}
                </button>

                <button
                  className={
                    profile.publishedAt
                      ? "settingsDanger"
                      : "settingsPrimary"
                  }
                  disabled={saving === "publish"}
                  onClick={() => void togglePublication()}
                >
                  {saving === "publish"
                    ? "Working…"
                    : profile.publishedAt
                      ? "Unpublish profile"
                      : "Publish profile"}
                </button>
              </div>
            </section>
          )}

          {tab === "account" && (
            <section className="settingsPanel">
              <div className="settingsPanelHead">
                <div>
                  <span>ACCOUNT SECURITY</span>
                  <h2>Account & security</h2>
                  <p>
                    Manage access to your Kora workspace and securely end your
                    current session.
                  </p>
                </div>
              </div>

              <div className="accountSecurityCard">
                <div className="accountSecurityIcon" aria-hidden="true">
                  ↗
                </div>
                <div className="accountSecurityCopy">
                  <strong>Log out of Kora OS</strong>
                  <p>
                    End your current session on this device. You will need to
                    verify your email again when you next sign in.
                  </p>
                </div>
                <button
                  type="button"
                  className="settingsDanger accountLogoutButton"
                  onClick={() => void handleLogout()}
                  disabled={loggingOut}
                >
                  {loggingOut ? "Logging out…" : "Log out"}
                </button>
              </div>

              <div className="settingsTrust">
                <span>◆</span>
                <div>
                  <strong>Your workspace stays protected</strong>
                  <p>
                    Logging out revokes this Kora session and removes its
                    authentication details from this browser.
                  </p>
                </div>
              </div>
            </section>
          )}

          {tab === "subscription" && (
            <section className="settingsPanel">
              <div className="settingsPanelHead">
                <div>
                  <span>KORA PLAN</span>
                  <h2>Subscription</h2>
                  <p>
                    Your current Kora subscription and workspace access.
                  </p>
                </div>
              </div>

              <div className="subscriptionHero">
                <div>
                  <small>CURRENT PLAN</small>
                  <h3>
                    {String(
                      subscription?.planName ??
                        subscription?.planCode ??
                        "Kora",
                    )}
                  </h3>
                  <span>
                    {String(subscription?.status ?? "Active")}
                  </span>
                </div>
                <div className="subscriptionMark">K</div>
              </div>

              <div className="settingsInfoGrid">
                <article>
                  <small>BUSINESS</small>
                  <strong>{workspace?.organizationName}</strong>
                </article>
                <article>
                  <small>BRANCH</small>
                  <strong>{workspace?.branchName}</strong>
                </article>
                <article>
                  <small>CURRENCY</small>
                  <strong>{workspace?.currency}</strong>
                </article>
                <article>
                  <small>TIME ZONE</small>
                  <strong>{workspace?.timeZone}</strong>
                </article>
              </div>

              <div className="settingsTrust">
                <span>◆</span>
                <div>
                  <strong>Subscription management</strong>
                  <p>
                    Kora is reading the plan directly from your business
                    subscription record. Billing actions will only appear when
                    the backend supports them.
                  </p>
                </div>
              </div>
            </section>
          )}
        </div>
      </section>

      <style jsx>{`
        .settingsShell {
          width: 100%;
          padding: 34px 36px 70px;
          color: var(--ws-text);
        }

        .settingsHeader {
          display: flex;
          justify-content: space-between;
          gap: 24px;
          align-items: flex-start;
          margin-bottom: 28px;
        }

        .settingsEyebrow,
        .settingsPanelHead span {
          display: block;
          color: var(--ws-gold);
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.16em;
          margin-bottom: 8px;
        }

        .settingsHeader h1 {
          margin: 0;
          font-size: clamp(32px, 4vw, 48px);
          line-height: 1;
          letter-spacing: -0.045em;
          color: var(--ws-text);
        }

        .settingsHeader p {
          max-width: 650px;
          margin: 12px 0 0;
          color: var(--ws-text-secondary);
          line-height: 1.6;
        }

        .settingsBranchPill {
          min-width: 220px;
          padding: 16px 18px;
          border: 1px solid var(--ws-border);
          border-radius: 16px;
          background: var(--ws-surface);
          box-shadow: 0 8px 30px rgba(15, 27, 45, 0.05);
        }

        .settingsBranchPill small {
          display: block;
          color: var(--ws-gold);
          font-weight: 900;
          font-size: 9px;
          letter-spacing: 0.14em;
        }

        .settingsBranchPill strong {
          display: block;
          margin-top: 5px;
          font-size: 15px;
        }

        .settingsBranchPill span {
          display: block;
          margin-top: 3px;
          color: var(--ws-text-secondary);
          font-size: 11px;
        }

        .settingsLayout {
          display: grid;
          grid-template-columns: 250px minmax(0, 1fr);
          gap: 24px;
          align-items: start;
        }

        .settingsNav {
          position: sticky;
          top: 24px;
          display: grid;
          gap: 7px;
          padding: 10px;
          border-radius: 18px;
          background: var(--ws-surface);
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
        }

        .settingsNav button {
          width: 100%;
          border: 0;
          border-radius: 12px;
          padding: 14px 12px;
          background: transparent;
          color: var(--ws-text-secondary);
          display: flex;
          align-items: center;
          gap: 12px;
          text-align: left;
          cursor: pointer;
        }

        .settingsNav button > span {
          display: grid;
          place-items: center;
          width: 30px;
          height: 30px;
          border-radius: 9px;
          background: rgba(255,255,255,.06);
          color: var(--ws-gold);
          font-size: 10px;
          font-weight: 900;
        }

        .settingsNav button strong,
        .settingsNav button small {
          display: block;
        }

        .settingsNav button strong {
          color: inherit;
          font-size: 13px;
        }

        .settingsNav button small {
          margin-top: 3px;
          font-size: 10px;
          opacity: .65;
        }

        .settingsNav button.active {
          background: linear-gradient(135deg, #caa347, #e1c16d);
          color: #171008;
        }

        .settingsNav button.active > span {
          background: rgba(16,27,45,.12);
          color: var(--ws-text);
        }

        .settingsContent {
          min-width: 0;
        }

        .settingsPanel {
          padding: 30px;
          border: 1px solid var(--ws-border);
          border-radius: 22px;
          background: var(--ws-surface);
          box-shadow: 0 16px 50px rgba(17, 31, 50, 0.06);
        }

        .settingsPanelHead {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          padding-bottom: 24px;
          margin-bottom: 24px;
          border-bottom: 1px solid var(--ws-border);
        }

        .settingsPanelHead h2 {
          margin: 0;
          color: var(--ws-text);
          font-size: 26px;
          letter-spacing: -.035em;
        }

        .settingsPanelHead p {
          margin: 7px 0 0;
          color: var(--ws-text-secondary);
          font-size: 13px;
          line-height: 1.55;
        }

        .settingsStatus {
          align-self: flex-start;
          padding: 7px 11px;
          border-radius: 999px;
          background: var(--ws-surface-2);
          color: var(--ws-text-secondary);
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: .08em;
        }

        .settingsStatus.live {
          background: var(--ws-success-soft);
          color: var(--ws-success);
        }

        .settingsGrid {
          display: grid;
          gap: 18px;
          margin-bottom: 18px;
        }

        .settingsGrid.two {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .settingsGrid.three {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .settingsGrid label,
        .settingsField {
          display: grid;
          gap: 7px;
        }

        .settingsGrid label > span,
        .settingsField > span {
          font-size: 11px;
          font-weight: 800;
          color: var(--ws-text-secondary);
        }

        input,
        textarea {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid var(--ws-border);
          border-radius: 11px;
          padding: 12px 13px;
          outline: none;
          background: var(--ws-surface);
          color: var(--ws-text);
          font: inherit;
          font-size: 13px;
        }

        input:focus,
        textarea:focus {
          border-color: #c69b39;
          box-shadow: 0 0 0 3px rgba(198,155,57,.11);
          background: var(--ws-surface);
        }

        textarea {
          resize: vertical;
        }

        .settingsField {
          margin-bottom: 18px;
        }

        .settingsField small {
          color: var(--ws-text-secondary);
          font-size: 10px;
        }

        .settingsActions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 28px;
          padding-top: 22px;
          border-top: 1px solid var(--ws-border);
        }

        .settingsActions.split {
          justify-content: space-between;
        }

        .settingsPrimary,
        .settingsSecondary,
        .settingsDanger {
          border: 0;
          border-radius: 11px;
          padding: 12px 17px;
          font-weight: 850;
          font-size: 12px;
          cursor: pointer;
        }

        .settingsPrimary {
          background: linear-gradient(135deg, #b98b2e, #d7b75f);
          color: #171008;
        }

        .settingsSecondary {
          border: 1px solid var(--ws-border-strong);
          background: var(--ws-surface-2);
          color: var(--ws-text);
        }

        .settingsDanger {
          border: 1px solid rgba(255, 128, 128, 0.25);
          background: var(--ws-error-soft);
          color: var(--ws-error);
        }

        button:disabled {
          opacity: .55;
          cursor: wait;
        }

        .hoursList {
          display: grid;
          gap: 8px;
        }

        .hoursRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          padding: 13px 15px;
          border: 1px solid var(--ws-border);
          border-radius: 13px;
          background: var(--ws-surface-2);
        }

        .hoursDay {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 170px;
        }

        .hoursDay strong {
          font-size: 12px;
        }

        .hoursTimes {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .hoursTimes input {
          width: 125px;
          padding: 8px 10px;
          background: var(--ws-surface);
        }

        .hoursTimes span,
        .hoursClosed {
          color: var(--ws-text-secondary);
          font-size: 11px;
        }

        .settingsSwitch {
          position: relative;
          width: 42px;
          height: 23px;
          flex: 0 0 42px;
          padding: 0;
          border: 0;
          border-radius: 999px;
          background: var(--ws-border);
          cursor: pointer;
        }

        .settingsSwitch i {
          position: absolute;
          width: 17px;
          height: 17px;
          left: 3px;
          top: 3px;
          border-radius: 50%;
          background: #f4f6f7;
          box-shadow: 0 2px 5px rgba(0,0,0,.35);
          transition: .18s ease;
        }

        .settingsSwitch.on {
          background: #c49a3c;
        }

        .settingsSwitch.on i {
          transform: translateX(19px);
        }

        .settingsToggleCard {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
          padding: 17px 18px;
          margin-top: 10px;
          border: 1px solid var(--ws-border);
          border-radius: 14px;
          background: var(--ws-surface-2);
        }

        .settingsToggleCard.highlight {
          margin-bottom: 20px;
          background: var(--ws-gold-soft);
          color: var(--ws-text-secondary);
          border-color: rgba(244, 169, 0, 0.25);
        }

        .settingsToggleCard strong {
          font-size: 12px;
        }

        .settingsToggleCard p {
          margin: 4px 0 0;
          color: var(--ws-text-secondary);
          font-size: 11px;
        }

        .settingsToggleCard.highlight p {
          color: var(--ws-text-muted);
        }

        .subscriptionHero {
          min-height: 170px;
          padding: 26px;
          border-radius: 18px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background:
            radial-gradient(circle at 80% 20%, rgba(214,178,84,.24), transparent 35%),
            linear-gradient(135deg, #0d192a, #162842);
          color: var(--ws-text-muted);
        }

        .subscriptionHero small {
          color: var(--ws-gold);
          font-size: 9px;
          letter-spacing: .15em;
          font-weight: 900;
        }

        .subscriptionHero h3 {
          margin: 8px 0 3px;
          font-size: 31px;
          letter-spacing: -.04em;
        }

        .subscriptionHero span {
          color: var(--ws-text-secondary);
          font-size: 11px;
        }

        .subscriptionMark {
          width: 82px;
          height: 82px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(222,190,104,.45);
          border-radius: 25px;
          color: var(--ws-gold);
          font-size: 37px;
          font-weight: 950;
          background: rgba(255,255,255,.04);
        }

        .settingsInfoGrid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0,1fr));
          gap: 10px;
          margin-top: 14px;
        }

        .settingsInfoGrid article {
          padding: 15px;
          border: 1px solid var(--ws-border);
          border-radius: 13px;
        }

        .settingsInfoGrid small {
          display: block;
          color: var(--ws-gold);
          font-size: 8px;
          font-weight: 900;
          letter-spacing: .12em;
        }

        .settingsInfoGrid strong {
          display: block;
          margin-top: 6px;
          font-size: 11px;
          overflow-wrap: anywhere;
        }

        .accountSecurityCard {
          display: grid;
          grid-template-columns: 52px minmax(0, 1fr) auto;
          gap: 18px;
          align-items: center;
          margin-top: 26px;
          padding: 22px;
          border: 1px solid rgba(239, 68, 68, 0.2);
          border-radius: 16px;
          background:
            linear-gradient(135deg, rgba(239, 68, 68, 0.07), rgba(239, 68, 68, 0.02)),
            rgba(255, 255, 255, 0.02);
        }

        .accountSecurityIcon {
          display: grid;
          place-items: center;
          width: 52px;
          height: 52px;
          border: 1px solid rgba(239, 68, 68, 0.24);
          border-radius: 14px;
          background: rgba(239, 68, 68, 0.08);
          color: #f87171;
          font-size: 23px;
          font-weight: 800;
        }

        .accountSecurityCopy {
          min-width: 0;
        }

        .accountSecurityCopy strong {
          display: block;
          color: #f4f7fb;
          font-size: 15px;
          line-height: 22px;
        }

        .accountSecurityCopy p {
          margin: 5px 0 0;
          max-width: 560px;
          color: #8f9bad;
          font-size: 13px;
          line-height: 21px;
        }

        .accountLogoutButton {
          min-width: 112px;
          white-space: nowrap;
        }

        .accountLogoutButton:disabled {
          cursor: wait;
          opacity: 0.6;
        }

        @media (max-width: 720px) {
          .accountSecurityCard {
            grid-template-columns: 48px minmax(0, 1fr);
          }

          .accountSecurityIcon {
            width: 48px;
            height: 48px;
          }

          .accountLogoutButton {
            grid-column: 1 / -1;
            width: 100%;
          }
        }

        .settingsTrust {
          display: flex;
          gap: 13px;
          padding: 17px;
          margin-top: 18px;
          border-radius: 14px;
          background: var(--ws-surface-2);
        }

        .settingsTrust > span {
          color: var(--ws-gold);
        }

        .settingsTrust strong {
          font-size: 12px;
        }

        .settingsTrust p {
          margin: 4px 0 0;
          color: var(--ws-text-secondary);
          font-size: 11px;
          line-height: 1.5;
        }

        .settingsAlert {
          margin-bottom: 18px;
          padding: 12px 15px;
          border-radius: 11px;
          font-size: 12px;
          font-weight: 700;
        }

        .settingsAlert.error {
          border: 1px solid rgba(255, 128, 128, 0.25);
          background: var(--ws-error-soft);
          color: var(--ws-error);
        }

        .settingsAlert.success {
          border: 1px solid rgba(61, 220, 132, 0.3);
          background: var(--ws-success-soft);
          color: var(--ws-success);
        }

        .settingsLoading {
          padding: 70px 20px;
          color: var(--ws-text-secondary);
          text-align: center;
        }

        @media (max-width: 1050px) {
          .settingsLayout {
            grid-template-columns: 1fr;
          }

          .settingsNav {
            position: static;
            grid-template-columns: repeat(5, minmax(0, 1fr));
          }

          .settingsNav button {
            justify-content: center;
          }

          .settingsNav button div {
            display: none;
          }

          .settingsGrid.three,
          .settingsInfoGrid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 720px) {
          .settingsShell {
            padding: 24px 18px 60px;
          }

          .settingsHeader {
            display: block;
          }

          .settingsBranchPill {
            margin-top: 18px;
          }

          .settingsPanel {
            padding: 20px;
          }

          .settingsGrid.two,
          .settingsGrid.three,
          .settingsInfoGrid {
            grid-template-columns: 1fr;
          }

          .hoursRow {
            align-items: flex-start;
            flex-direction: column;
          }

          .hoursTimes {
            width: 100%;
          }

          .hoursTimes input {
            flex: 1;
            width: auto;
          }

          .settingsActions.split {
            flex-direction: column;
          }
        }
      `}</style>
      </div>
    </WorkspaceShell>
  );
}

function NumberField({
  label,
  suffix,
  value,
  min,
  onChange,
}: {
  label: string;
  suffix: string;
  value: number;
  min: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <div style={{ position: "relative" }}>
        <input
          type="number"
          min={min}
          value={value}
          onChange={(e) =>
            onChange(Math.max(min, Number(e.target.value) || min))
          }
          style={{ paddingRight: 72 }}
        />
        <small
          style={{
            position: "absolute",
            right: 12,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--ws-text-muted)",
            fontSize: 9,
          }}
        >
          {suffix}
        </small>
      </div>
    </label>
  );
}
