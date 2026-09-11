const assert = require("node:assert/strict");
const {
  OWNER_PERMISSIONS,
  PLATFORM_MANAGE_BUSINESSES,
  hasBusinessPermission,
  sanitizeBusinessPermissions,
  SYSTEM_ROLE_TEMPLATES,
} = require("../permissions");

const tests = [];
function test(name, run) {
  tests.push({ name, run });
}

test("owner wildcard is business-only", () => {
  assert.deepEqual(OWNER_PERMISSIONS, ["*"]);
  assert.equal(hasBusinessPermission(["*"], "clients.delete"), true);
  assert.equal(hasBusinessPermission(["*"], "users.invite"), true);
  assert.equal(hasBusinessPermission(["*"], "inventory.adjust"), true);
  assert.equal(
    hasBusinessPermission(["*"], PLATFORM_MANAGE_BUSINESSES),
    false
  );
});

test("invoice operator can manage invoices and clients", () => {
  const role = SYSTEM_ROLE_TEMPLATES.find((r) => r.slug === "invoice_operator");
  assert.ok(role);
  assert.equal(hasBusinessPermission(role.permissions, "invoices.create"), true);
  assert.equal(hasBusinessPermission(role.permissions, "clients.create"), true);
  assert.equal(hasBusinessPermission(role.permissions, "inventory.view"), true);
  assert.equal(hasBusinessPermission(role.permissions, "categories.view"), true);
  assert.equal(hasBusinessPermission(role.permissions, "inventory.adjust"), false);
  assert.equal(hasBusinessPermission(role.permissions, "users.invite"), false);
});

test("inventory manager cannot manage team", () => {
  const role = SYSTEM_ROLE_TEMPLATES.find((r) => r.slug === "inventory_manager");
  assert.equal(hasBusinessPermission(role.permissions, "products.create"), true);
  assert.equal(hasBusinessPermission(role.permissions, "categories.create"), true);
  assert.equal(hasBusinessPermission(role.permissions, "inventory.adjust"), true);
  assert.equal(hasBusinessPermission(role.permissions, "purchases.confirm"), true);
  assert.equal(hasBusinessPermission(role.permissions, "suppliers.create"), true);
  assert.equal(hasBusinessPermission(role.permissions, "users.invite"), false);
  assert.equal(hasBusinessPermission(role.permissions, "roles.manage"), false);
});

test("invoice operator and order booker do not get purchase permissions", () => {
  const clerk = SYSTEM_ROLE_TEMPLATES.find((r) => r.slug === "invoice_operator");
  const booker = SYSTEM_ROLE_TEMPLATES.find((r) => r.slug === "order_booker");
  assert.equal(hasBusinessPermission(clerk.permissions, "purchases.create"), false);
  assert.equal(hasBusinessPermission(clerk.permissions, "suppliers.view"), false);
  assert.equal(hasBusinessPermission(booker.permissions, "purchases.confirm"), false);
  assert.equal(hasBusinessPermission(booker.permissions, "supplier_payments.create"), false);
});

test("order booker can manage clients but not products", () => {
  const role = SYSTEM_ROLE_TEMPLATES.find((r) => r.slug === "order_booker");
  assert.equal(hasBusinessPermission(role.permissions, "clients.create"), true);
  assert.equal(hasBusinessPermission(role.permissions, "orders.create"), true);
  assert.equal(hasBusinessPermission(role.permissions, "products.create"), false);
  assert.equal(hasBusinessPermission(role.permissions, "inventory.adjust"), false);
});

test("sanitize strips platform permission and wildcard for custom roles", () => {
  const cleaned = sanitizeBusinessPermissions(
    ["clients.view", "platform.manage_businesses", "*", "not.real"],
    { allowWildcard: false }
  );
  assert.deepEqual(cleaned, ["clients.view"]);
});

test("sanitize allows wildcard when explicitly enabled", () => {
  const cleaned = sanitizeBusinessPermissions(["*", "clients.view"], {
    allowWildcard: true,
  });
  assert.deepEqual(cleaned, ["*", "clients.view"]);
});

test("invoice operator can manage rate lists", () => {
  const role = SYSTEM_ROLE_TEMPLATES.find((r) => r.slug === "invoice_operator");
  assert.equal(hasBusinessPermission(role.permissions, "rate_lists.create"), true);
  assert.equal(hasBusinessPermission(role.permissions, "rate_lists.send"), true);
});

test("order booker can create rate lists and view products", () => {
  const role = SYSTEM_ROLE_TEMPLATES.find((r) => r.slug === "order_booker");
  assert.equal(hasBusinessPermission(role.permissions, "rate_lists.create"), true);
  assert.equal(hasBusinessPermission(role.permissions, "products.view"), true);
  assert.equal(hasBusinessPermission(role.permissions, "products.create"), false);
});

test("inventory manager cannot manage rate lists", () => {
  const role = SYSTEM_ROLE_TEMPLATES.find((r) => r.slug === "inventory_manager");
  assert.equal(hasBusinessPermission(role.permissions, "rate_lists.view"), false);
  assert.equal(hasBusinessPermission(role.permissions, "rate_lists.create"), false);
});

test("invoice operator can convert store orders; booker cannot", () => {
  const clerk = SYSTEM_ROLE_TEMPLATES.find((r) => r.slug === "invoice_operator");
  const booker = SYSTEM_ROLE_TEMPLATES.find((r) => r.slug === "order_booker");
  assert.equal(hasBusinessPermission(clerk.permissions, "orders.view"), true);
  assert.equal(hasBusinessPermission(clerk.permissions, "orders.convert"), true);
  assert.equal(hasBusinessPermission(booker.permissions, "orders.create"), true);
  assert.equal(hasBusinessPermission(booker.permissions, "orders.convert"), false);
});

test("inventory manager cannot view orders; manager can", () => {
  const stock = SYSTEM_ROLE_TEMPLATES.find((r) => r.slug === "inventory_manager");
  const manager = SYSTEM_ROLE_TEMPLATES.find((r) => r.slug === "manager");
  assert.equal(hasBusinessPermission(stock.permissions, "orders.view"), false);
  assert.equal(hasBusinessPermission(manager.permissions, "orders.view"), true);
});

test("all five system role templates are defined", () => {
  assert.deepEqual(
    SYSTEM_ROLE_TEMPLATES.map((r) => r.slug).sort(),
    [
      "business_owner",
      "inventory_manager",
      "invoice_operator",
      "manager",
      "order_booker",
    ]
  );
});

async function main() {
  let failures = 0;
  for (const current of tests) {
    try {
      await current.run();
      console.log(`✓ ${current.name}`);
    } catch (error) {
      failures += 1;
      console.error(`✗ ${current.name}`);
      console.error(error);
    }
  }
  if (failures) throw new Error(`${failures} permission unit test(s) failed`);
  console.log(`All ${tests.length} permission unit tests passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
