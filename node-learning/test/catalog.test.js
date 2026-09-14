/**
 * Phase 2 integration tests — products, categories, stock ledger, RBAC, tenancy.
 */
const assert = require("node:assert/strict");
const { createApp } = require("../app-http");
const { runMigrations } = require("../database");
const { createTestMongo, cleanupTestMongo } = require("./mongo-test-env");

let mongoEnv;
let client;
let db;
let server;
let baseUrl;
let ownerA;
let ownerB;
let businessAId;
let businessBId;

const secrets = {
  accessSecret: "phase2-access-secret-that-is-long-and-stable",
  refreshSecret: "phase2-refresh-secret-that-is-long-and-different",
};

const tests = [];

function test(name, run) {
  tests.push({ name, run });
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body:
      options.body && typeof options.body !== "string"
        ? JSON.stringify(options.body)
        : options.body,
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  return { status: response.status, payload };
}

function tenantHeaders(auth, businessId) {
  return {
    Authorization: `Bearer ${auth.tokens.accessToken}`,
    "X-Business-Id": businessId,
  };
}

async function register(data) {
  const result = await request("/register", { method: "POST", body: data });
  assert.equal(result.status, 201, JSON.stringify(result.payload));
  return result.payload.data;
}

async function login(email, password) {
  const result = await request("/login", {
    method: "POST",
    body: { email, password },
  });
  assert.equal(result.status, 200, JSON.stringify(result.payload));
  return result.payload.data;
}

async function setup() {
  try {
    mongoEnv = await createTestMongo();
  } catch (error) {
    console.error(String(error && error.message ? error.message : error));
    process.exit(2);
  }
  client = mongoEnv.client;
  db = mongoEnv.db;
  await runMigrations(db, client);
  const app = createApp({ db, mongoClient: client, jwtSecrets: secrets });
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const regA = await register({
    firstName: "Owner",
    lastName: "Alpha",
    businessName: "Phase2 Alpha",
    email: "phase2-alpha@example.com",
    password: "Password123!",
  });
  ownerA = await login("phase2-alpha@example.com", "Password123!");
  businessAId = regA.user.activeBusinessId;

  const regB = await register({
    firstName: "Owner",
    lastName: "Beta",
    businessName: "Phase2 Beta",
    email: "phase2-beta@example.com",
    password: "Password123!",
  });
  ownerB = await login("phase2-beta@example.com", "Password123!");
  businessBId = regB.user.activeBusinessId;
}

async function cleanup() {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
  if (mongoEnv) await cleanupTestMongo(mongoEnv);
}

test("category create/list/update and business uniqueness", async () => {
  const created = await request("/categories", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { name: "Electronics", description: "Devices" },
  });
  assert.equal(created.status, 201, JSON.stringify(created.payload));
  assert.equal(created.payload.name, "Electronics");
  assert.equal(created.payload.businessId, businessAId);

  const dup = await request("/categories", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { name: "electronics" },
  });
  assert.equal(dup.status, 409);

  const patched = await request(`/categories/${created.payload.id}`, {
    method: "PATCH",
    headers: tenantHeaders(ownerA, businessAId),
    body: { description: "Updated devices" },
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.payload.description, "Updated devices");

  // Business B has no categories yet — numeric id from A must not be visible.
  const cross = await request(`/categories/${created.payload.id}`, {
    headers: tenantHeaders(ownerB, businessBId),
  });
  assert.equal(cross.status, 404);

  const other = await request("/categories", {
    method: "POST",
    headers: tenantHeaders(ownerB, businessBId),
    body: { name: "Electronics" },
  });
  assert.equal(other.status, 201);
});

