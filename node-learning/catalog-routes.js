/**
 * Phase 2 catalog + inventory routes:
 * categories, products, product variants, stock adjust / opening / low-stock.
 */

const { nextTenantId } = require("./database");
const { writeAuditLog, actorDisplayName } = require("./audit");
const {
  MOVEMENT_TYPES,
  getCurrentStock,
  checkAvailableStock,
  applyMovementTransactional,
  stockFieldsFromQuantity,
} = require("./stockService");

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

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Public product DTO — generic fields first; legacy pharma fields kept as aliases.
 */
function publicProduct(product, extras = {}) {
  if (!product) return product;
  const currentStock =
    product.currentStock != null
      ? Number(product.currentStock)
      : product.stock != null
        ? Number(product.stock)
        : 0;
  const salePrice =
    product.salePrice != null
      ? Number(product.salePrice)
      : product.printRate != null
        ? Number(product.printRate)
        : product.price != null
          ? Number(product.price)
          : null;
  const purchasePrice =
    product.purchasePrice != null
      ? Number(product.purchasePrice)
      : product.tpRate != null
        ? Number(product.tpRate)
        : null;
  const minimumStockLevel =
    product.minimumStockLevel != null
      ? Number(product.minimumStockLevel)
      : product.minStock != null
        ? Number(product.minStock)
        : 0;

  const stockStatus =
    currentStock < minimumStockLevel ? "LOW_STOCK" : "OK";

  return {
    id: product.id,
    businessId: product.businessId,
    name: product.name,
    sku: product.sku || null,
    barcode: product.barcode || null,
    categoryId: product.categoryId ?? null,
    category: product.category || null,
    brand: product.brand || null,
    unit: product.unit || "pcs",
    purchasePrice,
    salePrice,
    wholesalePrice:
      product.wholesalePrice != null ? Number(product.wholesalePrice) : null,
    minimumStockLevel,
    minStock: minimumStockLevel,
    currentStock,
    stock: currentStock,
    stockStatus,
    status: product.status || "active",
    description: product.description || null,
    trackVariants: product.trackVariants === true,
    attributes: product.attributes || null,
    // Deprecated aliases (backward compatibility)
    tpRate: product.tpRate != null ? Number(product.tpRate) : purchasePrice,
    discountPercent:
      product.discountPercent != null ? Number(product.discountPercent) : null,
    netRate: product.netRate != null ? Number(product.netRate) : null,
    printRate:
      product.printRate != null ? Number(product.printRate) : salePrice,
    price: salePrice,
    createdBy: product.createdBy || null,
    updatedBy: product.updatedBy || null,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    ...extras,
  };
}

