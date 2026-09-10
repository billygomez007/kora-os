"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { getKoraSession } from "@/lib/auth/session";
import { logoutKoraSession } from "@/lib/api/kora-api";
import {
  resolveActiveWorkspace,
  type ActiveWorkspace,
} from "@/lib/api/dashboard";
import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";
import { stripLocale } from "@/i18n/routing";
import {
  hasAnyWorkspacePermission,
  visibleWorkspaceNavItems,
  workspaceNavItems,
  type WorkspaceNavItem,
} from "./workspace-navigation";

interface WorkspaceIdentity {
  businessName: string;
  branchName: string;
  email: string | null;
  roleLabel: string;
  permissionCodes: string[];
}

function roleLabel(workspace: ActiveWorkspace): string {
  if (workspace.roleNames.length) {
    return workspace.roleNames.join(" · ");
  }

  if (workspace.roleCodes.length) {
    return workspace.roleCodes
      .map((code) =>
        code
          .split("_")
          .map((part) =>
            part.length
              ? `${part[0].toUpperCase()}${part.slice(1)}`
              : part,
          )
          .join(" "),
      )
      .join(" · ");
  }

  return "Kora team member";
}

function routeIsAllowed(
  pathname: string,
  permissionCodes: readonly string[],
): boolean {
  if (pathname === "/app") return true;

  const route = workspaceNavItems
    .filter((item) => item.href !== "/app")
    .sort((a, b) => b.href.length - a.href.length)
    .find(
      (item) =>
        pathname === item.href ||
        pathname.startsWith(`${item.href}/`),
    );

  if (!route) {
    return true;
  }

  return hasAnyWorkspacePermission(
    permissionCodes,
    route.anyPermissions,
  );
}

