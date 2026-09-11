"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";
import { KoraApiError, koraData } from "@/lib/api/kora-api";

type Tab = "overview" | "businesses" | "users" | "subscriptions" | "activity";

interface Business {
  id: string;
  name: string;
  slug: string;
  businessType: string;
  status: string;
  countryCode: string;
  createdAt: string;
  branches: number;
  memberships: number;
  subscription: { planName: string; status: string } | null;
  marketplace: { visibility: string; verificationStatus: string } | null;
}

interface User {
  id: string;
  displayName: string;
  email: string | null;
  status: string;
  createdAt: string;
  memberships: Array<{ organizationId: string; organization: { name: string } }>;
}

interface SubscriptionPlanPrice {
  billingInterval: "MONTH" | "YEAR";
  amountMinor: number | null;
  currency: string;
}

interface SubscriptionPlanEntitlement {
  code: string;
  name: string;
  value: boolean | number | string | null;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function amountLabel(price: SubscriptionPlanPrice | undefined, customLabel: string) {
  if (!price || price.amountMinor === null) return customLabel;
  return `${price.currency} ${(price.amountMinor / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function SuperAdminPage() {
  const locale = useLocale();
  const t = useTranslations("SuperAdmin");
  const localize = (path: string) => `/${locale}${path}`;
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [businessTotal, setBusinessTotal] = useState(0);
  const [businessSearch, setBusinessSearch] = useState("");
  const [businessPage, setBusinessPage] = useState(1);
  const [selectedBusiness, setSelectedBusiness] = useState<Record<string, unknown> | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [subscriptions, setSubscriptions] = useState<Array<Record<string, unknown>>>([]);
  const [activity, setActivity] = useState<Array<Record<string, unknown>>>([]);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setOverview(await koraData<Record<string, unknown>>("/platform/overview"));
      setForbidden(false);
    } catch (cause) {
      if (cause instanceof KoraApiError && cause.status === 403) setForbidden(true);
      setError(cause instanceof Error ? cause.message : t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadBusinesses = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ page: String(businessPage) });
      if (businessSearch.trim()) query.set("search", businessSearch.trim());
      const result = await koraData<{ data: Business[]; page: { total: number } }>(
        `/platform/businesses?${query.toString()}`,
      );
      setBusinesses(result.data ?? []);
      setBusinessTotal(result.page?.total ?? 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [businessPage, businessSearch, t]);

  const loadTab = useCallback(async (nextTab: Tab) => {
    if (nextTab === "overview") return loadOverview();
    setLoading(true);
    setError("");
    try {
      if (nextTab === "businesses") await loadBusinesses();
      if (nextTab === "users") {
        const query = userSearch.trim() ? `?search=${encodeURIComponent(userSearch.trim())}` : "";
        const result = await koraData<{ data: User[] }>(`/platform/users${query}`);
        setUsers(result.data ?? []);
      }
      if (nextTab === "subscriptions") setSubscriptions(await koraData<Array<Record<string, unknown>>>("/platform/subscriptions"));
      if (nextTab === "activity") setActivity(await koraData<Array<Record<string, unknown>>>("/platform/activity"));
      setForbidden(false);
    } catch (cause) {
      if (cause instanceof KoraApiError && cause.status === 403) setForbidden(true);
      setError(cause instanceof Error ? cause.message : t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [loadBusinesses, loadOverview, t, userSearch]);

  useEffect(() => {
    const task = window.setTimeout(() => void loadTab(tab), 0);
    return () => window.clearTimeout(task);
  }, [loadTab, tab]);

  async function openBusiness(id: string) {
    try {
      setSelectedBusiness(await koraData<Record<string, unknown>>(`/platform/businesses/${id}`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("loadError"));
    }
  }

  const subscriptionsByStatus = (overview?.subscriptions ?? {}) as Record<string, number>;

  if (forbidden) {
    return (
      <main className="platform-admin-page">
        <section className="platform-admin-denied">
          <span className="platform-admin-kicker">{t("kicker")}</span>
          <h1>{t("deniedTitle")}</h1>
          <p>{t("deniedBody")}</p>
          <Link href={localize("/app")}>{t("returnKora")}</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="platform-admin-page">
      <header className="platform-admin-header">
        <div>
          <span className="platform-admin-kicker">{t("kicker")}</span>
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
        <div className="platform-admin-tools">
          <LanguageSwitcher compact />
          <Link href={localize("/app")} className="platform-admin-return">{t("returnKora")}</Link>
        </div>
      </header>

      <nav className="platform-admin-tabs" aria-label={t("navigation")}>
        {(["overview", "businesses", "users", "subscriptions", "activity"] as Tab[]).map((item) => (
          <button key={item} type="button" className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
            {t(item)}
          </button>
        ))}
      </nav>

      {error ? <div className="platform-admin-error" role="alert">{error}</div> : null}
      {loading ? <div className="platform-admin-loading">{t("loading")}</div> : null}

      {tab === "overview" && overview ? (
        <section className="platform-admin-grid">
          <article><span>{t("activeBusinesses")}</span><strong>{(overview.organizations as { active?: number })?.active ?? 0}</strong></article>
          <article><span>{t("users")}</span><strong>{String(overview.users ?? 0)}</strong></article>
          <article><span>{t("memberships")}</span><strong>{String(overview.activeMemberships ?? 0)}</strong></article>
          <article><span>{t("activeSubscriptions")}</span><strong>{subscriptionsByStatus.ACTIVE ?? 0}</strong></article>
          <article><span>{t("trialSubscriptions")}</span><strong>{subscriptionsByStatus.TRIALING ?? 0}</strong></article>
          <article><span>{t("suspendedSubscriptions")}</span><strong>{(subscriptionsByStatus.SUSPENDED ?? 0) + (subscriptionsByStatus.CANCELED ?? 0)}</strong></article>
        </section>
      ) : null}

      {tab === "businesses" ? (
        <section className="platform-admin-panel">
          <div className="platform-admin-toolbar"><h2>{t("businesses")}</h2><form onSubmit={(event) => { event.preventDefault(); setBusinessPage(1); void loadBusinesses(); }}><input aria-label={t("searchBusinesses")} value={businessSearch} onChange={(event) => setBusinessSearch(event.target.value)} placeholder={t("searchBusinesses")} /><button type="submit">{t("search")}</button></form></div>
          <div className="platform-admin-table-wrap"><table><thead><tr><th>{t("name")}</th><th>{t("status")}</th><th>{t("plan")}</th><th>{t("branches")}</th><th>{t("created")}</th></tr></thead><tbody>{businesses.map((business) => <tr key={business.id}><td><button type="button" className="platform-admin-link" onClick={() => void openBusiness(business.id)}><strong>{business.name}</strong><small>{business.id}</small></button></td><td>{business.status}</td><td>{business.subscription?.planName ?? t("notSet")}</td><td>{business.branches}</td><td>{dateLabel(business.createdAt)}</td></tr>)}</tbody></table></div><small>{businessTotal} {t("businessesLower")}</small>
        </section>
      ) : null}

      {tab === "users" ? (
        <section className="platform-admin-panel"><div className="platform-admin-toolbar"><h2>{t("users")}</h2><form onSubmit={(event) => { event.preventDefault(); void loadTab("users"); }}><input aria-label={t("searchUsers")} value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder={t("searchUsers")} /><button type="submit">{t("search")}</button></form></div><div className="platform-admin-table-wrap"><table><thead><tr><th>{t("name")}</th><th>{t("status")}</th><th>{t("organizations")}</th><th>{t("created")}</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><strong>{user.displayName}</strong><small>{user.email ?? user.id}</small></td><td>{user.status}</td><td>{user.memberships.map((membership) => membership.organization.name).join(", ") || t("none")}</td><td>{dateLabel(user.createdAt)}</td></tr>)}</tbody></table></div></section>
      ) : null}

      {tab === "subscriptions" ? <section className="platform-admin-panel"><h2>{t("subscriptions")}</h2><div className="platform-admin-table-wrap"><table><thead><tr><th>{t("business")}</th><th>{t("plan")}</th><th>{t("limits")}</th><th>{t("entitlements")}</th><th>{t("interval")}</th><th>{t("amount")}</th><th>{t("currency")}</th><th>{t("status")}</th><th>{t("periodEnd")}</th></tr></thead><tbody>{subscriptions.map((subscription) => { const plan = subscription.plan as { name?: string; planPrices?: SubscriptionPlanPrice[]; branchLimit?: number | null; staffLimit?: number | null; planEntitlements?: SubscriptionPlanEntitlement[] } | undefined; const prices = plan?.planPrices ?? []; const enabled = (plan?.planEntitlements ?? []).filter((entry) => entry.value === true).map((entry) => entry.name); return <tr key={String(subscription.organizationId)}><td>{String((subscription.organization as { name?: string })?.name ?? subscription.organizationId)}</td><td>{String(plan?.name ?? t("notSet"))}</td><td>{plan ? `${plan.branchLimit ?? t("custom")} / ${plan.staffLimit ?? t("custom")}` : t("notSet")}</td><td>{enabled.length ? enabled.join(", ") : t("notSet")}</td><td>{prices.length ? prices.map((price) => <div key={`${price.billingInterval}-interval`}>{price.billingInterval === "YEAR" ? t("annual") : t("monthly")}</div>) : t("notSet")}</td><td>{prices.length ? prices.map((price) => <div key={`${price.billingInterval}-amount`}>{amountLabel(price, t("custom"))}</div>) : t("notSet")}</td><td>{prices.length ? prices.map((price) => <div key={`${price.billingInterval}-currency`}>{price.currency}</div>) : t("notSet")}</td><td>{String(subscription.status)}</td><td>{subscription.currentPeriodEndsAt ? dateLabel(String(subscription.currentPeriodEndsAt)) : t("notSet")}</td></tr>; })}</tbody></table></div></section> : null}

      {tab === "activity" ? <section className="platform-admin-panel"><h2>{t("activity")}</h2><div className="platform-admin-table-wrap"><table><thead><tr><th>{t("action")}</th><th>{t("target")}</th><th>{t("actor")}</th><th>{t("created")}</th></tr></thead><tbody>{activity.map((event) => <tr key={String(event.id)}><td>{String(event.action)}</td><td>{String(event.entityType)} / {String(event.entityId)}</td><td>{String(event.actorUserId ?? t("system"))}</td><td>{dateLabel(String(event.occurredAt))}</td></tr>)}</tbody></table></div></section> : null}

      {selectedBusiness ? <aside className="platform-admin-detail"><button type="button" onClick={() => setSelectedBusiness(null)} aria-label={t("close")}>×</button><span className="platform-admin-kicker">{t("businessDetail")}</span><h2>{String(selectedBusiness.name)}</h2><p>{String(selectedBusiness.id)}</p><dl><dt>{t("status")}</dt><dd>{String(selectedBusiness.status)}</dd><dt>{t("branches")}</dt><dd>{Array.isArray(selectedBusiness.branches) ? selectedBusiness.branches.length : 0}</dd><dt>{t("plan")}</dt><dd>{String((selectedBusiness.subscription as { planName?: string } | null)?.planName ?? t("notSet"))}</dd></dl></aside> : null}
    </main>
  );
}