function publicCategory(category) {
  return {
    id: category.id,
    businessId: category.businessId,
    name: category.name,
    description: category.description || null,
    status: category.status || "active",
    createdBy: category.createdBy || null,
    updatedBy: category.updatedBy || null,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}

function publicVariant(variant) {
  const currentStock =
    variant.currentStock != null
      ? Number(variant.currentStock)
      : variant.stock != null
        ? Number(variant.stock)
        : 0;
  return {
    id: variant.id,
    businessId: variant.businessId,
    productId: variant.productId,
    name: variant.name,
    sku: variant.sku || null,
    barcode: variant.barcode || null,
    attributes: variant.attributes || {},
    purchasePrice:
      variant.purchasePrice != null ? Number(variant.purchasePrice) : null,
    salePrice: variant.salePrice != null ? Number(variant.salePrice) : null,
    wholesalePrice:
      variant.wholesalePrice != null ? Number(variant.wholesalePrice) : null,
    currentStock,
    stock: currentStock,
    status: variant.status || "active",
    createdAt: variant.createdAt,
    updatedAt: variant.updatedAt,
  };
}

function publicMovement(movement) {
  return {
    id: movement.id,
    businessId: movement.businessId,
    productId: movement.productId,
    variantId: movement.variantId ?? null,
    productName: movement.productName || null,
    movementType: movement.movementType || movement.type,
    type: movement.movementType || movement.type,
    quantity: movement.quantity,
    previousQuantity: movement.previousQuantity ?? null,
    resultingQuantity:
      movement.resultingQuantity ?? movement.balanceAfter ?? null,
    balanceAfter: movement.balanceAfter ?? movement.resultingQuantity ?? null,
    referenceType: movement.referenceType || null,
    referenceId: movement.referenceId || null,
    reason: movement.reason || null,
    unitCost: movement.unitCost ?? null,
    createdBy: movement.createdBy || null,
    createdAt: movement.createdAt,
  };
}

async function assertUniqueSku(db, businessId, sku, { excludeProductId, excludeVariantId, session } = {}) {
  if (!sku) return;
  const productClash = await db.collection("products").findOne(
    {
      businessId,
      sku,
      ...(excludeProductId != null ? { id: { $ne: Number(excludeProductId) } } : {}),
    },
    { session }
  );
  if (productClash) {
    const err = new Error(`SKU '${sku}' already exists in this business`);
    err.status = 409;
    err.code = "DUPLICATE_SKU";
    throw err;
  }
  const variantClash = await db.collection("product_variants").findOne(
    {
      businessId,
      sku,
      ...(excludeVariantId != null ? { id: { $ne: Number(excludeVariantId) } } : {}),
    },
    { session }
  );
  if (variantClash) {
    const err = new Error(`SKU '${sku}' already exists on a variant in this business`);
    err.status = 409;
    err.code = "DUPLICATE_SKU";
    throw err;
  }
}

async function assertUniqueBarcode(
  db,
  businessId,
  barcode,
  { excludeProductId, excludeVariantId, session } = {}
) {
  if (!barcode) return;
  const productClash = await db.collection("products").findOne(
    {
      businessId,
      barcode,
      ...(excludeProductId != null ? { id: { $ne: Number(excludeProductId) } } : {}),
    },
    { session }
  );
  if (productClash) {
    const err = new Error(`Barcode '${barcode}' already exists in this business`);
    err.status = 409;
    err.code = "DUPLICATE_BARCODE";
    throw err;
  }
  const variantClash = await db.collection("product_variants").findOne(
    {
      businessId,
      barcode,
      ...(excludeVariantId != null ? { id: { $ne: Number(excludeVariantId) } } : {}),
    },
    { session }
  );
  if (variantClash) {
    const err = new Error(`Barcode '${barcode}' already exists on a variant`);
    err.status = 409;
    err.code = "DUPLICATE_BARCODE";
    throw err;
  }
}

function throwApp(AppError, error) {
  if (error instanceof AppError) throw error;
  if (error.status && error.code) {
    throw new AppError(
      error.status,
      error.code,
      error.message,
      error.details || {}
    );
  }
  throw error;
}

function registerCatalogRoutes({
  app,
  db,
  mongoClient,
  AppError,
  tenantRoute,
  requirePermission,
  tenantScope,
}) {
  // ---------- Categories ----------

  app.get(
    "/categories",
    ...tenantRoute,
    requirePermission("categories.view"),
    async (req, res, next) => {
      try {
        const filter = { ...tenantScope(req) };
        const status = toOptionalString(req.query.status);
        if (status) filter.status = status;
        const q = toOptionalString(req.query.q);
        if (q) filter.name = { $regex: escapeRegex(q), $options: "i" };

        const categories = await db
          .collection("categories")
          .find(filter)
          .sort({ name: 1 })
          .toArray();
        res.json({ categories: categories.map(publicCategory) });
      } catch (error) {
        next(error);
      }
    }
  );

  app.get(
    "/categories/:id",
    ...tenantRoute,
    requirePermission("categories.view"),
    async (req, res, next) => {
      try {
        const category = await db.collection("categories").findOne({
          id: Number(req.params.id),
          ...tenantScope(req),
        });
        if (!category) {
          throw new AppError(404, "CATEGORY_NOT_FOUND", "Category not found");
        }
        res.json(publicCategory(category));
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/categories",
    ...tenantRoute,
    requirePermission("categories.create"),
    async (req, res, next) => {
      try {
        const name = toOptionalString(req.body.name);
        if (!name) {
          throw new AppError(400, "VALIDATION_ERROR", "Category name is required");
        }
        const businessId = req.tenant.businessId;
        const existing = await db.collection("categories").findOne({
          businessId,
          name: { $regex: `^${escapeRegex(name)}$`, $options: "i" },
        });
        if (existing) {
          throw new AppError(
            409,
            "DUPLICATE_CATEGORY",
            `Category '${name}' already exists in this business`
          );
        }

        const category = {
          id: await nextTenantId(db, "categories", businessId),
          businessId,
          name,
          description: toOptionalString(req.body.description),
          status: normalizeStatus(req.body.status),
          createdBy: req.auth.user.id,
          updatedBy: req.auth.user.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        await db.collection("categories").insertOne(category);
        res.status(201).json(publicCategory(category));
      } catch (error) {
        next(error);
      }
    }
  );

  app.patch(
    "/categories/:id",
    ...tenantRoute,
    requirePermission("categories.update"),
    async (req, res, next) => {
      try {
        const filter = {
          id: Number(req.params.id),
          ...tenantScope(req),
        };
        const existing = await db.collection("categories").findOne(filter);
        if (!existing) {
          throw new AppError(404, "CATEGORY_NOT_FOUND", "Category not found");
        }

        const updates = { updatedBy: req.auth.user.id, updatedAt: new Date() };
        if (req.body.name !== undefined) {
          const name = toOptionalString(req.body.name);
          if (!name) {
            throw new AppError(400, "VALIDATION_ERROR", "Category name is required");
          }
          const clash = await db.collection("categories").findOne({
            businessId: req.tenant.businessId,
            id: { $ne: existing.id },
            name: { $regex: `^${escapeRegex(name)}$`, $options: "i" },
          });
          if (clash) {
            throw new AppError(
              409,
              "DUPLICATE_CATEGORY",
              `Category '${name}' already exists in this business`
            );
          }
          updates.name = name;
        }
        if (req.body.description !== undefined) {
          updates.description = toOptionalString(req.body.description);
        }
        if (req.body.status !== undefined) {
          updates.status = normalizeStatus(req.body.status);
        }

        await db.collection("categories").updateOne(filter, { $set: updates });
        res.json(
          publicCategory(await db.collection("categories").findOne(filter))
        );
      } catch (error) {
        next(error);
      }
    }
  );

  app.delete(
    "/categories/:id",
    ...tenantRoute,
    requirePermission("categories.delete"),
    async (req, res, next) => {
      try {
        const filter = {
          id: Number(req.params.id),
          ...tenantScope(req),
        };
        const existing = await db.collection("categories").findOne(filter);
        if (!existing) {
          throw new AppError(404, "CATEGORY_NOT_FOUND", "Category not found");
        }

        const productCount = await db.collection("products").countDocuments({
          businessId: req.tenant.businessId,
          categoryId: existing.id,
          status: { $ne: "archived" },
        });

        if (productCount > 0) {
          // Soft-archive — do not orphan products by hard delete.
          await db.collection("categories").updateOne(filter, {
            $set: {
              status: "inactive",
              updatedBy: req.auth.user.id,
              updatedAt: new Date(),
            },
          });
          res.json({
            message: "Category archived because products still reference it",
            id: existing.id,
            archived: true,
          });
          return;
        }

        await db.collection("categories").deleteOne(filter);
        res.json({ message: "Category deleted", id: existing.id, archived: false });
      } catch (error) {
        next(error);
      }
    }
  );

  // ---------- Products ----------

  app.get(
    "/products",
    ...tenantRoute,
    requirePermission("products.view"),
    async (req, res, next) => {
      try {
        const filter = { ...tenantScope(req) };
        const q = toOptionalString(req.query.q || req.query.search);
        const sku = toOptionalString(req.query.sku);
        const barcode = toOptionalString(req.query.barcode);
        const categoryId = toOptionalNumber(req.query.categoryId);
        const status = toOptionalString(req.query.status);
        const lowStock = String(req.query.lowStock || "") === "true";

        if (sku) filter.sku = { $regex: `^${escapeRegex(sku)}$`, $options: "i" };
        if (barcode) filter.barcode = barcode;
        if (categoryId != null) filter.categoryId = categoryId;
        if (status === "active") {
          filter.$and = [
            ...(filter.$and || []),
            {
              $or: [
                { status: "active" },
                { status: { $exists: false } },
                { status: null },
              ],
            },
          ];
        } else if (status) {
          filter.status = status;
        } else {
          filter.status = { $ne: "archived" };
        }

        if (q) {
          filter.$or = [
            { name: { $regex: escapeRegex(q), $options: "i" } },
            { sku: { $regex: escapeRegex(q), $options: "i" } },
            { barcode: { $regex: escapeRegex(q), $options: "i" } },
            { brand: { $regex: escapeRegex(q), $options: "i" } },
            { category: { $regex: escapeRegex(q), $options: "i" } },
          ];
        }

        let products = await db
          .collection("products")
          .find(filter)
          .sort({ name: 1 })
          .toArray();

        if (lowStock) {
          products = products.filter((p) => {
            const current =
              p.currentStock != null ? Number(p.currentStock) : Number(p.stock || 0);
            const min =
              p.minimumStockLevel != null
                ? Number(p.minimumStockLevel)
                : Number(p.minStock || 0);
            return current < min;
          });
        }

        // Keep array response for existing RTK clients; also expose wrapped form via Accept not needed.
        res.json(products.map((p) => publicProduct(p)));
      } catch (error) {
        next(error);
      }
    }
  );

  app.get(
    "/products/low-stock",
    ...tenantRoute,
    requirePermission("inventory.view"),
    async (req, res, next) => {
      try {
        const products = await db
          .collection("products")
          .find({
            ...tenantScope(req),
            status: { $ne: "archived" },
          })
          .toArray();

        const low = products
          .map((p) => publicProduct(p))
          .filter((p) => p.currentStock < p.minimumStockLevel);

        res.json({ products: low });
      } catch (error) {
        next(error);
      }
    }
  );

  app.get(
    "/products/:id",
    ...tenantRoute,
    requirePermission("products.view"),
    async (req, res, next) => {
      try {
        const product = await db.collection("products").findOne({
          id: Number(req.params.id),
          ...tenantScope(req),
        });
        if (!product) {
          throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
        }

        const variants = await db
          .collection("product_variants")
          .find({
            businessId: req.tenant.businessId,
            productId: product.id,
          })
          .sort({ id: 1 })
          .toArray();

        res.json(
          publicProduct(product, {
            variants: variants.map(publicVariant),
          })
        );
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/products",
    ...tenantRoute,
    requirePermission("products.create"),
    async (req, res, next) => {
      try {
        const name = toOptionalString(req.body.name);
        if (!name) {
          throw new AppError(400, "VALIDATION_ERROR", "Product name is required");
        }

        const businessId = req.tenant.businessId;
        const sku = toOptionalString(req.body.sku);
        const barcode = toOptionalString(req.body.barcode);
        await assertUniqueSku(db, businessId, sku);
        await assertUniqueBarcode(db, businessId, barcode);

        let categoryId = toOptionalNumber(req.body.categoryId);
        let categoryName = toOptionalString(req.body.category);
        if (categoryId != null) {
          const cat = await db.collection("categories").findOne({
            businessId,
            id: categoryId,
          });
          if (!cat) {
            throw new AppError(400, "INVALID_CATEGORY", "Category not found");
          }
          categoryName = cat.name;
        }

        const purchasePrice = toOptionalNumber(
          req.body.purchasePrice ?? req.body.tpRate
        );
        const salePrice = toOptionalNumber(
          req.body.salePrice ?? req.body.printRate ?? req.body.price
        );
        const wholesalePrice = toOptionalNumber(req.body.wholesalePrice);
        const minimumStockLevel = toNonNegNumber(
          req.body.minimumStockLevel ?? req.body.minStock,
          0
        );

        // Opening stock from create — NEVER store as authoritative without a movement.
        const openingQty = toOptionalNumber(
          req.body.openingStock ?? req.body.stock ?? req.body.currentStock
        );

        const product = {
          id: await nextTenantId(db, "products", businessId),
          businessId,
          name,
          sku,
          barcode,
          categoryId,
          category: categoryName,
          brand: toOptionalString(req.body.brand),
          unit: toOptionalString(req.body.unit) || "pcs",
          purchasePrice,
          salePrice,
          wholesalePrice,
          minimumStockLevel,
          minStock: minimumStockLevel,
          ...stockFieldsFromQuantity(0),
          status: normalizeStatus(req.body.status),
          description: toOptionalString(req.body.description),
          trackVariants: req.body.trackVariants === true,
          attributes:
            req.body.attributes && typeof req.body.attributes === "object"
              ? req.body.attributes
              : null,
          // Deprecated legacy fields (kept for old UI / data)
          tpRate: toOptionalNumber(req.body.tpRate) ?? purchasePrice,
          discountPercent: toOptionalNumber(req.body.discountPercent),
          netRate: toOptionalNumber(req.body.netRate),
          printRate: toOptionalNumber(req.body.printRate) ?? salePrice,
          price: salePrice,
          createdBy: req.auth.user.id,
          updatedBy: req.auth.user.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await db.collection("products").insertOne(product);

        let created = product;
        if (openingQty != null && openingQty > 0) {
          try {
            const { product: updated } = await applyMovementTransactional(
              db,
              mongoClient,
              {
                businessId,
                productId: product.id,
                movementType: MOVEMENT_TYPES.OPENING_STOCK,
                quantity: openingQty,
                reason: toOptionalString(req.body.openingReason) || "Opening stock",
                referenceType: "product",
                referenceId: product.id,
                createdBy: req.auth.user.id,
                productName: product.name,
              }
            );
            created = updated || (await db.collection("products").findOne({
              businessId,
              id: product.id,
            }));
          } catch (error) {
            throwApp(AppError, error);
          }
        }

        // Optional inline variants foundation
        const variantInputs = Array.isArray(req.body.variants)
          ? req.body.variants
          : [];
        for (const input of variantInputs) {
          const vName = toOptionalString(input.name);
          if (!vName) continue;
          const vSku = toOptionalString(input.sku);
          const vBarcode = toOptionalString(input.barcode);
          await assertUniqueSku(db, businessId, vSku);
          await assertUniqueBarcode(db, businessId, vBarcode);
          const variant = {
            id: await nextTenantId(db, "product_variants", businessId),
            businessId,
            productId: product.id,
            name: vName,
            sku: vSku,
            barcode: vBarcode,
            attributes:
              input.attributes && typeof input.attributes === "object"
                ? input.attributes
                : {},
            purchasePrice: toOptionalNumber(input.purchasePrice),
            salePrice: toOptionalNumber(input.salePrice),
            wholesalePrice: toOptionalNumber(input.wholesalePrice),
            ...stockFieldsFromQuantity(0),
            status: normalizeStatus(input.status),
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          await db.collection("product_variants").insertOne(variant);

          const vOpening = toOptionalNumber(
            input.openingStock ?? input.stock ?? input.currentStock
          );
          if (vOpening != null && vOpening > 0) {
            await applyMovementTransactional(db, mongoClient, {
              businessId,
              productId: product.id,
              variantId: variant.id,
              movementType: MOVEMENT_TYPES.OPENING_STOCK,
              quantity: vOpening,
              reason: "Opening stock",
              referenceType: "product_variant",
              referenceId: variant.id,
              createdBy: req.auth.user.id,
              productName: `${product.name} / ${variant.name}`,
            });
          }
        }

        if (variantInputs.length) {
          await db.collection("products").updateOne(
            { businessId, id: product.id },
            { $set: { trackVariants: true, updatedAt: new Date() } }
          );
          created = await db.collection("products").findOne({
            businessId,
            id: product.id,
          });
        }

        res.status(201).json(publicProduct(created));
      } catch (error) {
        next(error);
      }
    }
  );

  const updateProductHandler = async (req, res, next) => {
    try {
      const filter = {
        id: Number(req.params.id),
        ...tenantScope(req),
      };
      const existing = await db.collection("products").findOne(filter);
      if (!existing) {
        throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
      }

      // CRITICAL: product PATCH/PUT must NOT modify stock.
      if (
        req.body.stock !== undefined ||
        req.body.currentStock !== undefined ||
        req.body.openingStock !== undefined
      ) {
        // Ignore silently for stock keys but do not apply them.
        // If client ONLY sent stock fields, still succeed with unchanged stock.
      }

      const updates = {
        updatedBy: req.auth.user.id,
        updatedAt: new Date(),
      };

      if (req.body.name !== undefined) {
        const name = toOptionalString(req.body.name);
        if (!name) {
          throw new AppError(400, "VALIDATION_ERROR", "Product name is required");
        }
        updates.name = name;
      }

      if (req.body.sku !== undefined) {
        const sku = toOptionalString(req.body.sku);
        await assertUniqueSku(db, req.tenant.businessId, sku, {
          excludeProductId: existing.id,
        });
        updates.sku = sku;
      }

      if (req.body.barcode !== undefined) {
        const barcode = toOptionalString(req.body.barcode);
        await assertUniqueBarcode(db, req.tenant.businessId, barcode, {
          excludeProductId: existing.id,
        });
        updates.barcode = barcode;
      }

      if (req.body.categoryId !== undefined) {
        const categoryId = toOptionalNumber(req.body.categoryId);
        if (categoryId == null) {
          updates.categoryId = null;
        } else {
          const cat = await db.collection("categories").findOne({
            businessId: req.tenant.businessId,
            id: categoryId,
          });
          if (!cat) {
            throw new AppError(400, "INVALID_CATEGORY", "Category not found");
          }
          updates.categoryId = categoryId;
          updates.category = cat.name;
        }
      } else if (req.body.category !== undefined) {
        updates.category = toOptionalString(req.body.category);
      }

      if (req.body.brand !== undefined) {
        updates.brand = toOptionalString(req.body.brand);
      }
      if (req.body.unit !== undefined) {
        updates.unit = toOptionalString(req.body.unit) || "pcs";
      }
      if (req.body.description !== undefined) {
        updates.description = toOptionalString(req.body.description);
      }
      if (req.body.status !== undefined) {
        updates.status = normalizeStatus(req.body.status);
      }
      if (req.body.trackVariants !== undefined) {
        updates.trackVariants = req.body.trackVariants === true;
      }
      if (req.body.attributes !== undefined) {
        updates.attributes =
          req.body.attributes && typeof req.body.attributes === "object"
            ? req.body.attributes
            : null;
      }

      if (req.body.purchasePrice !== undefined || req.body.tpRate !== undefined) {
        const purchasePrice = toOptionalNumber(
          req.body.purchasePrice ?? req.body.tpRate
        );
        updates.purchasePrice = purchasePrice;
        if (req.body.tpRate !== undefined) {
          updates.tpRate = toOptionalNumber(req.body.tpRate);
        } else if (purchasePrice != null) {
          updates.tpRate = purchasePrice;
        }
      }

      if (
        req.body.salePrice !== undefined ||
        req.body.printRate !== undefined ||
        req.body.price !== undefined
      ) {
        const salePrice = toOptionalNumber(
          req.body.salePrice ?? req.body.printRate ?? req.body.price
        );
        updates.salePrice = salePrice;
        updates.price = salePrice;
        if (req.body.printRate !== undefined) {
          updates.printRate = toOptionalNumber(req.body.printRate);
        } else if (salePrice != null) {
          updates.printRate = salePrice;
        }
      }

      if (req.body.wholesalePrice !== undefined) {
        updates.wholesalePrice = toOptionalNumber(req.body.wholesalePrice);
      }

      if (
        req.body.minimumStockLevel !== undefined ||
        req.body.minStock !== undefined
      ) {
        const minimumStockLevel = toNonNegNumber(
          req.body.minimumStockLevel ?? req.body.minStock,
          0
        );
        updates.minimumStockLevel = minimumStockLevel;
        updates.minStock = minimumStockLevel;
      }

      // Legacy optional fields
      if (req.body.discountPercent !== undefined) {
        updates.discountPercent = toOptionalNumber(req.body.discountPercent);
      }
      if (req.body.netRate !== undefined) {
        updates.netRate = toOptionalNumber(req.body.netRate);
      }

      await db.collection("products").updateOne(filter, { $set: updates });
      const updated = await db.collection("products").findOne(filter);
      res.json(publicProduct(updated));
    } catch (error) {
      next(error);
    }
  };

  app.put(
    "/products/:id",
    ...tenantRoute,
    requirePermission("products.update"),
    updateProductHandler
  );

  app.patch(
    "/products/:id",
    ...tenantRoute,
    requirePermission("products.update"),
    updateProductHandler
  );

  app.delete(
    "/products/:id",
    ...tenantRoute,
    requirePermission("products.delete"),
    async (req, res, next) => {
      try {
        const filter = {
          id: Number(req.params.id),
          ...tenantScope(req),
        };
        const existing = await db.collection("products").findOne(filter);
        if (!existing) {
          throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
        }

        // Prefer archive over hard delete to preserve movement history.
        await db.collection("products").updateOne(filter, {
          $set: {
            status: "archived",
            updatedBy: req.auth.user.id,
            updatedAt: new Date(),
          },
        });
        res.json({
          message: "Product archived",
          id: existing.id,
          archived: true,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // ---------- Variants ----------

  app.get(
    "/products/:id/variants",
    ...tenantRoute,
    requirePermission("products.view"),
    async (req, res, next) => {
      try {
        const product = await db.collection("products").findOne({
          id: Number(req.params.id),
          ...tenantScope(req),
        });
        if (!product) {
          throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
        }
        const variants = await db
          .collection("product_variants")
          .find({
            businessId: req.tenant.businessId,
            productId: product.id,
          })
          .sort({ id: 1 })
          .toArray();
        res.json({ variants: variants.map(publicVariant) });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/products/:id/variants",
    ...tenantRoute,
    requirePermission("products.create"),
    async (req, res, next) => {
      try {
        const product = await db.collection("products").findOne({
          id: Number(req.params.id),
          ...tenantScope(req),
        });
        if (!product) {
          throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
        }

        const name = toOptionalString(req.body.name);
        if (!name) {
          throw new AppError(400, "VALIDATION_ERROR", "Variant name is required");
        }

        const businessId = req.tenant.businessId;
        const sku = toOptionalString(req.body.sku);
        const barcode = toOptionalString(req.body.barcode);
        await assertUniqueSku(db, businessId, sku);
        await assertUniqueBarcode(db, businessId, barcode);

        const variant = {
          id: await nextTenantId(db, "product_variants", businessId),
          businessId,
          productId: product.id,
          name,
          sku,
          barcode,
          attributes:
            req.body.attributes && typeof req.body.attributes === "object"
              ? req.body.attributes
              : {},
          purchasePrice: toOptionalNumber(req.body.purchasePrice),
          salePrice: toOptionalNumber(req.body.salePrice),
          wholesalePrice: toOptionalNumber(req.body.wholesalePrice),
          ...stockFieldsFromQuantity(0),
          status: normalizeStatus(req.body.status),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        await db.collection("product_variants").insertOne(variant);
        await db.collection("products").updateOne(
          { businessId, id: product.id },
          { $set: { trackVariants: true, updatedAt: new Date() } }
        );

        const openingQty = toOptionalNumber(
          req.body.openingStock ?? req.body.stock ?? req.body.currentStock
        );
        if (openingQty != null && openingQty > 0) {
          await applyMovementTransactional(db, mongoClient, {
            businessId,
            productId: product.id,
            variantId: variant.id,
            movementType: MOVEMENT_TYPES.OPENING_STOCK,
            quantity: openingQty,
            reason: "Opening stock",
            referenceType: "product_variant",
            referenceId: variant.id,
            createdBy: req.auth.user.id,
            productName: `${product.name} / ${variant.name}`,
          });
        }

        const saved = await db.collection("product_variants").findOne({
          businessId,
          id: variant.id,
        });
        res.status(201).json(publicVariant(saved));
      } catch (error) {
        next(error);
      }
    }
  );

  app.patch(
    "/products/:productId/variants/:variantId",
    ...tenantRoute,
    requirePermission("products.update"),
    async (req, res, next) => {
      try {
        const filter = {
          businessId: req.tenant.businessId,
          productId: Number(req.params.productId),
          id: Number(req.params.variantId),
        };
        const existing = await db.collection("product_variants").findOne(filter);
        if (!existing) {
          throw new AppError(404, "VARIANT_NOT_FOUND", "Variant not found");
        }

        const updates = { updatedAt: new Date() };
        if (req.body.name !== undefined) {
          const name = toOptionalString(req.body.name);
          if (!name) {
            throw new AppError(400, "VALIDATION_ERROR", "Variant name is required");
          }
          updates.name = name;
        }
        if (req.body.sku !== undefined) {
          const sku = toOptionalString(req.body.sku);
          await assertUniqueSku(db, req.tenant.businessId, sku, {
            excludeVariantId: existing.id,
          });
          updates.sku = sku;
        }
        if (req.body.barcode !== undefined) {
          const barcode = toOptionalString(req.body.barcode);
          await assertUniqueBarcode(db, req.tenant.businessId, barcode, {
            excludeVariantId: existing.id,
          });
          updates.barcode = barcode;
        }
        if (req.body.attributes !== undefined) {
          updates.attributes =
            req.body.attributes && typeof req.body.attributes === "object"
              ? req.body.attributes
              : {};
        }
        if (req.body.purchasePrice !== undefined) {
          updates.purchasePrice = toOptionalNumber(req.body.purchasePrice);
        }
        if (req.body.salePrice !== undefined) {
          updates.salePrice = toOptionalNumber(req.body.salePrice);
        }
        if (req.body.wholesalePrice !== undefined) {
          updates.wholesalePrice = toOptionalNumber(req.body.wholesalePrice);
        }
        if (req.body.status !== undefined) {
          updates.status = normalizeStatus(req.body.status);
        }

        await db.collection("product_variants").updateOne(filter, { $set: updates });
        res.json(
          publicVariant(await db.collection("product_variants").findOne(filter))
        );
      } catch (error) {
        next(error);
      }
    }
  );

  // ---------- Inventory ----------

  app.get(
    "/inventory/movements",
    ...tenantRoute,
    requirePermission("inventory.view"),
    async (req, res, next) => {
      try {
        const filter = { ...tenantScope(req) };
        const productId = toOptionalNumber(req.query.productId);
        const variantId = toOptionalNumber(req.query.variantId);
        const movementType = toOptionalString(
          req.query.movementType || req.query.type
        );

        if (productId != null) filter.productId = productId;
        if (variantId != null) filter.variantId = variantId;
        if (movementType) {
          filter.$or = [
            { movementType },
            { type: movementType },
          ];
        }

        const movements = await db
          .collection("inventory_movements")
          .find(filter)
          .sort({ createdAt: -1, id: -1 })
          .toArray();

        res.json({ movements: movements.map(publicMovement) });
      } catch (error) {
        next(error);
      }
    }
  );

  app.get(
    "/inventory/stock/:productId",
    ...tenantRoute,
    requirePermission("inventory.view"),
    async (req, res, next) => {
      try {
        const productId = Number(req.params.productId);
        const variantId = toOptionalNumber(req.query.variantId);
        const available = await getCurrentStock(db, {
          businessId: req.tenant.businessId,
          productId,
          variantId,
        });
        if (available == null) {
          throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
        }
        res.json({
          productId,
          variantId,
          currentStock: available,
          available,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/inventory/check-stock",
    ...tenantRoute,
    requirePermission("inventory.view"),
    async (req, res, next) => {
      try {
        const productId = toOptionalNumber(req.body.productId);
        const requestedQuantity = toOptionalNumber(req.body.requestedQuantity);
        if (productId == null || requestedQuantity == null) {
          throw new AppError(
            400,
            "VALIDATION_ERROR",
            "productId and requestedQuantity are required"
          );
        }
        const result = await checkAvailableStock(db, {
          businessId: req.tenant.businessId,
          productId,
          variantId: toOptionalNumber(req.body.variantId),
          requestedQuantity,
        });
        res.json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/inventory/adjust",
    ...tenantRoute,
    requirePermission("inventory.adjust"),
    async (req, res, next) => {
      try {
        const productId = toOptionalNumber(req.body.productId);
        const quantity = toOptionalNumber(req.body.quantity);
        const reason = toOptionalString(req.body.reason);
        const variantId = toOptionalNumber(req.body.variantId);

        if (productId == null) {
          throw new AppError(400, "VALIDATION_ERROR", "productId is required");
        }
        if (quantity == null || quantity === 0) {
          throw new AppError(
            400,
            "VALIDATION_ERROR",
            "quantity must be a non-zero number"
          );
        }

        let result;
        try {
          result = await applyMovementTransactional(db, mongoClient, {
            businessId: req.tenant.businessId,
            productId,
            variantId,
            movementType: MOVEMENT_TYPES.ADJUSTMENT,
            quantity,
            reason,
            referenceType: "adjustment",
            referenceId: null,
            unitCost: toOptionalNumber(req.body.unitCost),
            createdBy: req.auth.user.id,
          });
        } catch (error) {
          throwApp(AppError, error);
        }

        await writeAuditLog(db, {
          businessId: req.tenant.businessId,
          actorId: req.auth.user.id,
          actorName: actorDisplayName(req.auth.user),
          action: "inventory.adjust",
          entity: "product",
          entityId: productId,
          oldValues: { currentStock: result.previousQuantity },
          newValues: {
            currentStock: result.resultingQuantity,
            quantity,
            reason,
            variantId,
            movementId: result.movement.id,
          },
          meta: { movementType: MOVEMENT_TYPES.ADJUSTMENT },
        });

        res.status(201).json({
          movement: publicMovement(result.movement),
          product: publicProduct(
            await db.collection("products").findOne({
              businessId: req.tenant.businessId,
              id: productId,
            })
          ),
        });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/inventory/opening-stock",
    ...tenantRoute,
    requirePermission("inventory.adjust"),
    async (req, res, next) => {
      try {
        const productId = toOptionalNumber(req.body.productId);
        const quantity = toOptionalNumber(req.body.quantity);
        const variantId = toOptionalNumber(req.body.variantId);
        const reason =
          toOptionalString(req.body.reason) || "Opening stock";

        if (productId == null) {
          throw new AppError(400, "VALIDATION_ERROR", "productId is required");
        }
        if (quantity == null || quantity <= 0) {
          throw new AppError(
            400,
            "VALIDATION_ERROR",
            "quantity must be a positive number"
          );
        }

        // Opening stock should only be applied when ledger is empty for this item.
        const existingMovements = await db
          .collection("inventory_movements")
          .countDocuments({
            businessId: req.tenant.businessId,
            productId,
            ...(variantId != null
              ? { variantId }
              : {
                  $or: [
                    { variantId: null },
                    { variantId: { $exists: false } },
                  ],
                }),
          });
        if (existingMovements > 0) {
          throw new AppError(
            409,
            "OPENING_STOCK_EXISTS",
            "Opening stock can only be set when no movements exist; use adjustment instead"
          );
        }

        let result;
        try {
          result = await applyMovementTransactional(db, mongoClient, {
            businessId: req.tenant.businessId,
            productId,
            variantId,
            movementType: MOVEMENT_TYPES.OPENING_STOCK,
            quantity,
            reason,
            referenceType: "opening_stock",
            referenceId: productId,
            unitCost: toOptionalNumber(req.body.unitCost),
            createdBy: req.auth.user.id,
          });
        } catch (error) {
          throwApp(AppError, error);
        }

        await writeAuditLog(db, {
          businessId: req.tenant.businessId,
          actorId: req.auth.user.id,
          actorName: actorDisplayName(req.auth.user),
          action: "inventory.opening_stock",
          entity: "product",
          entityId: productId,
          newValues: {
            quantity,
            reason,
            movementId: result.movement.id,
            currentStock: result.resultingQuantity,
          },
        });

        res.status(201).json({
          movement: publicMovement(result.movement),
          product: publicProduct(
            await db.collection("products").findOne({
              businessId: req.tenant.businessId,
              id: productId,
            })
          ),
        });
      } catch (error) {
        next(error);
      }
    }
  );

  app.get(
    "/inventory/low-stock",
    ...tenantRoute,
    requirePermission("inventory.view"),
    async (req, res, next) => {
      try {
        const products = await db
          .collection("products")
          .find({
            ...tenantScope(req),
            status: { $ne: "archived" },
          })
          .toArray();
        const low = products
          .map((p) => publicProduct(p))
          .filter((p) => p.currentStock < p.minimumStockLevel);
        res.json({ products: low });
      } catch (error) {
        next(error);
      }
    }
  );
}

module.exports = {
  registerCatalogRoutes,
  publicProduct,
  publicCategory,
  publicVariant,
  publicMovement,
};
