const crypto = require("crypto");
const {
  OWNER_PERMISSIONS,
  SYSTEM_ROLE_TEMPLATES,
} = require("./permissions");

function newId() {
  return crypto.randomUUID();
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function createUniqueSlug(db, name, { session, excludeId } = {}) {
  const base = slugify(name) || `business-${crypto.randomBytes(4).toString("hex")}`;
  let slug = base;
  let suffix = 1;

  while (
    await db.collection("businesses").findOne(
      {
        slug,
        ...(excludeId ? { id: { $ne: excludeId } } : {}),
      },
      { session }
    )
  ) {
    suffix += 1;
    slug = `${base}-${suffix}`;
  }

  return slug;
}

async function nextTenantId(db, collectionName, businessId, { session } = {}) {
  const lastRecord = await db
    .collection(collectionName)
    .find({ businessId }, session ? { session } : {})
    .sort({ id: -1 })
    .limit(1)
    .toArray();

  return lastRecord.length ? Number(lastRecord[0].id) + 1 : 1;
}

function defaultBusinessSettings(businessId) {
  return {
    id: newId(),
    businessId,
    currency: "Rs",
    allowNegativeStock: false,
    invoicePrefix: "INV-",
    orderPrefix: "ORD-",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Ensure all system role templates exist for a business.
 * Returns a map of slug → role document (existing or newly inserted).
 */
async function seedSystemRolesForBusiness(db, businessId, { session } = {}) {
  const bySlug = {};

  for (const template of SYSTEM_ROLE_TEMPLATES) {
    const existing = await db.collection("roles").findOne(
      { businessId, slug: template.slug },
      { session }
    );

    if (existing) {
      const updates = {
        isSystem: true,
        name: template.name,
        description: template.description,
        updatedAt: new Date(),
      };
      if (template.slug === "business_owner") {
        updates.permissions = [...OWNER_PERMISSIONS];
      } else if (
        !Array.isArray(existing.permissions) ||
        existing.permissions.length === 0
      ) {
        updates.permissions = [...template.permissions];
      }

      await db
        .collection("roles")
        .updateOne({ id: existing.id }, { $set: updates }, { session });
      bySlug[template.slug] = { ...existing, ...updates };
      continue;
    }

    const role = {
      id: newId(),
      businessId,
      name: template.name,
      slug: template.slug,
      description: template.description,
      permissions: [...template.permissions],
      isSystem: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await db.collection("roles").insertOne(role, { session });
    bySlug[template.slug] = role;
  }

  return bySlug;
}

async function ensureBusinessSettings(db, businessId, { session } = {}) {
  const existing = await db
    .collection("business_settings")
    .findOne({ businessId }, { session });
  if (existing) return existing;

  const settings = defaultBusinessSettings(businessId);
  await db.collection("business_settings").insertOne(settings, { session });
  return settings;
}

async function dropLegacyBusinessEmailIndex(db) {
  try {
    const indexes = await db.collection("businesses").listIndexes().toArray();
    const emailIndex = indexes.find(
      (index) =>
        index.name === "email_1" ||
        (index.key && Object.keys(index.key).length === 1 && index.key.email === 1)
    );
    if (emailIndex) {
      await db.collection("businesses").dropIndex(emailIndex.name);
    }
  } catch (error) {
    if (error.codeName !== "NamespaceNotFound") throw error;
  }
}

async function migrateLegacyData(db, mongoClient) {
  await dropLegacyBusinessEmailIndex(db);

  const legacyBusinesses = await db
    .collection("businesses")
    .find({ email: { $exists: true } })
    .toArray();

  for (const legacy of legacyBusinesses) {
    const session = mongoClient.startSession();
    try {
      await session.withTransaction(async () => {
        const email = String(legacy.email).trim().toLowerCase();
        let user = await db.collection("users").findOne({ email }, { session });

        if (!user) {
          user = {
            id: newId(),
            firstName: legacy.firstName || "",
            lastName: legacy.lastName || "",
            email,
            passwordHash: legacy.passwordSalt
              ? `${legacy.passwordSalt}:${legacy.passwordHash}`
              : legacy.passwordHash,
            isPlatformAdmin: false,
            status: "active",
            createdAt: legacy.createdAt || new Date(),
            updatedAt: new Date(),
          };
          await db.collection("users").insertOne(user, { session });
        }

        const businessId = legacy.id || newId();
        const businessName = legacy.businessName || legacy.name || "My Business";

        await db.collection("businesses").updateOne(
          { _id: legacy._id },
          {
            $set: {
              id: businessId,
              name: businessName,
              slug: await createUniqueSlug(db, businessName, { session }),
              status: legacy.status || "active",
              ownerUserId: user.id,
              createdAt: legacy.createdAt || new Date(),
              updatedAt: new Date(),
            },
            $unset: {
              firstName: "",
              lastName: "",
              email: "",
              passwordHash: "",
              passwordSalt: "",
              businessName: "",
              role: "",
              permissions: "",
              isPlatformAdmin: "",
            },
          },
          { session }
        );

        const roles = await seedSystemRolesForBusiness(db, businessId, {
          session,
        });
        const ownerRole = roles.business_owner;

        await db.collection("business_memberships").updateOne(
          { userId: user.id, businessId },
          {
            $setOnInsert: {
              id: newId(),
              userId: user.id,
              businessId,
              roleId: ownerRole.id,
              createdAt: new Date(),
            },
            $set: { roleId: ownerRole.id, updatedAt: new Date() },
          },
          { upsert: true, session }
        );

        await ensureBusinessSettings(db, businessId, { session });
      });
    } finally {
      await session.endSession();
    }
  }

  const businesses = await db
    .collection("businesses")
    .find({ id: { $exists: true } })
    .project({ id: 1 })
    .toArray();
  const fallbackBusinessId =
    businesses.length === 1 ? businesses[0].id : "__unassigned__";

  for (const collectionName of [
    "clients",
    "products",
    "invoices",
    "inventory_movements",
    "team_members",
  ]) {
    await db
      .collection(collectionName)
      .updateMany(
        { businessId: { $exists: false } },
        { $set: { businessId: fallbackBusinessId } }
      );
  }
}

async function migratePhase1Rbac(db) {
  const businesses = await db
    .collection("businesses")
    .find({ id: { $exists: true } })
    .project({ id: 1 })
    .toArray();

  for (const business of businesses) {
    await seedSystemRolesForBusiness(db, business.id);
    await ensureBusinessSettings(db, business.id);
  }

  // Harden any owner roles that somehow skipped seed (e.g. partial failures).
  await db.collection("roles").updateMany(
    { slug: "business_owner", businessId: { $ne: null } },
    {
      $set: {
        permissions: [...OWNER_PERMISSIONS],
        isSystem: true,
        updatedAt: new Date(),
      },
    }
  );
}

/**
 * Sync non-owner system role permissions from templates (merge missing keys).
 * Does not remove custom extras already granted on system roles.
 */
async function syncSystemRolePermissions(db) {
  for (const template of SYSTEM_ROLE_TEMPLATES) {
    if (template.slug === "business_owner") continue;

    const roles = await db
      .collection("roles")
      .find({ slug: template.slug, isSystem: true })
      .toArray();

    for (const role of roles) {
      const existing = Array.isArray(role.permissions) ? role.permissions : [];
      if (existing.includes("*")) continue;
      const merged = [...new Set([...existing, ...template.permissions])];
      if (merged.length === existing.length && merged.every((p) => existing.includes(p))) {
        continue;
      }
      await db.collection("roles").updateOne(
        { id: role.id },
        { $set: { permissions: merged, updatedAt: new Date() } }
      );
    }
  }
}

const PHASE2_CATALOG_SCAN_ID = "phase2_catalog_product_scan";
const PHASE2_CATALOG_SCAN_VERSION = 1;

/**
 * Phase 2: generalize products, backfill stock cache, seed opening movements.
 * Full collection scan runs once; later cold starts skip via schema_migrations.
 */
async function migratePhase2Catalog(db) {
  await syncSystemRolePermissions(db);

  const flag = await db
    .collection("schema_migrations")
    .findOne({ _id: PHASE2_CATALOG_SCAN_ID });
  if (flag && Number(flag.version) >= PHASE2_CATALOG_SCAN_VERSION) {
    return;
  }

  const products = await db.collection("products").find({}).toArray();

  for (const product of products) {
    if (!product.businessId) continue;

    const updates = {};
    const stockValue =
      product.currentStock != null
        ? Number(product.currentStock)
        : product.stock != null
          ? Number(product.stock)
          : 0;

    if (product.currentStock == null) {
      updates.currentStock = Number.isFinite(stockValue) ? stockValue : 0;
    }
    if (product.stock == null && updates.currentStock != null) {
      updates.stock = updates.currentStock;
    } else if (product.stock == null && product.currentStock != null) {
      updates.stock = Number(product.currentStock);
    }

    if (product.salePrice == null) {
      const sale =
        product.printRate != null
          ? Number(product.printRate)
          : product.price != null
            ? Number(product.price)
            : null;
      if (sale != null && Number.isFinite(sale)) updates.salePrice = sale;
    }

    if (product.purchasePrice == null && product.tpRate != null) {
      const purchase = Number(product.tpRate);
      if (Number.isFinite(purchase)) updates.purchasePrice = purchase;
    }

    if (product.minimumStockLevel == null) {
      updates.minimumStockLevel =
        product.minStock != null && Number.isFinite(Number(product.minStock))
          ? Number(product.minStock)
          : 0;
    }
    if (product.minStock == null && updates.minimumStockLevel != null) {
      updates.minStock = updates.minimumStockLevel;
    }

    if (product.trackVariants == null) {
      updates.trackVariants = false;
    }
    if (!product.status) {
      updates.status = "active";
    }

    if (Object.keys(updates).length) {
      updates.updatedAt = new Date();
      await db
        .collection("products")
        .updateOne({ _id: product._id }, { $set: updates });
    }

    const currentStock =
      updates.currentStock != null
        ? updates.currentStock
        : product.currentStock != null
          ? Number(product.currentStock)
          : product.stock != null
            ? Number(product.stock)
            : 0;

    if (!Number.isFinite(currentStock) || currentStock <= 0) continue;

    const movementCount = await db.collection("inventory_movements").countDocuments({
      businessId: product.businessId,
      productId: product.id,
    });
    if (movementCount > 0) continue;

    const lastMovement = await db
      .collection("inventory_movements")
      .find({ businessId: product.businessId })
      .sort({ id: -1 })
      .limit(1)
      .toArray();
    const nextId = lastMovement.length ? Number(lastMovement[0].id) + 1 : 1;

    await db.collection("inventory_movements").insertOne({
      id: nextId,
      businessId: product.businessId,
      productId: product.id,
      variantId: null,
      productName: product.name || null,
      movementType: "OPENING_STOCK",
      type: "OPENING_STOCK",
      quantity: currentStock,
      previousQuantity: 0,
      resultingQuantity: currentStock,
      balanceAfter: currentStock,
      referenceType: "migration",
      referenceId: String(product.id),
      reason: "Phase 2 opening stock backfill",
      unitCost: null,
      createdBy: null,
      createdAt: product.createdAt || new Date(),
    });
  }

  await db.collection("schema_migrations").updateOne(
    { _id: PHASE2_CATALOG_SCAN_ID },
    {
      $set: {
        version: PHASE2_CATALOG_SCAN_VERSION,
        completedAt: new Date(),
      },
    },
    { upsert: true }
  );
}

/**
 * Phase 3: sync purchase/supplier permissions onto system roles.
 * New collections only — no product/catalog data mutation.
 */
async function migratePhase3Purchases(db) {
  await syncSystemRolePermissions(db);
}

/**
 * Phase 4: client-specific rate lists — sync permissions onto system roles.
 */
async function migratePhase4RateLists(db) {
  await syncSystemRolePermissions(db);
}

async function migratePhase5StoreOrders(db) {
  await syncSystemRolePermissions(db);
}

async function ensureIndexes(db) {
  await db.collection("users").createIndex({ id: 1 }, { unique: true });
  await db.collection("users").createIndex({ email: 1 }, { unique: true });
  await db.collection("businesses").createIndex({ id: 1 }, { unique: true });
  await db.collection("businesses").createIndex({ slug: 1 }, { unique: true });
  await db.collection("roles").createIndex({ id: 1 }, { unique: true });
  await db
    .collection("roles")
    .createIndex({ businessId: 1, slug: 1 }, { unique: true });
  await db
    .collection("business_memberships")
    .createIndex({ id: 1 }, { unique: true });
  await db
    .collection("business_memberships")
    .createIndex({ userId: 1, businessId: 1 }, { unique: true });
  await db
    .collection("business_memberships")
    .createIndex({ businessId: 1, roleId: 1 });
  await db.collection("refresh_tokens").createIndex({ id: 1 }, { unique: true });
  await db
    .collection("refresh_tokens")
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  await db
    .collection("business_settings")
    .createIndex({ businessId: 1 }, { unique: true });
  await db.collection("business_settings").createIndex(
    { catalogStoreToken: 1 },
    {
      unique: true,
      partialFilterExpression: { catalogStoreToken: { $type: "string" } },
    }
  );
  await db.collection("audit_logs").createIndex({ id: 1 }, { unique: true });
  await db
    .collection("audit_logs")
    .createIndex({ businessId: 1, createdAt: -1 });
  await db
    .collection("audit_logs")
    .createIndex({ businessId: 1, entity: 1, entityId: 1 });

  for (const collectionName of [
    "clients",
    "products",
    "invoices",
    "inventory_movements",
    "team_members",
    "categories",
    "product_variants",
    "suppliers",
    "purchases",
    "supplier_ledger_entries",
    "supplier_payments",
    "supplier_price_history",
    "rate_lists",
    "orders",
  ]) {
    await db
      .collection(collectionName)
      .createIndex({ businessId: 1, id: 1 }, { unique: true });
  }

  // Phase 2 catalog indexes (business-scoped uniqueness)
  await db
    .collection("categories")
    .createIndex({ businessId: 1, name: 1 }, { unique: true });

  await db.collection("products").createIndex(
    { businessId: 1, sku: 1 },
    {
      unique: true,
      partialFilterExpression: { sku: { $type: "string" } },
    }
  );
  await db.collection("products").createIndex(
    { businessId: 1, barcode: 1 },
    {
      unique: true,
      partialFilterExpression: { barcode: { $type: "string" } },
    }
  );
  await db.collection("products").createIndex({ businessId: 1, categoryId: 1 });
  await db.collection("products").createIndex({ businessId: 1, name: 1 });
  await db.collection("product_images").createIndex({ key: 1 }, { unique: true });
  await db
    .collection("product_images")
    .createIndex({ businessId: 1, filename: 1 });

  await db.collection("product_variants").createIndex(
    { businessId: 1, sku: 1 },
    {
      unique: true,
      partialFilterExpression: { sku: { $type: "string" } },
    }
  );
  await db.collection("product_variants").createIndex(
    { businessId: 1, barcode: 1 },
    {
      unique: true,
      partialFilterExpression: { barcode: { $type: "string" } },
    }
  );
  await db
    .collection("product_variants")
    .createIndex({ businessId: 1, productId: 1 });

  await db
    .collection("inventory_movements")
    .createIndex({ businessId: 1, productId: 1, createdAt: -1 });
  await db
    .collection("inventory_movements")
    .createIndex({ businessId: 1, referenceType: 1, referenceId: 1 });

  // Phase 3 supplier / purchase indexes
  await db.collection("suppliers").createIndex({ businessId: 1, name: 1 });
  await db.collection("suppliers").createIndex({ businessId: 1, phone: 1 });
  await db.collection("suppliers").createIndex({ businessId: 1, status: 1 });

  await db
    .collection("purchases")
    .createIndex({ businessId: 1, purchaseNumber: 1 }, { unique: true });
  await db.collection("purchases").createIndex({ businessId: 1, supplierId: 1 });
  await db.collection("purchases").createIndex({ businessId: 1, status: 1 });
  await db
    .collection("purchases")
    .createIndex({ businessId: 1, purchaseDate: -1 });

  await db
    .collection("supplier_ledger_entries")
    .createIndex({ businessId: 1, supplierId: 1, createdAt: -1 });
  await db
    .collection("supplier_ledger_entries")
    .createIndex({ businessId: 1, referenceType: 1, referenceId: 1 });

  await db
    .collection("supplier_payments")
    .createIndex({ businessId: 1, supplierId: 1, paymentDate: -1 });

  await db
    .collection("supplier_price_history")
    .createIndex({ businessId: 1, productId: 1, purchasedAt: -1 });
  await db
    .collection("supplier_price_history")
    .createIndex({ businessId: 1, supplierId: 1, productId: 1 });

  await db
    .collection("rate_lists")
    .createIndex({ businessId: 1, number: 1 }, { unique: true });
  await db.collection("rate_lists").createIndex({ businessId: 1, clientId: 1 });
  await db.collection("rate_lists").createIndex({ businessId: 1, status: 1 });
  await db
    .collection("rate_lists")
    .createIndex({ businessId: 1, createdAt: -1 });
  await db.collection("rate_lists").createIndex(
    { shareToken: 1 },
    {
      unique: true,
      partialFilterExpression: { shareToken: { $type: "string" } },
    }
  );

  await db
    .collection("orders")
    .createIndex({ businessId: 1, number: 1 }, { unique: true });
  await db.collection("orders").createIndex({ businessId: 1, clientId: 1 });
  await db.collection("orders").createIndex({ businessId: 1, status: 1 });
  await db.collection("orders").createIndex({ businessId: 1, createdAt: -1 });
  await db.collection("orders").createIndex({ businessId: 1, rateListId: 1 });
}

async function runMigrations(db, mongoClient) {
  await migrateLegacyData(db, mongoClient);
  await migratePhase1Rbac(db);
  await migratePhase2Catalog(db);
  await migratePhase3Purchases(db);
  await migratePhase4RateLists(db);
  await migratePhase5StoreOrders(db);
  await ensureIndexes(db);
}

module.exports = {
  newId,
  slugify,
  createUniqueSlug,
  nextTenantId,
  defaultBusinessSettings,
  seedSystemRolesForBusiness,
  ensureBusinessSettings,
  migrateLegacyData,
  migratePhase1Rbac,
  migratePhase2Catalog,
  migratePhase3Purchases,
  migratePhase4RateLists,
  migratePhase5StoreOrders,
  syncSystemRolePermissions,
  ensureIndexes,
  runMigrations,
};
