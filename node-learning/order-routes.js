/**
 * Store orders:
 * GET    /public/store/:token
 * POST   /public/store/:token/orders
 * GET    /orders
 * GET    /orders/:id
 * POST   /orders
 * PATCH  /orders/:id
 * POST   /orders/:id/convert
 */

const { nextTenantId, ensureBusinessSettings } = require("./database");
const { writeAuditLog, actorDisplayName } = require("./audit");
const {
  insertInvoiceDocument,
  withOptionalTransaction,
  INVOICE_STATUSES,
} = require("./invoice-routes");
const {
  RATE_LIST_STATUSES,
  loadPublicSentRateList,
  loadProductsForRateList,
  publicStoreFromRateList,
} = require("./rate-list-routes");

const ORDER_STATUSES = Object.freeze({
  PLACED: "placed",
  CONFIRMED: "confirmed",
  CONVERTED: "converted",
  CANCELLED: "cancelled",
});

const STATUS_SET = new Set(Object.values(ORDER_STATUSES));
const PATCHABLE_STATUSES = new Set([
  ORDER_STATUSES.CONFIRMED,
  ORDER_STATUSES.CANCELLED,
]);

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

function toMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function calcLineTotal(quantity, unitPrice, tax) {
  const total = (Number(quantity) || 0) * (Number(unitPrice) || 0);
  const taxRate = (Number(tax) || 0) / 100;
  return toMoney(total + total * taxRate);
}

