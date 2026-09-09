/**
 * One-time catalog seed for a SINGLE existing business.
 * Does not run on migrate / start. Does not create businesses.
 *
 * Usage:
 *   node --env-file=.env import-business-catalog.js \
 *     --file=catalog-tufail-traders.json \
 *     --business-id=22af2885-7a6e-4ad1-84c4-e0ddeba9cb8c
 *
 * Optional:
 *   --dry-run   print counts, do not write
 */
const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");
const { nextTenantId } = require("./database");
const {
  MOVEMENT_TYPES,
  applyMovementTransactional,
  stockFieldsFromQuantity,
} = require("./stockService");

function argValue(flag, fallback = null) {
  const exact = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (exact) return exact.slice(flag.length + 1);
  const index = process.argv.indexOf(flag);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toOptionalString(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function toOptionalNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toNonNegNumber(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function normalizeStatus(value, fallback = "active") {
  const s = String(value || fallback).trim().toLowerCase();
  if (s === "inactive" || s === "archived") return s;
  return "active";
}

function nameFilter(businessId, name) {
  return {
    businessId,
    name: { $regex: `^${escapeRegex(name)}$`, $options: "i" },
  };
}

function flattenCatalog(catalog) {
  const groups = Array.isArray(catalog.categories) ? catalog.categories : [];
  const categories = [];
  const products = [];

  for (const group of groups) {
    const categoryName = toOptionalString(group.name);
    if (!categoryName) {
      throw new Error("A category is missing a name");
    }
    categories.push({
      name: categoryName,
      description: toOptionalString(group.description),
      status: normalizeStatus(group.status),
    });

    const rows = Array.isArray(group.products) ? group.products : [];
    for (const raw of rows) {
      products.push(normalizeProduct(raw, categoryName));
    }
  }

  if (Array.isArray(catalog.products)) {
    for (const raw of catalog.products) {
      const categoryName = toOptionalString(raw && raw.category);
      if (!categoryName) {
        throw new Error("A product is missing a category name");
      }
      if (!categories.some((c) => c.name.toLowerCase() === categoryName.toLowerCase())) {
        categories.push({
          name: categoryName,
          description: null,
          status: "active",
        });
      }
      products.push(normalizeProduct(raw, categoryName));
    }
  }

  return { categories, products };
}

function normalizeProduct(raw, categoryName) {
  if (typeof raw === "string" || typeof raw === "number") {
    const name = toOptionalString(raw);
    if (!name) return null;
    return {
      name,
      sku: null,
      barcode: null,
      brand: null,
      category: categoryName,
      unit: "pcs",
      purchasePrice: null,
      salePrice: null,
      wholesalePrice: null,
      minimumStockLevel: 0,
      openingStock: 0,
      description: null,
      status: "active",
    };
  }

  if (!raw || typeof raw !== "object") return null;
  const name = toOptionalString(raw.name);
  if (!name) return null;

  return {
    name,
    sku: toOptionalString(raw.sku),
    barcode: toOptionalString(raw.barcode),
    brand: toOptionalString(raw.brand),
    category: toOptionalString(raw.category) || categoryName,
    unit: toOptionalString(raw.unit) || "pcs",
    purchasePrice: toOptionalNumber(raw.purchasePrice ?? raw.tpRate),
    salePrice: toOptionalNumber(raw.salePrice ?? raw.price),
    printRate: toOptionalNumber(raw.printRate ?? raw.printed),
    wholesalePrice: toOptionalNumber(raw.wholesalePrice),
    minimumStockLevel: toNonNegNumber(
      raw.minimumStockLevel ?? raw.minStock,
      0
    ),
    openingStock: toNonNegNumber(
      raw.openingStock ?? raw.stock ?? raw.currentStock,
      0
    ),
    description: toOptionalString(raw.description),
    status: normalizeStatus(raw.status),
  };
}

async function loadUsedSkus(db, businessId) {
  const used = new Set();
  const [products, variants] = await Promise.all([
    db
      .collection("products")
      .find({ businessId, sku: { $type: "string" } })
      .project({ sku: 1 })
      .toArray(),
    db
      .collection("product_variants")
      .find({ businessId, sku: { $type: "string" } })
      .project({ sku: 1 })
      .toArray(),
  ]);
  for (const row of [...products, ...variants]) {
    const sku = toOptionalString(row.sku);
    if (sku) used.add(sku.toUpperCase());
  }
  return used;
}

function nextGeneratedSku(used) {
  let n = 1;
  while (used.has(`PRD-${String(n).padStart(4, "0")}`)) {
    n += 1;
  }
  const sku = `PRD-${String(n).padStart(4, "0")}`;
  used.add(sku);
  return sku;
}

async function importCatalog() {
  const fileArg = argValue("--file", "catalog-tufail-traders.json");
  const dryRun = process.argv.includes("--dry-run");
  const catalogPath = path.resolve(process.cwd(), fileArg);
  const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

  const businessId = argValue("--business-id", catalog.businessId || null);
  if (!businessId) {
    throw new Error(
      "Pass --business-id=<uuid>. Import will only write to that one business."
    );
  }
  if (catalog.businessId && catalog.businessId !== businessId) {
    throw new Error(
      `JSON businessId (${catalog.businessId}) does not match --business-id (${businessId})`
    );
  }

  const { categories, products } = flattenCatalog(catalog);
  if (!categories.length || !products.length) {
    throw new Error("Catalog JSON has no categories/products");
  }

  const uri = process.env.MONGODB_URI;
  if (!uri || uri.includes("<db_password>") || uri.includes("REPLACE_WITH")) {
    throw new Error("Set a valid MONGODB_URI before importing");
  }

  const client = new MongoClient(uri);
  const skipped = [];
  const errors = [];
  let categoriesCreated = 0;
  let categoriesSkipped = 0;
  let productsCreated = 0;
  let productsSkipped = 0;
  let openingMovements = 0;

  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB || "InvoiceApp");

    const business = await db.collection("businesses").findOne({ id: businessId });
    if (!business) {
      throw new Error(
        `Business not found: ${businessId}. Refusing to create a new business.`
      );
    }
    if (
      catalog.businessName &&
      String(business.name).trim().toLowerCase() !==
        String(catalog.businessName).trim().toLowerCase()
    ) {
      throw new Error(
        `Business name mismatch. DB="${business.name}" JSON="${catalog.businessName}"`
      );
    }

    console.log(
      `${dryRun ? "[dry-run] " : ""}Seeding ${products.length} products / ${
        categories.length
      } categories into "${business.name}" (${business.id})`
    );

    const actorId = business.ownerUserId || null;
    const categoryIdByName = new Map();

    for (const group of categories) {
      const existing = await db.collection("categories").findOne(
        nameFilter(businessId, group.name)
      );
      if (existing) {
        categoryIdByName.set(group.name.toLowerCase(), existing.id);
        categoriesSkipped += 1;
        skipped.push(`category exists: ${group.name}`);
        continue;
      }

      if (!dryRun) {
        const now = new Date();
        const category = {
          id: await nextTenantId(db, "categories", businessId),
          businessId,
          name: group.name,
          description: group.description,
          status: group.status,
          createdBy: actorId,
          updatedBy: actorId,
          createdAt: now,
          updatedAt: now,
        };
        await db.collection("categories").insertOne(category);
        categoryIdByName.set(group.name.toLowerCase(), category.id);
      } else {
        categoryIdByName.set(group.name.toLowerCase(), null);
      }
      categoriesCreated += 1;
    }

    const usedSkus = await loadUsedSkus(db, businessId);

    for (const row of products) {
      if (!row) continue;
      try {
        const categoryId = categoryIdByName.get(row.category.toLowerCase());
        if (categoryId == null && !dryRun) {
          throw new Error(`Category not mapped: ${row.category}`);
        }

        let sku = row.sku;
        if (sku && usedSkus.has(sku.toUpperCase())) {
          productsSkipped += 1;
          skipped.push(`sku exists: ${sku} (${row.name})`);
          continue;
        }

        const existingByName = await db.collection("products").findOne({
          ...nameFilter(businessId, row.name),
          status: { $ne: "archived" },
        });
        if (existingByName) {
          if (!dryRun) {
            const purchasePrice = row.purchasePrice;
            const salePrice = row.salePrice;
            const printRate =
              row.printRate != null ? row.printRate : salePrice;
            const wholesalePrice =
              row.wholesalePrice != null ? row.wholesalePrice : salePrice;
            await db.collection("products").updateOne(
              { businessId, id: existingByName.id },
              {
                $set: {
                  purchasePrice,
                  salePrice,
                  wholesalePrice,
                  tpRate: purchasePrice,
                  printRate,
                  price: salePrice,
                  minimumStockLevel: row.minimumStockLevel,
                  minStock: row.minimumStockLevel,
                  updatedAt: new Date(),
                },
              }
            );
            const current =
              existingByName.currentStock != null
                ? Number(existingByName.currentStock)
                : Number(existingByName.stock || 0);
            if (row.openingStock > 0 && (!Number.isFinite(current) || current <= 0)) {
              await applyMovementTransactional(db, client, {
                businessId,
                productId: existingByName.id,
                movementType: MOVEMENT_TYPES.OPENING_STOCK,
                quantity: row.openingStock,
                reason: "Opening stock",
                referenceType: "product",
                referenceId: existingByName.id,
                createdBy: actorId,
                productName: existingByName.name,
              });
              openingMovements += 1;
            }
          }
          productsSkipped += 1;
          skipped.push(`product name exists, prices/min/stock updated: ${row.name}`);
          continue;
        }

        if (sku) {
          usedSkus.add(sku.toUpperCase());
        } else {
          sku = nextGeneratedSku(usedSkus);
        }

        if (dryRun) {
          productsCreated += 1;
          if (row.openingStock > 0) openingMovements += 1;
          continue;
        }

        const now = new Date();
        const purchasePrice = row.purchasePrice;
        const salePrice = row.salePrice;
        const printRate = row.printRate != null ? row.printRate : salePrice;
        const wholesalePrice =
          row.wholesalePrice != null ? row.wholesalePrice : salePrice;
        const product = {
          id: await nextTenantId(db, "products", businessId),
          businessId,
          name: row.name,
          sku,
          barcode: row.barcode,
          categoryId,
          category: row.category,
          brand: row.brand,
          unit: row.unit || "pcs",
          purchasePrice,
          salePrice,
          wholesalePrice,
          minimumStockLevel: row.minimumStockLevel,
          minStock: row.minimumStockLevel,
          ...stockFieldsFromQuantity(0),
          status: row.status,
          description: row.description,
          trackVariants: false,
          attributes: null,
          tpRate: purchasePrice,
          discountPercent: null,
          netRate: null,
          printRate,
          price: salePrice,
          createdBy: actorId,
          updatedBy: actorId,
          createdAt: now,
          updatedAt: now,
        };

        await db.collection("products").insertOne(product);

        if (row.openingStock > 0) {
          await applyMovementTransactional(db, client, {
            businessId,
            productId: product.id,
            movementType: MOVEMENT_TYPES.OPENING_STOCK,
            quantity: row.openingStock,
            reason: "Opening stock",
            referenceType: "product",
            referenceId: product.id,
            createdBy: actorId,
            productName: product.name,
          });
          openingMovements += 1;
        }

        productsCreated += 1;
      } catch (error) {
        productsSkipped += 1;
        errors.push(`${row.name}: ${error.message || error}`);
      }
    }

    console.log(`business id: ${business.id}`);
    console.log(`category count: ${categoriesCreated} created, ${categoriesSkipped} skipped`);
    console.log(`product count: ${productsCreated} created, ${productsSkipped} skipped`);
    console.log(`opening stock movements: ${openingMovements}`);
    if (skipped.length) {
      console.log("skipped duplicates:");
      for (const line of skipped) console.log(`  - ${line}`);
    }
    if (errors.length) {
      console.log("errors:");
      for (const line of errors) console.log(`  - ${line}`);
    }
  } finally {
    await client.close();
  }
}

importCatalog().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
