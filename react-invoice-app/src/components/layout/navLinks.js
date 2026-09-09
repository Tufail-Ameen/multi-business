import {
  faBoxesStacked,
  faBuilding,
  faCartShopping,
  faClipboardList,
  faFileInvoice,
  faTags,
  faShieldHalved,
  faTruck,
  faUserGroup,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import { PERMISSIONS } from "../../lib/permissions";

/** Main business work — permission se filter hota hai. */
export const mainNavLinks = [
  {
    to: "/invoices",
    label: "Invoices",
    icon: faFileInvoice,
    end: true,
    permission: PERMISSIONS.INVOICES_VIEW,
  },
  {
    to: "/clients",
    label: "Clients",
    icon: faUsers,
    permission: PERMISSIONS.CLIENTS_VIEW,
  },
  {
    to: "/stock",
    label: "Products & Stock",
    icon: faBoxesStacked,
    permission: PERMISSIONS.PRODUCTS_VIEW,
  },
  {
    to: "/rate-lists",
    label: "Rate lists",
    icon: faTags,
    permission: PERMISSIONS.RATE_LISTS_VIEW,
  },
  {
    to: "/suppliers",
    label: "Suppliers",
    icon: faTruck,
    permission: PERMISSIONS.SUPPLIERS_VIEW,
  },
  {
    to: "/purchases",
    label: "Purchases",
    icon: faCartShopping,
    permission: PERMISSIONS.PURCHASES_VIEW,
  },
];

/** Business ke andar team management. */
export const teamNavLinks = [
  {
    to: "/team/users",
    label: "Team Users",
    icon: faUserGroup,
    permission: PERMISSIONS.USERS_VIEW,
  },
  {
    to: "/team/roles",
    label: "Roles",
    icon: faShieldHalved,
    permission: PERMISSIONS.ROLES_VIEW,
  },
  {
    to: "/team/audit",
    label: "Audit Log",
    icon: faClipboardList,
    permission: PERMISSIONS.AUDIT_VIEW,
  },
];

/** Platform Super Admin only. */
export const platformNavLinks = [
  {
    to: "/platform/businesses",
    label: "Businesses",
    icon: faBuilding,
    permission: PERMISSIONS.PLATFORM_MANAGE_BUSINESSES,
  },
];

/** @deprecated use mainNavLinks — BottomNav compatibility */
export const navLinks = mainNavLinks;

export function getNavSectionLabel(pathname) {
  if (pathname.startsWith("/team")) return "Team";
  if (pathname.startsWith("/platform")) return "Platform";
  return "Workspace";
}

export function getNavPageTitle(pathname) {
  if (pathname.startsWith("/invoices/")) return "Invoice Details";
  if (pathname === "/rate-lists/new") return "New rate list";
  if (pathname === "/rate-lists/clients") return "Client rate lists";
  if (pathname.startsWith("/rate-lists/") && pathname !== "/rate-lists") {
    return "Rate list";
  }
  if (pathname.startsWith("/clients/") && pathname !== "/clients") return "Client";
  if (pathname.startsWith("/suppliers/") && pathname !== "/suppliers") {
    return "Supplier Details";
  }
  if (pathname === "/purchases/new") return "New Purchase";
  if (/^\/purchases\/[^/]+\/edit$/.test(pathname)) return "Edit Purchase";
  if (pathname.startsWith("/purchases/") && pathname !== "/purchases") {
    return "Purchase Details";
  }
  const all = [...mainNavLinks, ...teamNavLinks, ...platformNavLinks];
  const match = all.find((link) =>
    link.end ? pathname === link.to : pathname.startsWith(link.to)
  );
  return match?.label ?? "Dashboard";
}

export function filterNavByPermission(links, can) {
  return links.filter((link) => !link.permission || can(link.permission));
}