test("product CRUD + SKU uniqueness per business", async () => {
  const cat = await request("/categories", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { name: "Grocery" },
  });
  assert.equal(cat.status, 201);

  const product = await request("/products", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      name: "Coca Cola 1.5L",
      sku: "SKU-100",
      barcode: "BAR-100",
      categoryId: cat.payload.id,
      brand: "CocaCola",
      unit: "pcs",
      purchasePrice: 80,
      salePrice: 120,
      wholesalePrice: 100,
      minimumStockLevel: 20,
      openingStock: 100,
    },
  });
  assert.equal(product.status, 201, JSON.stringify(product.payload));
  assert.equal(product.payload.sku, "SKU-100");
  assert.equal(product.payload.currentStock, 100);
  assert.equal(product.payload.stock, 100);
  assert.equal(product.payload.salePrice, 120);
  assert.equal(product.payload.printRate, 120);
  assert.equal(product.payload.stockStatus, "OK");

  const openPrint = await request("/products", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      name: "Open print spray",
      sku: `OPEN-PRINT-${Date.now()}`,
      categoryId: cat.payload.id,
      salePrice: 165,
      printRate: null,
    },
  });
  assert.equal(openPrint.status, 201, JSON.stringify(openPrint.payload));
  assert.equal(openPrint.payload.salePrice, 165);
  assert.equal(openPrint.payload.printRate, null);

  const dupSku = await request("/products", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { name: "Other", sku: "SKU-100" },
  });
  assert.equal(dupSku.status, 409);

  const listed = await request("/products?q=Coca&sku=SKU-100", {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(listed.status, 200);
  assert.ok(Array.isArray(listed.payload.products));
  assert.equal(listed.payload.products.length, 1);
  assert.equal(listed.payload.pagination.page, 1);
  assert.equal(listed.payload.pagination.per_page, 50);

  // Before Business B creates its own product id=1, A's id must be invisible.
  const cross = await request(`/products/${product.payload.id}`, {
    headers: tenantHeaders(ownerB, businessBId),
  });
  assert.equal(cross.status, 404);

  const otherBiz = await request("/products", {
    method: "POST",
    headers: tenantHeaders(ownerB, businessBId),
    body: {
      name: "Coca Cola 1.5L",
      sku: "SKU-100",
      barcode: "BAR-100",
      openingStock: 5,
    },
  });
  assert.equal(otherBiz.status, 201);
  assert.equal(otherBiz.payload.currentStock, 5);

  // PATCH must not change stock
  const beforeStock = product.payload.currentStock;
  const patched = await request(`/products/${product.payload.id}`, {
    method: "PATCH",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      name: "Coca Cola 1.5L Updated",
      stock: 500,
      currentStock: 500,
      salePrice: 125,
    },
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.payload.name, "Coca Cola 1.5L Updated");
  assert.equal(patched.payload.currentStock, beforeStock);
  assert.equal(patched.payload.salePrice, 125);
});

test("opening stock movement + adjustments + history", async () => {
  // Fresh product only in Business A so numeric id is not shared with B.
  const created = await request("/products", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      name: "PVC Pipe",
      sku: `PIPE-ISO-${Date.now()}`,
      openingStock: 100,
      minimumStockLevel: 10,
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.payload));
  assert.equal(created.payload.currentStock, 100);
  const productId = created.payload.id;

  const movements1 = await request(`/inventory/movements?productId=${productId}`, {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(movements1.status, 200);
  assert.ok(movements1.payload.movements.length >= 1);

  const opening = movements1.payload.movements.find(
    (m) => m.movementType === "OPENING_STOCK" || m.type === "OPENING_STOCK"
  );
  assert.ok(opening);
  assert.equal(opening.quantity, 100);

  const adjDown = await request("/inventory/adjust", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { productId, quantity: -5, reason: "Damaged goods" },
  });
  assert.equal(adjDown.status, 201, JSON.stringify(adjDown.payload));
  assert.equal(adjDown.payload.product.currentStock, 95);
  assert.equal(adjDown.payload.movement.movementType, "ADJUSTMENT");

  const adjUp = await request("/inventory/adjust", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { productId, quantity: 10, reason: "Found stock" },
  });
  assert.equal(adjUp.status, 201);
  assert.equal(adjUp.payload.product.currentStock, 105);

  const history = await request(`/inventory/movements?productId=${productId}`, {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(history.payload.movements.length, 3);

  const stock = await request(`/inventory/stock/${productId}`, {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(stock.status, 200);
  assert.equal(stock.payload.currentStock, 105);

  // Cross-tenant adjust denied (product id exists only in A)
  const denied = await request("/inventory/adjust", {
    method: "POST",
    headers: tenantHeaders(ownerB, businessBId),
    body: { productId, quantity: -1, reason: "Hack" },
  });
  assert.equal(denied.status, 404);

  const crossMovements = await request(
    `/inventory/movements?productId=${productId}`,
    { headers: tenantHeaders(ownerB, businessBId) }
  );
  assert.equal(crossMovements.status, 200);
  assert.equal(crossMovements.payload.movements.length, 0);

  // Confirm A's stock unchanged by the denied attempt
  const stockAfter = await request(`/inventory/stock/${productId}`, {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(stockAfter.payload.currentStock, 105);
});

test("low stock query", async () => {
  const product = await request("/products", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      name: "Low Stock Item",
      sku: "LOW-1",
      minimumStockLevel: 20,
      openingStock: 8,
    },
  });
  assert.equal(product.status, 201);
  assert.equal(product.payload.stockStatus, "LOW_STOCK");

  const low = await request("/inventory/low-stock", {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(low.status, 200);
  assert.ok(low.payload.products.some((p) => p.id === product.payload.id));

  const okProduct = await request("/products", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      name: "Ok Stock Item",
      sku: "OK-1",
      minimumStockLevel: 5,
      openingStock: 10,
    },
  });
  assert.equal(okProduct.payload.stockStatus, "OK");
  assert.ok(!low.payload.products.some((p) => p.id === okProduct.payload.id));
});

test("checkAvailableStock rejects when negative stock disabled", async () => {
  const product = await request("/products", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { name: "Pipe", sku: "PIPE-1", openingStock: 3 },
  });
  assert.equal(product.status, 201);

  const check = await request("/inventory/check-stock", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { productId: product.payload.id, requestedQuantity: 10 },
  });
  assert.equal(check.status, 200);
  assert.equal(check.payload.ok, false);
  assert.equal(check.payload.reason, "INSUFFICIENT_STOCK");

  const adj = await request("/inventory/adjust", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      productId: product.payload.id,
      quantity: -10,
      reason: "Too much",
    },
  });
  assert.equal(adj.status, 409);
  assert.equal(adj.payload.error.code, "INSUFFICIENT_STOCK");
});

