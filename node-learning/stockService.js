/**
 * Stock ledger service — inventory_movements is the auditable source of truth.
 * products.currentStock (and legacy products.stock) are caches updated in the
 * same transaction as each movement.
 */

const { nextTenantId, ensureBusinessSettings } = require("./database");

const MOVEMENT_TYPES = Object.freeze({
  OPENING_STOCK: "OPENING_STOCK",
  PURCHASE: "PURCHASE",
  SALE: "SALE",
  SALE_RETURN: "SALE_RETURN",
  PURCHASE_RETURN: "PURCHASE_RETURN",
  DAMAGE: "DAMAGE",
  ADJUSTMENT: "ADJUSTMENT",
  STOCK_TRANSFER: "STOCK_TRANSFER",
});

const MOVEMENT_TYPE_SET = new Set(Object.values(MOVEMENT_TYPES));

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function stockFieldsFromQuantity(quantity) {
  const qty = toNumber(quantity, 0);
  return { currentStock: qty, stock: qty };
}

/**
 * Sum signed quantities from the ledger (true source of truth).
 * Optionally scoped to a variant.
 */
async function sumLedgerStock(
  db,
  { businessId, productId, variantId = null },
  { session } = {}
) {
  const match = {
    businessId,
    productId: Number(productId),
  };
  if (variantId == null) {
    match.$or = [{ variantId: null }, { variantId: { $exists: false } }];
  } else {
    match.variantId = Number(variantId);
  }

  const rows = await db
    .collection("inventory_movements")
    .aggregate(
      [{ $match: match }, { $group: { _id: null, total: { $sum: "$quantity" } } }],
      session ? { session } : undefined
    )
    .toArray();

  return toNumber(rows[0]?.total, 0);
}

/**
 * Current stock for a product (or variant).
 * Prefers the cached balance when present; falls back to ledger sum.
 */
async function getCurrentStock(
  db,
  { businessId, productId, variantId = null },
  { session, preferLedger = false } = {}
) {
  if (variantId != null) {
    const variant = await db.collection("product_variants").findOne(
      {
        businessId,
        productId: Number(productId),
        id: Number(variantId),
      },
      { session }
    );
    if (!variant) return null;
    if (!preferLedger && variant.currentStock != null) {
      return toNumber(variant.currentStock, 0);
    }
    return sumLedgerStock(db, { businessId, productId, variantId }, { session });
  }

  const product = await db.collection("products").findOne(
    { businessId, id: Number(productId) },
    { session }
  );
  if (!product) return null;

  if (!preferLedger) {
    if (product.currentStock != null) return toNumber(product.currentStock, 0);
    if (product.stock != null) return toNumber(product.stock, 0);
  }

  return sumLedgerStock(db, { businessId, productId, variantId: null }, { session });
}

/**
 * Whether requestedQuantity can be fulfilled given available stock and settings.
 */
async function checkAvailableStock(
  db,
  { businessId, productId, variantId = null, requestedQuantity },
  { session } = {}
) {
  const requested = toNumber(requestedQuantity, NaN);
  if (!Number.isFinite(requested) || requested < 0) {
    return {
      ok: false,
      available: 0,
      requested,
      allowNegativeStock: false,
      reason: "INVALID_QUANTITY",
    };
  }

  const available = await getCurrentStock(
    db,
    { businessId, productId, variantId },
    { session }
  );
  if (available == null) {
    return {
      ok: false,
      available: 0,
      requested,
      allowNegativeStock: false,
      reason: "PRODUCT_NOT_FOUND",
    };
  }

  const settings = await ensureBusinessSettings(db, businessId, { session });
  const allowNegativeStock = settings.allowNegativeStock === true;

  if (!allowNegativeStock && requested > available) {
    return {
      ok: false,
      available,
      requested,
      allowNegativeStock,
      reason: "INSUFFICIENT_STOCK",
    };
  }

  return {
    ok: true,
    available,
    requested,
    allowNegativeStock,
    reason: null,
  };
}

/**
 * Append a stock movement and keep product/variant caches in sync.
 * Must be called inside a Mongo session transaction when mongoClient supports it.
 */
