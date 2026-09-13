/**
 * Client-specific rate lists: selected products + custom prices per customer.
 * Product catalog salePrice stays the default; lists snapshot names/prices.
 */

const crypto = require("crypto");
const { nextTenantId } = require("./database");
const { writeAuditLog, actorDisplayName } = require("./audit");
const { parseListPagination, paginateFind } = require("./pagination");

const RATE_LIST_STATUSES = Object.freeze({
  DRAFT: "DRAFT",
  SENT: "SENT",
  ARCHIVED: "ARCHIVED",
});

const SEND_CHANNELS = new Set(["link", "whatsapp", "email"]);

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

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function parsePositiveId(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

function productSalePrice(product, variant) {
  if (variant && variant.salePrice != null) return toMoney(variant.salePrice);
  if (product.salePrice != null) return toMoney(product.salePrice);
  if (product.printRate != null) return toMoney(product.printRate);
  if (product.price != null) return toMoney(product.price);
  return 0;
}

const SALE_INVOICE_STATUSES = new Set(["pending", "paid"]);

function publicRateListItem(item, purchase) {
  return {
    productId: item.productId,
    variantId: item.variantId ?? null,
    productName: item.productName,
    sku: item.sku || null,
    unit: item.unit || "pcs",
    variantName: item.variantName || null,
    defaultPrice: toMoney(item.defaultPrice),
    customPrice: toMoney(item.customPrice),
    soldQty: Number(purchase?.soldQty) || 0,
    lastBoughtAt: purchase?.lastBoughtAt || null,
  };
}

function purchaseForItem(item, purchases) {
  if (!purchases || typeof purchases.get !== "function") return null;
  return purchases.get(Number(item.productId)) || purchases.get(item.productId) || null;
}

function publicRateList(list, extras = {}) {
  if (!list) return list;
  const { purchases, ...rest } = extras;
  return {
    id: list.id,
    businessId: list.businessId,
    clientId: list.clientId,
    clientName: list.clientName || null,
    number: list.number,
    title: list.title || null,
    notes: list.notes || null,
    status: list.status,
    items: Array.isArray(list.items)
      ? list.items.map((item) => publicRateListItem(item, purchaseForItem(item, purchases)))
      : [],
    itemCount: Array.isArray(list.items)
      ? list.items.length
      : Number(list.itemCount) || 0,
    sentAt: list.sentAt || null,
    sentBy: list.sentBy || null,
    sendChannel: list.sendChannel || null,
    shareToken: list.shareToken || null,
    sharePath: list.shareToken ? `/public/rate-lists/${list.shareToken}` : null,
    storePath: list.shareToken ? `/public/store/${list.shareToken}` : null,
    expiresAt: list.expiresAt || null,
    createdBy: list.createdBy || null,
    updatedBy: list.updatedBy || null,
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
    ...rest,
  };
}

function publicRateListSummary(list) {
  const { items, ...summary } = publicRateList(list);
  return summary;
}

function publicShareItem(item, product) {
  const currentStock =
    product?.currentStock != null
      ? Number(product.currentStock)
      : product?.stock != null
        ? Number(product.stock)
        : null;
  return {
    productId: item.productId,
    variantId: item.variantId ?? null,
    productName: item.productName,
    sku: item.sku || null,
    unit: item.unit || "pcs",
    variantName: item.variantName || null,
    price: toMoney(item.customPrice),
    imageUrl: product?.imageUrl || null,
    currentStock,
  };
}

function publicShareRateList(list, productsById = new Map()) {
  return {
    number: list.number,
    title: list.title || null,
    notes: list.notes || null,
    clientName: list.clientName || null,
    sentAt: list.sentAt || null,
    expiresAt: list.expiresAt || null,
    items: Array.isArray(list.items)
      ? list.items.map((item) =>
          publicShareItem(item, productsById.get(item.productId))
        )
      : [],
  };
}

function publicStoreFromRateList(
  list,
  { productsById = new Map(), businessName = null, currency = "Rs" } = {}
) {
  return {
    kind: "rate-list",
    requiresCustomer: false,
    title: list.title || list.number,
    notes: list.notes || null,
    clientName: list.clientName || null,
    businessName: businessName || null,
    currency,
    sentAt: list.sentAt || null,
    expiresAt: list.expiresAt || null,
    items: Array.isArray(list.items)
      ? list.items.map((item) => {
          const product = productsById.get(item.productId);
          const share = publicShareItem(item, product);
          return {
            productId: share.productId,
            variantId: share.variantId,
            name: share.productName,
            sku: share.sku,
            unit: share.unit,
            variantName: share.variantName,
            price: share.price,
            imageUrl: share.imageUrl,
            currentStock: share.currentStock,
            description: product?.description || null,
          };
        })
      : [],
  };
}

async function loadClientPurchaseStats(db, businessId, clientId) {
  const stats = new Map();
  const id = parsePositiveId(clientId);
  if (id == null) return stats;
  const invoices = await db
    .collection("invoices")
    .find(
      {
        businessId,
        clientId: id,
        status: { $in: [...SALE_INVOICE_STATUSES] },
      },
      { projection: { items: 1, issueDate: 1, createdAt: 1 } }
    )
    .toArray();

  for (const invoice of invoices) {
    const when = new Date(invoice.issueDate || invoice.createdAt || 0);
    const whenMs = when.getTime();
    const whenIso = Number.isFinite(whenMs) && whenMs > 0 ? when.toISOString() : null;
    for (const item of invoice.items || []) {
      const productId = Number(item.productId);
      if (!Number.isFinite(productId)) continue;
      const qty = Number(item.quantity) || 0;
      if (qty <= 0) continue;
      const prev = stats.get(productId) || { soldQty: 0, lastBoughtAt: null };
      prev.soldQty += qty;
      if (
        whenIso &&
        (!prev.lastBoughtAt || whenMs > new Date(prev.lastBoughtAt).getTime())
      ) {
        prev.lastBoughtAt = whenIso;
      }
      stats.set(productId, prev);
    }
  }
  return stats;
}

async function loadProductsForRateList(db, list, { session } = {}) {
  const ids = [
    ...new Set(
      (list.items || [])
        .map((item) => item.productId)
        .filter((id) => id != null)
    ),
  ];
  if (!ids.length) return new Map();
  const products = await db
    .collection("products")
    .find({ businessId: list.businessId, id: { $in: ids } }, { session })
    .toArray();
  return new Map(products.map((product) => [product.id, product]));
}

async function loadPublicSentRateList(db, token, AppError) {
  const shareToken = toOptionalString(token);
  if (!shareToken) {
    throw new AppError(404, "SHARE_LINK_NOT_FOUND", "Rate list not found");
  }
  const list = await db.collection("rate_lists").findOne({
    shareToken,
    status: RATE_LIST_STATUSES.SENT,
  });
  if (!list) {
    throw new AppError(404, "SHARE_LINK_NOT_FOUND", "Rate list not found");
  }
  if (list.expiresAt && new Date(list.expiresAt).getTime() < Date.now()) {
    throw new AppError(410, "SHARE_LINK_EXPIRED", "This rate list link has expired");
  }
  return list;
}

function newShareToken() {
  return crypto.randomBytes(32).toString("hex");
}

function parseExpiresAt(value) {
  if (value == null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const err = new Error("expiresAt must be a valid date");
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }
  return date;
}

async function assertClient(db, businessId, clientId) {
  const id = parsePositiveId(clientId);
  if (id == null) {
    const err = new Error("clientId is required");
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }
  const client = await db.collection("clients").findOne({ businessId, id });
  if (!client) {
    const err = new Error("Client not found");
    err.status = 404;
    err.code = "CLIENT_NOT_FOUND";
    throw err;
  }
  return client;
}

async function hydrateRateListItems(db, businessId, rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    const err = new Error("Rate list requires at least one product");
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const parsed = [];
  const seen = new Set();
  const productIds = new Set();
  const variantIds = new Set();

  for (const raw of rawItems) {
    const productId = toOptionalNumber(raw.productId);
    const variantId = toOptionalNumber(raw.variantId);
    if (productId == null) {
      const err = new Error("Each line requires productId");
      err.status = 400;
      err.code = "VALIDATION_ERROR";
      throw err;
    }

    const key = `${productId}:${variantId ?? ""}`;
    if (seen.has(key)) {
      const err = new Error("Duplicate product in rate list");
      err.status = 400;
      err.code = "DUPLICATE_PRODUCT";
      throw err;
    }
    seen.add(key);
    productIds.add(productId);
    if (variantId != null) variantIds.add(variantId);

    let customPrice = null;
    if (Object.prototype.hasOwnProperty.call(raw, "customPrice")) {
      customPrice = toOptionalNumber(raw.customPrice);
      if (raw.customPrice !== null && raw.customPrice !== "" && customPrice == null) {
        const err = new Error("customPrice must be a number");
        err.status = 400;
        err.code = "VALIDATION_ERROR";
        throw err;
      }
      if (customPrice != null && customPrice < 0) {
        const err = new Error("customPrice must be >= 0");
        err.status = 400;
        err.code = "VALIDATION_ERROR";
        throw err;
      }
    }

    parsed.push({ productId, variantId, customPrice });
  }

  const products = await db
    .collection("products")
    .find({ businessId, id: { $in: [...productIds] } })
    .toArray();
  const productById = new Map(products.map((p) => [p.id, p]));

  let variantById = new Map();
  if (variantIds.size) {
    const variants = await db
      .collection("product_variants")
      .find({
        businessId,
        id: { $in: [...variantIds] },
      })
      .toArray();
    variantById = new Map(variants.map((v) => [v.id, v]));
  }

  return parsed.map((line) => {
    const product = productById.get(line.productId);
    if (!product) {
      const err = new Error(
        `Product ${line.productId} not found in this business`
      );
      err.status = 400;
      err.code = "INVALID_PRODUCT";
      throw err;
    }
    if (product.status === "archived") {
      const err = new Error(`Product ${product.name} is archived`);
      err.status = 400;
      err.code = "INVALID_PRODUCT";
      throw err;
    }

    let variant = null;
    if (line.variantId != null) {
      variant = variantById.get(line.variantId);
      if (!variant || variant.productId !== product.id) {
        const err = new Error(
          `Variant ${line.variantId} not found for product ${product.id}`
        );
        err.status = 400;
        err.code = "INVALID_VARIANT";
        throw err;
      }
    }

    const defaultPrice = productSalePrice(product, variant);
    const customPrice =
      line.customPrice != null ? toMoney(line.customPrice) : defaultPrice;

    return {
      productId: product.id,
      variantId: variant ? variant.id : null,
      productName: product.name,
      sku: (variant && variant.sku) || product.sku || null,
      unit: product.unit || "pcs",
      variantName: variant ? variant.name : null,
      defaultPrice,
      customPrice,
    };
  });
}

function assertDraft(list, AppError) {
  if (list.status !== RATE_LIST_STATUSES.DRAFT) {
    throw new AppError(
      409,
      "RATE_LIST_LOCKED",
      "Only draft rate lists can be edited"
    );
  }
}

function registerRateListRoutes({
  app,
  db,
  AppError,
  tenantRoute,
  requirePermission,
  tenantScope,
}) {
  app.get(
    "/rate-lists",
    ...tenantRoute,
    requirePermission("rate_lists.view"),
    async (req, res, next) => {
      try {
        const filter = { ...tenantScope(req) };
        const clientId = parsePositiveId(req.query.clientId);
        if (req.query.clientId != null && req.query.clientId !== "") {
          if (clientId == null) {
            throw new AppError(400, "VALIDATION_ERROR", "clientId is invalid");
          }
          filter.clientId = clientId;
        }
        const status = toOptionalString(req.query.status);
        if (status) {
          const normalized = status.toUpperCase();
          if (!Object.values(RATE_LIST_STATUSES).includes(normalized)) {
            throw new AppError(400, "VALIDATION_ERROR", "Invalid status");
          }
          filter.status = normalized;
        }
        const q = toOptionalString(req.query.q);
        if (q) {
          const rx = { $regex: escapeRegex(q), $options: "i" };
          filter.$or = [{ title: rx }, { number: rx }, { clientName: rx }];
        }

        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
        const skip = (page - 1) * limit;

        const [total, rows] = await Promise.all([
          db.collection("rate_lists").countDocuments(filter),
          db
            .collection("rate_lists")
            .find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray(),
        ]);

        res.json({
          rateLists: rows.map((row) => publicRateListSummary(row)),
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit) || 0,
          },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/rate-lists/bulk-outreach",
    ...tenantRoute,
    requirePermission("rate_lists.send"),
    async (req, res, next) => {
      try {
        const rawIds = Array.isArray(req.body?.clientIds)
          ? req.body.clientIds
          : [];
        const clientIds = [
          ...new Set(rawIds.map(parsePositiveId).filter((id) => id != null)),
        ];
        if (!clientIds.length) {
          throw new AppError(
            400,
            "VALIDATION_ERROR",
            "Select at least one shop"
          );
        }
        if (clientIds.length > 300) {
          throw new AppError(
            400,
            "VALIDATION_ERROR",
            "Select at most 300 shops at a time"
          );
        }

        const [clients, lists] = await Promise.all([
          db
            .collection("clients")
            .find({ ...tenantScope(req), id: { $in: clientIds } })
            .toArray(),
          db
            .collection("rate_lists")
            .find({
              ...tenantScope(req),
              clientId: { $in: clientIds },
              status: { $ne: RATE_LIST_STATUSES.ARCHIVED },
            })
            .toArray(),
        ]);
        const clientById = new Map(clients.map((row) => [row.id, row]));
        const listsByClient = new Map();
        for (const list of lists) {
          const bucket = listsByClient.get(list.clientId) || [];
          bucket.push(list);
          listsByClient.set(list.clientId, bucket);
        }

        const skipped = [];
        const ready = [];
        for (const clientId of clientIds) {
          const client = clientById.get(clientId);
          if (!client) {
            skipped.push({
              clientId,
              name: null,
              phone: null,
              reason: "not_found",
            });
            continue;
          }
          const phone = String(client.phone || "").trim();
          if (!phone) {
            skipped.push({
              clientId,
              name: client.name || null,
              phone: null,
              reason: "no_phone",
            });
            continue;
          }
          const open = (listsByClient.get(clientId) || []).filter(
            (list) => Array.isArray(list.items) && list.items.length > 0
          );
          const picked = open.sort((a, b) => {
            const aTime = new Date(
              a.updatedAt || a.sentAt || a.createdAt || 0
            ).getTime();
            const bTime = new Date(
              b.updatedAt || b.sentAt || b.createdAt || 0
            ).getTime();
            return bTime - aTime;
          })[0];
          if (!picked) {
            skipped.push({
              clientId,
              name: client.name || null,
              phone,
              reason: "no_list",
            });
            continue;
          }
          const items = (picked.items || []).map((item) => ({
            productId: item.productId,
            productName: item.productName,
            unit: item.unit || "pcs",
            customPrice: toMoney(item.customPrice),
          }));
          const fingerprint = items
            .map((item) => `${item.productId}:${item.customPrice}`)
            .sort()
            .join("|");
          ready.push({
            clientId,
            name: client.name || null,
            phone,
            rateListId: picked.id,
            itemCount: items.length,
            items,
            fingerprint,
          });
        }

        const grouped = new Map();
        for (const row of ready) {
          const bucket = grouped.get(row.fingerprint) || [];
          bucket.push(row);
          grouped.set(row.fingerprint, bucket);
        }
        const groups = [...grouped.values()]
          .map((recipients) => ({
            kind: recipients.length >= 2 ? "shared" : "custom",
            fingerprint: recipients[0].fingerprint,
            itemCount: recipients[0].itemCount,
            items: recipients[0].items,
            recipients: recipients.map((row) => ({
              clientId: row.clientId,
              name: row.name,
              phone: row.phone,
              rateListId: row.rateListId,
            })),
          }))
          .sort((a, b) => {
            if (a.kind !== b.kind) return a.kind === "shared" ? -1 : 1;
            return b.recipients.length - a.recipients.length;
          });

        res.json({
          selected: clientIds.length,
          ready: ready.length,
          skipped,
          groups,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  app.get(
    "/clients/:clientId/rate-lists",
    ...tenantRoute,
    requirePermission("rate_lists.view"),
    async (req, res, next) => {
      try {
        const client = await assertClient(
          db,
          req.tenant.businessId,
          req.params.clientId
        );
        const paging = parseListPagination(req.query);
        const { rows, pagination } = await paginateFind(
          db.collection("rate_lists"),
          {
            ...tenantScope(req),
            clientId: client.id,
          },
          { ...paging, sort: { createdAt: -1 } }
        );
        res.json({
          clientId: client.id,
          clientName: client.name || null,
          rateLists: rows.map((row) => publicRateListSummary(row)),
          pagination,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  app.get(
    "/rate-lists/:id",
    ...tenantRoute,
    requirePermission("rate_lists.view"),
    async (req, res, next) => {
      try {
        const id = parsePositiveId(req.params.id);
        if (id == null) {
          throw new AppError(400, "VALIDATION_ERROR", "Invalid rate list id");
        }
        const list = await db.collection("rate_lists").findOne({
          id,
          ...tenantScope(req),
        });
        if (!list) {
          throw new AppError(404, "RATE_LIST_NOT_FOUND", "Rate list not found");
        }
        const purchases = await loadClientPurchaseStats(
          db,
          req.tenant.businessId,
          list.clientId
        );
        res.json(publicRateList(list, { purchases }));
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/rate-lists",
    ...tenantRoute,
    requirePermission("rate_lists.create"),
    async (req, res, next) => {
      try {
        const client = await assertClient(
          db,
          req.tenant.businessId,
          req.body.clientId
        );
        let items;
        try {
          items = await hydrateRateListItems(
            db,
            req.tenant.businessId,
            req.body.items
          );
        } catch (error) {
          throwApp(AppError, error);
        }

        const id = await nextTenantId(db, "rate_lists", req.tenant.businessId);
        const list = {
          id,
          businessId: req.tenant.businessId,
          clientId: client.id,
          clientName: client.name || null,
          number: `RL-${String(id).padStart(5, "0")}`,
          title: toOptionalString(req.body.title) || `Rate list for ${client.name}`,
          notes: toOptionalString(req.body.notes),
          status: RATE_LIST_STATUSES.DRAFT,
          items,
          itemCount: items.length,
          sentAt: null,
          sentBy: null,
          sendChannel: null,
          shareToken: null,
          expiresAt: null,
          createdBy: req.auth.user.id,
          updatedBy: req.auth.user.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await db.collection("rate_lists").insertOne(list);

        await writeAuditLog(db, {
          businessId: req.tenant.businessId,
          actorId: req.auth.user.id,
          actorName: actorDisplayName(req.auth.user),
          action: "RATE_LIST_CREATED",
          entity: "rate_list",
          entityId: list.id,
          newValues: {
            number: list.number,
            clientId: list.clientId,
            itemCount: list.itemCount,
            status: list.status,
          },
        });

        res.status(201).json(publicRateList(list));
      } catch (error) {
        next(error);
      }
    }
  );

  app.patch(
    "/rate-lists/:id",
    ...tenantRoute,
    requirePermission("rate_lists.update"),
    async (req, res, next) => {
      try {
        const id = parsePositiveId(req.params.id);
        if (id == null) {
          throw new AppError(400, "VALIDATION_ERROR", "Invalid rate list id");
        }
        const filter = { id, ...tenantScope(req) };
        const existing = await db.collection("rate_lists").findOne(filter);
        if (!existing) {
          throw new AppError(404, "RATE_LIST_NOT_FOUND", "Rate list not found");
        }
        assertDraft(existing, AppError);

        const updates = {
          updatedBy: req.auth.user.id,
          updatedAt: new Date(),
        };

        if (Object.prototype.hasOwnProperty.call(req.body, "title")) {
          updates.title = toOptionalString(req.body.title);
        }
        if (Object.prototype.hasOwnProperty.call(req.body, "notes")) {
          updates.notes = toOptionalString(req.body.notes);
        }
        if (Object.prototype.hasOwnProperty.call(req.body, "clientId")) {
          const client = await assertClient(
            db,
            req.tenant.businessId,
            req.body.clientId
          );
          updates.clientId = client.id;
          updates.clientName = client.name || null;
        }
        if (Object.prototype.hasOwnProperty.call(req.body, "items")) {
          try {
            updates.items = await hydrateRateListItems(
              db,
              req.tenant.businessId,
              req.body.items
            );
            updates.itemCount = updates.items.length;
          } catch (error) {
            throwApp(AppError, error);
          }
        }

        await db.collection("rate_lists").updateOne(filter, { $set: updates });
        const updated = await db.collection("rate_lists").findOne(filter);

        await writeAuditLog(db, {
          businessId: req.tenant.businessId,
          actorId: req.auth.user.id,
          actorName: actorDisplayName(req.auth.user),
          action: "RATE_LIST_UPDATED",
          entity: "rate_list",
          entityId: updated.id,
          oldValues: { itemCount: existing.itemCount, clientId: existing.clientId },
          newValues: { itemCount: updated.itemCount, clientId: updated.clientId },
        });

        res.json(publicRateList(updated));
      } catch (error) {
        next(error);
      }
    }
  );

  app.delete(
    "/rate-lists/:id",
    ...tenantRoute,
    requirePermission("rate_lists.delete"),
    async (req, res, next) => {
      try {
        const id = parsePositiveId(req.params.id);
        if (id == null) {
          throw new AppError(400, "VALIDATION_ERROR", "Invalid rate list id");
        }
        const filter = { id, ...tenantScope(req) };
        const existing = await db.collection("rate_lists").findOne(filter);
        if (!existing) {
          throw new AppError(404, "RATE_LIST_NOT_FOUND", "Rate list not found");
        }

        if (existing.status === RATE_LIST_STATUSES.DRAFT) {
          await db.collection("rate_lists").deleteOne(filter);
          await writeAuditLog(db, {
            businessId: req.tenant.businessId,
            actorId: req.auth.user.id,
            actorName: actorDisplayName(req.auth.user),
            action: "RATE_LIST_DELETED",
            entity: "rate_list",
            entityId: existing.id,
            oldValues: { number: existing.number, status: existing.status },
          });
          res.json({ message: "Rate list deleted", id: existing.id });
          return;
        }

        if (existing.status === RATE_LIST_STATUSES.ARCHIVED) {
          res.json({
            message: "Rate list already archived",
            id: existing.id,
            status: existing.status,
          });
          return;
        }

        await db.collection("rate_lists").updateOne(filter, {
          $set: {
            status: RATE_LIST_STATUSES.ARCHIVED,
            updatedBy: req.auth.user.id,
            updatedAt: new Date(),
          },
        });
        await writeAuditLog(db, {
          businessId: req.tenant.businessId,
          actorId: req.auth.user.id,
          actorName: actorDisplayName(req.auth.user),
          action: "RATE_LIST_ARCHIVED",
          entity: "rate_list",
          entityId: existing.id,
          oldValues: { status: existing.status },
          newValues: { status: RATE_LIST_STATUSES.ARCHIVED },
        });
        res.json({
          message: "Rate list archived",
          id: existing.id,
          status: RATE_LIST_STATUSES.ARCHIVED,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/rate-lists/:id/send",
    ...tenantRoute,
    requirePermission("rate_lists.send"),
    async (req, res, next) => {
      try {
        const id = parsePositiveId(req.params.id);
        if (id == null) {
          throw new AppError(400, "VALIDATION_ERROR", "Invalid rate list id");
        }
        const filter = { id, ...tenantScope(req) };
        const existing = await db.collection("rate_lists").findOne(filter);
        if (!existing) {
          throw new AppError(404, "RATE_LIST_NOT_FOUND", "Rate list not found");
        }
        if (existing.status === RATE_LIST_STATUSES.ARCHIVED) {
          throw new AppError(
            409,
            "RATE_LIST_NOT_SENDABLE",
            "Archived rate lists cannot be sent"
          );
        }
        if (!Array.isArray(existing.items) || existing.items.length === 0) {
          throw new AppError(
            400,
            "VALIDATION_ERROR",
            "Rate list has no products to send"
          );
        }

        let expiresAt = existing.expiresAt || null;
        if (Object.prototype.hasOwnProperty.call(req.body || {}, "expiresAt")) {
          expiresAt = parseExpiresAt(req.body.expiresAt);
        }

        const channelRaw = toOptionalString(req.body && req.body.channel);
        const sendChannel = channelRaw
          ? channelRaw.toLowerCase()
          : existing.sendChannel || "link";
        if (!SEND_CHANNELS.has(sendChannel)) {
          throw new AppError(
            400,
            "VALIDATION_ERROR",
            "channel must be link, whatsapp, or email"
          );
        }

        const rotateToken =
          existing.status === RATE_LIST_STATUSES.DRAFT ||
          req.body?.rotateToken === true;
        const shareToken =
          rotateToken || !existing.shareToken
            ? newShareToken()
            : existing.shareToken;

        const updates = {
          status: RATE_LIST_STATUSES.SENT,
          sentAt: new Date(),
          sentBy: req.auth.user.id,
          sendChannel,
          shareToken,
          expiresAt,
          updatedBy: req.auth.user.id,
          updatedAt: new Date(),
        };

        await db.collection("rate_lists").updateOne(filter, { $set: updates });
        const updated = await db.collection("rate_lists").findOne(filter);

        await writeAuditLog(db, {
          businessId: req.tenant.businessId,
          actorId: req.auth.user.id,
          actorName: actorDisplayName(req.auth.user),
          action:
            existing.status === RATE_LIST_STATUSES.DRAFT
              ? "RATE_LIST_SENT"
              : "RATE_LIST_RESENT",
          entity: "rate_list",
          entityId: updated.id,
          newValues: {
            number: updated.number,
            clientId: updated.clientId,
            sendChannel: updated.sendChannel,
          },
        });

        res.json(publicRateList(updated));
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/rate-lists/:id/duplicate",
    ...tenantRoute,
    requirePermission("rate_lists.create"),
    async (req, res, next) => {
      try {
        const id = parsePositiveId(req.params.id);
        if (id == null) {
          throw new AppError(400, "VALIDATION_ERROR", "Invalid rate list id");
        }
        const existing = await db.collection("rate_lists").findOne({
          id,
          ...tenantScope(req),
        });
        if (!existing) {
          throw new AppError(404, "RATE_LIST_NOT_FOUND", "Rate list not found");
        }

        const clientId = Object.prototype.hasOwnProperty.call(
          req.body || {},
          "clientId"
        )
          ? req.body.clientId
          : existing.clientId;
        const client = await assertClient(
          db,
          req.tenant.businessId,
          clientId
        );

        const sourceItems = (existing.items || []).map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          customPrice: item.customPrice,
        }));
        let items;
        try {
          items = await hydrateRateListItems(
            db,
            req.tenant.businessId,
            sourceItems
          );
        } catch (error) {
          throwApp(AppError, error);
        }

        const nextId = await nextTenantId(
          db,
          "rate_lists",
          req.tenant.businessId
        );
        const list = {
          id: nextId,
          businessId: req.tenant.businessId,
          clientId: client.id,
          clientName: client.name || null,
          number: `RL-${String(nextId).padStart(5, "0")}`,
          title:
            toOptionalString(req.body && req.body.title) ||
            (existing.title ? `${existing.title} (copy)` : `Rate list for ${client.name}`),
          notes: existing.notes || null,
          status: RATE_LIST_STATUSES.DRAFT,
          items,
          itemCount: items.length,
          sentAt: null,
          sentBy: null,
          sendChannel: null,
          shareToken: null,
          expiresAt: null,
          createdBy: req.auth.user.id,
          updatedBy: req.auth.user.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await db.collection("rate_lists").insertOne(list);
        await writeAuditLog(db, {
          businessId: req.tenant.businessId,
          actorId: req.auth.user.id,
          actorName: actorDisplayName(req.auth.user),
          action: "RATE_LIST_DUPLICATED",
          entity: "rate_list",
          entityId: list.id,
          meta: { sourceId: existing.id },
        });

        res.status(201).json(publicRateList(list));
      } catch (error) {
        next(error);
      }
    }
  );

  app.get("/public/rate-lists/:token", async (req, res, next) => {
    try {
      const list = await loadPublicSentRateList(db, req.params.token, AppError);
      const productsById = await loadProductsForRateList(db, list);
      res.json({ rateList: publicShareRateList(list, productsById) });
    } catch (error) {
      next(error);
    }
  });
}

module.exports = {
  RATE_LIST_STATUSES,
  registerRateListRoutes,
  loadPublicSentRateList,
  loadProductsForRateList,
  publicShareRateList,
  publicStoreFromRateList,
};
