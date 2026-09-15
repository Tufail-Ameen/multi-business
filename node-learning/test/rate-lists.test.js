/**
 * Client-specific rate list tests — CRUD, snapshots, send/share, RBAC, tenancy.
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
  accessSecret: "phase4-access-secret-that-is-long-and-stable",
  refreshSecret: "phase4-refresh-secret-that-is-long-and-different",
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
    businessName: "Phase4 Alpha",
    email: "phase4-alpha@example.com",
    password: "Password123!",
  });
  ownerA = await login("phase4-alpha@example.com", "Password123!");
  businessAId = regA.user.activeBusinessId;

  const regB = await register({
    firstName: "Owner",
    lastName: "Beta",
    businessName: "Phase4 Beta",
    email: "phase4-beta@example.com",
    password: "Password123!",
  });
  ownerB = await login("phase4-beta@example.com", "Password123!");
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
    body: { name: "Ahmed Traders", email: "ahmed@example.com", ...body },
  });
  assert.equal(result.status, 201, JSON.stringify(result.payload));
  return result.payload;
}

async function createProduct(auth, businessId, body = {}) {
  const result = await request("/products", {
    method: "POST",
    headers: tenantHeaders(auth, businessId),
    body: {
      name: "Biscuit 200g",
      sku: `BIS-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      salePrice: 100,
      purchasePrice: 70,
      ...body,
    },
  });
  assert.equal(result.status, 201, JSON.stringify(result.payload));
  return result.payload;
}

test("create rate list snapshots product names and default prices", async () => {
  const clientDoc = await createClient(ownerA, businessAId, {
    name: "Ahmed Traders",
  });
  const biscuit = await createProduct(ownerA, businessAId, {
    name: "Biscuit 200g",
    sku: "BIS-200",
    salePrice: 100,
  });
  const oil = await createProduct(ownerA, businessAId, {
    name: "Oil 1L",
    sku: "OIL-1L",
    salePrice: 450,
  });

  const created = await request("/rate-lists", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      clientId: clientDoc.id,
      title: "Ramzan Rate List",
      items: [
        { productId: biscuit.id, customPrice: 80 },
        { productId: oil.id },
      ],
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.payload));
  assert.equal(created.payload.status, "DRAFT");
  assert.equal(created.payload.clientId, clientDoc.id);
  assert.equal(created.payload.clientName, "Ahmed Traders");
  assert.equal(created.payload.itemCount, 2);
  assert.match(created.payload.number, /^RL-\d{5}$/);

  const biscuitLine = created.payload.items.find((i) => i.productId === biscuit.id);
  const oilLine = created.payload.items.find((i) => i.productId === oil.id);
  assert.equal(biscuitLine.productName, "Biscuit 200g");
  assert.equal(biscuitLine.defaultPrice, 100);
  assert.equal(biscuitLine.customPrice, 80);
  assert.equal(oilLine.defaultPrice, 450);
  assert.equal(oilLine.customPrice, 450);

  await request(`/products/${biscuit.id}`, {
    method: "PATCH",
    headers: tenantHeaders(ownerA, businessAId),
    body: { name: "Biscuit renamed", salePrice: 999 },
  });

  const got = await request(`/rate-lists/${created.payload.id}`, {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(got.status, 200);
  const still = got.payload.items.find((i) => i.productId === biscuit.id);
  assert.equal(still.productName, "Biscuit 200g");
  assert.equal(still.defaultPrice, 100);
  assert.equal(still.customPrice, 80);
});

test("rate list items include the live product category", async () => {
  const cat = await request("/categories", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { name: "Hair Color" },
  });
  assert.equal(cat.status, 201, JSON.stringify(cat.payload));

  const shop = await createClient(ownerA, businessAId, {
    name: "Color Shop",
    email: "color-shop@example.com",
    phone: "03001111888",
  });
  const dye = await createProduct(ownerA, businessAId, {
    name: "Sabalon Apply Color",
    sku: "SAB-COLOR",
    salePrice: 1700,
    categoryId: cat.payload.id,
  });

  const created = await request("/rate-lists", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { clientId: shop.id, items: [{ productId: dye.id }] },
  });
  assert.equal(created.status, 201, JSON.stringify(created.payload));
  assert.equal(created.payload.items[0].category, "Hair Color");
  assert.equal(created.payload.items[0].categoryId, cat.payload.id);
  assert.equal(created.payload.items[0].categorySortOrder, cat.payload.sortOrder);

  const got = await request(`/rate-lists/${created.payload.id}`, {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(got.status, 200);
  assert.equal(got.payload.items[0].category, "Hair Color");
  assert.equal(got.payload.items[0].categoryId, cat.payload.id);
  assert.equal(got.payload.items[0].categorySortOrder, cat.payload.sortOrder);

  const outreach = await request("/rate-lists/bulk-outreach", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { clientIds: [shop.id] },
  });
  assert.equal(outreach.status, 200, JSON.stringify(outreach.payload));
  assert.equal(outreach.payload.groups[0].items[0].category, "Hair Color");
});

test("catalog rate list items follow saved category order", async () => {
  const prefix = `RlOrd-${Date.now()}`;
  const wax = await request("/categories", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { name: `${prefix} Wax` },
  });
  const color = await request("/categories", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { name: `${prefix} Color` },
  });
  const spray = await request("/categories", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { name: `${prefix} Spray` },
  });
  assert.equal(wax.status, 201, JSON.stringify(wax.payload));
  assert.equal(color.status, 201, JSON.stringify(color.payload));
  assert.equal(spray.status, 201, JSON.stringify(spray.payload));

  await createProduct(ownerA, businessAId, {
    name: `${prefix} Apple Color`,
    sku: `${prefix}-APPLE`,
    salePrice: 1700,
    categoryId: color.payload.id,
  });
  await createProduct(ownerA, businessAId, {
    name: `${prefix} Zebra Wax`,
    sku: `${prefix}-ZEBRA`,
    salePrice: 300,
    categoryId: wax.payload.id,
  });
  await createProduct(ownerA, businessAId, {
    name: `${prefix} Beta Spray`,
    sku: `${prefix}-BETA`,
    salePrice: 220,
    categoryId: spray.payload.id,
  });

  const listed = await request("/categories?per_page=500", {
    headers: tenantHeaders(ownerA, businessAId),
  });
  const restIds = listed.payload.categories
    .map((row) => row.id)
    .filter((id) => ![wax.payload.id, color.payload.id, spray.payload.id].includes(id));
  const reordered = await request("/categories/reorder", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { ids: [spray.payload.id, wax.payload.id, color.payload.id, ...restIds] },
  });
  assert.equal(reordered.status, 200, JSON.stringify(reordered.payload));

  const shop = await createClient(ownerA, businessAId, {
    name: `${prefix} Shop`,
    email: `${prefix}@example.com`,
    phone: "03001111999",
  });
  const outreach = await request("/rate-lists/bulk-outreach", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { clientIds: [shop.id] },
  });
  assert.equal(outreach.status, 200, JSON.stringify(outreach.payload));
  const names = outreach.payload.groups[0].items
    .filter((item) => String(item.productName).startsWith(prefix))
    .map((item) => item.productName);
  assert.deepEqual(names, [
    `${prefix} Beta Spray`,
    `${prefix} Zebra Wax`,
    `${prefix} Apple Color`,
  ]);
});

test("rate list items include how much this shop already bought", async () => {
  const shop = await createClient(ownerA, businessAId, {
    name: "Purchase Rank Shop",
    email: "rank-shop@example.com",
  });
  const other = await createClient(ownerA, businessAId, {
    name: "Other Shop",
    email: "other-shop@example.com",
  });
  const cap = await createProduct(ownerA, businessAId, {
    name: "Cap",
    sku: "CAP-RANK",
    salePrice: 45,
    openingStock: 80,
  });
  const oil = await createProduct(ownerA, businessAId, {
    name: "Oil",
    sku: "OIL-RANK",
    salePrice: 450,
    openingStock: 80,
  });
  const soap = await createProduct(ownerA, businessAId, {
    name: "Soap",
    sku: "SOAP-RANK",
    salePrice: 50,
    openingStock: 80,
  });

  const created = await request("/rate-lists", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      clientId: shop.id,
      title: "Rank list",
      items: [{ productId: soap.id }, { productId: oil.id }, { productId: cap.id }],
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.payload));

  const sold = await request("/invoices", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      clientId: shop.id,
      issueDate: "2026-09-10",
      dueDate: "2026-09-20",
      status: "pending",
      items: [
        { productId: cap.id, quantity: 9, tax: 0 },
        { productId: oil.id, quantity: 2, tax: 0 },
      ],
    },
  });
  assert.equal(sold.status, 201, JSON.stringify(sold.payload));

  const draft = await request("/invoices", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      clientId: shop.id,
      issueDate: "2026-09-11",
      dueDate: "2026-09-21",
      status: "draft",
      items: [{ productId: soap.id, quantity: 40, tax: 0 }],
    },
  });
  assert.equal(draft.status, 201, JSON.stringify(draft.payload));

  const otherSale = await request("/invoices", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      clientId: other.id,
      issueDate: "2026-09-12",
      dueDate: "2026-09-22",
      status: "pending",
      items: [{ productId: soap.id, quantity: 30, tax: 0 }],
    },
  });
  assert.equal(otherSale.status, 201, JSON.stringify(otherSale.payload));

  const got = await request(`/rate-lists/${created.payload.id}`, {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(got.status, 200, JSON.stringify(got.payload));
  const capLine = got.payload.items.find((item) => item.productId === cap.id);
  const oilLine = got.payload.items.find((item) => item.productId === oil.id);
  const soapLine = got.payload.items.find((item) => item.productId === soap.id);
  assert.equal(capLine.soldQty, 9);
  assert.ok(capLine.lastBoughtAt);
  assert.equal(oilLine.soldQty, 2);
  assert.equal(soapLine.soldQty, 0);
  assert.equal(soapLine.lastBoughtAt, null);
});

test("rejects missing client, invalid product, duplicates, and negative prices", async () => {
  const clientDoc = await createClient(ownerA, businessAId, {
    name: "Validation Client",
    email: "val@example.com",
  });
  const product = await createProduct(ownerA, businessAId, {
    name: "Widget",
    sku: "VAL-1",
    salePrice: 10,
  });

  const noClient = await request("/rate-lists", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { items: [{ productId: product.id }] },
  });
  assert.equal(noClient.status, 400);

  const missingClient = await request("/rate-lists", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { clientId: 99999, items: [{ productId: product.id }] },
  });
  assert.equal(missingClient.status, 404);
  assert.equal(missingClient.payload.error.code, "CLIENT_NOT_FOUND");

  const badProduct = await request("/rate-lists", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { clientId: clientDoc.id, items: [{ productId: 88888 }] },
  });
  assert.equal(badProduct.status, 400);
  assert.equal(badProduct.payload.error.code, "INVALID_PRODUCT");

  const dup = await request("/rate-lists", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      clientId: clientDoc.id,
      items: [
        { productId: product.id, customPrice: 9 },
        { productId: product.id, customPrice: 8 },
      ],
    },
  });
  assert.equal(dup.status, 400);
  assert.equal(dup.payload.error.code, "DUPLICATE_PRODUCT");

  const negative = await request("/rate-lists", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      clientId: clientDoc.id,
      items: [{ productId: product.id, customPrice: -1 }],
    },
  });
  assert.equal(negative.status, 400);
});

test("list filters by client; patch draft; delete draft", async () => {
  const c1 = await createClient(ownerA, businessAId, {
    name: "Client One",
    email: "one@example.com",
  });
  const c2 = await createClient(ownerA, businessAId, {
    name: "Client Two",
    email: "two@example.com",
  });
  const product = await createProduct(ownerA, businessAId, {
    name: "Soap",
    sku: "SOAP-1",
    salePrice: 50,
  });

  const list1 = await request("/rate-lists", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { clientId: c1.id, items: [{ productId: product.id, customPrice: 45 }] },
  });
  assert.equal(list1.status, 201);
  await request("/rate-lists", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { clientId: c2.id, items: [{ productId: product.id }] },
  });

  const filtered = await request(`/rate-lists?clientId=${c1.id}`, {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(filtered.status, 200);
  assert.ok(filtered.payload.rateLists.every((row) => row.clientId === c1.id));
  assert.ok(filtered.payload.rateLists.every((row) => row.items === undefined));

  const nested = await request(`/clients/${c1.id}/rate-lists`, {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(nested.status, 200);
  assert.equal(nested.payload.clientId, c1.id);
  assert.ok(nested.payload.rateLists.length >= 1);

  const patched = await request(`/rate-lists/${list1.payload.id}`, {
    method: "PATCH",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      title: "Updated title",
      items: [{ productId: product.id, customPrice: 40 }],
    },
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.payload.title, "Updated title");
  assert.equal(patched.payload.items[0].customPrice, 40);

  const deleted = await request(`/rate-lists/${list1.payload.id}`, {
    method: "DELETE",
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.payload.message, "Rate list deleted");

  const gone = await request(`/rate-lists/${list1.payload.id}`, {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(gone.status, 404);
});

test("send locks the list, public share works, resend keeps token unless rotated", async () => {
  const clientDoc = await createClient(ownerA, businessAId, {
    name: "Share Client",
    email: "share@example.com",
  });
  const product = await createProduct(ownerA, businessAId, {
    name: "Tea",
    sku: "TEA-1",
    salePrice: 200,
  });
  const created = await request("/rate-lists", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      clientId: clientDoc.id,
      items: [{ productId: product.id, customPrice: 175 }],
    },
  });
  assert.equal(created.status, 201);

  const sent = await request(`/rate-lists/${created.payload.id}/send`, {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { channel: "whatsapp" },
  });
  assert.equal(sent.status, 200, JSON.stringify(sent.payload));
  assert.equal(sent.payload.status, "SENT");
  assert.equal(sent.payload.sendChannel, "whatsapp");
  assert.ok(sent.payload.shareToken);
  assert.equal(
    sent.payload.sharePath,
    `/public/rate-lists/${sent.payload.shareToken}`
  );

  const locked = await request(`/rate-lists/${created.payload.id}`, {
    method: "PATCH",
    headers: tenantHeaders(ownerA, businessAId),
    body: { title: "should fail" },
  });
  assert.equal(locked.status, 409);
  assert.equal(locked.payload.error.code, "RATE_LIST_LOCKED");

  const publicView = await request(sent.payload.sharePath);
  assert.equal(publicView.status, 200);
  assert.equal(publicView.payload.rateList.clientName, "Share Client");
  assert.equal(publicView.payload.rateList.items[0].productName, "Tea");
  assert.equal(publicView.payload.rateList.items[0].price, 175);
  assert.equal(publicView.payload.rateList.businessId, undefined);
  assert.equal(publicView.payload.rateList.shareToken, undefined);

  const resent = await request(`/rate-lists/${created.payload.id}/send`, {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { channel: "email" },
  });
  assert.equal(resent.status, 200);
  assert.equal(resent.payload.shareToken, sent.payload.shareToken);
  assert.equal(resent.payload.sendChannel, "email");

  const rotated = await request(`/rate-lists/${created.payload.id}/send`, {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { rotateToken: true },
  });
  assert.equal(rotated.status, 200);
  assert.notEqual(rotated.payload.shareToken, sent.payload.shareToken);

  const oldLink = await request(sent.payload.sharePath);
  assert.equal(oldLink.status, 404);

  const archived = await request(`/rate-lists/${created.payload.id}`, {
    method: "DELETE",
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(archived.status, 200);
  assert.equal(archived.payload.status, "ARCHIVED");

  const sendArchived = await request(`/rate-lists/${created.payload.id}/send`, {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {},
  });
  assert.equal(sendArchived.status, 409);
});

test("bulk outreach groups identical lists and uses the catalog when a shop has no assigned products", async () => {
  const product = await createProduct(ownerA, businessAId, {
    name: "Soap",
    sku: `SOAP-BULK-${Date.now()}`,
    salePrice: 50,
  });
  const sameA = await createClient(ownerA, businessAId, {
    name: "Same A",
    phone: "03001111001",
  });
  const sameB = await createClient(ownerA, businessAId, {
    name: "Same B",
    phone: "03001111002",
  });
  const custom = await createClient(ownerA, businessAId, {
    name: "Custom Shop",
    phone: "03001111003",
  });
  const noList = await createClient(ownerA, businessAId, {
    name: "No List",
    phone: "03001111004",
  });
  const noListB = await createClient(ownerA, businessAId, {
    name: "No List B",
    phone: "03001111005",
  });
  const noPhone = await createClient(ownerA, businessAId, {
    name: "No Phone",
    phone: "",
  });

  for (const shop of [sameA, sameB]) {
    const created = await request("/rate-lists", {
      method: "POST",
      headers: tenantHeaders(ownerA, businessAId),
      body: {
        clientId: shop.id,
        items: [{ productId: product.id, customPrice: 45 }],
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.payload));
  }
  const customList = await request("/rate-lists", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      clientId: custom.id,
      items: [{ productId: product.id, customPrice: 70 }],
    },
  });
  assert.equal(customList.status, 201, JSON.stringify(customList.payload));

  const result = await request("/rate-lists/bulk-outreach", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      clientIds: [sameA.id, sameB.id, custom.id, noList.id, noListB.id, noPhone.id],
    },
  });
  assert.equal(result.status, 200, JSON.stringify(result.payload));
  assert.equal(result.payload.ready, 5);
  assert.equal(result.payload.groups.length, 3);
  const assignedShared = result.payload.groups.find(
    (group) => group.source === "assigned" && group.kind === "shared"
  );
  const assignedCustom = result.payload.groups.find(
    (group) => group.source === "assigned" && group.kind === "custom"
  );
  const catalogGroup = result.payload.groups.find(
    (group) => group.source === "catalog"
  );
  assert.equal(assignedShared.recipients.length, 2);
  assert.equal(assignedCustom.recipients.length, 1);
  assert.equal(catalogGroup.kind, "shared");
  assert.equal(catalogGroup.recipients.length, 2);
  assert.ok(catalogGroup.items.length >= 1);
  const catalogSoap = catalogGroup.items.find((item) => item.productId === product.id);
  assert.ok(catalogSoap);
  assert.equal(catalogSoap.customPrice, 50);
  assert.equal(catalogSoap.productName, "Soap");
  const catalogIds = catalogGroup.recipients.map((row) => row.clientId).sort();
  assert.deepEqual(catalogIds, [noList.id, noListB.id].sort());
  const reasons = result.payload.skipped.map((row) => row.reason).sort();
  assert.deepEqual(reasons, ["no_phone"]);
});

test("expired public share returns 410; draft has no public access", async () => {
  const clientDoc = await createClient(ownerA, businessAId, {
    name: "Expiry Client",
    email: "exp@example.com",
  });
  const product = await createProduct(ownerA, businessAId, {
    name: "Milk",
    sku: "MILK-1",
    salePrice: 80,
  });
  const created = await request("/rate-lists", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { clientId: clientDoc.id, items: [{ productId: product.id }] },
  });

  const draftPublic = await request("/public/rate-lists/not-a-real-token");
  assert.equal(draftPublic.status, 404);

  const past = new Date(Date.now() - 60_000).toISOString();
  const sent = await request(`/rate-lists/${created.payload.id}/send`, {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { expiresAt: past },
  });
  assert.equal(sent.status, 200);
  const expired = await request(sent.payload.sharePath);
  assert.equal(expired.status, 410);
  assert.equal(expired.payload.error.code, "SHARE_LINK_EXPIRED");
});

test("duplicate copies custom prices into a new draft and can retarget a client", async () => {
  const c1 = await createClient(ownerA, businessAId, {
    name: "Original",
    email: "orig@example.com",
  });
  const c2 = await createClient(ownerA, businessAId, {
    name: "Copy Target",
    email: "copy@example.com",
  });
  const product = await createProduct(ownerA, businessAId, {
    name: "Sugar",
    sku: "SUG-1",
    salePrice: 90,
  });
  const created = await request("/rate-lists", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      clientId: c1.id,
      title: "Original list",
      items: [{ productId: product.id, customPrice: 77 }],
    },
  });
  await request(`/rate-lists/${created.payload.id}/send`, {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {},
  });

  const copy = await request(`/rate-lists/${created.payload.id}/duplicate`, {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { clientId: c2.id },
  });
  assert.equal(copy.status, 201, JSON.stringify(copy.payload));
  assert.equal(copy.payload.status, "DRAFT");
  assert.equal(copy.payload.clientId, c2.id);
  assert.equal(copy.payload.shareToken, null);
  assert.equal(copy.payload.items[0].customPrice, 77);
  assert.notEqual(copy.payload.id, created.payload.id);
});

test("tenant isolation: business B cannot read, send, or use A's products", async () => {
  const clientA = await createClient(ownerA, businessAId, {
    name: "Iso A",
    email: "iso-a@example.com",
  });
  const productA = await createProduct(ownerA, businessAId, {
    name: "Iso Product",
    sku: "ISO-RL-1",
    salePrice: 15,
  });
  const created = await request("/rate-lists", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { clientId: clientA.id, items: [{ productId: productA.id }] },
  });
  assert.equal(created.status, 201);

  const crossGet = await request(`/rate-lists/${created.payload.id}`, {
    headers: tenantHeaders(ownerB, businessBId),
  });
  assert.equal(crossGet.status, 404);

  const crossSend = await request(`/rate-lists/${created.payload.id}/send`, {
    method: "POST",
    headers: tenantHeaders(ownerB, businessBId),
    body: {},
  });
  assert.equal(crossSend.status, 404);

  const clientB = await createClient(ownerB, businessBId, {
    name: "Iso B",
    email: "iso-b@example.com",
  });
  const stealProduct = await request("/rate-lists", {
    method: "POST",
    headers: tenantHeaders(ownerB, businessBId),
    body: { clientId: clientB.id, items: [{ productId: productA.id }] },
  });
  assert.equal(stealProduct.status, 400);
  assert.equal(stealProduct.payload.error.code, "INVALID_PRODUCT");

  const stealClient = await request("/rate-lists", {
    method: "POST",
    headers: tenantHeaders(ownerB, businessBId),
    body: { clientId: clientA.id, items: [{ productId: productA.id }] },
  });
  assert.equal(stealClient.status, 404);
});

test("RBAC: invoice operator can manage rate lists; inventory manager cannot", async () => {
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
      lastName: "Rates",
      email: "phase4-clerk@example.com",
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
      lastName: "Rates",
      email: "phase4-stock@example.com",
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
      lastName: "Rates",
      email: "phase4-booker@example.com",
      password: "Password123!",
      roleId: bySlug.order_booker.id,
    },
  });
  assert.equal(inviteBooker.status, 201);

  const clerkUser = await login("phase4-clerk@example.com", "Password123!");
  const stockUser = await login("phase4-stock@example.com", "Password123!");
  const bookerUser = await login("phase4-booker@example.com", "Password123!");

  const clientDoc = await createClient(clerkUser, businessAId, {
    name: "RBAC Client",
    email: "rbac-rl@example.com",
  });
  const product = await createProduct(ownerA, businessAId, {
    name: "RBAC Item",
    sku: "RBAC-RL-1",
    salePrice: 30,
  });

  const clerkCreate = await request("/rate-lists", {
    method: "POST",
    headers: tenantHeaders(clerkUser, businessAId),
    body: {
      clientId: clientDoc.id,
      items: [{ productId: product.id, customPrice: 25 }],
    },
  });
  assert.equal(clerkCreate.status, 201, JSON.stringify(clerkCreate.payload));

  const bookerCreate = await request("/rate-lists", {
    method: "POST",
    headers: tenantHeaders(bookerUser, businessAId),
    body: {
      clientId: clientDoc.id,
      items: [{ productId: product.id, customPrice: 22 }],
    },
  });
  assert.equal(bookerCreate.status, 201, JSON.stringify(bookerCreate.payload));

  const stockCreate = await request("/rate-lists", {
    method: "POST",
    headers: tenantHeaders(stockUser, businessAId),
    body: {
      clientId: clientDoc.id,
      items: [{ productId: product.id }],
    },
  });
  assert.equal(stockCreate.status, 403);

  const stockView = await request("/rate-lists", {
    headers: tenantHeaders(stockUser, businessAId),
  });
  assert.equal(stockView.status, 403);
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
