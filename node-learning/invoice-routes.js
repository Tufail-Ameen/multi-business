/**
 * Invoice APIs expected by react-invoice-app:
 * GET    /invoices
 * GET    /invoices/:id
 * POST   /invoices
 * PATCH  /invoices/:id
 * PATCH  /invoices/:id/status
 * DELETE /invoices/:id
 */

const { nextTenantId, ensureBusinessSettings } = require("./database");
const { writeAuditLog, actorDisplayName } = require("./audit");
const { MOVEMENT_TYPES, applyMovement } = require("./stockService");

const INVOICE_STATUSES = Object.freeze({
  DRAFT: "draft",
  PENDING: "pending",
  PAID: "paid",
  CANCELLED: "cancelled",
});

const STATUS_SET = new Set(Object.values(INVOICE_STATUSES));

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

function publicInvoice(invoice) {
  if (!invoice) return invoice;
  return {
    id: invoice.id,
    businessId: invoice.businessId,
    number: invoice.number,
    clientId: invoice.clientId,
    clientName: invoice.clientName || invoice.clientSnapshot?.name || "",
    clientArea: invoice.clientArea || invoice.clientSnapshot?.area || "",
    clientPhone: invoice.clientPhone || invoice.clientSnapshot?.phone || "",
    clientEmail: invoice.clientEmail || invoice.clientSnapshot?.email || "",
    clientSnapshot: invoice.clientSnapshot || {},
    billFrom: invoice.billFrom || {},
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    description: invoice.description || "",
    currency: invoice.currency || "Rs",
    status: invoice.status,
    items: Array.isArray(invoice.items) ? invoice.items : [],
    subtotal: toMoney(invoice.subtotal),
    taxTotal: toMoney(invoice.taxTotal),
    total: toMoney(invoice.total),
    stockApplied: invoice.stockApplied === true,
    createdBy: invoice.createdBy || null,
    updatedBy: invoice.updatedBy || null,
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt,
  };
}

function isTransientMongoError(error) {
  if (!error) return false;
  if (error.code === 112 || error.codeName === "WriteConflict") return true;
  if (typeof error.hasErrorLabel === "function") {
    return (
      error.hasErrorLabel("TransientTransactionError") ||
      error.hasErrorLabel("UnknownTransactionCommitResult")
    );
  }
  return Boolean(
    error.errorLabelSet &&
      typeof error.errorLabelSet.has === "function" &&
      error.errorLabelSet.has("TransientTransactionError")
  );
}

function normalizeRouteError(AppError, error) {
  if (error instanceof AppError) return error;
  if (error && error.status && error.code) {
    return new AppError(
      error.status,
      error.code,
      error.message,
      error.details || {}
    );
  }
  if (isTransientMongoError(error)) {
    return new AppError(
      409,
      "SAVE_CONFLICT",
      "Invoice save conflict ho gaya. Dobara Save dabain."
    );
  }
  return error;
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

function billFromSnapshot(business, settings) {
  return {
    name: business.name || "",
    address: business.address || settings.address || "",
    city: business.city || settings.city || "",
    code: business.postalCode || business.code || settings.postalCode || "",
    country: business.country || settings.country || "",
    phone: business.phone || settings.phone || "",
  };
}

async function hydrateItems(db, businessId, rawItems, AppError, { session } = {}) {
  if (!Array.isArray(rawItems) || !rawItems.length) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "At least one invoice item is required"
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
        `${product.name} is archived and cannot be invoiced`
      );
    }

    const unitPrice = productUnitPrice(product);
    const lineTotal = calcLineTotal(quantity, unitPrice, tax);
    items.push({
      productId: product.id,
      name: product.name,
      quantity,
      unitPrice,
      tax,
      lineTotal,
    });
  }
  return items;
}

function totalsFromItems(items) {
  const subtotal = toMoney(
    items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  );
  const taxTotal = toMoney(
    items.reduce((sum, item) => sum + (item.lineTotal - item.quantity * item.unitPrice), 0)
  );
  const total = toMoney(items.reduce((sum, item) => sum + item.lineTotal, 0));
  return { subtotal, taxTotal, total };
}

