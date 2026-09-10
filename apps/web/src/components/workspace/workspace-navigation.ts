export interface WorkspaceNavItem {
  labelKey: string;
  icon: string;
  href: string;
  anyPermissions?: string[];
}

export const workspaceNavItems: WorkspaceNavItem[] = [
  { labelKey: "overview", icon: "▣", href: "/app" },
  {
    labelKey: "appointments",
    icon: "▧",
    href: "/app/appointments",
    anyPermissions: ["appointments.read", "appointments.manage"],
  },
  {
    labelKey: "queue",
    icon: "◌",
    href: "/app/queue",
    anyPermissions: ["queue.read", "queue.manage"],
  },
  {
    labelKey: "customers",
    icon: "◉",
    href: "/app/customers",
    anyPermissions: ["customers.read", "customers.manage"],
  },
  {
    labelKey: "staff",
    icon: "♙",
    href: "/app/staff",
    anyPermissions: ["staff.read", "staff.manage", "staff.invite"],
  },
  {
    labelKey: "services",
    icon: "▤",
    href: "/app/services",
    anyPermissions: ["services.read", "services.manage"],
  },
  {
    labelKey: "products",
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
    labelKey: "storefront",
    icon: "⌗",
    href: "/app/qr",
    anyPermissions: ["business_profile.manage"],
  },
  {
    labelKey: "payments",
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
    labelKey: "transactions",
    icon: "▰",
    href: "/app/transactions",
    anyPermissions: ["transactions.read"],
  },
  {
    labelKey: "reports",
    icon: "◫",
    href: "/app/reports",
    anyPermissions: ["reports.read"],
  },
  {
    labelKey: "settings",
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

export function hasAnyWorkspacePermission(
  permissionCodes: readonly string[],
  required: readonly string[] | undefined,
): boolean {
  if (!required?.length) return true;
  const granted = new Set(permissionCodes);
  return required.some((permission) => granted.has(permission));
}

export function visibleWorkspaceNavItems(permissionCodes: readonly string[]) {
  return workspaceNavItems.filter((item) =>
    hasAnyWorkspacePermission(permissionCodes, item.anyPermissions),
  );
}
