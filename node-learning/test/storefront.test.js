/**
 * Per-business public landing — slug page, publish, RBAC.
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
let slugA;
let slugB;

const secrets = {
  accessSecret: "storefront-access-secret-that-is-long-and-stable",
  refreshSecret: "storefront-refresh-secret-that-is-long-and-different",
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
    businessName: "Tufail Traders",
    email: "storefront-alpha@example.com",
    password: "Password123!",
  });
  ownerA = await login("storefront-alpha@example.com", "Password123!");
  businessAId = regA.user.activeBusinessId;
  slugA = regA.user.businesses[0].slug;

  const regB = await register({
    firstName: "Owner",
    lastName: "Beta",
    businessName: "Anarkali Shop",
    email: "storefront-beta@example.com",
    password: "Password123!",
  });
  ownerB = await login("storefront-beta@example.com", "Password123!");
  businessBId = regB.user.activeBusinessId;
  slugB = regB.user.businesses[0].slug;
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

test("unpublished landing is hidden from the public", async () => {
  const missing = await request("/public/businesses/no-such-shop");
  assert.equal(missing.status, 404);
  assert.equal(missing.payload.error.code, "LANDING_NOT_FOUND");

  const hidden = await request(`/public/businesses/${slugA}`);
  assert.equal(hidden.status, 404);
  assert.equal(hidden.payload.error.code, "LANDING_NOT_FOUND");
});

test("owner can read unpublished storefront and public path uses slug", async () => {
  const result = await request("/storefront", {
    headers: tenantHeaders(ownerA, businessAId),
  });
  assert.equal(result.status, 200, JSON.stringify(result.payload));
  assert.equal(result.payload.slug, slugA);
  assert.equal(result.payload.publicPath, `/b/${slugA}`);
  assert.equal(result.payload.storefront.published, false);
  assert.equal(slugA, "tufail-traders");
  assert.equal(slugB, "anarkali-shop");
});

test("invoice operator cannot edit storefront", async () => {
  const roles = await request("/roles", {
    headers: tenantHeaders(ownerA, businessAId),
  });
  const clerkRole = roles.payload.data.roles.find(
    (role) => role.slug === "invoice_operator"
  );
  const invited = await request("/users", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      firstName: "Clerk",
      lastName: "One",
      email: "storefront-clerk@example.com",
      password: "Password123!",
      roleId: clerkRole.id,
    },
  });
  assert.equal(invited.status, 201, JSON.stringify(invited.payload));

  const clerk = await login("storefront-clerk@example.com", "Password123!");
  const deniedGet = await request("/storefront", {
    headers: tenantHeaders(clerk, businessAId),
  });
  assert.equal(deniedGet.status, 403);
  assert.equal(deniedGet.payload.error.code, "PERMISSION_DENIED");

  const deniedPatch = await request("/storefront", {
    method: "PATCH",
    headers: tenantHeaders(clerk, businessAId),
    body: { published: true },
  });
  assert.equal(deniedPatch.status, 403);
});

test("owner publishes landing and public slug page returns it", async () => {
  const created = await request("/products", {
    method: "POST",
    headers: tenantHeaders(ownerA, businessAId),
    body: { name: "Hair Spray", sku: "HS-1", salePrice: 250, openingStock: 12 },
  });
  assert.equal(created.status, 201, JSON.stringify(created.payload));

  const invalidColor = await request("/storefront", {
    method: "PATCH",
    headers: tenantHeaders(ownerA, businessAId),
    body: { primaryColor: "green" },
  });
  assert.equal(invalidColor.status, 400);

  const published = await request("/storefront", {
    method: "PATCH",
    headers: tenantHeaders(ownerA, businessAId),
    body: {
      published: true,
      heroTitle: "Wholesale cosmetics",
      heroSubtitle: "Anarkali rates, same-day booking",
      about: "Family wholesale shop.",
      whatsapp: "03001234567",
      phone: "03001234567",
      city: "Lahore",
      address: "Anarkali, Mazang",
      primaryColor: "#2d6a56",
    },
  });
  assert.equal(published.status, 200, JSON.stringify(published.payload));
  assert.equal(published.payload.storefront.published, true);
  assert.ok(published.payload.storeToken);

  const publicPage = await request(`/public/businesses/${slugA}`);
  assert.equal(publicPage.status, 200, JSON.stringify(publicPage.payload));
  assert.equal(publicPage.payload.business.name, "Tufail Traders");
  assert.equal(publicPage.payload.business.slug, slugA);
  assert.equal(publicPage.payload.storefront.heroTitle, "Wholesale cosmetics");
  assert.equal(publicPage.payload.storefront.city, "Lahore");
  assert.equal(publicPage.payload.storefront.highlights.length, 3);
  assert.ok(Array.isArray(publicPage.payload.categories));
  assert.equal(publicPage.payload.productCount, 1);
  assert.equal(publicPage.payload.featuredProducts[0].imageUrl, undefined);
  assert.ok(Array.isArray(publicPage.payload.storefront.showcases));
  assert.equal(publicPage.payload.store.token, published.payload.storeToken);
  assert.equal(
    publicPage.payload.store.path,
    `/store/${published.payload.storeToken}`
  );
  assert.ok(
    publicPage.payload.featuredProducts.some((item) => item.name === "Hair Spray")
  );

  const mixedCase = await request("/public/businesses/Tufail-Traders");
  assert.equal(mixedCase.status, 200);
  assert.equal(mixedCase.payload.business.slug, slugA);
});

test("other business landing stays isolated until published", async () => {
  const stillHidden = await request(`/public/businesses/${slugB}`);
  assert.equal(stillHidden.status, 404);

  const crossEdit = await request("/storefront", {
    headers: tenantHeaders(ownerA, businessBId),
  });
  assert.equal(crossEdit.status, 403);

  const publishedB = await request("/storefront", {
    method: "PATCH",
    headers: tenantHeaders(ownerB, businessBId),
    body: { published: true, heroTitle: "Anarkali shop" },
  });
  assert.equal(publishedB.status, 200, JSON.stringify(publishedB.payload));

  const publicB = await request(`/public/businesses/${slugB}`);
  assert.equal(publicB.status, 200);
  assert.equal(publicB.payload.storefront.heroTitle, "Anarkali shop");
  assert.notEqual(publicB.payload.business.slug, slugA);
});

test("unpublish and suspend hide the public landing", async () => {
  const unpublished = await request("/storefront", {
    method: "PATCH",
    headers: tenantHeaders(ownerA, businessAId),
    body: { published: false },
  });
  assert.equal(unpublished.status, 200);
  const hidden = await request(`/public/businesses/${slugA}`);
  assert.equal(hidden.status, 404);

  await db
    .collection("businesses")
    .updateOne({ id: businessBId }, { $set: { status: "suspended" } });
  const suspended = await request(`/public/businesses/${slugB}`);
  assert.equal(suspended.status, 404);
});

async function run() {
  await setup();
  let failed = 0;
  for (const current of tests) {
    try {
      await current.run();
      console.log(`ok  ${current.name}`);
    } catch (error) {
      failed += 1;
      console.error(`not ok  ${current.name}`);
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