function productUnitPrice(product) {
  if (product.salePrice != null) return toMoney(product.salePrice);
  if (product.printRate != null) return toMoney(product.printRate);
  if (product.price != null) return toMoney(product.price);
  return 0;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function plusDaysIso(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function throwApp(AppError, error) {
  if (error instanceof AppError) throw error;
  if (error && error.status && error.code) {
    throw new AppError(
      error.status,
      error.code,
      error.message,
      error.details || {}
    );
  }
  throw error;
}

function publicOrder(order) {
  if (!order) return order;
  return {
    id: order.id,
    businessId: order.businessId,
    number: order.number,
    status: order.status,
    source: order.source || "store",
    clientId: order.clientId,
    clientName: order.clientName || order.clientSnapshot?.name || "",
    clientPhone: order.clientPhone || order.clientSnapshot?.phone || "",
    clientArea: order.clientArea || order.clientSnapshot?.area || "",
    clientSnapshot: order.clientSnapshot || {},
    rateListId: order.rateListId ?? null,
    rateListNumber: order.rateListNumber || null,
    items: Array.isArray(order.items) ? order.items : [],
    subtotal: toMoney(order.subtotal),
    taxTotal: toMoney(order.taxTotal),
    total: toMoney(order.total),
    currency: order.currency || "Rs",
    notes: order.notes || "",
    convertedInvoiceId: order.convertedInvoiceId ?? null,
    convertedAt: order.convertedAt || null,
    placedAt: order.placedAt || order.createdAt || null,
    createdBy: order.createdBy || null,
    updatedBy: order.updatedBy || null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

function publicStoreOrder(order) {
  return {
    id: order.id,
    number: order.number,
    status: order.status,
    clientName: order.clientName || "",
    items: Array.isArray(order.items)
      ? order.items.map((item) => ({
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          unitPrice: toMoney(item.unitPrice),
          lineTotal: toMoney(item.lineTotal),
          unit: item.unit || "pcs",
        }))
      : [],
    subtotal: toMoney(order.subtotal),
    taxTotal: toMoney(order.taxTotal),
    total: toMoney(order.total),
    currency: order.currency || "Rs",
    notes: order.notes || "",
    placedAt: order.placedAt || order.createdAt || null,
  };
}

function clientSnapshot(client) {
  return {
    name: client.name || "",
    phone: client.phone || "",
    email: client.email || "",
    address: client.address || "",
    city: client.city || "",
    code: client.code || client.postalCode || "",
    country: client.country || "",
    area: client.area || "",
  };
}

async function findClient(db, businessId, clientId, { session } = {}) {
  const numericId = toOptionalNumber(clientId);
  const filter = { businessId };
  if (numericId != null) {
    filter.$or = [{ id: numericId }, { id: String(clientId) }];
  } else {
    filter.id = String(clientId);
  }
  return db.collection("clients").findOne(filter, { session });
}

function rateListItemKey(item) {
  return `${item.productId}:${item.variantId ?? ""}`;
}

function rateListLineMap(list) {
  const map = new Map();
  for (const item of list.items || []) {
    map.set(rateListItemKey(item), item);
    if (item.variantId == null) {
      map.set(String(item.productId), item);
    }
  }
  return map;
}

function totalsFromItems(items) {
  const subtotal = toMoney(
    items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  );
  const taxTotal = toMoney(
    items.reduce(
      (sum, item) => sum + (item.lineTotal - item.quantity * item.unitPrice),
      0
    )
  );
  const total = toMoney(items.reduce((sum, item) => sum + item.lineTotal, 0));
  return { subtotal, taxTotal, total };
}

async function hydrateStoreItems(
  db,
  { businessId, rawItems, priceLines, AppError, session }
) {
  if (!Array.isArray(rawItems) || !rawItems.length) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "At least one order item is required"
    );
  }
  if (rawItems.length > 50) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Orders can include at most 50 items"
    );
  }

  const merged = new Map();
  for (const raw of rawItems) {
    const productId = toOptionalNumber(raw.productId);
    const variantId = toOptionalNumber(raw.variantId);
    const quantity = toOptionalNumber(raw.quantity);
    const tax = toOptionalNumber(raw.tax) ?? 0;
    if (productId == null) {
      throw new AppError(400, "VALIDATION_ERROR", "productId is required");
    }
    if (quantity == null || quantity <= 0) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "Each item needs a quantity greater than 0"
      );
    }
    if (quantity > 10000) {
      throw new AppError(400, "VALIDATION_ERROR", "Quantity is too large");
    }
    const key = `${productId}:${variantId ?? ""}`;
    const prev = merged.get(key);
    if (prev) {
      prev.quantity = toMoney(prev.quantity + quantity);
      continue;
    }
    merged.set(key, { productId, variantId, quantity, tax });
  }

  const productIds = [...new Set([...merged.values()].map((row) => row.productId))];
  const products = await db
    .collection("products")
    .find({ businessId, id: { $in: productIds } }, { session })
    .toArray();
  const productById = new Map(products.map((p) => [p.id, p]));

  const items = [];
  for (const row of merged.values()) {
    const line =
      priceLines.get(`${row.productId}:${row.variantId ?? ""}`) ||
      (row.variantId == null ? priceLines.get(String(row.productId)) : null);
    if (!line) {
      throw new AppError(
        400,
        "PRODUCT_NOT_ON_RATE_LIST",
        "One or more products are not on this rate list"
      );
    }

    const product = productById.get(row.productId);
    if (!product) {
      throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
    }
    if (product.status === "archived") {
      throw new AppError(
        400,
        "PRODUCT_ARCHIVED",
        `${product.name} is archived and cannot be ordered`
      );
    }

    const unitPrice = toMoney(line.customPrice);
    const lineTotal = calcLineTotal(row.quantity, unitPrice, row.tax);
    items.push({
      productId: product.id,
      variantId: line.variantId ?? row.variantId ?? null,
      name: line.productName || product.name,
      sku: line.sku || product.sku || null,
      unit: line.unit || product.unit || "pcs",
      quantity: row.quantity,
      unitPrice,
      tax: row.tax,
      lineTotal,
      imageUrl: product.imageUrl || null,
    });
  }
  return items;
}

async function hydrateCatalogItems(db, businessId, rawItems, AppError, { session } = {}) {
  if (!Array.isArray(rawItems) || !rawItems.length) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "At least one order item is required"
    );
  }

  const items = [];
  for (const raw of rawItems) {
    const productId = toOptionalNumber(raw.productId);
    const quantity = toOptionalNumber(raw.quantity);
    const tax = toOptionalNumber(raw.tax) ?? 0;
    if (productId == null) {
      throw new AppError(400, "VALIDATION_ERROR", "productId is required");
    }
    if (quantity == null || quantity <= 0) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "Each item needs a quantity greater than 0"
      );
    }
    const product = await db.collection("products").findOne(
      { businessId, id: productId },
      { session }
    );
    if (!product) {
      throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
    }
    if (product.status === "archived") {
      throw new AppError(
        400,
        "PRODUCT_ARCHIVED",
        `${product.name} is archived and cannot be ordered`
      );
    }
    const unitPrice = productUnitPrice(product);
    const lineTotal = calcLineTotal(quantity, unitPrice, tax);
    items.push({
      productId: product.id,
      variantId: toOptionalNumber(raw.variantId),
      name: product.name,
      sku: product.sku || null,
      unit: product.unit || "pcs",
      quantity,
      unitPrice,
      tax,
      lineTotal,
      imageUrl: product.imageUrl || null,
    });
  }
  return items;
}