function statusAppliesStock(status) {
  return status === INVOICE_STATUSES.PENDING || status === INVOICE_STATUSES.PAID;
}

function quantityByProduct(items) {
  const map = new Map();
  if (!Array.isArray(items)) return map;
  for (const item of items) {
    const productId = Number(item.productId);
    if (!Number.isFinite(productId)) continue;
    const quantity = Math.abs(Number(item.quantity) || 0);
    map.set(productId, (map.get(productId) || 0) + quantity);
  }
  return map;
}

function itemNameForProduct(items, productId) {
  const match = (items || []).find(
    (item) => Number(item.productId) === Number(productId)
  );
  return match?.name || null;
}

async function applyInvoiceStock(db, invoice, userId, { session } = {}) {
  const quantities = quantityByProduct(invoice.items);
  for (const [productId, quantity] of quantities) {
    if (!quantity) continue;
    await applyMovement(
      db,
      {
        businessId: invoice.businessId,
        productId,
        movementType: MOVEMENT_TYPES.SALE,
        quantity: -quantity,
        referenceType: "invoice",
        referenceId: invoice.id,
        reason: `Invoice ${invoice.number}`,
        createdBy: userId,
        productName: itemNameForProduct(invoice.items, productId),
      },
      { session }
    );
  }
}

async function reverseInvoiceStock(db, invoice, userId, { session } = {}) {
  const quantities = quantityByProduct(invoice.items);
  for (const [productId, quantity] of quantities) {
    if (!quantity) continue;
    await applyMovement(
      db,
      {
        businessId: invoice.businessId,
        productId,
        movementType: MOVEMENT_TYPES.SALE_RETURN,
        quantity,
        referenceType: "invoice",
        referenceId: invoice.id,
        reason: `Invoice ${invoice.number} reversed`,
        createdBy: userId,
        productName: itemNameForProduct(invoice.items, productId),
        allowNegativeOverride: true,
      },
      { session }
    );
  }
}

async function syncInvoiceStock(db, existing, nextItems, userId, { session } = {}) {
  const before = quantityByProduct(existing.items);
  const after = quantityByProduct(nextItems);
  const productIds = new Set([...before.keys(), ...after.keys()]);

  for (const productId of productIds) {
    const delta = (after.get(productId) || 0) - (before.get(productId) || 0);
    if (!delta) continue;

    const productName =
      itemNameForProduct(nextItems, productId) ||
      itemNameForProduct(existing.items, productId);

    if (delta > 0) {
      await applyMovement(
        db,
        {
          businessId: existing.businessId,
          productId,
          movementType: MOVEMENT_TYPES.SALE,
          quantity: -delta,
          referenceType: "invoice",
          referenceId: existing.id,
          reason: `Invoice ${existing.number}`,
          createdBy: userId,
          productName,
        },
        { session }
      );
    } else {
      await applyMovement(
        db,
        {
          businessId: existing.businessId,
          productId,
          movementType: MOVEMENT_TYPES.SALE_RETURN,
          quantity: -delta,
          referenceType: "invoice",
          referenceId: existing.id,
          reason: `Invoice ${existing.number} adjusted`,
          createdBy: userId,
          productName,
          allowNegativeOverride: true,
        },
        { session }
      );
    }
  }
}

async function withOptionalTransaction(mongoClient, work) {
  if (!mongoClient) return work(undefined);

  const session = mongoClient.startSession();
  try {
    let result;
    try {
      await session.withTransaction(async () => {
        result = await work(session);
      });
    } catch (error) {
      const message = String(error && error.message ? error.message : error);
      if (
        message.includes("Transaction numbers are only allowed") ||
        message.includes("replica set") ||
        error.code === 20
      ) {
        result = await work(undefined);
      } else {
        throw error;
      }
    }
    return result;
  } finally {
    await session.endSession();
  }
}

