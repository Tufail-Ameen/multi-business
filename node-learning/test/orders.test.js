/**
 * Store orders — public catalog/place-order, staff list/convert, images, RBAC.
 */
const assert = require("node:assert/strict");
const { createApp } = require("../app-http");
const { runMigrations } = require("../database");
const { createTestMongo, cleanupTestMongo } = require("./mongo-test-env");

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

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
  accessSecret: "orders-access-secret-that-is-long-and-stable",
  refreshSecret: "orders-refresh-secret-that-is-long-and-different",
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
    businessName: "Orders Alpha",
    email: "orders-alpha@example.com",
    password: "Password123!",
  });
  ownerA = await login("orders-alpha@example.com", "Password123!");
  businessAId = regA.user.activeBusinessId;

  const regB = await register({
    firstName: "Owner",
    lastName: "Beta",
    businessName: "Orders Beta",
    email: "orders-beta@example.com",
    password: "Password123!",
  });
  ownerB = await login("orders-beta@example.com", "Password123!");
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
    body: {
      name: "Ali Traders",
      phone: "03001234567",
      area: "Ichhra",
      ...body,
    },
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
      sku: `ORD-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      openingStock: 20,
      salePrice: 200,
      ...body,
    },
  });
  assert.equal(result.status, 201, JSON.stringify(result.payload));
  return result.payload;
}

async function createSentRateList(auth, businessId, { clientId, items, expiresAt }) {
  const created = await request("/rate-lists", {
    method: "POST",
    headers: tenantHeaders(auth, businessId),
    body: { clientId, items },
  });
  assert.equal(created.status, 201, JSON.stringify(created.payload));
  const sent = await request(`/rate-lists/${created.payload.id}/send`, {
    method: "POST",
    headers: tenantHeaders(auth, businessId),
    body: expiresAt ? { expiresAt } : { channel: "link" },
  });
  assert.equal(sent.status, 200, JSON.stringify(sent.payload));
  return sent.payload;
}

test("GET /orders starts empty for the tenant", async () => {
  const result = await request("/orders", {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(result.status, 200, JSON.stringify(result.payload));
  assert.ok(Array.isArray(result.payload.orders));
  assert.equal(result.payload.orders.length, 0);
});

test("product image can be set by URL or base64", async () => {
  const product = await createProduct(ownerA, businessAId, { name: "Photo Item" });
  assert.equal(product.imageUrl, null);

  const byUrl = await request(`/products/${product.id}/image`, {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { imageUrl: "https://cdn.example.com/widget.png" },
  });
  assert.equal(byUrl.status, 200, JSON.stringify(byUrl.payload));
  assert.equal(byUrl.payload.imageUrl, "https://cdn.example.com/widget.png");

  const byFile = await request(`/products/${product.id}/image`, {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { imageBase64: TINY_PNG },
  });
  assert.equal(byFile.status, 200, JSON.stringify(byFile.payload));
  assert.match(byFile.payload.imageUrl, /^\/uploads\/products\//);

  const served = await fetch(`${baseUrl}${byFile.payload.imageUrl}`);
  assert.equal(served.status, 200);
  assert.ok((served.headers.get("content-type") || "").includes("image/png"));
});

test("public store catalog uses rate-list prices and includes productId/image", async () => {
  const clientDoc = await createClient(ownerA, businessAId, { name: "Store Client" });
  const product = await createProduct(ownerA, businessAId, {
    name: "Tea",
    salePrice: 200,
    openingStock: 12,
  });
  await request(`/products/${product.id}/image`, {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { imageUrl: "https://cdn.example.com/tea.png" },
  });

  const list = await createSentRateList(ownerA, businessAId, {
    clientId: clientDoc.id,
    items: [{ productId: product.id, customPrice: 175 }],
  });

  const publicView = await request(`/public/rate-lists/${list.shareToken}`);
  assert.equal(publicView.status, 200, JSON.stringify(publicView.payload));
  assert.equal(publicView.payload.rateList.items[0].productId, product.id);
  assert.equal(publicView.payload.rateList.items[0].price, 175);
  assert.equal(publicView.payload.rateList.items[0].imageUrl, "https://cdn.example.com/tea.png");
  assert.equal(publicView.payload.rateList.items[0].currentStock, 12);
  assert.equal(publicView.payload.rateList.businessId, undefined);
  assert.equal(publicView.payload.rateList.shareToken, undefined);

  const store = await request(`/public/store/${list.shareToken}`);
  assert.equal(store.status, 200, JSON.stringify(store.payload));
  assert.equal(store.payload.store.clientName, "Store Client");
  assert.equal(store.payload.store.businessName, "Orders Alpha");
  assert.equal(store.payload.store.items[0].name, "Tea");
  assert.equal(store.payload.store.items[0].price, 175);
  assert.equal(store.payload.store.items[0].productId, product.id);
});

test("client can place an order from the store token using rate-list prices", async () => {
  const clientDoc = await createClient(ownerA, businessAId, { name: "Order Client" });
  const biscuit = await createProduct(ownerA, businessAId, {
    name: "Biscuit",
    salePrice: 100,
    openingStock: 30,
  });
  const oil = await createProduct(ownerA, businessAId, {
    name: "Oil",
    salePrice: 450,
    openingStock: 10,
  });
  const list = await createSentRateList(ownerA, businessAId, {
    clientId: clientDoc.id,
    items: [
      { productId: biscuit.id, customPrice: 80 },
      { productId: oil.id, customPrice: 400 },
    ],
  });

  const placed = await request(`/public/store/${list.shareToken}/orders`, {
    method: "POST",
    body: {
      notes: "Please deliver Monday",
      items: [
        { productId: biscuit.id, quantity: 2 },
        { productId: oil.id, quantity: 1 },
      ],
    },
  });
  assert.equal(placed.status, 201, JSON.stringify(placed.payload));
  assert.equal(placed.payload.order.status, "placed");
  assert.match(String(placed.payload.order.number), /^ORD-/);
  assert.equal(placed.payload.order.total, 560);
  assert.equal(placed.payload.order.clientName, "Order Client");
  assert.equal(placed.payload.order.businessId, undefined);

  const biscuitLine = placed.payload.order.items.find((i) => i.productId === biscuit.id);
  assert.equal(biscuitLine.unitPrice, 80);

  const stock = await request(`/products/${biscuit.id}`, {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(stock.payload.currentStock, 30);

  const listOrders = await request("/orders", {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(listOrders.status, 200);
  const found = listOrders.payload.orders.find((row) => row.id === placed.payload.order.id);
  assert.ok(found);
  assert.equal(found.rateListId, list.id);
  assert.equal(found.source, "store");
});

test("cannot order a product that is not on the shared rate list", async () => {
  const clientDoc = await createClient(ownerA, businessAId, { name: "Strict Client" });
  const listed = await createProduct(ownerA, businessAId, { name: "Listed" });
  const extra = await createProduct(ownerA, businessAId, { name: "Extra" });
  const list = await createSentRateList(ownerA, businessAId, {
    clientId: clientDoc.id,
    items: [{ productId: listed.id, customPrice: 50 }],
  });

  const result = await request(`/public/store/${list.shareToken}/orders`, {
    method: "POST",
    body: { items: [{ productId: extra.id, quantity: 1 }] },
  });
  assert.equal(result.status, 400);
  assert.equal(result.payload.error.code, "PRODUCT_NOT_ON_RATE_LIST");
});

test("expired store link cannot be used to place an order", async () => {
  const clientDoc = await createClient(ownerA, businessAId, { name: "Expired Client" });
  const product = await createProduct(ownerA, businessAId, { name: "Milk" });
  const past = new Date(Date.now() - 60_000).toISOString();
  const list = await createSentRateList(ownerA, businessAId, {
    clientId: clientDoc.id,
    items: [{ productId: product.id }],
    expiresAt: past,
  });

  const catalog = await request(`/public/store/${list.shareToken}`);
  assert.equal(catalog.status, 410);
  const placed = await request(`/public/store/${list.shareToken}/orders`, {
    method: "POST",
    body: { items: [{ productId: product.id, quantity: 1 }] },
  });
  assert.equal(placed.status, 410);
});

test("convert order to invoice uses rate-list prices and deducts stock", async () => {
  const clientDoc = await createClient(ownerA, businessAId, { name: "Convert Client" });
  const product = await createProduct(ownerA, businessAId, {
    name: "Bag",
    salePrice: 100,
    openingStock: 8,
  });
  const list = await createSentRateList(ownerA, businessAId, {
    clientId: clientDoc.id,
    items: [{ productId: product.id, customPrice: 70 }],
  });
  const placed = await request(`/public/store/${list.shareToken}/orders`, {
    method: "POST",
    body: { items: [{ productId: product.id, quantity: 3 }] },
  });
  assert.equal(placed.status, 201, JSON.stringify(placed.payload));
  assert.equal(placed.payload.order.total, 210);

  const converted = await request(`/orders/${placed.payload.order.id}/convert`, {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {},
  });
  assert.equal(converted.status, 201, JSON.stringify(converted.payload));
  assert.equal(converted.payload.order.status, "converted");
  assert.ok(converted.payload.invoice.id);
  assert.equal(converted.payload.invoice.status, "pending");
  assert.equal(converted.payload.invoice.total, 210);
  assert.equal(converted.payload.invoice.stockApplied, true);

  const invoice = await request(`/invoices/${converted.payload.invoice.id}`, {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(invoice.status, 200);
  assert.equal(invoice.payload.invoice.items[0].unitPrice, 70);
  assert.equal(invoice.payload.invoice.sourceOrderId, placed.payload.order.id);
  assert.equal(invoice.payload.invoice.total, 210);

  const stock = await request(`/products/${product.id}`, {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(stock.payload.currentStock, 5);

  const again = await request(`/orders/${placed.payload.order.id}/convert`, {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {},
  });
  assert.equal(again.status, 409);
  assert.equal(again.payload.error.code, "ORDER_ALREADY_CONVERTED");
});

test("staff can confirm or cancel a placed order", async () => {
  const clientDoc = await createClient(ownerA, businessAId, { name: "Patch Client" });
  const product = await createProduct(ownerA, businessAId, { name: "Cup" });
  const list = await createSentRateList(ownerA, businessAId, {
    clientId: clientDoc.id,
    items: [{ productId: product.id, customPrice: 40 }],
  });
  const placed = await request(`/public/store/${list.shareToken}/orders`, {
    method: "POST",
    body: { items: [{ productId: product.id, quantity: 1 }] },
  });

  const confirmed = await request(`/orders/${placed.payload.order.id}`, {
    method: "PATCH",
    headers: tenantHeaders(ownerA, businessAId),
    body: { status: "confirmed", notes: "Call before delivery" },
  });
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.payload));
  assert.equal(confirmed.payload.order.status, "confirmed");
  assert.equal(confirmed.payload.order.notes, "Call before delivery");

  const cancelled = await request(`/orders/${placed.payload.order.id}`, {
    method: "PATCH",
    headers: tenantHeaders(ownerA, businessAId),
    body: { status: "cancelled" },
  });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.payload.order.status, "cancelled");

  const convert = await request(`/orders/${placed.payload.order.id}/convert`, {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {},
  });
  assert.equal(convert.status, 409);
  assert.equal(convert.payload.error.code, "ORDER_CANCELLED");
});

test("staff can create an order against a client rate list", async () => {
  const clientDoc = await createClient(ownerA, businessAId, { name: "Staff Client" });
  const product = await createProduct(ownerA, businessAId, {
    name: "Soap",
    salePrice: 90,
  });
  const list = await createSentRateList(ownerA, businessAId, {
    clientId: clientDoc.id,
    items: [{ productId: product.id, customPrice: 60 }],
  });

  const created = await request("/orders", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      clientId: clientDoc.id,
      rateListId: list.id,
      items: [{ productId: product.id, quantity: 2 }],
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.payload));
  assert.equal(created.payload.order.source, "staff");
  assert.equal(created.payload.order.total, 120);
  assert.equal(created.payload.order.items[0].unitPrice, 60);
});

test("orders are tenant-scoped", async () => {
  const clientDoc = await createClient(ownerA, businessAId, { name: "Tenant Client" });
  const product = await createProduct(ownerA, businessAId, { name: "Tenant Item" });
  const list = await createSentRateList(ownerA, businessAId, {
    clientId: clientDoc.id,
    items: [{ productId: product.id, customPrice: 15 }],
  });
  const placed = await request(`/public/store/${list.shareToken}/orders`, {
    method: "POST",
    body: { items: [{ productId: product.id, quantity: 1 }] },
  });

  const otherList = await request("/orders", {
    headers: tenantHeaders(ownerB, businessBId),
  });
  assert.equal(otherList.status, 200);
  assert.ok(
    !otherList.payload.orders.some((row) => row.id === placed.payload.order.id)
  );

  const steal = await request(`/orders/${placed.payload.order.id}`, {
    headers: tenantHeaders(ownerB, businessBId),
  });
  assert.equal(steal.status, 404);
});

test("RBAC: operator can convert; booker cannot; inventory cannot view", async () => {
  const roles = await request("/roles", {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(roles.status, 200);
  const roleList = roles.payload?.data?.roles || roles.payload?.roles || [];
  const bySlug = Object.fromEntries(roleList.map((r) => [r.slug, r]));

  const inviteClerk = await request("/users", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      firstName: "Clerk",
      lastName: "Orders",
      email: "orders-clerk@example.com",
      password: "Password123!",
      roleId: bySlug.invoice_operator.id,
    },
  });
  assert.equal(inviteClerk.status, 201, JSON.stringify(inviteClerk.payload));

  const inviteStock = await request("/users", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      firstName: "Stock",
      lastName: "Orders",
      email: "orders-stock@example.com",
      password: "Password123!",
      roleId: bySlug.inventory_manager.id,
    },
  });
  assert.equal(inviteStock.status, 201);

  const inviteBooker = await request("/users", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      firstName: "Booker",
      lastName: "Orders",
      email: "orders-booker@example.com",
      password: "Password123!",
      roleId: bySlug.order_booker.id,
    },
  });
  assert.equal(inviteBooker.status, 201);

  const clerkUser = await login("orders-clerk@example.com", "Password123!");
  const stockUser = await login("orders-stock@example.com", "Password123!");
  const bookerUser = await login("orders-booker@example.com", "Password123!");

  const clientDoc = await createClient(ownerA, businessAId, { name: "RBAC Order Client" });
  const product = await createProduct(ownerA, businessAId, {
    name: "RBAC Item",
    openingStock: 5,
    salePrice: 30,
  });
  const list = await createSentRateList(ownerA, businessAId, {
    clientId: clientDoc.id,
    items: [{ productId: product.id, customPrice: 25 }],
  });
  const placed = await request(`/public/store/${list.shareToken}/orders`, {
    method: "POST",
    body: { items: [{ productId: product.id, quantity: 1 }] },
  });

  const stockList = await request("/orders", {
    headers: tenantHeaders(stockUser, businessAId),
  });
  assert.equal(stockList.status, 403);

  const bookerConvert = await request(`/orders/${placed.payload.order.id}/convert`, {
    method: "POST",
    headers: tenantHeaders(bookerUser, businessAId),
    body: {},
  });
  assert.equal(bookerConvert.status, 403);

  const clerkConvert = await request(`/orders/${placed.payload.order.id}/convert`, {
    method: "POST",
    headers: tenantHeaders(clerkUser, businessAId),
    body: {},
  });
  assert.equal(clerkConvert.status, 201, JSON.stringify(clerkConvert.payload));
  assert.equal(clerkConvert.payload.order.status, "converted");
});

test("general catalog has a store link anyone can order from", async () => {
  const tea = await createProduct(ownerA, businessAId, {
    name: "Catalog Tea",
    salePrice: 220,
    openingStock: 15,
  });
  const jam = await createProduct(ownerA, businessAId, {
    name: "Catalog Jam",
    salePrice: 115,
    openingStock: 8,
  });
  await createProduct(ownerA, businessAId, {
    name: "Hidden Archived",
    salePrice: 99,
    status: "archived",
  });

  const created = await request("/store-link", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {},
  });
  assert.equal(created.status, 200, JSON.stringify(created.payload));
  assert.ok(created.payload.storeToken);
  assert.equal(created.payload.storePath, `/public/store/${created.payload.storeToken}`);

  const again = await request("/store-link", {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(again.status, 200);
  assert.equal(again.payload.storeToken, created.payload.storeToken);

  const store = await request(`/public/store/${created.payload.storeToken}`);
  assert.equal(store.status, 200, JSON.stringify(store.payload));
  assert.equal(store.payload.store.kind, "catalog");
  assert.equal(store.payload.store.requiresCustomer, true);
  assert.equal(store.payload.store.clientName, null);
  assert.equal(store.payload.store.businessName, "Orders Alpha");
  const names = store.payload.store.items.map((item) => item.name);
  assert.ok(names.includes("Catalog Tea"));
  assert.ok(names.includes("Catalog Jam"));
  assert.equal(names.includes("Hidden Archived"), false);
  const teaItem = store.payload.store.items.find((item) => item.productId === tea.id);
  assert.equal(teaItem.price, 220);

  const missingCustomer = await request(`/public/store/${created.payload.storeToken}/orders`, {
    method: "POST",
    body: { items: [{ productId: tea.id, quantity: 1 }] },
  });
  assert.equal(missingCustomer.status, 400);

  const placed = await request(`/public/store/${created.payload.storeToken}/orders`, {
    method: "POST",
    body: {
      clientName: "Walk-in Buyer",
      clientPhone: "03001112233",
      items: [
        { productId: tea.id, quantity: 2 },
        { productId: jam.id, quantity: 1 },
      ],
    },
  });
  assert.equal(placed.status, 201, JSON.stringify(placed.payload));
  assert.equal(placed.payload.order.clientName, "Walk-in Buyer");
  assert.equal(placed.payload.order.total, 220 * 2 + 115);

  const listed = await request("/orders", {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(listed.status, 200);
  const found = listed.payload.orders.find((row) => row.id === placed.payload.order.id);
  assert.ok(found);
  assert.equal(found.rateListId, null);
  assert.equal(found.clientPhone, "03001112233");

  const converted = await request(`/orders/${placed.payload.order.id}/convert`, {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {},
  });
  assert.equal(converted.status, 201, JSON.stringify(converted.payload));
  assert.equal(converted.payload.invoice.total, 555);

  const rotated = await request("/store-link", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { rotateToken: true },
  });
  assert.equal(rotated.status, 200);
  assert.notEqual(rotated.payload.storeToken, created.payload.storeToken);
  const oldLink = await request(`/public/store/${created.payload.storeToken}`);
  assert.equal(oldLink.status, 404);
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
