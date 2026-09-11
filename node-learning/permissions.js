/**
 * Business-scoped permission catalog and default role templates.
 * Platform permission stays separate — never granted by business "*".
 */

const PLATFORM_MANAGE_BUSINESSES = "platform.manage_businesses";

/** Owner wildcard — full access within one business only. */
const OWNER_PERMISSIONS = ["*"];

/**
 * Canonical business permissions used by seed roles and sanitize().
 * Keep resource.action naming consistent with the frontend catalog.
 * Future module keys may appear here before APIs exist — they must not
 * be attached to routes until those APIs ship.
 */
const BUSINESS_PERMISSIONS = [
  "dashboard.view",

  "clients.view",
  "clients.create",
  "clients.update",
  "clients.delete",

  "products.view",
  "products.create",
  "products.update",
  "products.delete",

  "categories.view",
  "categories.create",
  "categories.update",
  "categories.delete",

  "inventory.view",
  "inventory.adjust",

  "suppliers.view",
  "suppliers.create",
  "suppliers.update",
  "suppliers.delete",

  "purchases.view",
  "purchases.create",
  "purchases.update",
  "purchases.delete",
  "purchases.confirm",

  "supplier_payments.view",
  "supplier_payments.create",
  "supplier_ledger.view",

  "invoices.view",
  "invoices.create",
  "invoices.update",
  "invoices.delete",
  "invoices.change_status",
  "invoices.print",

  "rate_lists.view",
  "rate_lists.create",
  "rate_lists.update",
  "rate_lists.delete",
  "rate_lists.send",

  "users.view",
  "users.invite",
  "users.update",
  "users.delete",
  "roles.view",
  "roles.manage",
  "business.manage_team",

  "business.settings",
  "audit.view",

  "orders.view",
  "orders.create",
  "orders.update",
  "orders.convert",

  // Future modules
  "reports.view",
];

const BUSINESS_PERMISSION_SET = new Set(BUSINESS_PERMISSIONS);

/**
 * Default system roles seeded per business.
 * Default seeded roles for a new business.
 */
const SYSTEM_ROLE_TEMPLATES = [
  {
    slug: "business_owner",
    name: "Business Owner",
    description: "Full access within this business (not platform admin)",
    permissions: [...OWNER_PERMISSIONS],
    isSystem: true,
  },
  {
    slug: "invoice_operator",
    name: "Invoice Operator",
    description: "Create and manage invoices and clients",
    permissions: [
      "dashboard.view",
      "clients.view",
      "clients.create",
      "clients.update",
      "products.view",
      "categories.view",
      "inventory.view",
      "invoices.view",
      "invoices.create",
      "invoices.update",
      "invoices.print",
      "rate_lists.view",
      "rate_lists.create",
      "rate_lists.update",
      "rate_lists.delete",
      "rate_lists.send",
      "orders.view",
      "orders.update",
      "orders.convert",
    ],
    isSystem: true,
  },
  {
    slug: "inventory_manager",
    name: "Inventory Manager",
    description: "Products, stock, vendors, and purchases",
    permissions: [
      "dashboard.view",
      "products.view",
      "products.create",
      "products.update",
      "products.delete",
      "categories.view",
      "categories.create",
      "categories.update",
      "categories.delete",
      "inventory.view",
      "inventory.adjust",
      "suppliers.view",
      "suppliers.create",
      "suppliers.update",
      "suppliers.delete",
      "purchases.view",
      "purchases.create",
      "purchases.update",
      "purchases.delete",
      "purchases.confirm",
      "supplier_payments.view",
      "supplier_payments.create",
      "supplier_ledger.view",
    ],
    isSystem: true,
  },
  {
    slug: "order_booker",
    name: "Order Booker",
    description: "Customers, rate lists, and orders",
    permissions: [
      "dashboard.view",
      "clients.view",
      "clients.create",
      "clients.update",
      "products.view",
      "orders.view",
      "orders.create",
      "orders.update",
      "rate_lists.view",
      "rate_lists.create",
      "rate_lists.update",
      "rate_lists.delete",
      "rate_lists.send",
    ],
    isSystem: true,
  },
  {
    slug: "manager",
    name: "Manager",
    description: "Broad read access across operations",
    permissions: [
      "dashboard.view",
      "products.view",
      "categories.view",
      "inventory.view",
      "clients.view",
      "invoices.view",
      "rate_lists.view",
      "suppliers.view",
      "purchases.view",
      "supplier_payments.view",
      "supplier_ledger.view",
      "orders.view",
      "reports.view",
    ],
    isSystem: true,
  },
];

function hasBusinessPermission(grantedPermissions, requiredPermission) {
  if (!requiredPermission) return true;
  if (!Array.isArray(grantedPermissions) || !grantedPermissions.length) {
    return false;
  }
  if (requiredPermission === PLATFORM_MANAGE_BUSINESSES) {
    return grantedPermissions.includes(PLATFORM_MANAGE_BUSINESSES);
  }
  if (grantedPermissions.includes("*")) return true;
  return grantedPermissions.includes(requiredPermission);
}

/**
 * Strip unknown / platform permissions from business role payloads.
 * Only business_owner may keep "*".
 */
function sanitizeBusinessPermissions(permissions, { allowWildcard = false } = {}) {
  if (!Array.isArray(permissions)) return [];
  const cleaned = [];
  for (const permission of permissions) {
    if (typeof permission !== "string") continue;
    if (permission === "*") {
      if (allowWildcard) cleaned.push("*");
      continue;
    }
    if (permission === PLATFORM_MANAGE_BUSINESSES) continue;
    if (BUSINESS_PERMISSION_SET.has(permission)) cleaned.push(permission);
  }
  return [...new Set(cleaned)];
}

function slugifyRoleName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

module.exports = {
  PLATFORM_MANAGE_BUSINESSES,
  OWNER_PERMISSIONS,
  BUSINESS_PERMISSIONS,
  SYSTEM_ROLE_TEMPLATES,
  hasBusinessPermission,
  sanitizeBusinessPermissions,
  slugifyRoleName,
};