function allowedStatusTransition(from, to) {
  if (from === to) return true;
  if (from === INVOICE_STATUSES.DRAFT) {
    return (
      to === INVOICE_STATUSES.PENDING ||
      to === INVOICE_STATUSES.PAID ||
      to === INVOICE_STATUSES.CANCELLED
    );
  }
  if (from === INVOICE_STATUSES.PENDING) {
    return to === INVOICE_STATUSES.PAID || to === INVOICE_STATUSES.CANCELLED;
  }
  return false;
}

function registerInvoiceRoutes({
  app,
  db,
  mongoClient,
  AppError,
  tenantRoute,
  requirePermission,
  tenantScope,
}) {
  app.get(
    "/invoices",
    ...tenantRoute,
    requirePermission("invoices.view"),
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

        const page = Math.max(1, Number(req.query.page) || 1);
        const perPage = Math.min(
          100,
          Math.max(1, Number(req.query.per_page || req.query.limit) || 50)
        );
        const skip = (page - 1) * perPage;

        const [total, rows] = await Promise.all([
          db.collection("invoices").countDocuments(filter),
          db
            .collection("invoices")
            .find(filter)
            .sort({ id: -1 })
            .skip(skip)
            .limit(perPage)
            .toArray(),
        ]);

        res.json({
          invoices: rows.map(publicInvoice),
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
    "/invoices/:id",
    ...tenantRoute,
    requirePermission("invoices.view"),
    async (req, res, next) => {
      try {
        const invoice = await db.collection("invoices").findOne({
          id: Number(req.params.id),
          ...tenantScope(req),
        });
        if (!invoice) {
          throw new AppError(404, "INVOICE_NOT_FOUND", "Invoice not found");
        }
        res.json({ invoice: publicInvoice(invoice) });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/invoices",
    ...tenantRoute,
    requirePermission("invoices.create"),
    async (req, res, next) => {
      try {
        const businessId = req.tenant.businessId;
        const clientId = req.body.clientId;
        if (clientId == null || clientId === "") {
          throw new AppError(400, "VALIDATION_ERROR", "clientId is required");
        }

        const issueDate = toOptionalString(req.body.issueDate);
        const dueDate = toOptionalString(req.body.dueDate);
        if (!issueDate || !dueDate) {
          throw new AppError(
            400,
            "VALIDATION_ERROR",
            "issueDate and dueDate are required"
          );
        }

        let status = toOptionalString(req.body.status) || INVOICE_STATUSES.DRAFT;
        if (!STATUS_SET.has(status) || status === INVOICE_STATUSES.CANCELLED) {
          throw new AppError(400, "VALIDATION_ERROR", "Invalid status");
        }

        const invoice = await withOptionalTransaction(mongoClient, async (session) => {
          const client = await findClient(db, businessId, clientId, { session });
          if (!client) {
            throw new AppError(404, "CLIENT_NOT_FOUND", "Client not found");
          }

          const items = await hydrateItems(db, businessId, req.body.items, AppError, {
            session,
          });
          const { subtotal, taxTotal, total } = totalsFromItems(items);
          const settings = await ensureBusinessSettings(db, businessId, { session });
          const id = await nextTenantId(db, "invoices", businessId, { session });
          const prefix = settings.invoicePrefix || "INV-";
          const snap = clientSnapshot(client);

          const doc = {
            id,
            businessId,
            number: `${prefix}${id}`,
            clientId: client.id,
            clientName: snap.name,
            clientArea: snap.area,
            clientPhone: snap.phone,
            clientEmail: snap.email,
            clientSnapshot: snap,
            billFrom: billFromSnapshot(req.tenant.business, settings),
            issueDate,
            dueDate,
            description: toOptionalString(req.body.description) || "",
            currency: toOptionalString(req.body.currency) || settings.currency || "Rs",
            status,
            items,
            subtotal,
            taxTotal,
            total,
            stockApplied: false,
            createdBy: req.auth.user.id,
            updatedBy: req.auth.user.id,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          if (statusAppliesStock(status)) {
            await applyInvoiceStock(db, doc, req.auth.user.id, { session });
            doc.stockApplied = true;
          }

          await db.collection("invoices").insertOne(doc, session ? { session } : undefined);
          return doc;
        });

        await writeAuditLog(db, {
          businessId,
          actorId: req.auth.user.id,
          actorName: actorDisplayName(req.auth.user),
          action: "INVOICE_CREATED",
          entity: "invoice",
          entityId: invoice.id,
          newValues: {
            number: invoice.number,
            status: invoice.status,
            total: invoice.total,
          },
        });

        res.status(201).json({ invoice: publicInvoice(invoice) });
      } catch (error) {
        next(normalizeRouteError(AppError, error));
      }
    }
  );

  app.patch(
    "/invoices/:id/status",
    ...tenantRoute,
    requirePermission("invoices.change_status"),
    async (req, res, next) => {
      try {
        const filter = {
          id: Number(req.params.id),
          ...tenantScope(req),
        };
        const status = toOptionalString(req.body.status);
        if (!status || !STATUS_SET.has(status)) {
          throw new AppError(400, "VALIDATION_ERROR", "Invalid status");
        }

        const updated = await withOptionalTransaction(mongoClient, async (session) => {
          const existing = await db.collection("invoices").findOne(filter, { session });
          if (!existing) {
            throw new AppError(404, "INVOICE_NOT_FOUND", "Invoice not found");
          }
          if (!allowedStatusTransition(existing.status, status)) {
            throw new AppError(
              409,
              "INVALID_STATE",
              `Cannot change invoice from ${existing.status} to ${status}`
            );
          }
          if (existing.status === status) {
            return existing;
          }

          const changes = {
            status,
            updatedBy: req.auth.user.id,
            updatedAt: new Date(),
          };

          if (statusAppliesStock(status) && existing.stockApplied !== true) {
            await applyInvoiceStock(db, existing, req.auth.user.id, { session });
            changes.stockApplied = true;
          }

          if (status === INVOICE_STATUSES.CANCELLED && existing.stockApplied === true) {
            await reverseInvoiceStock(db, existing, req.auth.user.id, { session });
            changes.stockApplied = false;
          }

          await db.collection("invoices").updateOne(
            filter,
            { $set: changes },
            session ? { session } : undefined
          );
          return db.collection("invoices").findOne(filter, { session });
        });

        await writeAuditLog(db, {
          businessId: req.tenant.businessId,
          actorId: req.auth.user.id,
          actorName: actorDisplayName(req.auth.user),
          action: "INVOICE_STATUS_CHANGED",
          entity: "invoice",
          entityId: updated.id,
          newValues: { status: updated.status },
        });

        res.json({ invoice: publicInvoice(updated) });
      } catch (error) {
        next(normalizeRouteError(AppError, error));
      }
    }
  );

  app.patch(
    "/invoices/:id",
    ...tenantRoute,
    requirePermission("invoices.update"),
    async (req, res, next) => {
      try {
        const filter = {
          id: Number(req.params.id),
          ...tenantScope(req),
        };
        const updated = await withOptionalTransaction(mongoClient, async (session) => {
          const existing = await db.collection("invoices").findOne(filter, { session });
          if (!existing) {
            throw new AppError(404, "INVOICE_NOT_FOUND", "Invoice not found");
          }
          if (existing.status === INVOICE_STATUSES.PAID) {
            throw new AppError(
              409,
              "INVOICE_NOT_EDITABLE",
              "Paid invoices cannot be edited"
            );
          }

          const updates = {
            updatedBy: req.auth.user.id,
            updatedAt: new Date(),
          };

          if (Object.prototype.hasOwnProperty.call(req.body, "clientId")) {
            const client = await findClient(
              db,
              req.tenant.businessId,
              req.body.clientId,
              { session }
            );
            if (!client) {
              throw new AppError(404, "CLIENT_NOT_FOUND", "Client not found");
            }
            const snap = clientSnapshot(client);
            updates.clientId = client.id;
            updates.clientName = snap.name;
            updates.clientArea = snap.area;
            updates.clientPhone = snap.phone;
            updates.clientEmail = snap.email;
            updates.clientSnapshot = snap;
          }

          if (Object.prototype.hasOwnProperty.call(req.body, "issueDate")) {
            const issueDate = toOptionalString(req.body.issueDate);
            if (!issueDate) {
              throw new AppError(400, "VALIDATION_ERROR", "issueDate is required");
            }
            updates.issueDate = issueDate;
          }

          if (Object.prototype.hasOwnProperty.call(req.body, "dueDate")) {
            const dueDate = toOptionalString(req.body.dueDate);
            if (!dueDate) {
              throw new AppError(400, "VALIDATION_ERROR", "dueDate is required");
            }
            updates.dueDate = dueDate;
          }

          if (Object.prototype.hasOwnProperty.call(req.body, "description")) {
            updates.description = toOptionalString(req.body.description) || "";
          }

          if (Object.prototype.hasOwnProperty.call(req.body, "currency")) {
            updates.currency = toOptionalString(req.body.currency) || existing.currency;
          }

          if (Object.prototype.hasOwnProperty.call(req.body, "items")) {
            const items = await hydrateItems(
              db,
              req.tenant.businessId,
              req.body.items,
              AppError,
              { session }
            );
            const totals = totalsFromItems(items);
            updates.items = items;
            updates.subtotal = totals.subtotal;
            updates.taxTotal = totals.taxTotal;
            updates.total = totals.total;

            if (existing.stockApplied === true) {
              await syncInvoiceStock(
                db,
                existing,
                items,
                req.auth.user.id,
                { session }
              );
              updates.stockApplied = true;
            }
          }

          await db.collection("invoices").updateOne(
            filter,
            { $set: updates },
            session ? { session } : undefined
          );
          return db.collection("invoices").findOne(filter, { session });
        });

        await writeAuditLog(db, {
          businessId: req.tenant.businessId,
          actorId: req.auth.user.id,
          actorName: actorDisplayName(req.auth.user),
          action: "INVOICE_UPDATED",
          entity: "invoice",
          entityId: updated.id,
        });

        res.json({ invoice: publicInvoice(updated) });
      } catch (error) {
        next(normalizeRouteError(AppError, error));
      }
    }
  );

  app.delete(
    "/invoices/:id",
    ...tenantRoute,
    requirePermission("invoices.delete"),
    async (req, res, next) => {
      try {
        const filter = {
          id: Number(req.params.id),
          ...tenantScope(req),
        };

        await withOptionalTransaction(mongoClient, async (session) => {
          const existing = await db.collection("invoices").findOne(filter, { session });
          if (!existing) {
            throw new AppError(404, "INVOICE_NOT_FOUND", "Invoice not found");
          }
          if (existing.status === INVOICE_STATUSES.PAID) {
            throw new AppError(
              409,
              "INVOICE_NOT_DELETABLE",
              "Paid invoices cannot be deleted"
            );
          }
          if (existing.stockApplied === true) {
            await reverseInvoiceStock(db, existing, req.auth.user.id, { session });
          }
          const result = await db
            .collection("invoices")
            .deleteOne(filter, session ? { session } : undefined);
          if (!result.deletedCount) {
            throw new AppError(404, "INVOICE_NOT_FOUND", "Invoice not found");
          }
        });

        await writeAuditLog(db, {
          businessId: req.tenant.businessId,
          actorId: req.auth.user.id,
          actorName: actorDisplayName(req.auth.user),
          action: "INVOICE_DELETED",
          entity: "invoice",
          entityId: Number(req.params.id),
        });

        res.json({ message: "Invoice deleted", id: Number(req.params.id) });
      } catch (error) {
        next(normalizeRouteError(AppError, error));
      }
    }
  );
}

module.exports = {
  registerInvoiceRoutes,
  publicInvoice,
  INVOICE_STATUSES,
};
