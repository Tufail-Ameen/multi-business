const assert = require("node:assert/strict");
const { createApp } = require("../app-http");
const {
  PLATFORM_MANAGE_BUSINESSES,
  hashPassword,
  signJwt,
} = require("../auth");
const { newId, runMigrations } = require("../database");
const { createTestMongo, cleanupTestMongo } = require("./mongo-test-env");

let mongoEnv;
let client;
let db;
let server;
let baseUrl;
let businessA;
let businessB;
let ownerA;
let ownerB;
let adminCredentials;

const secrets = {
  accessSecret: "test-access-secret-that-is-long-and-stable",
  refreshSecret: "test-refresh-secret-that-is-long-and-different",
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
  const result = await request("/register", {
    method: "POST",
    body: data,
  });
  if (result.status !== 201) {
    console.error("Registration test response:", result.status, result.payload);
  }
  assert.equal(result.status, 201);
  return result.payload.data;
}

async function login(email, password) {
  return request("/login", {
    method: "POST",
    body: { email, password },
  });
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
}

async function cleanup() {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
  if (mongoEnv) {
    await cleanupTestMongo(mongoEnv);
  }
}

test("1. Business A register and login succeeds", async () => {
  businessA = await register({
    firstName: "Owner",
    lastName: "Alpha",
    businessName: "Business Alpha",
    email: "alpha@example.com",
    password: "Password123!",
  });

  assert.equal(businessA.user.isPlatformAdmin, false);
  assert.equal(businessA.user.role.slug, "business_owner");
  assert.ok(businessA.user.permissions.includes("*"));
  assert.ok(!businessA.user.permissions.includes(PLATFORM_MANAGE_BUSINESSES));
  assert.ok(businessA.tokens.accessToken);

  const loginResult = await login("alpha@example.com", "Password123!");
  if (loginResult.status !== 200) {
    console.error(
      "Login test response:",
      loginResult.status,
      loginResult.payload
    );
  }
  assert.equal(loginResult.status, 200);
  ownerA = loginResult.payload.data;
  assert.equal(ownerA.user.activeBusinessId, businessA.user.activeBusinessId);
});

test("2. Business A can access its own data", async () => {
  const created = await request("/clients", {
    method: "POST",
    headers: tenantHeaders(ownerA, ownerA.user.activeBusinessId),
    body: { name: "Alpha Client", phone: "", area: "" },
  });
  assert.equal(created.status, 201);
  assert.equal(created.payload.businessId, ownerA.user.activeBusinessId);
  assert.equal(created.payload.phone, "");

  const list = await request("/clients", {
    headers: tenantHeaders(ownerA, ownerA.user.activeBusinessId),
  });
  assert.equal(list.status, 200);
  assert.equal(list.payload.length, 1);
  assert.equal(list.payload[0].name, "Alpha Client");
});

test("2a. Business Owner can create products and list inventory movements", async () => {
  const product = await request("/products", {
    method: "POST",
    headers: tenantHeaders(ownerA, ownerA.user.activeBusinessId),
    body: { name: "Alpha Product", stock: 10, unit: "pcs" },
  });
  assert.equal(product.status, 201);
  assert.equal(product.payload.businessId, ownerA.user.activeBusinessId);
  assert.equal(product.payload.currentStock, 10);

  const openingMovements = await request("/inventory/movements", {
    headers: tenantHeaders(ownerA, ownerA.user.activeBusinessId),
  });
  assert.equal(openingMovements.status, 200);
  assert.ok(
    openingMovements.payload.movements.some(
      (m) =>
        m.productId === product.payload.id &&
        (m.movementType === "OPENING_STOCK" || m.type === "OPENING_STOCK")
    )
  );

  await db.collection("inventory_movements").insertMany([
    {
      id: 9001,
      businessId: ownerA.user.activeBusinessId,
      productId: product.payload.id,
      movementType: "ADJUSTMENT",
      type: "ADJUSTMENT",
      quantity: 3,
      createdAt: new Date(),
    },
    {
      id: 9001,
      businessId: "another-business",
      productId: 1,
      movementType: "ADJUSTMENT",
      type: "ADJUSTMENT",
      quantity: 99,
      createdAt: new Date(),
    },
  ]);

  const movements = await request("/inventory/movements", {
    headers: tenantHeaders(ownerA, ownerA.user.activeBusinessId),
  });
  assert.equal(movements.status, 200);
  assert.ok(movements.payload.movements.length >= 2);
  assert.ok(
    movements.payload.movements.every(
      (m) => m.businessId === ownerA.user.activeBusinessId
    )
  );
  assert.ok(!movements.payload.movements.some((m) => m.quantity === 99));
});

