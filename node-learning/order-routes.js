/**
 * Store orders:
 * GET    /public/store/:token
 * POST   /public/store/:token/orders
 * GET    /store-link
 * POST   /store-link
 * GET    /orders
 * GET    /orders/:id
 * POST   /orders
 * PATCH  /orders/:id
 * POST   /orders/:id/convert
 */

const crypto = require("crypto");
const { nextTenantId, ensureBusinessSettings } = require("./database");
const { writeAuditLog, actorDisplayName } = require("./audit");
const {
  insertInvoiceDocument,
  withOptionalTransaction,
  INVOICE_STATUSES,
} = require("./invoice-routes");
const {
  RATE_LIST_STATUSES,
  loadProductsForRateList,
  publicStoreFromRateList,
} = require("./rate-list-routes");
const {
  escapeRegex,
  parseListPagination,
  paginateFind,
} = require("./pagination");

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
  if (rawItems.length > 50) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Orders can include at most 50 items"
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
    if (product.status === "archived" || product.status === "inactive") {
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

function newStoreToken() {
  return crypto.randomBytes(32).toString("hex");
}

function normalizePhone(value) {
  return String(value || "").replace(/[^\d+]/g, "");
}

function productCurrentStock(product) {
  if (product?.currentStock != null) return Number(product.currentStock);
  if (product?.stock != null) return Number(product.stock);
  return null;
}

function publicStoreFromCatalog(
  products,
  { businessName = null, currency = "Rs", title = "Rate list" } = {}
) {
  return {
    kind: "catalog",
    requiresCustomer: true,
    title,
    notes: null,
    clientName: null,
    businessName: businessName || null,
    currency,
    sentAt: null,
    expiresAt: null,
    items: (products || []).map((product) => ({
      productId: product.id,
      variantId: null,
      name: product.name,
      sku: product.sku || null,
      unit: product.unit || "pcs",
      variantName: null,
      price: productUnitPrice(product),
      imageUrl: product.imageUrl || null,
      currentStock: productCurrentStock(product),
      description: product.description || null,
    })),
  };
}

async function loadCatalogStoreProducts(db, businessId, query = {}) {
  const filter = {
    businessId,
    $and: [
      {
        $or: [
          { status: "active" },
          { status: { $exists: false } },
          { status: null },
        ],
      },
    ],
  };
  const q = String(query.q || query.search || "").trim();
  if (q) {
    const rx = { $regex: escapeRegex(q), $options: "i" };
    filter.$and.push({
      $or: [{ name: rx }, { sku: rx }, { barcode: rx }, { unit: rx }],
    });
  }
  const paging = parseListPagination(query);
  const { rows, pagination } = await paginateFind(
    db.collection("products"),
    filter,
    { ...paging, sort: { name: 1 } }
  );
  return { products: rows, pagination };
}

async function resolvePublicStoreSource(db, token, AppError) {
  const shareToken = toOptionalString(token);
  if (!shareToken) {
    throw new AppError(404, "SHARE_LINK_NOT_FOUND", "Store not found");
  }

  const list = await db.collection("rate_lists").findOne({
    shareToken,
    status: RATE_LIST_STATUSES.SENT,
  });
  if (list) {
    if (list.expiresAt && new Date(list.expiresAt).getTime() < Date.now()) {
      throw new AppError(
        410,
        "SHARE_LINK_EXPIRED",
        "This rate list link has expired"
      );
    }
    return { kind: "rate-list", list, businessId: list.businessId };
  }

  const settings = await db.collection("business_settings").findOne({
    catalogStoreToken: shareToken,
  });
  if (!settings) {
    throw new AppError(404, "SHARE_LINK_NOT_FOUND", "Store not found");
  }
  return { kind: "catalog", settings, businessId: settings.businessId };
}

async function ensureCatalogStoreToken(db, businessId, { rotate = false } = {}) {
  const settings = await ensureBusinessSettings(db, businessId);
  if (!rotate && settings.catalogStoreToken) {
    return settings.catalogStoreToken;
  }
  const token = newStoreToken();
  await db.collection("business_settings").updateOne(
    { businessId },
    { $set: { catalogStoreToken: token, updatedAt: new Date() } }
  );
  return token;
}

function storeLinkPayload(token) {
  return {
    storeToken: token,
    storePath: `/public/store/${token}`,
  };
}

async function ensureStoreCustomer(
  db,
  businessId,
  { name, phone, area },
  AppError,
  { session } = {}
) {
  const clientName = toOptionalString(name);
  const clientPhone = normalizePhone(phone);
  const clientArea = toOptionalString(area) || "";
  if (!clientName) {
    throw new AppError(400, "VALIDATION_ERROR", "Name is required");
  }
  if (!clientPhone || clientPhone.replace(/\D/g, "").length < 7) {
    throw new AppError(400, "VALIDATION_ERROR", "A valid phone number is required");
  }

  const existing = await db.collection("clients").findOne(
    { businessId, phone: clientPhone },
    { session }
  );
  if (existing) {
    const updates = { updatedAt: new Date() };
    if (!existing.name && clientName) updates.name = clientName;
    if (!existing.area && clientArea) updates.area = clientArea;
    if (Object.keys(updates).length > 1) {
      await db.collection("clients").updateOne(
        { businessId, id: existing.id },
        { $set: updates },
        session ? { session } : undefined
      );
      return { ...existing, ...updates };
    }
    return existing;
  }

  const now = new Date();
  const client = {
    id: await nextTenantId(db, "clients", businessId, { session }),
    businessId,
    name: clientName,
    phone: clientPhone,
    area: clientArea,
    address: "",
    city: "",
    country: "",
    source: "store",
    createdAt: now,
    updatedAt: now,
  };
  await db.collection("clients").insertOne(client, session ? { session } : undefined);
  return client;
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
      const source = await resolvePublicStoreSource(db, req.params.token, AppError);
      const business = await db.collection("businesses").findOne({
        id: source.businessId,
      });
      const settings = await ensureBusinessSettings(db, source.businessId);
      const extras = {
        businessName: business?.name || null,
        currency: settings.currency || "Rs",
      };

      if (source.kind === "catalog") {
        const { products, pagination } = await loadCatalogStoreProducts(
          db,
          source.businessId,
          req.query
        );
        res.json({
          store: publicStoreFromCatalog(products, {
            ...extras,
            title: extras.businessName
              ? `${extras.businessName} — Rate list`
              : "Rate list",
          }),
          pagination,
        });
        return;
      }

      const productsById = await loadProductsForRateList(db, source.list);
      res.json({
        store: publicStoreFromRateList(source.list, {
          productsById,
          ...extras,
        }),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/public/store/:token/orders", async (req, res, next) => {
    try {
      const source = await resolvePublicStoreSource(db, req.params.token, AppError);
      const notes = toOptionalString(req.body?.notes) || "";
      let client;
      let items;
      let rateList = null;

      if (source.kind === "catalog") {
        client = await ensureStoreCustomer(
          db,
          source.businessId,
          {
            name: req.body?.clientName || req.body?.name,
            phone: req.body?.clientPhone || req.body?.phone,
            area: req.body?.clientArea || req.body?.area,
          },
          AppError
        );
        items = await hydrateCatalogItems(
          db,
          source.businessId,
          req.body?.items,
          AppError
        );
      } else {
        rateList = source.list;
        client = await findClient(db, rateList.businessId, rateList.clientId);
        if (!client) {
          throw new AppError(404, "CLIENT_NOT_FOUND", "Client not found");
        }
        items = await hydrateStoreItems(db, {
          businessId: rateList.businessId,
          rawItems: req.body?.items,
          priceLines: rateListLineMap(rateList),
          AppError,
        });
      }

      const order = await insertOrderDocument(db, {
        businessId: source.businessId,
        client,
        items,
        rateList,
        source: "store",
        notes,
        createdBy: null,
      });

      await writeAuditLog(db, {
        businessId: source.businessId,
        actorId: null,
        actorName: client.name || "store",
        action: "ORDER_PLACED",
        entity: "order",
        entityId: order.id,
        newValues: {
          number: order.number,
          total: order.total,
          source: "store",
          kind: source.kind,
        },
      });

      res.status(201).json({ order: publicStoreOrder(order) });
    } catch (error) {
      next(error);
    }
  });

  app.get(
    "/store-link",
    ...tenantRoute,
    requirePermission("rate_lists.send"),
    async (req, res, next) => {
      try {
        const token = await ensureCatalogStoreToken(db, req.tenant.businessId);
        res.json(storeLinkPayload(token));
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/store-link",
    ...tenantRoute,
    requirePermission("rate_lists.send"),
    async (req, res, next) => {
      try {
        const token = await ensureCatalogStoreToken(db, req.tenant.businessId, {
          rotate: req.body?.rotateToken === true,
        });
        res.json(storeLinkPayload(token));
      } catch (error) {
        next(error);
      }
    }
  );

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