test("product variants foundation", async () => {
  const product = await request("/products", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      name: "T-Shirt",
      sku: "TSHIRT",
      variants: [
        {
          name: "Small / Red",
          sku: "TSHIRT-S-RED",
          attributes: { size: "S", color: "Red" },
          openingStock: 4,
        },
        {
          name: "Medium / Blue",
          sku: "TSHIRT-M-BLUE",
          attributes: { size: "M", color: "Blue" },
          openingStock: 6,
        },
      ],
    },
  });
  assert.equal(product.status, 201, JSON.stringify(product.payload));

  const detail = await request(`/products/${product.payload.id}`, {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(detail.status, 200);
  assert.equal(detail.payload.variants.length, 2);
  assert.equal(detail.payload.currentStock, 10);
});

test("RBAC: inventory manager can adjust; invoice operator and booker cannot", async () => {
  const roles = await request("/roles", {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(roles.status, 200);
  const roleList = roles.payload?.data?.roles || roles.payload?.roles || [];
  const bySlug = Object.fromEntries(roleList.map((r) => [r.slug, r]));
  assert.ok(bySlug.inventory_manager);
  assert.ok(bySlug.invoice_operator);
  assert.ok(bySlug.order_booker);

  const inviteStock = await request("/users", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      firstName: "Inv",
      lastName: "Manager",
      email: "phase2-stock@example.com",
      password: "Password123!",
      roleId: bySlug.inventory_manager.id,
    },
  });
  assert.equal(inviteStock.status, 201, JSON.stringify(inviteStock.payload));

  const inviteClerk = await request("/users", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      firstName: "Inv",
      lastName: "Clerk",
      email: "phase2-clerk@example.com",
      password: "Password123!",
      roleId: bySlug.invoice_operator.id,
    },
  });
  assert.equal(inviteClerk.status, 201);

  const inviteBooker = await request("/users", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      firstName: "Order",
      lastName: "Booker",
      email: "phase2-booker@example.com",
      password: "Password123!",
      roleId: bySlug.order_booker.id,
    },
  });
  assert.equal(inviteBooker.status, 201);

  const stockUser = await login("phase2-stock@example.com", "Password123!");
  const clerkUser = await login("phase2-clerk@example.com", "Password123!");
  const bookerUser = await login("phase2-booker@example.com", "Password123!");

  const product = await request("/products", {
    method: "POST",
    headers: tenantHeaders(stockUser, businessAId),
    body: { name: "Managed", sku: "MNG-1", openingStock: 20 },
  });
  assert.equal(product.status, 201);

  const stockAdj = await request("/inventory/adjust", {
    method: "POST",
    headers: tenantHeaders(stockUser, businessAId),
    body: {
      productId: product.payload.id,
      quantity: -2,
      reason: "Damage",
    },
  });
  assert.equal(stockAdj.status, 201);

  const clerkView = await request("/inventory/movements", {
    headers: tenantHeaders(clerkUser, businessAId),
  });
  assert.equal(clerkView.status, 200);

  const clerkAdj = await request("/inventory/adjust", {
    method: "POST",
    headers: tenantHeaders(clerkUser, businessAId),
    body: {
      productId: product.payload.id,
      quantity: -1,
      reason: "Nope",
    },
  });
  assert.equal(clerkAdj.status, 403);

  const bookerAdj = await request("/inventory/adjust", {
    method: "POST",
    headers: tenantHeaders(bookerUser, businessAId),
    body: {
      productId: product.payload.id,
      quantity: -1,
      reason: "Nope",
    },
  });
  assert.equal(bookerAdj.status, 403);

  const bookerProduct = await request("/products", {
    method: "POST",
    headers: tenantHeaders(bookerUser, businessAId),
    body: { name: "Denied", sku: "DENY-1" },
  });
  assert.equal(bookerProduct.status, 403);
});