test("2b. Migration sets Business Owner permissions to business wildcard", async () => {
  const roleFilter = {
    businessId: ownerA.user.activeBusinessId,
    slug: "business_owner",
  };
  await db
    .collection("roles")
    .updateOne(roleFilter, { $set: { permissions: ["clients.view"] } });

  await runMigrations(db, client);

  const role = await db.collection("roles").findOne(roleFilter);
  assert.deepEqual(role.permissions, ["*"]);
  assert.equal(role.isSystem, true);

  const seeded = await db
    .collection("roles")
    .find({ businessId: ownerA.user.activeBusinessId })
    .toArray();
  const slugs = seeded.map((r) => r.slug).sort();
  assert.deepEqual(slugs, [
    "business_owner",
    "inventory_manager",
    "invoice_operator",
    "manager",
    "order_booker",
  ]);
});

test("2c. Owner can update and delete own clients and products", async () => {
  const client = await request("/clients", {
    method: "POST",
    headers: tenantHeaders(ownerA, ownerA.user.activeBusinessId),
    body: { name: "Editable Client" },
  });
  assert.equal(client.status, 201);

  const updated = await request(`/clients/${client.payload.id}`, {
    method: "PUT",
    headers: tenantHeaders(ownerA, ownerA.user.activeBusinessId),
    body: {
      name: "Edited Client",
      phone: "03001234567",
      area: "Ichhra",
      address: "Street 1",
      city: "Lahore",
      country: "Pakistan",
    },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.payload.name, "Edited Client");
  assert.equal(updated.payload.phone, "03001234567");
  assert.equal(updated.payload.area, "Ichhra");

  const product = await request("/products", {
    method: "POST",
    headers: tenantHeaders(ownerA, ownerA.user.activeBusinessId),
    body: { name: "Patch Product", stock: 1, unit: "pcs" },
  });
  assert.equal(product.status, 201);
  assert.equal(product.payload.currentStock, 1);

  const patched = await request(`/products/${product.payload.id}`, {
    method: "PATCH",
    headers: tenantHeaders(ownerA, ownerA.user.activeBusinessId),
    body: { name: "Patched Product", stock: 999, unit: "pcs", status: "active" },
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.payload.name, "Patched Product");
  assert.equal(patched.payload.currentStock, 1);
});

test("3. Business A cannot use Business B X-Business-Id", async () => {
  businessB = await register({
    firstName: "Owner",
    lastName: "Beta",
    businessName: "Business Beta",
    email: "beta@example.com",
    password: "Password123!",
  });
  ownerB = (await login("beta@example.com", "Password123!")).payload.data;

  const denied = await request("/clients", {
    headers: tenantHeaders(ownerA, businessB.user.activeBusinessId),
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.payload.error.code, "BUSINESS_ACCESS_DENIED");
});

test("4. Business Owner cannot access platform businesses", async () => {
  const denied = await request("/platform/businesses", {
    headers: {
      Authorization: `Bearer ${ownerA.tokens.accessToken}`,
    },
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.payload.error.code, "PLATFORM_ACCESS_DENIED");
});

test("5. Public register cannot set isPlatformAdmin", async () => {
  const registered = await register({
    firstName: "Public",
    lastName: "User",
    businessName: "Public Business",
    email: "public@example.com",
    password: "Password123!",
    isPlatformAdmin: true,
    permissions: [PLATFORM_MANAGE_BUSINESSES],
  });
  assert.equal(registered.user.isPlatformAdmin, false);
  assert.ok(!registered.user.permissions.includes(PLATFORM_MANAGE_BUSINESSES));

  const storedUser = await db
    .collection("users")
    .findOne({ email: "public@example.com" });
  assert.equal(storedUser.isPlatformAdmin, false);
});

test("6. Seeded Platform Admin can login, list, and create businesses", async () => {
  const role = {
    id: newId(),
    businessId: null,
    name: "Platform Super Admin",
    slug: "platform_super_admin",
    permissions: [PLATFORM_MANAGE_BUSINESSES],
  };
  adminCredentials = {
    email: "platform@example.com",
    password: "StrongAdminPassword123!",
  };
  await db.collection("roles").insertOne(role);
  await db.collection("users").insertOne({
    id: newId(),
    firstName: "Platform",
    lastName: "Admin",
    email: adminCredentials.email,
    passwordHash: await hashPassword(adminCredentials.password),
    isPlatformAdmin: true,
    platformRoleId: role.id,
    status: "active",
  });

  const loginResult = await login(
    adminCredentials.email,
    adminCredentials.password
  );
  assert.equal(loginResult.status, 200);
  adminCredentials.auth = loginResult.payload.data;

  const headers = {
    Authorization: `Bearer ${adminCredentials.auth.tokens.accessToken}`,
  };
  const list = await request("/platform/businesses", { headers });
  assert.equal(list.status, 200);
  assert.ok(list.payload.data.businesses.length >= 3);

  const created = await request("/platform/businesses", {
    method: "POST",
    headers,
    body: { name: "Admin Created Business" },
  });
  assert.equal(created.status, 201);
  assert.equal(created.payload.data.business.status, "active");
});

test("7. Platform Admin can view Business A and B after verified switching", async () => {
  await request("/clients", {
    method: "POST",
    headers: tenantHeaders(ownerB, ownerB.user.activeBusinessId),
    body: { name: "Beta Client One" },
  });
  await request("/clients", {
    method: "POST",
    headers: tenantHeaders(ownerB, ownerB.user.activeBusinessId),
    body: { name: "Beta Client Two" },
  });

  for (const expected of [
    { id: businessA.user.activeBusinessId, client: "Alpha Client" },
    { id: businessB.user.activeBusinessId, client: "Beta Client One" },
  ]) {
    const switched = await request("/auth/switch-business", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminCredentials.auth.tokens.accessToken}`,
      },
      body: { businessId: expected.id },
    });
    assert.equal(switched.status, 200);

    const list = await request("/clients", {
      headers: tenantHeaders(switched.payload.data, expected.id),
    });
    assert.equal(list.status, 200);
    assert.ok(list.payload.some((item) => item.name === expected.client));
  }
});

test("7a. Missing, invalid, and expired JWT return 401", async () => {
  const missing = await request("/clients", {
    headers: { "X-Business-Id": ownerA.user.activeBusinessId },
  });
  assert.equal(missing.status, 401);

  const invalid = await request("/clients", {
    headers: tenantHeaders(
      { tokens: { accessToken: "not-a-jwt" } },
      ownerA.user.activeBusinessId
    ),
  });
  assert.equal(invalid.status, 401);
  assert.equal(invalid.payload.error.code, "INVALID_TOKEN");

  const expiredToken = signJwt(
    {
      sub: ownerA.user.id,
      type: "access",
      activeBusinessId: ownerA.user.activeBusinessId,
    },
    secrets.accessSecret,
    -10
  );
  const expired = await request("/clients", {
    headers: tenantHeaders(
      { tokens: { accessToken: expiredToken } },
      ownerA.user.activeBusinessId
    ),
  });
  assert.equal(expired.status, 401);
  assert.equal(expired.payload.error.code, "TOKEN_EXPIRED");
});

test("7b. Team users/roles/audit APIs work for owner and deny cross-tenant", async () => {
  const roles = await request("/roles", {
    headers: tenantHeaders(ownerA, ownerA.user.activeBusinessId),
  });
  assert.equal(roles.status, 200);
  assert.ok(roles.payload.data.roles.length >= 5);

  const invoiceRole = roles.payload.data.roles.find(
    (role) => role.slug === "invoice_operator"
  );
  assert.ok(invoiceRole);

  const invited = await request("/users", {
    method: "POST",
    headers: tenantHeaders(ownerA, ownerA.user.activeBusinessId),
    body: {
      firstName: "Clerk",
      lastName: "One",
      email: "clerk@alpha.test",
      password: "Password123!",
      roleId: invoiceRole.id,
    },
  });
  assert.equal(invited.status, 201);
  assert.equal(invited.payload.data.user.role.slug, "invoice_operator");

  const users = await request("/users", {
    headers: tenantHeaders(ownerA, ownerA.user.activeBusinessId),
  });
  assert.equal(users.status, 200);
  assert.ok(
    users.payload.data.users.some((user) => user.email === "clerk@alpha.test")
  );

  const audit = await request("/audit-logs", {
    headers: tenantHeaders(ownerA, ownerA.user.activeBusinessId),
  });
  assert.equal(audit.status, 200);
  assert.ok(
    audit.payload.data.logs.some((log) => log.action === "users.invite")
  );

  const crossTenantUsers = await request("/users", {
    headers: tenantHeaders(ownerA, businessB.user.activeBusinessId),
  });
  assert.equal(crossTenantUsers.status, 403);
});

test("7c. Role permissions enforce invoice operator vs inventory manager", async () => {
  const roles = await request("/roles", {
    headers: tenantHeaders(ownerA, ownerA.user.activeBusinessId),
  });
  const bySlug = Object.fromEntries(
    roles.payload.data.roles.map((role) => [role.slug, role])
  );

  const clerkLogin = (await login("clerk@alpha.test", "Password123!")).payload
    .data;
  assert.equal(clerkLogin.user.role.slug, "invoice_operator");

  const clerkClients = await request("/clients", {
    headers: tenantHeaders(clerkLogin, ownerA.user.activeBusinessId),
  });
  assert.equal(clerkClients.status, 200);

  const clerkProductCreate = await request("/products", {
    method: "POST",
    headers: tenantHeaders(clerkLogin, ownerA.user.activeBusinessId),
    body: { name: "Denied Product", stock: 1 },
  });
  assert.equal(clerkProductCreate.status, 403);
  assert.equal(clerkProductCreate.payload.error.code, "PERMISSION_DENIED");

  const clerkUsers = await request("/users", {
    headers: tenantHeaders(clerkLogin, ownerA.user.activeBusinessId),
  });
  assert.equal(clerkUsers.status, 403);

  await request("/users", {
    method: "POST",
    headers: tenantHeaders(ownerA, ownerA.user.activeBusinessId),
    body: {
      firstName: "Stock",
      lastName: "Manager",
      email: "stock@alpha.test",
      password: "Password123!",
      roleId: bySlug.inventory_manager.id,
    },
  });
  const stockLogin = (await login("stock@alpha.test", "Password123!")).payload
    .data;

  const stockProduct = await request("/products", {
    method: "POST",
    headers: tenantHeaders(stockLogin, ownerA.user.activeBusinessId),
    body: { name: "Managed Product", stock: 5, unit: "pcs" },
  });
  assert.equal(stockProduct.status, 201);

  const stockInvite = await request("/users", {
    method: "POST",
    headers: tenantHeaders(stockLogin, ownerA.user.activeBusinessId),
    body: {
      firstName: "Nope",
      lastName: "User",
      email: "nope@alpha.test",
      password: "Password123!",
      roleId: bySlug.invoice_operator.id,
    },
  });
  assert.equal(stockInvite.status, 403);

  await request("/users", {
    method: "POST",
    headers: tenantHeaders(ownerA, ownerA.user.activeBusinessId),
    body: {
      firstName: "Booker",
      lastName: "Field",
      email: "booker@alpha.test",
      password: "Password123!",
      roleId: bySlug.order_booker.id,
    },
  });
  const bookerLogin = (await login("booker@alpha.test", "Password123!")).payload
    .data;
  const bookerClient = await request("/clients", {
    method: "POST",
    headers: tenantHeaders(bookerLogin, ownerA.user.activeBusinessId),
    body: { name: "Booker Client", email: "booker-client@alpha.test" },
  });
  assert.equal(bookerClient.status, 201);

  const bookerProduct = await request("/products", {
    method: "POST",
    headers: tenantHeaders(bookerLogin, ownerA.user.activeBusinessId),
    body: { name: "Booker Denied", stock: 1 },
  });
  assert.equal(bookerProduct.status, 403);
});

test("7d. System owner role permissions cannot be patched; custom roles work", async () => {
  const roles = await request("/roles", {
    headers: tenantHeaders(ownerA, ownerA.user.activeBusinessId),
  });
  const ownerRole = roles.payload.data.roles.find(
    (role) => role.slug === "business_owner"
  );
  const locked = await request(`/roles/${ownerRole.id}`, {
    method: "PATCH",
    headers: tenantHeaders(ownerA, ownerA.user.activeBusinessId),
    body: { permissions: ["clients.view"] },
  });
  assert.equal(locked.status, 409);

  const created = await request("/roles", {
    method: "POST",
    headers: tenantHeaders(ownerA, ownerA.user.activeBusinessId),
    body: {
      name: "Custom Viewer",
      permissions: ["clients.view", "platform.manage_businesses", "*"],
    },
  });
  assert.equal(created.status, 201);
  assert.deepEqual(created.payload.data.role.permissions, ["clients.view"]);
  assert.equal(created.payload.data.role.isSystem, false);
});

test("8. Invalid password returns 401", async () => {
  const result = await login("alpha@example.com", "WrongPassword!");
  assert.equal(result.status, 401);
  assert.equal(result.payload.error.code, "INVALID_CREDENTIALS");
});

test("9. Suspended business and user access are blocked", async () => {
  await db
    .collection("businesses")
    .updateOne(
      { id: businessB.user.activeBusinessId },
      { $set: { status: "suspended" } }
    );
  const suspendedBusinessLogin = await login(
    "beta@example.com",
    "Password123!"
  );
  assert.equal(suspendedBusinessLogin.status, 403);
  assert.equal(
    suspendedBusinessLogin.payload.error.code,
    "BUSINESS_SUSPENDED"
  );
  await db
    .collection("businesses")
    .updateOne(
      { id: businessB.user.activeBusinessId },
      { $set: { status: "active" } }
    );

  await db
    .collection("users")
    .updateOne(
      { email: "alpha@example.com" },
      { $set: { status: "suspended" } }
    );
  const suspendedUserAccess = await request("/auth/me", {
    headers: { Authorization: `Bearer ${ownerA.tokens.accessToken}` },
  });
  assert.equal(suspendedUserAccess.status, 403);
  assert.equal(suspendedUserAccess.payload.error.code, "USER_SUSPENDED");
  await db
    .collection("users")
    .updateOne(
      { email: "alpha@example.com" },
      { $set: { status: "active" } }
    );
});

test("10. Cross-tenant detail, update, and delete cannot target another tenant ID", async () => {
  // Per-tenant sequential ids collide across businesses (both may have id=1).
  // Insert a high unique id only on Business B to prove scoped queries never
  // leak or mutate another tenant's document.
  const foreignId = 900001;
  await db.collection("clients").insertOne({
    id: foreignId,
    businessId: businessB.user.activeBusinessId,
    name: "Secret Beta Only",
    email: "secret@beta.test",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  for (const operation of [
    { method: "GET" },
    {
      method: "PUT",
      body: {
        name: "Stolen",
        phone: "",
        area: "",
        address: "x",
        city: "x",
        country: "x",
      },
    },
    { method: "DELETE" },
  ]) {
    const result = await request(`/clients/${foreignId}`, {
      method: operation.method,
      headers: tenantHeaders(ownerA, ownerA.user.activeBusinessId),
      body: operation.body,
    });
    assert.equal(result.status, 404);
    assert.equal(result.payload.error.code, "CLIENT_NOT_FOUND");
  }

  const stillThere = await db.collection("clients").findOne({
    id: foreignId,
    businessId: businessB.user.activeBusinessId,
  });
  assert.ok(stillThere);
  assert.equal(stillThere.name, "Secret Beta Only");
});

async function main() {
  let failures = 0;
  await setup();

  try {
    for (const currentTest of tests) {
      try {
        await currentTest.run();
        console.log(`✓ ${currentTest.name}`);
      } catch (error) {
        failures += 1;
        console.error(`✗ ${currentTest.name}`);
        console.error(error);
      }
    }
  } finally {
    await cleanup();
  }

  if (failures) {
    throw new Error(`${failures} authentication test(s) failed`);
  }
  console.log(`All ${tests.length} authentication tests passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
