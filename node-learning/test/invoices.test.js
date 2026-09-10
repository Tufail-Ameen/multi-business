/**
 * Invoice API integration tests — list/create/status/stock/tenancy.
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
  accessSecret: "invoice-access-secret-that-is-long-and-stable",
  refreshSecret: "invoice-refresh-secret-that-is-long-and-different",
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
    businessName: "Invoice Alpha",
    email: "invoice-alpha@example.com",
    password: "Password123!",
  });
  ownerA = await login("invoice-alpha@example.com", "Password123!");
  businessAId = regA.user.activeBusinessId;

  const regB = await register({
    firstName: "Owner",
    lastName: "Beta",
    businessName: "Invoice Beta",
    email: "invoice-beta@example.com",
    password: "Password123!",
  });
  ownerB = await login("invoice-beta@example.com", "Password123!");
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

async function createClient(auth, businessId, body = {}) {
  const result = await request("/clients", {
    method: "POST",
    headers: tenantHeaders(auth, businessId),
    body: { name: "Ali Traders", phone: "03001234567", area: "Ichhra", city: "Lahore", ...body },
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
      sku: `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      openingStock: 50,
      salePrice: 200,
      ...body,
    },
  });
  assert.equal(result.status, 201, JSON.stringify(result.payload));
  return result.payload;
}

async function createInvoice(auth, businessId, body) {
  const result = await request("/invoices", {
    method: "POST",
    headers: tenantHeaders(auth, businessId),
    body,
  });
  assert.equal(result.status, 201, JSON.stringify(result.payload));
  return result.payload.invoice;
}

test("GET /invoices is not ROUTE_NOT_FOUND and starts empty", async () => {
  const result = await request("/invoices?per_page=100", {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(result.status, 200, JSON.stringify(result.payload));
  assert.ok(Array.isArray(result.payload.invoices));
  assert.equal(result.payload.invoices.length, 0);
});

test("create draft invoice, list it, and load detail", async () => {
  const clientDoc = await createClient(ownerA, businessAId);
  const product = await createProduct(ownerA, businessAId, { openingStock: 10 });

  const invoice = await createInvoice(ownerA, businessAId, {
    clientId: clientDoc.id,
    issueDate: "2026-09-10",
    dueDate: "2026-09-20",
    description: "Test draft",
    currency: "Rs",
    status: "draft",
    items: [{ productId: product.id, quantity: 2, tax: 0 }],
  });

  assert.equal(invoice.status, "draft");
  assert.equal(invoice.stockApplied, false);
  assert.equal(invoice.clientName, "Ali Traders");
  assert.equal(invoice.clientArea, "Ichhra");
  assert.equal(invoice.clientSnapshot.area, "Ichhra");
  assert.equal(invoice.items[0].name, "Widget");
  assert.equal(invoice.items[0].quantity, 2);
  assert.equal(invoice.total, 400);
  assert.match(String(invoice.number), /^INV-/);

  const list = await request("/invoices", {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(list.status, 200);
  assert.ok(list.payload.invoices.some((row) => row.id === invoice.id));

  const detail = await request(`/invoices/${invoice.id}`, {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(detail.status, 200);
  assert.equal(detail.payload.invoice.id, invoice.id);
  assert.equal(detail.payload.invoice.description, "Test draft");

  const stock = await request(`/products/${product.id}`, {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(stock.payload.currentStock, 10);
});

test("pending invoice deducts stock; cancel restores it", async () => {
  const clientDoc = await createClient(ownerA, businessAId, { name: "Stock Client" });
  const product = await createProduct(ownerA, businessAId, {
    name: "Bag",
    openingStock: 8,
    salePrice: 100,
  });

  const invoice = await createInvoice(ownerA, businessAId, {
    clientId: clientDoc.id,
    issueDate: "2026-09-10",
    dueDate: "2026-09-11",
    status: "pending",
    items: [{ productId: product.id, quantity: 3, tax: 10 }],
  });

  assert.equal(invoice.status, "pending");
  assert.equal(invoice.stockApplied, true);
  assert.equal(invoice.total, 330);

  let stock = await request(`/products/${product.id}`, {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(stock.payload.currentStock, 5);

  const cancelled = await request(`/invoices/${invoice.id}/status`, {
    method: "PATCH",
    headers: tenantHeaders(ownerA, businessAId),
    body: { status: "cancelled" },
  });
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.payload));
  assert.equal(cancelled.payload.invoice.status, "cancelled");
  assert.equal(cancelled.payload.invoice.stockApplied, false);

  stock = await request(`/products/${product.id}`, {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(stock.payload.currentStock, 8);
});

test("draft send applies stock; paid invoices cannot be deleted", async () => {
  const clientDoc = await createClient(ownerA, businessAId, { name: "Paid Client" });
  const product = await createProduct(ownerA, businessAId, {
    name: "Box",
    openingStock: 6,
    salePrice: 50,
  });

  const invoice = await createInvoice(ownerA, businessAId, {
    clientId: clientDoc.id,
    issueDate: "2026-09-10",
    dueDate: "2026-09-12",
    status: "draft",
    items: [{ productId: product.id, quantity: 2, tax: 0 }],
  });

  const sent = await request(`/invoices/${invoice.id}/status`, {
    method: "PATCH",
    headers: tenantHeaders(ownerA, businessAId),
    body: { status: "pending" },
  });
  assert.equal(sent.status, 200, JSON.stringify(sent.payload));
  assert.equal(sent.payload.invoice.stockApplied, true);

  const paid = await request(`/invoices/${invoice.id}/status`, {
    method: "PATCH",
    headers: tenantHeaders(ownerA, businessAId),
    body: { status: "paid" },
  });
  assert.equal(paid.status, 200, JSON.stringify(paid.payload));
  assert.equal(paid.payload.invoice.status, "paid");

  const deleted = await request(`/invoices/${invoice.id}`, {
    method: "DELETE",
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(deleted.status, 409);
  assert.equal(deleted.payload.error.code, "INVOICE_NOT_DELETABLE");
});

test("pending invoice with two lines does not collide on movement ids", async () => {
  const clientDoc = await createClient(ownerA, businessAId, { name: "Two Line Client" });
  const productA = await createProduct(ownerA, businessAId, {
    name: "Line A",
    openingStock: 20,
    salePrice: 40,
  });
  const productB = await createProduct(ownerA, businessAId, {
    name: "Line B",
    openingStock: 15,
    salePrice: 25,
  });

  const invoice = await createInvoice(ownerA, businessAId, {
    clientId: clientDoc.id,
    issueDate: "2026-09-10",
    dueDate: "2026-09-14",
    status: "pending",
    items: [
      { productId: productA.id, quantity: 2, tax: 0 },
      { productId: productB.id, quantity: 3, tax: 0 },
    ],
  });

  assert.equal(invoice.status, "pending");
  assert.equal(invoice.items.length, 2);
  assert.equal(invoice.total, 155);

  const stockA = await request(`/products/${productA.id}`, {
    headers: tenantHeaders(ownerA, businessAId),
  });
  const stockB = await request(`/products/${productB.id}`, {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(stockA.payload.currentStock, 18);
  assert.equal(stockB.payload.currentStock, 12);
});

test("pending invoices can be edited; paid invoices cannot; tenant isolation holds", async () => {
  const clientA = await createClient(ownerA, businessAId, { name: "Alpha Client" });
  const productA = await createProduct(ownerA, businessAId, {
    name: "Alpha Item",
    openingStock: 20,
    salePrice: 10,
  });
  const pending = await createInvoice(ownerA, businessAId, {
    clientId: clientA.id,
    issueDate: "2026-09-10",
    dueDate: "2026-09-13",
    status: "pending",
    items: [{ productId: productA.id, quantity: 1, tax: 0 }],
  });

  const edited = await request(`/invoices/${pending.id}`, {
    method: "PATCH",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      description: "updated pending",
      items: [{ productId: productA.id, quantity: 3, tax: 0 }],
    },
  });
  assert.equal(edited.status, 200, JSON.stringify(edited.payload));
  assert.equal(edited.payload.invoice.description, "updated pending");
  assert.equal(edited.payload.invoice.items[0].quantity, 3);
  assert.equal(edited.payload.invoice.status, "pending");

  const stockAfterEdit = await request(`/products/${productA.id}`, {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(stockAfterEdit.payload.currentStock, 17);

  const paid = await createInvoice(ownerA, businessAId, {
    clientId: clientA.id,
    issueDate: "2026-09-10",
    dueDate: "2026-09-13",
    status: "paid",
    items: [{ productId: productA.id, quantity: 1, tax: 0 }],
  });
  const paidEdit = await request(`/invoices/${paid.id}`, {
    method: "PATCH",
    headers: tenantHeaders(ownerA, businessAId),
    body: { description: "should fail" },
  });
  assert.equal(paidEdit.status, 409);
  assert.equal(paidEdit.payload.error.code, "INVOICE_NOT_EDITABLE");

  const other = await request(`/invoices/${pending.id}`, {
    headers: tenantHeaders(ownerB, businessBId),
  });
  assert.equal(other.status, 404);
  assert.equal(other.payload.error.code, "INVOICE_NOT_FOUND");
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