async function applyMovement(
  db,
  {
    businessId,
    productId,
    variantId = null,
    movementType,
    quantity,
    referenceType = null,
    referenceId = null,
    reason = null,
    unitCost = null,
    createdBy = null,
    productName = null,
    allowNegativeOverride = null,
  },
  { session } = {}
) {
  if (!businessId) {
    throw Object.assign(new Error("businessId is required"), {
      status: 400,
      code: "VALIDATION_ERROR",
    });
  }
  if (!MOVEMENT_TYPE_SET.has(movementType)) {
    throw Object.assign(new Error(`Invalid movement type: ${movementType}`), {
      status: 400,
      code: "INVALID_MOVEMENT_TYPE",
    });
  }

  const qty = toNumber(quantity, NaN);
  if (!Number.isFinite(qty) || qty === 0) {
    throw Object.assign(new Error("Movement quantity must be a non-zero number"), {
      status: 400,
      code: "INVALID_QUANTITY",
    });
  }

  const product = await db.collection("products").findOne(
    { businessId, id: Number(productId) },
    { session }
  );
  if (!product) {
    throw Object.assign(new Error("Product not found"), {
      status: 404,
      code: "PRODUCT_NOT_FOUND",
    });
  }

  let variant = null;
  if (variantId != null) {
    variant = await db.collection("product_variants").findOne(
      {
        businessId,
        productId: Number(productId),
        id: Number(variantId),
      },
      { session }
    );
    if (!variant) {
      throw Object.assign(new Error("Product variant not found"), {
        status: 404,
        code: "VARIANT_NOT_FOUND",
      });
    }
  }

  const previousQuantity = await getCurrentStock(
    db,
    {
      businessId,
      productId: product.id,
      variantId: variant ? variant.id : null,
    },
    { session }
  );
  const resultingQuantity = previousQuantity + qty;

  const settings = await ensureBusinessSettings(db, businessId, { session });
  const allowNegative =
    allowNegativeOverride != null
      ? allowNegativeOverride
      : settings.allowNegativeStock === true;

  if (!allowNegative && resultingQuantity < 0) {
    throw Object.assign(
      new Error(
        `Insufficient stock. Available ${previousQuantity}, change ${qty}`
      ),
      {
        status: 409,
        code: "INSUFFICIENT_STOCK",
        details: {
          available: previousQuantity,
          quantity: qty,
          resultingQuantity,
        },
      }
    );
  }

  const movementId = await nextTenantId(
    db,
    "inventory_movements",
    businessId
  );

  const movement = {
    id: movementId,
    businessId,
    productId: product.id,
    variantId: variant ? variant.id : null,
    productName: productName || product.name || null,
    movementType,
    // Legacy alias used by older UI / tests
    type: movementType,
    quantity: qty,
    previousQuantity,
    resultingQuantity,
    balanceAfter: resultingQuantity,
    referenceType: referenceType || null,
    referenceId: referenceId == null ? null : String(referenceId),
    reason: reason ? String(reason).trim() : null,
    unitCost: unitCost == null || unitCost === "" ? null : toNumber(unitCost, null),
    createdBy: createdBy || null,
    createdAt: new Date(),
  };

  await db
    .collection("inventory_movements")
    .insertOne(movement, session ? { session } : undefined);

  if (variant) {
    await db.collection("product_variants").updateOne(
      { businessId, id: variant.id },
      {
        $set: {
          ...stockFieldsFromQuantity(resultingQuantity),
          updatedAt: new Date(),
        },
      },
      session ? { session } : undefined
    );

    // Parent product cache = sum of variant caches when variants are tracked.
    const variantStocks = await db
      .collection("product_variants")
      .find({ businessId, productId: product.id }, { session })
      .project({ currentStock: 1, stock: 1 })
      .toArray();
    const productTotal = variantStocks.reduce(
      (sum, row) =>
        sum + toNumber(row.currentStock != null ? row.currentStock : row.stock, 0),
      0
    );
    await db.collection("products").updateOne(
      { businessId, id: product.id },
      {
        $set: {
          ...stockFieldsFromQuantity(productTotal),
          updatedAt: new Date(),
        },
      },
      session ? { session } : undefined
    );
  } else {
    await db.collection("products").updateOne(
      { businessId, id: product.id },
      {
        $set: {
          ...stockFieldsFromQuantity(resultingQuantity),
          updatedAt: new Date(),
        },
      },
      session ? { session } : undefined
    );
  }

  const updatedProduct = await db.collection("products").findOne(
    { businessId, id: product.id },
    { session }
  );
  const updatedVariant = variant
    ? await db.collection("product_variants").findOne(
        { businessId, id: variant.id },
        { session }
      )
    : null;

  return {
    movement,
    previousQuantity,
    resultingQuantity,
    product: updatedProduct,
    variant: updatedVariant,
  };
}

/**
 * Run applyMovement inside a transaction when a client is provided.
 * Falls back to non-transactional apply if session fails (e.g. standalone mongod).
 */
async function applyMovementTransactional(db, mongoClient, payload) {
  if (!mongoClient) {
    return applyMovement(db, payload);
  }

  const session = mongoClient.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await applyMovement(db, payload, { session });
    });
    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = {
  MOVEMENT_TYPES,
  MOVEMENT_TYPE_SET,
  stockFieldsFromQuantity,
  sumLedgerStock,
  getCurrentStock,
  checkAvailableStock,
  applyMovement,
  applyMovementTransactional,
};