export default function WorkspaceShell({
  title,
  children,
  actions,
}: {
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const pathname = usePathname();
  const routePathname = stripLocale(pathname);
  const t = useTranslations("Workspace");

  const [identity, setIdentity] = useState<WorkspaceIdentity>({
    businessName: "Your Kora Business",
    branchName: "Primary location",
    email: null,
    roleLabel: "Kora team member",
    permissionCodes: [],
  });

  const [accessResolved, setAccessResolved] = useState(false);
  const [workspaceContextError, setWorkspaceContextError] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const session = getKoraSession();

      void resolveActiveWorkspace()
        .then((workspace) => {
          setWorkspaceContextError(false);
          setIdentity({
            businessName: workspace.organizationName,
            branchName: workspace.branchName,
            email: session?.user?.email ?? null,
            roleLabel: roleLabel(workspace),
            permissionCodes: workspace.permissionCodes,
          });

          setAccessResolved(true);
        })
        .catch((reason) => {
          setWorkspaceContextError(true);
          if (process.env.NODE_ENV === "development") {
            console.warn("[Kora workspace] context resolution failed", reason);
          }
          setIdentity((current) => ({
            ...current,
            email: session?.user?.email ?? null,
          }));

          setAccessResolved(true);
        });
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const visibleNavItems = useMemo(
    () =>
      visibleWorkspaceNavItems(identity.permissionCodes),
    [identity.permissionCodes],
  );

  const pageAllowed =
    !accessResolved ||
    routeIsAllowed(routePathname, identity.permissionCodes);

  async function handleSignOut() {
    if (signingOut) return;

    setSigningOut(true);

    try {
      await logoutKoraSession();
    } finally {
      window.location.replace("/login");
    }
  }

  function renderNavItem(item: WorkspaceNavItem, mobile = false) {
    const active =
      item.href === "/app"
        ? routePathname === "/app"
        : routePathname.startsWith(item.href);

    return (
      <Link
        key={item.labelKey}
        href={item.href}
        className={active ? "active" : ""}
        onClick={
          mobile
            ? () => setMobileNavOpen(false)
            : undefined
        }
      >
        <span>{item.icon}</span>
        {t(item.labelKey)}
      </Link>
    );
  }

  return (
    <main className="workspace-page">
      <aside className="workspace-sidebar">
        <div className="workspace-brand">
          <Image
            src="/brand/kora-app-icon.png"
            alt="Kora OS"
            width={38}
            height={38}
            priority
          />
          <span>Kora OS</span>
        </div>

        <div className="workspace-business">
          <small>{t("workspace").toUpperCase()}</small>
          <strong>{identity.businessName}</strong>
          <span>{identity.branchName}</span>
        </div>

        <nav className="workspace-nav">
          {workspaceContextError ? (
            <p className="workspace-nav-error">
              Workspace access unavailable. Sign in again.
            </p>
          ) : (
            visibleNavItems.map((item) => renderNavItem(item))
          )}
        </nav>

        <div className="workspace-sidebar-footer">
          <LanguageSwitcher compact />
          <div className="workspace-user">
            <div className="workspace-avatar">
              {identity.email?.slice(0, 1).toUpperCase() || "K"}
            </div>

            <div>
              <strong>{identity.roleLabel}</strong>
              <span>{identity.email || t("account")}</span>
            </div>
          </div>

          <button
            type="button"
            className="workspace-signout-button"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
          >
            {signingOut ? t("signingOut") : t("signOut")}
          </button>
        </div>
      </aside>

      <section className="workspace-main">
        <header className="workspace-topbar">
          <button
            type="button"
            className="workspace-mobile-nav-toggle"
            aria-expanded={mobileNavOpen}
            aria-controls="workspace-mobile-nav"
            aria-label={
              mobileNavOpen
                ? t("closeMenu")
                : t("openMenu")
            }
            onClick={() =>
              setMobileNavOpen((current) => !current)
            }
          >
            <span />
            <span />
            <span />
          </button>

          <div className="workspace-topbar-title">
            <span>Kora {t("workspace").toLowerCase()}</span>
            <strong>{title}</strong>
          </div>

          {pageAllowed && actions ? (
            <div className="workspace-actions">
              {actions}
            </div>
          ) : null}
        </header>

        <div className="workspace-content">
          {!accessResolved ? (
            <div className="workspace-access-loading">
              {t("checkingAccess")}
            </div>
          ) : pageAllowed ? (
            children
          ) : (
            <section className="workspace-access-denied">
              <span>{t("restrictedKicker")}</span>
              <h1>{t("restrictedTitle")}</h1>
              <p>{t("restrictedBody")}</p>

              <Link
                href="/app"
                className="workspace-primary-button"
              >
                {t("returnOverview")}
              </Link>
            </section>
          )}
        </div>
      </section>

      {mobileNavOpen ? (
        <div
          className="workspace-mobile-nav-backdrop"
          onClick={() => setMobileNavOpen(false)}
        >
          <nav
            id="workspace-mobile-nav"
            className="workspace-mobile-nav"
            aria-label="Workspace navigation"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="workspace-mobile-nav-head">
              <span>{identity.businessName}</span>

              <button
                type="button"
                aria-label={t("closeMenu")}
                onClick={() => setMobileNavOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="workspace-mobile-nav-links">
              {visibleNavItems.map((item) =>
                renderNavItem(item, true),
              )}
            </div>

            <div className="workspace-mobile-account">
              <LanguageSwitcher compact />
              <div className="workspace-user">
                <div className="workspace-avatar">
                  {identity.email?.slice(0, 1).toUpperCase() || "K"}
                </div>

                <div>
                  <strong>{identity.roleLabel}</strong>
                  <span>{identity.email || t("account")}</span>
                </div>
              </div>

              <button
                type="button"
                className="workspace-signout-button"
                onClick={() => void handleSignOut()}
                disabled={signingOut}
              >
                {signingOut ? t("signingOut") : t("signOut")}
              </button>
            </div>
          </nav>
        </div>
      ) : null}
    </main>
  );
}
