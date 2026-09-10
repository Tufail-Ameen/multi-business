/**
 * Phase 3 integration tests — suppliers, purchases, ledger, payments, RBAC, tenancy.
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
  accessSecret: "phase3-access-secret-that-is-long-and-stable",
  refreshSecret: "phase3-refresh-secret-that-is-long-and-different",
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
    businessName: "Phase3 Alpha",
    email: "phase3-alpha@example.com",
    password: "Password123!",
  });
  ownerA = await login("phase3-alpha@example.com", "Password123!");
  businessAId = regA.user.activeBusinessId;

  const regB = await register({
    firstName: "Owner",
    lastName: "Beta",
    businessName: "Phase3 Beta",
    email: "phase3-beta@example.com",
    password: "Password123!",
  });
  ownerB = await login("phase3-beta@example.com", "Password123!");
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

async function createSupplier(auth, businessId, body = {}) {
  const result = await request("/suppliers", {
    method: "POST",
    headers: tenantHeaders(auth, businessId),
    body: { name: "Acme Supply", phone: "03001234567", ...body },
  });
  assert.equal(result.status, 201, JSON.stringify(result.payload));
  return result.payload;
}

async function createProduct(auth, businessId, body = {}) {
  const result = await request("/products", {
    method: "POST",
    headers: tenantHeaders(auth, businessId),
    body: {
      name: "Widget",
      sku: `W-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      openingStock: 50,
      purchasePrice: 100,
      ...body,
    },
  });
  assert.equal(result.status, 201, JSON.stringify(result.payload));
  return result.payload;
}

test("supplier create/read/update/archive and tenant isolation", async () => {
  const created = await createSupplier(ownerA, businessAId, {
    name: "Pak Traders",
    companyName: "Pak Traders Pvt",
    email: "pak@example.com",
  });
  assert.equal(created.name, "Pak Traders");
  assert.equal(created.status, "ACTIVE");
  assert.equal(created.businessId, businessAId);

  const got = await request(`/suppliers/${created.id}`, {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(got.status, 200);
  assert.equal(got.payload.name, "Pak Traders");

  const patched = await request(`/suppliers/${created.id}`, {
    method: "PATCH",
    headers: tenantHeaders(ownerA, businessAId),
    body: { city: "Lahore", phone: "03111111111" },
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.payload.city, "Lahore");
  assert.equal(patched.payload.phone, "03111111111");

  const cross = await request(`/suppliers/${created.id}`, {
    headers: tenantHeaders(ownerB, businessBId),
  });
  assert.equal(cross.status, 404);

  const deleted = await request(`/suppliers/${created.id}`, {
    method: "DELETE",
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(deleted.status, 200);
  // No history → hard delete
  assert.equal(deleted.payload.message, "Vendor deleted");
});

test("supplier phone must be 11 digits starting with 03", async () => {
  const tooLong = await request("/suppliers", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { name: "Long Phone Vendor", phone: "0309876543332232" },
  });
  assert.equal(tooLong.status, 400, JSON.stringify(tooLong.payload));
  assert.equal(tooLong.payload.error.code, "VALIDATION_ERROR");

  const wrongPrefix = await request("/suppliers", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { name: "Wrong Prefix Vendor", phone: "12345678901" },
  });
  assert.equal(wrongPrefix.status, 400);

  const created = await createSupplier(ownerA, businessAId, {
    name: "Valid Phone Vendor",
    phone: "03001234567",
  });
  assert.equal(created.phone, "03001234567");

  const badPatch = await request(`/suppliers/${created.id}`, {
    method: "PATCH",
    headers: tenantHeaders(ownerA, businessAId),
    body: { phone: "04001234567" },
  });
  assert.equal(badPatch.status, 400);
});

test("supplier with purchase history is archived not hard-deleted", async () => {
  const supplier = await createSupplier(ownerA, businessAId, {
    name: "History Supplier",
  });
  const product = await createProduct(ownerA, businessAId, {
    name: "Bolt",
    sku: "BOLT-H1",
  });

  const purchase = await request("/purchases", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: 2, unitCost: 10 }],
    },
  });
  assert.equal(purchase.status, 201);

  const archived = await request(`/suppliers/${supplier.id}`, {
    method: "DELETE",
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(archived.status, 200);
  assert.equal(archived.payload.status, "ARCHIVED");
});

test("purchase draft does not change stock or create payable", async () => {
  const supplier = await createSupplier(ownerA, businessAId, {
    name: "Draft Supplier",
  });
  const product = await createProduct(ownerA, businessAId, {
    name: "Draft Item",
    sku: "DFT-1",
    openingStock: 40,
  });

  const before = await request(`/products/${product.id}`, {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(before.payload.currentStock, 40);

  const draft = await request("/purchases", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      supplierId: supplier.id,
      items: [
        { productId: product.id, quantity: 10, unitCost: 25, discount: 5, tax: 2 },
      ],
      discount: 0,
      tax: 0,
    },
  });
  assert.equal(draft.status, 201, JSON.stringify(draft.payload));
  assert.equal(draft.payload.status, "DRAFT");
  // (10*25) - 5 + 2 = 247
  assert.equal(draft.payload.grandTotal, 247);
  assert.equal(draft.payload.stockApplied, false);

  const after = await request(`/products/${product.id}`, {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(after.payload.currentStock, 40);

  const ledger = await request(`/suppliers/${supplier.id}/ledger`, {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(ledger.status, 200);
  assert.equal(ledger.payload.entries.length, 0);
  assert.equal(ledger.payload.summary.outstandingPayable, 0);
});

test("server rejects invalid/cross-business product and supplier on purchase", async () => {
  const supplierA = await createSupplier(ownerA, businessAId, {
    name: "Local Supplier",
  });
  const productA = await createProduct(ownerA, businessAId, {
    name: "Local Product",
    sku: "LOC-1",
  });

  // Business-scoped ids can collide across tenants; isolation is by businessId filter.
  // Reject product ids that do not exist in the active business.
  const badProduct = await request("/purchases", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      supplierId: supplierA.id,
      items: [{ productId: 987654321, quantity: 1, unitCost: 5 }],
    },
  });
  assert.equal(badProduct.status, 400);
  assert.equal(badProduct.payload.error.code, "INVALID_PRODUCT");

  const badSupplier = await request("/purchases", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      supplierId: 987654321,
      items: [{ productId: productA.id, quantity: 1, unitCost: 5 }],
    },
  });
  assert.equal(badSupplier.status, 404);

  // Business B supplier id must not authorize a purchase in business A
  // even when numeric ids happen to match — create in B then assert A cannot read it.
  const supplierB = await createSupplier(ownerB, businessBId, {
    name: "Foreign Supplier Unique",
  });
  const crossRead = await request(`/suppliers/${supplierB.id}`, {
    headers: tenantHeaders(ownerA, businessAId),
  });
  // Either 404 (different id space) or, if ids collide, must still be A's own supplier only.
  if (crossRead.status === 200) {
    assert.equal(crossRead.payload.businessId, businessAId);
    assert.notEqual(crossRead.payload.name, "Foreign Supplier Unique");
  } else {
    assert.equal(crossRead.status, 404);
  }

  const zeroQty = await request("/purchases", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      supplierId: supplierA.id,
      items: [{ productId: productA.id, quantity: 0, unitCost: 5 }],
    },
  });
  assert.equal(zeroQty.status, 400);
});

test("confirm creates PURCHASE movement, increases stock, creates payable", async () => {
  const supplier = await createSupplier(ownerA, businessAId, {
    name: "Confirm Supplier",
  });
  const product = await createProduct(ownerA, businessAId, {
    name: "Confirm Item",
    sku: "CNF-1",
    openingStock: 50,
  });

  const draft = await request("/purchases", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: 20, unitCost: 15 }],
    },
  });
  assert.equal(draft.status, 201);
  assert.equal(draft.payload.grandTotal, 300);

  const confirmed = await request(`/purchases/${draft.payload.id}/confirm`, {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.payload));
  assert.equal(confirmed.payload.purchase.status, "CONFIRMED");
  assert.equal(confirmed.payload.movements.length, 1);
  assert.equal(confirmed.payload.movements[0].movementType, "PURCHASE");
  assert.equal(confirmed.payload.movements[0].quantity, 20);
  assert.equal(confirmed.payload.ledgerEntry.credit, 300);

  const after = await request(`/products/${product.id}`, {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(after.payload.currentStock, 70);

  const movements = await request(
    `/inventory/movements?productId=${product.id}&type=PURCHASE`,
    { headers: tenantHeaders(ownerA, businessAId) }
  );
  assert.equal(movements.status, 200);
  const purchaseMoves = (movements.payload.movements || []).filter(
    (m) => m.movementType === "PURCHASE" || m.type === "PURCHASE"
  );
  assert.ok(purchaseMoves.length >= 1);

  const detail = await request(`/suppliers/${supplier.id}`, {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(detail.payload.outstandingPayable, 300);
  assert.equal(detail.payload.totalPurchases, 300);
  assert.equal(detail.payload.totalPaid, 0);

  // Duplicate confirm rejected
  const again = await request(`/purchases/${draft.payload.id}/confirm`, {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(again.status, 409);

  // Confirmed cannot be freely edited
  const edit = await request(`/purchases/${draft.payload.id}`, {
    method: "PATCH",
    headers: tenantHeaders(ownerA, businessAId),
    body: { notes: "hack" },
  });
  assert.equal(edit.status, 409);

  // Confirmed cancel deferred
  const cancel = await request(`/purchases/${draft.payload.id}/cancel`, {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(cancel.status, 409);
  assert.equal(cancel.payload.error.code, "CONFIRMED_CANCEL_DEFERRED");
});

test("supplier payment reduces outstanding; overpayment rejected", async () => {
  const supplier = await createSupplier(ownerA, businessAId, {
    name: "Pay Supplier",
  });
  const product = await createProduct(ownerA, businessAId, {
    name: "Pay Item",
    sku: "PAY-1",
    openingStock: 10,
  });

  const draft = await request("/purchases", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: 4, unitCost: 25 }],
    },
  });
  assert.equal(draft.status, 201);
  // grandTotal 100
  const confirmed = await request(`/purchases/${draft.payload.id}/confirm`, {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(confirmed.status, 200);

  const over = await request(`/suppliers/${supplier.id}/payments`, {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { amount: 150, paymentMethod: "cash" },
  });
  assert.equal(over.status, 400);
  assert.equal(over.payload.error.code, "OVERPAYMENT_NOT_ALLOWED");

  const pay = await request(`/suppliers/${supplier.id}/payments`, {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { amount: 40, paymentMethod: "bank", reference: "TRX-1" },
  });
  assert.equal(pay.status, 201, JSON.stringify(pay.payload));
  assert.equal(pay.payload.payment.amount, 40);
  assert.equal(pay.payload.ledgerEntry.debit, 40);

  const detail = await request(`/suppliers/${supplier.id}`, {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(detail.payload.outstandingPayable, 60);
  assert.equal(detail.payload.totalPaid, 40);
  assert.equal(detail.payload.totalPurchases, 100);

  const invalid = await request(`/suppliers/${supplier.id}/payments`, {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { amount: 0 },
  });
  assert.equal(invalid.status, 400);
});

test("purchase tenant isolation on confirm and payment", async () => {
  const supplier = await createSupplier(ownerA, businessAId, {
    name: "Iso Supplier",
  });
  const product = await createProduct(ownerA, businessAId, {
    name: "Iso Item",
    sku: "ISO-1",
  });
  const draft = await request("/purchases", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: 1, unitCost: 9 }],
    },
  });
  assert.equal(draft.status, 201);

  const crossPurchase = await request(`/purchases/${draft.payload.id}`, {
    headers: tenantHeaders(ownerB, businessBId),
  });
  assert.equal(crossPurchase.status, 404);

  const crossConfirm = await request(`/purchases/${draft.payload.id}/confirm`, {
    method: "POST",
    headers: tenantHeaders(ownerB, businessBId),
  });
  assert.equal(crossConfirm.status, 404);

  const crossPay = await request(`/suppliers/${supplier.id}/payments`, {
    method: "POST",
    headers: tenantHeaders(ownerB, businessBId),
    body: { amount: 1 },
  });
  assert.equal(crossPay.status, 404);
});

test("RBAC: inventory manager can purchase; invoice operator and booker cannot", async () => {
  const roles = await request("/roles", {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(roles.status, 200);
  const roleList = roles.payload?.data?.roles || roles.payload?.roles || [];
  const bySlug = Object.fromEntries(roleList.map((r) => [r.slug, r]));

  const inviteStock = await request("/users", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      firstName: "Stock",
      lastName: "Buyer",
      email: "phase3-stock@example.com",
      password: "Password123!",
      roleId: bySlug.inventory_manager.id,
    },
  });
  assert.equal(inviteStock.status, 201, JSON.stringify(inviteStock.payload));

  const inviteClerk = await request("/users", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      firstName: "Clerk",
      lastName: "User",
      email: "phase3-clerk@example.com",
      password: "Password123!",
      roleId: bySlug.invoice_operator.id,
    },
  });
  assert.equal(inviteClerk.status, 201);

  const inviteBooker = await request("/users", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      firstName: "Booker",
      lastName: "User",
      email: "phase3-booker@example.com",
      password: "Password123!",
      roleId: bySlug.order_booker.id,
    },
  });
  assert.equal(inviteBooker.status, 201);

  const stockUser = await login("phase3-stock@example.com", "Password123!");
  const clerkUser = await login("phase3-clerk@example.com", "Password123!");
  const bookerUser = await login("phase3-booker@example.com", "Password123!");

  const supplier = await createSupplier(stockUser, businessAId, {
    name: "RBAC Supplier",
  });
  const product = await createProduct(stockUser, businessAId, {
    name: "RBAC Item",
    sku: "RBAC-1",
    openingStock: 5,
  });

  const draft = await request("/purchases", {
    method: "POST",
    headers: tenantHeaders(stockUser, businessAId),
    body: {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: 3, unitCost: 8 }],
    },
  });
  assert.equal(draft.status, 201);

  const confirm = await request(`/purchases/${draft.payload.id}/confirm`, {
    method: "POST",
    headers: tenantHeaders(stockUser, businessAId),
  });
  assert.equal(confirm.status, 200);

  const clerkCreate = await request("/purchases", {
    method: "POST",
    headers: tenantHeaders(clerkUser, businessAId),
    body: {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: 1, unitCost: 1 }],
    },
  });
  assert.equal(clerkCreate.status, 403);

  const bookerSupplier = await request("/suppliers", {
    method: "POST",
    headers: tenantHeaders(bookerUser, businessAId),
    body: { name: "Nope" },
  });
  assert.equal(bookerSupplier.status, 403);
});

test("draft cancel has no stock impact; confirmed stays intact on failed cancel", async () => {
  const supplier = await createSupplier(ownerA, businessAId, {
    name: "Cancel Supplier",
  });
  const product = await createProduct(ownerA, businessAId, {
    name: "Cancel Item",
    sku: "CXL-1",
    openingStock: 12,
  });

  const draft = await request("/purchases", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: 5, unitCost: 2 }],
    },
  });
  assert.equal(draft.status, 201);

  const cancelled = await request(`/purchases/${draft.payload.id}/cancel`, {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.payload.status, "CANCELLED");

  const stock = await request(`/products/${product.id}`, {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(stock.payload.currentStock, 12);
});

test("confirmation atomicity: purchase not confirmed if already confirmed path blocked", async () => {
  // Covered by duplicate confirm → 409 and purchase remains CONFIRMED once.
  // Explicit check that a missing product mid-flight leaves draft untouched:
  const supplier = await createSupplier(ownerA, businessAId, {
    name: "Atomic Supplier",
  });
  const product = await createProduct(ownerA, businessAId, {
    name: "Atomic Item",
    sku: "ATM-1",
    openingStock: 1,
  });

  const draft = await request("/purchases", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: 2, unitCost: 3 }],
    },
  });
  assert.equal(draft.status, 201);

  // Corrupt draft item to a non-existent product to force confirm failure.
  await db.collection("purchases").updateOne(
    { businessId: businessAId, id: draft.payload.id },
    { $set: { "items.0.productId": 999999 } }
  );

  const failed = await request(`/purchases/${draft.payload.id}/confirm`, {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.ok(failed.status >= 400);

  const still = await request(`/purchases/${draft.payload.id}`, {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(still.status, 200);
  assert.equal(still.payload.status, "DRAFT");
  assert.equal(still.payload.stockApplied, false);

  const stock = await request(`/products/${product.id}`, {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(stock.payload.currentStock, 1);

  const ledger = await request(`/suppliers/${supplier.id}/ledger`, {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(ledger.payload.entries.length, 0);
});

async function run() {
  await setup();
  let failed = 0;
  for (const t of tests) {
    try {
      await t.run();
      console.log(`ok - ${t.name}`);
    } catch (error) {
      failed += 1;
      console.error(`not ok - ${t.name}`);
      console.error(error);
    }
  }
  await cleanup();
  if (failed) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
  }
  console.log(`\n${tests.length} test(s) passed`);
}

run().catch((error) => {
  console.error(error);
  cleanup().finally(() => process.exit(1));
});