function allowedOrderPatch(from, to) {
  if (from === to) return true;
  if (from === ORDER_STATUSES.PLACED) {
    return (
      to === ORDER_STATUSES.CONFIRMED || to === ORDER_STATUSES.CANCELLED
    );
  }
  if (from === ORDER_STATUSES.CONFIRMED) {
    return to === ORDER_STATUSES.CANCELLED;
  }
  return false;
}

async function insertOrderDocument(
  db,
  {
    businessId,
    client,
    items,
    rateList,
    source,
    notes,
    currency,
    createdBy,
  },
  { session } = {}
) {
  const settings = await ensureBusinessSettings(db, businessId, { session });
  const id = await nextTenantId(db, "orders", businessId, { session });
  const prefix = settings.orderPrefix || "ORD-";
  const snap = clientSnapshot(client);
  const totals = totalsFromItems(items);
  const now = new Date();
  const doc = {
    id,
    businessId,
    number: `${prefix}${String(id).padStart(5, "0")}`,
    status: ORDER_STATUSES.PLACED,
    source,
    clientId: client.id,
    clientName: snap.name,
    clientPhone: snap.phone,
    clientArea: snap.area,
    clientSnapshot: snap,
    rateListId: rateList ? rateList.id : null,
    rateListNumber: rateList ? rateList.number : null,
    items,
    ...totals,
    currency: currency || settings.currency || "Rs",
    notes: notes || "",
    convertedInvoiceId: null,
    convertedAt: null,
    placedAt: now,
    createdBy: createdBy || null,
    updatedBy: createdBy || null,
    createdAt: now,
    updatedAt: now,
  };
  await db.collection("orders").insertOne(doc, session ? { session } : undefined);
  return doc;
}