test("category archive when products reference it", async () => {
  const cat = await request("/categories", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { name: "Hardware Soft" },
  });
  const product = await request("/products", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      name: "Hammer",
      sku: "HAM-1",
      categoryId: cat.payload.id,
    },
  });
  assert.equal(product.status, 201);

  const del = await request(`/categories/${cat.payload.id}`, {
    method: "DELETE",
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(del.status, 200);
  assert.equal(del.payload.archived, true);

  const got = await request(`/categories/${cat.payload.id}`, {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(got.payload.status, "inactive");
});

test("product archive on delete", async () => {
  const product = await request("/products", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { name: "Temp", sku: "TMP-DEL" },
  });
  const del = await request(`/products/${product.payload.id}`, {
    method: "DELETE",
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(del.status, 200);
  assert.equal(del.payload.archived, true);

  const list = await request("/products", {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.ok(!list.payload.products.some((p) => p.id === product.payload.id));
});

test("product list paginates with per_page cap", async () => {
  const prefix = `Page-${Date.now()}`;
  for (const name of ["Alpha", "Beta", "Gamma"]) {
    const created = await request("/products", {
      method: "POST",
      headers: tenantHeaders(ownerA, businessAId),
      body: { name: `${prefix} ${name}`, sku: `${prefix}-${name}` },
    });
    assert.equal(created.status, 201, JSON.stringify(created.payload));
  }

  const page1 = await request(
    `/products?q=${encodeURIComponent(prefix)}&per_page=2&page=1`,
    { headers: tenantHeaders(ownerA, businessAId) }
  );
  assert.equal(page1.status, 200);
  assert.equal(page1.payload.products.length, 2);
  assert.equal(page1.payload.pagination.per_page, 2);
  assert.equal(page1.payload.pagination.page, 1);
  assert.equal(page1.payload.pagination.total, 3);
  assert.equal(page1.payload.pagination.pages, 2);

  const page2 = await request(
    `/products?q=${encodeURIComponent(prefix)}&per_page=2&page=2`,
    { headers: tenantHeaders(ownerA, businessAId) }
  );
  assert.equal(page2.status, 200);
  assert.equal(page2.payload.products.length, 1);

  const capped = await request(
    `/products?q=${encodeURIComponent(prefix)}&per_page=500`,
    { headers: tenantHeaders(ownerA, businessAId) }
  );
  assert.equal(capped.status, 200);
  assert.equal(capped.payload.pagination.per_page, 100);
});

test("phase2 catalog product scan is skipped after version flag", async () => {
  const flag = await db
    .collection("schema_migrations")
    .findOne({ _id: "phase2_catalog_product_scan" });
  assert.equal(flag.version, 1);

  await db.collection("products").insertOne({
    id: 91001,
    businessId: businessAId,
    name: "Unscanned leftover",
    sku: "SKIP-SCAN-1",
  });

  await runMigrations(db, client);

  const leftover = await db.collection("products").findOne({ sku: "SKIP-SCAN-1" });
  assert.equal(leftover.status, undefined);
  assert.equal(leftover.trackVariants, undefined);
});

(async () => {
  try {
    await setup();
    let passed = 0;
    for (const { name, run } of tests) {
      await run();
      passed += 1;
      console.log(`ok - ${name}`);
    }
    console.log(`\n${passed}/${tests.length} phase2 tests passed`);
  } catch (error) {
    console.error("FAIL", error);
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
})();
