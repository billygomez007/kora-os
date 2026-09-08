"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getKoraSession } from "@/lib/auth/session";
import {
  resolveActiveWorkspace,
  type ActiveWorkspace,
} from "@/lib/api/dashboard";

interface NavItem {
  label: string;
  icon: string;
  href: string;
  anyPermissions?: string[];
}

const navItems: NavItem[] = [
  {
    label: "Overview",
    icon: "▣",
    href: "/app",
  },
  {
    label: "Appointments",
    icon: "▧",
    href: "/app/appointments",
    anyPermissions: ["appointments.read", "appointments.manage"],
  },
  {
    label: "Queue",
    icon: "◌",
    href: "/app/queue",
    anyPermissions: ["queue.read", "queue.manage"],
  },
  {
    label: "Customers",
    icon: "◉",
    href: "/app/customers",
    anyPermissions: ["customers.read", "customers.manage"],
  },
  {
    label: "Staff",
    icon: "♙",
    href: "/app/staff",
    anyPermissions: ["staff.read", "staff.manage", "staff.invite"],
  },
  {
    label: "Services",
    icon: "▤",
    href: "/app/services",
    anyPermissions: ["services.read", "services.manage"],
  },
  {
    label: "Products & Inventory",
    icon: "▦",
    href: "/app/products",
    anyPermissions: [
      "products.read",
      "products.manage",
      "inventory.read",
      "inventory.manage",
    ],
  },
  {
    label: "QR & Storefront",
    icon: "⌗",
    href: "/app/qr",
    anyPermissions: ["business_profile.manage"],
  },
  {
    label: "Payments",
    icon: "▥",
    href: "/app/payments",
    anyPermissions: [
      "payments.read",
      "payments.record",
      "payments.resolve",
      "payments.void",
      "payments.refund",
    ],
  },
  {
    label: "Reports",
    icon: "◫",
    href: "/app/reports",
    anyPermissions: [
      "reports.read",
      "reports.basic",
      "reports.advanced",
    ],
  },
  {
    label: "Settings",
    icon: "⚙",
    href: "/app/settings",
    anyPermissions: [
      "organization.update",
      "branches.manage",
      "availability.manage",
      "roles.manage",
      "subscriptions.manage",
      "business_profile.manage",
    ],
  },
];

interface WorkspaceIdentity {
  businessName: string;
  branchName: string;
  email: string | null;
  roleLabel: string;
  permissionCodes: string[];
}

function hasAnyPermission(
  permissionCodes: readonly string[],
  required: readonly string[] | undefined,
): boolean {
  if (!required?.length) return true;

  const granted = new Set(permissionCodes);

  return required.some((permission) => granted.has(permission));
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

  const route = navItems
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

  return hasAnyPermission(
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

  const [identity, setIdentity] = useState<WorkspaceIdentity>({
    businessName: "Your Kora Business",
    branchName: "Primary location",
    email: null,
    roleLabel: "Kora team member",
    permissionCodes: [],
  });

  const [accessResolved, setAccessResolved] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const session = getKoraSession();

      void resolveActiveWorkspace()
        .then((workspace) => {
          setIdentity({
            businessName: workspace.organizationName,
            branchName: workspace.branchName,
            email: session?.user?.email ?? null,
            roleLabel: roleLabel(workspace),
            permissionCodes: workspace.permissionCodes,
          });

          setAccessResolved(true);
        })
        .catch(() => {
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
      navItems.filter((item) =>
        hasAnyPermission(
          identity.permissionCodes,
          item.anyPermissions,
        ),
      ),
    [identity.permissionCodes],
  );

  const pageAllowed =
    !accessResolved ||
    routeIsAllowed(pathname, identity.permissionCodes);

  function renderNavItem(item: NavItem, mobile = false) {
    const active =
      item.href === "/app"
        ? pathname === "/app"
        : pathname.startsWith(item.href);

    return (
      <Link
        key={item.label}
        href={item.href}
        className={active ? "active" : ""}
        onClick={
          mobile
            ? () => setMobileNavOpen(false)
            : undefined
        }
      >
        <span>{item.icon}</span>
        {item.label}
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
          <small>WORKSPACE</small>
          <strong>{identity.businessName}</strong>
          <span>{identity.branchName}</span>
        </div>

        <nav className="workspace-nav">
          {visibleNavItems.map((item) =>
            renderNavItem(item),
          )}
        </nav>

        <div className="workspace-sidebar-footer">
          <div className="workspace-user">
            <div className="workspace-avatar">
              {identity.email?.slice(0, 1).toUpperCase() || "K"}
            </div>

            <div>
              <strong>{identity.roleLabel}</strong>
              <span>{identity.email || "Kora account"}</span>
            </div>
          </div>
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
                ? "Close workspace menu"
                : "Open workspace menu"
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
            <span>Kora workspace</span>
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
              Checking workspace access…
            </div>
          ) : pageAllowed ? (
            children
          ) : (
            <section className="workspace-access-denied">
              <span>ACCESS RESTRICTED</span>
              <h1>This area is not available for your role.</h1>
              <p>
                Your Kora access is based on the permissions
                assigned to your role in this business.
              </p>

              <Link
                href="/app"
                className="workspace-primary-button"
              >
                Return to overview
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
                aria-label="Close workspace menu"
                onClick={() => setMobileNavOpen(false)}
              >
                ×
              </button>
            </div>

            {visibleNavItems.map((item) =>
              renderNavItem(item, true),
            )}
          </nav>
        </div>
      ) : null}
    </main>
  );
}