function registerOrderRoutes({
  app,
  db,
  mongoClient,
  AppError,
  tenantRoute,
  requirePermission,
  tenantScope,
}) {
  app.get("/public/store/:token", async (req, res, next) => {
    try {
      const list = await loadPublicSentRateList(db, req.params.token, AppError);
      const productsById = await loadProductsForRateList(db, list);
      const business = await db.collection("businesses").findOne({
        id: list.businessId,
      });
      const settings = await ensureBusinessSettings(db, list.businessId);
      res.json({
        store: publicStoreFromRateList(list, {
          productsById,
          businessName: business?.name || null,
          currency: settings.currency || "Rs",
        }),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/public/store/:token/orders", async (req, res, next) => {
    try {
      const list = await loadPublicSentRateList(db, req.params.token, AppError);
      if (list.status !== RATE_LIST_STATUSES.SENT) {
        throw new AppError(404, "SHARE_LINK_NOT_FOUND", "Rate list not found");
      }

      const client = await findClient(db, list.businessId, list.clientId);
      if (!client) {
        throw new AppError(404, "CLIENT_NOT_FOUND", "Client not found");
      }

      const items = await hydrateStoreItems(db, {
        businessId: list.businessId,
        rawItems: req.body?.items,
        priceLines: rateListLineMap(list),
        AppError,
      });
      const notes = toOptionalString(req.body?.notes) || "";

      const order = await insertOrderDocument(db, {
        businessId: list.businessId,
        client,
        items,
        rateList: list,
        source: "store",
        notes,
        createdBy: null,
      });

      await writeAuditLog(db, {
        businessId: list.businessId,
        actorId: null,
        actorName: client.name || "store",
        action: "ORDER_PLACED",
        entity: "order",
        entityId: order.id,
        newValues: { number: order.number, total: order.total, source: "store" },
      });

      res.status(201).json({ order: publicStoreOrder(order) });
    } catch (error) {
      next(error);
    }
  });

  app.get(
    "/orders",
    ...tenantRoute,
    requirePermission("orders.view"),
    async (req, res, next) => {
      try {
        const filter = { ...tenantScope(req) };
        const status = toOptionalString(req.query.status);
        if (status) {
          if (!STATUS_SET.has(status)) {
            throw new AppError(400, "VALIDATION_ERROR", "Invalid status");
          }
          filter.status = status;
        }
        const clientId = toOptionalNumber(req.query.clientId);
        if (clientId != null) filter.clientId = clientId;

        const page = Math.max(1, Number(req.query.page) || 1);
        const perPage = Math.min(
          100,
          Math.max(1, Number(req.query.per_page || req.query.limit) || 50)
        );
        const skip = (page - 1) * perPage;

        const [total, rows] = await Promise.all([
          db.collection("orders").countDocuments(filter),
          db
            .collection("orders")
            .find(filter)
            .sort({ id: -1 })
            .skip(skip)
            .limit(perPage)
            .toArray(),
        ]);

        res.json({
          orders: rows.map(publicOrder),
          pagination: {
            page,
            per_page: perPage,
            total,
            pages: Math.ceil(total / perPage) || 1,
          },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  app.get(
    "/orders/:id",
    ...tenantRoute,
    requirePermission("orders.view"),
    async (req, res, next) => {
      try {
        const order = await db.collection("orders").findOne({
          id: Number(req.params.id),
          ...tenantScope(req),
        });
        if (!order) {
          throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
        }
        res.json({ order: publicOrder(order) });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/orders",
    ...tenantRoute,
    requirePermission("orders.create"),
    async (req, res, next) => {
      try {
        const businessId = req.tenant.businessId;
        const clientId = req.body.clientId;
        if (clientId == null || clientId === "") {
          throw new AppError(400, "VALIDATION_ERROR", "clientId is required");
        }
        const client = await findClient(db, businessId, clientId);
        if (!client) {
          throw new AppError(404, "CLIENT_NOT_FOUND", "Client not found");
        }

        let rateList = null;
        let items;
        const rateListId = toOptionalNumber(req.body.rateListId);
        if (rateListId != null) {
          rateList = await db.collection("rate_lists").findOne({
            businessId,
            id: rateListId,
          });
          if (!rateList) {
            throw new AppError(404, "RATE_LIST_NOT_FOUND", "Rate list not found");
          }
          if (Number(rateList.clientId) !== Number(client.id)) {
            throw new AppError(
              400,
              "RATE_LIST_CLIENT_MISMATCH",
              "Rate list does not belong to this client"
            );
          }
          items = await hydrateStoreItems(db, {
            businessId,
            rawItems: req.body.items,
            priceLines: rateListLineMap(rateList),
            AppError,
          });
        } else {
          items = await hydrateCatalogItems(
            db,
            businessId,
            req.body.items,
            AppError
          );
        }

        const order = await insertOrderDocument(db, {
          businessId,
          client,
          items,
          rateList,
          source: "staff",
          notes: toOptionalString(req.body.notes) || "",
          createdBy: req.auth.user.id,
        });

        await writeAuditLog(db, {
          businessId,
          actorId: req.auth.user.id,
          actorName: actorDisplayName(req.auth.user),
          action: "ORDER_CREATED",
          entity: "order",
          entityId: order.id,
          newValues: { number: order.number, total: order.total, source: "staff" },
        });

        res.status(201).json({ order: publicOrder(order) });
      } catch (error) {
        next(error);
      }
    }
  );

  app.patch(
    "/orders/:id",
    ...tenantRoute,
    requirePermission("orders.update"),
    async (req, res, next) => {
      try {
        const filter = {
          id: Number(req.params.id),
          ...tenantScope(req),
        };
        const existing = await db.collection("orders").findOne(filter);
        if (!existing) {
          throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
        }
        if (
          existing.status === ORDER_STATUSES.CONVERTED ||
          existing.status === ORDER_STATUSES.CANCELLED
        ) {
          throw new AppError(
            409,
            "ORDER_NOT_EDITABLE",
            "Converted or cancelled orders cannot be updated"
          );
        }

        const updates = {
          updatedBy: req.auth.user.id,
          updatedAt: new Date(),
        };

        if (Object.prototype.hasOwnProperty.call(req.body, "notes")) {
          updates.notes = toOptionalString(req.body.notes) || "";
        }

        if (Object.prototype.hasOwnProperty.call(req.body, "status")) {
          const status = toOptionalString(req.body.status);
          if (!status || !PATCHABLE_STATUSES.has(status)) {
            throw new AppError(400, "VALIDATION_ERROR", "Invalid status");
          }
          if (!allowedOrderPatch(existing.status, status)) {
            throw new AppError(
              409,
              "INVALID_STATUS_TRANSITION",
              `Cannot change order from ${existing.status} to ${status}`
            );
          }
          updates.status = status;
        }

        await db.collection("orders").updateOne(filter, { $set: updates });
        const updated = await db.collection("orders").findOne(filter);

        await writeAuditLog(db, {
          businessId: req.tenant.businessId,
          actorId: req.auth.user.id,
          actorName: actorDisplayName(req.auth.user),
          action: "ORDER_UPDATED",
          entity: "order",
          entityId: updated.id,
          newValues: { status: updated.status },
        });

        res.json({ order: publicOrder(updated) });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/orders/:id/convert",
    ...tenantRoute,
    requirePermission("orders.convert"),
    async (req, res, next) => {
      try {
        const filter = {
          id: Number(req.params.id),
          ...tenantScope(req),
        };

        const result = await withOptionalTransaction(
          mongoClient,
          async (session) => {
            const existing = await db
              .collection("orders")
              .findOne(filter, { session });
            if (!existing) {
              throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
            }
            if (existing.status === ORDER_STATUSES.CANCELLED) {
              throw new AppError(
                409,
                "ORDER_CANCELLED",
                "Cancelled orders cannot be converted"
              );
            }
            if (
              existing.status === ORDER_STATUSES.CONVERTED ||
              existing.convertedInvoiceId
            ) {
              throw new AppError(
                409,
                "ORDER_ALREADY_CONVERTED",
                "Order is already converted to an invoice"
              );
            }

            const client = await findClient(
              db,
              req.tenant.businessId,
              existing.clientId,
              { session }
            );
            if (!client) {
              throw new AppError(404, "CLIENT_NOT_FOUND", "Client not found");
            }

            const invoiceStatus =
              toOptionalString(req.body?.status) || INVOICE_STATUSES.PENDING;
            const invoice = await insertInvoiceDocument(
              db,
              {
                businessId: req.tenant.businessId,
                business: req.tenant.business,
                userId: req.auth.user.id,
                client,
                items: existing.items,
                issueDate: toOptionalString(req.body?.issueDate) || todayIsoDate(),
                dueDate: toOptionalString(req.body?.dueDate) || plusDaysIso(7),
                description:
                  toOptionalString(req.body?.description) ||
                  `Order ${existing.number}`,
                currency: existing.currency,
                status: invoiceStatus,
                sourceOrderId: existing.id,
                sourceRateListId: existing.rateListId,
              },
              AppError,
              { session }
            );

            const now = new Date();
            await db.collection("orders").updateOne(
              filter,
              {
                $set: {
                  status: ORDER_STATUSES.CONVERTED,
                  convertedInvoiceId: invoice.id,
                  convertedAt: now,
                  updatedBy: req.auth.user.id,
                  updatedAt: now,
                },
              },
              session ? { session } : undefined
            );

            const order = await db
              .collection("orders")
              .findOne(filter, { session });
            return { order, invoice };
          }
        );

        await writeAuditLog(db, {
          businessId: req.tenant.businessId,
          actorId: req.auth.user.id,
          actorName: actorDisplayName(req.auth.user),
          action: "ORDER_CONVERTED",
          entity: "order",
          entityId: result.order.id,
          newValues: {
            invoiceId: result.invoice.id,
            invoiceNumber: result.invoice.number,
          },
        });

        res.status(201).json({
          order: publicOrder(result.order),
          invoice: {
            id: result.invoice.id,
            number: result.invoice.number,
            status: result.invoice.status,
            total: result.invoice.total,
            stockApplied: result.invoice.stockApplied === true,
          },
        });
      } catch (error) {
        try {
          throwApp(AppError, error);
        } catch (normalized) {
          next(normalized);
        }
      }
    }
  );
}

module.exports = {
  ORDER_STATUSES,
  registerOrderRoutes,
};
