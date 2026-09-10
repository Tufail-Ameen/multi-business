/**
 * Phase 3 — Suppliers, Purchases, Supplier Payments & Ledger.
 */

const { nextTenantId } = require("./database");
const { writeAuditLog, actorDisplayName } = require("./audit");
const { MOVEMENT_TYPES, applyMovement } = require("./stockService");
const {
  ENTRY_TYPES,
  getOutstandingBalance,
  getSupplierFinancialSummary,
  appendLedgerEntry,
} = require("./supplierLedgerService");

const SUPPLIER_STATUSES = Object.freeze({
  ACTIVE: "ACTIVE",
  ARCHIVED: "ARCHIVED",
});

const PURCHASE_STATUSES = Object.freeze({
  DRAFT: "DRAFT",
  CONFIRMED: "CONFIRMED",
  CANCELLED: "CANCELLED",
});

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

function normalizeSupplierStatus(value, fallback = SUPPLIER_STATUSES.ACTIVE) {
  const s = String(value || fallback).trim().toUpperCase();
  if (s === "ARCHIVED" || s === "INACTIVE") return SUPPLIER_STATUSES.ARCHIVED;
  return SUPPLIER_STATUSES.ACTIVE;
}

function publicSupplier(supplier, extras = {}) {
  if (!supplier) return supplier;
  return {
    id: supplier.id,
    businessId: supplier.businessId,
    name: supplier.name,
    companyName: supplier.companyName || null,
    phone: supplier.phone || null,
    email: supplier.email || null,
    address: supplier.address || null,
    city: supplier.city || null,
    taxNumber: supplier.taxNumber || null,
    notes: supplier.notes || null,
    status: supplier.status || SUPPLIER_STATUSES.ACTIVE,
    currentBalance: toMoney(supplier.currentBalance || 0),
    openingBalance: toMoney(supplier.openingBalance || 0),
    createdBy: supplier.createdBy || null,
    updatedBy: supplier.updatedBy || null,
    createdAt: supplier.createdAt,
    updatedAt: supplier.updatedAt,
    ...extras,
  };
}

function publicPurchase(purchase) {
  if (!purchase) return purchase;
  return {
    id: purchase.id,
    businessId: purchase.businessId,
    supplierId: purchase.supplierId,
    supplierName: purchase.supplierName || null,
    purchaseNumber: purchase.purchaseNumber,
    purchaseDate: purchase.purchaseDate,
    items: Array.isArray(purchase.items) ? purchase.items : [],
    subtotal: toMoney(purchase.subtotal),
    discount: toMoney(purchase.discount),
    tax: toMoney(purchase.tax),
    grandTotal: toMoney(purchase.grandTotal),
    paidAmount: toMoney(purchase.paidAmount || 0),
    remainingAmount: toMoney(purchase.remainingAmount ?? purchase.grandTotal),
    status: purchase.status,
    notes: purchase.notes || null,
    stockApplied: purchase.stockApplied === true,
    createdBy: purchase.createdBy || null,
    updatedBy: purchase.updatedBy || null,
    confirmedBy: purchase.confirmedBy || null,
    confirmedAt: purchase.confirmedAt || null,
    cancelledBy: purchase.cancelledBy || null,
    cancelledAt: purchase.cancelledAt || null,
    createdAt: purchase.createdAt,
    updatedAt: purchase.updatedAt,
  };
}

function publicLedgerEntry(entry) {
  return {
    id: entry.id,
    businessId: entry.businessId,
    supplierId: entry.supplierId,
    entryType: entry.entryType,
    referenceType: entry.referenceType || null,
    referenceId: entry.referenceId || null,
    debit: toMoney(entry.debit),
    credit: toMoney(entry.credit),
    amount: toMoney(entry.amount),
    balanceAfter: toMoney(entry.balanceAfter),
    description: entry.description || null,
    createdBy: entry.createdBy || null,
    createdAt: entry.createdAt,
  };
}

function publicPayment(payment) {
  return {
    id: payment.id,
    businessId: payment.businessId,
    supplierId: payment.supplierId,
    amount: toMoney(payment.amount),
    paymentDate: payment.paymentDate,
    paymentMethod: payment.paymentMethod || null,
    reference: payment.reference || null,
    notes: payment.notes || null,
    ledgerEntryId: payment.ledgerEntryId || null,
    createdBy: payment.createdBy || null,
    createdAt: payment.createdAt,
  };
}

/**
 * Server-side line + document totals. Never trust client totals.
 */
function calculatePurchaseTotals(rawItems, headerDiscount = 0, headerTax = 0) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    const err = new Error("Purchase requires at least one line item");
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const items = [];
  let linesSubtotal = 0;
  let linesDiscount = 0;
  let linesTax = 0;

  for (const raw of rawItems) {
    const productId = toOptionalNumber(raw.productId);
    const variantId = toOptionalNumber(raw.variantId);
    const quantity = toOptionalNumber(raw.quantity);
    const unitCost = toOptionalNumber(raw.unitCost ?? raw.unitPrice);
    const discount = toMoney(raw.discount || 0);
    const tax = toMoney(raw.tax || 0);

    if (productId == null) {
      const err = new Error("Each line requires productId");
      err.status = 400;
      err.code = "VALIDATION_ERROR";
      throw err;
    }
    if (quantity == null || quantity <= 0) {
      const err = new Error("Line quantity must be greater than 0");
      err.status = 400;
      err.code = "VALIDATION_ERROR";
      throw err;
    }
    if (unitCost == null || unitCost < 0) {
      const err = new Error("Line unitCost must be >= 0");
      err.status = 400;
      err.code = "VALIDATION_ERROR";
      throw err;
    }
    if (discount < 0 || tax < 0) {
      const err = new Error("Line discount/tax cannot be negative");
      err.status = 400;
      err.code = "VALIDATION_ERROR";
      throw err;
    }

    const gross = toMoney(quantity * unitCost);
    const lineTotal = toMoney(gross - discount + tax);
    if (lineTotal < 0) {
      const err = new Error("Line total cannot be negative");
      err.status = 400;
      err.code = "VALIDATION_ERROR";
      throw err;
    }

    linesSubtotal = toMoney(linesSubtotal + gross);
    linesDiscount = toMoney(linesDiscount + discount);
    linesTax = toMoney(linesTax + tax);

    items.push({
      productId,
      variantId,
      productNameSnapshot: toOptionalString(raw.productNameSnapshot) || null,
      skuSnapshot: toOptionalString(raw.skuSnapshot) || null,
      quantity,
      unitCost: toMoney(unitCost),
      discount,
      tax,
      lineTotal,
    });
  }

  const docDiscount = toMoney(headerDiscount || 0);
  const docTax = toMoney(headerTax || 0);
  if (docDiscount < 0 || docTax < 0) {
    const err = new Error("Document discount/tax cannot be negative");
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const discount = toMoney(linesDiscount + docDiscount);
  const tax = toMoney(linesTax + docTax);
  const subtotal = linesSubtotal;
  const grandTotal = toMoney(subtotal - discount + tax);
  if (grandTotal < 0) {
    const err = new Error("Grand total cannot be negative");
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  return { items, subtotal, discount, tax, grandTotal };
}

async function hydratePurchaseItems(db, businessId, items, { session } = {}) {
  const hydrated = [];
  for (const item of items) {
    const product = await db.collection("products").findOne(
      { businessId, id: Number(item.productId) },
      { session }
    );
    if (!product) {
      const err = new Error(`Product ${item.productId} not found in this business`);
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
    if (item.variantId != null) {
      variant = await db.collection("product_variants").findOne(
        {
          businessId,
          productId: product.id,
          id: Number(item.variantId),
        },
        { session }
      );
      if (!variant) {
        const err = new Error(
          `Variant ${item.variantId} not found for product ${product.id}`
        );
        err.status = 400;
        err.code = "INVALID_VARIANT";
        throw err;
      }
    }

    hydrated.push({
      ...item,
      productNameSnapshot: product.name,
      skuSnapshot: (variant && variant.sku) || product.sku || null,
    });
  }
  return hydrated;
}

async function assertActiveSupplier(db, businessId, supplierId, { session } = {}) {
  const supplier = await db.collection("suppliers").findOne(
    { businessId, id: Number(supplierId) },
    { session }
  );
  if (!supplier) {
    const err = new Error("Vendor not found");
    err.status = 404;
    err.code = "SUPPLIER_NOT_FOUND";
    throw err;
  }
  if (supplier.status === SUPPLIER_STATUSES.ARCHIVED) {
    const err = new Error("Vendor is archived");
    err.status = 409;
    err.code = "SUPPLIER_ARCHIVED";
    throw err;
  }
  return supplier;
}

async function nextPurchaseNumber(db, businessId, { session } = {}) {
  const last = await db
    .collection("purchases")
    .find({ businessId })
    .sort({ id: -1 })
    .limit(1)
    .toArray();
  const nextSeq = last.length ? Number(last[0].id) + 1 : 1;
  return `PO-${String(nextSeq).padStart(5, "0")}`;
}

async function confirmPurchaseInSession(
  db,
  {
    businessId,
    purchaseId,
    userId,
    AppError,
  },
  { session }
) {
  const purchase = await db.collection("purchases").findOne(
    { businessId, id: Number(purchaseId) },
    { session }
  );
  if (!purchase) {
    throw new AppError(404, "PURCHASE_NOT_FOUND", "Purchase not found");
  }
  if (purchase.status !== PURCHASE_STATUSES.DRAFT) {
    throw new AppError(
      409,
      "INVALID_STATE",
      `Only DRAFT purchases can be confirmed (current: ${purchase.status})`
    );
  }
  if (purchase.stockApplied === true) {
    throw new AppError(
      409,
      "ALREADY_CONFIRMED",
      "Purchase stock/payable already applied"
    );
  }

  const supplier = await assertActiveSupplier(db, businessId, purchase.supplierId, {
    session,
  });

  const hydratedItems = await hydratePurchaseItems(
    db,
    businessId,
    purchase.items,
    { session }
  );

  const lineDiscountSum = hydratedItems.reduce(
    (sum, item) => sum + toMoney(item.discount || 0),
    0
  );
  const lineTaxSum = hydratedItems.reduce(
    (sum, item) => sum + toMoney(item.tax || 0),
    0
  );
  const headerDiscount = Math.max(
    0,
    toMoney(purchase.discount || 0) - toMoney(lineDiscountSum)
  );
  const headerTax = Math.max(
    0,
    toMoney(purchase.tax || 0) - toMoney(lineTaxSum)
  );

  const recalculated = calculatePurchaseTotals(
    hydratedItems,
    headerDiscount,
    headerTax
  );

  const finalItems = recalculated.items;
  const grandTotal = recalculated.grandTotal;

  const movements = [];
  for (const item of finalItems) {
    const result = await applyMovement(
      db,
      {
        businessId,
        productId: item.productId,
        variantId: item.variantId,
        movementType: MOVEMENT_TYPES.PURCHASE,
        quantity: item.quantity,
        referenceType: "purchase",
        referenceId: purchase.id,
        reason: `Purchase ${purchase.purchaseNumber}`,
        unitCost: item.unitCost,
        createdBy: userId,
        productName: item.productNameSnapshot,
      },
      { session }
    );
    movements.push(result.movement);

    await db.collection("supplier_price_history").insertOne(
      {
        id: await nextTenantId(db, "supplier_price_history", businessId, {
          session,
        }),
        businessId,
        supplierId: supplier.id,
        productId: item.productId,
        variantId: item.variantId,
        unitPrice: item.unitCost,
        purchasedAt: purchase.purchaseDate || new Date(),
        purchaseId: purchase.id,
        createdAt: new Date(),
      },
      { session }
    );
  }

  const { entry: ledgerEntry } = await appendLedgerEntry(
    db,
    {
      businessId,
      supplierId: supplier.id,
      entryType: ENTRY_TYPES.PURCHASE,
      referenceType: "purchase",
      referenceId: purchase.id,
      debit: 0,
      credit: grandTotal,
      description: `Purchase ${purchase.purchaseNumber}`,
      createdBy: userId,
    },
    { session }
  );

  const confirmedAt = new Date();
  await db.collection("purchases").updateOne(
    { businessId, id: purchase.id },
    {
      $set: {
        items: finalItems,
        subtotal: recalculated.subtotal,
        discount: recalculated.discount,
        tax: recalculated.tax,
        grandTotal,
        paidAmount: toMoney(purchase.paidAmount || 0),
        remainingAmount: toMoney(grandTotal - toMoney(purchase.paidAmount || 0)),
        status: PURCHASE_STATUSES.CONFIRMED,
        stockApplied: true,
        confirmedBy: userId,
        confirmedAt,
        supplierName: supplier.name,
        updatedBy: userId,
        updatedAt: confirmedAt,
      },
    },
    { session }
  );

  const updated = await db.collection("purchases").findOne(
    { businessId, id: purchase.id },
    { session }
  );

  return { purchase: updated, movements, ledgerEntry, supplier };
}

function registerPurchaseRoutes({
  app,
  db,
  mongoClient,
  AppError,
  tenantRoute,
  requirePermission,
  tenantScope,
}) {
  // ---------- Suppliers ----------

  app.get(
    "/suppliers",
    ...tenantRoute,
    requirePermission("suppliers.view"),
    async (req, res, next) => {
      try {
        const filter = { ...tenantScope(req) };
        const status = toOptionalString(req.query.status);
        if (status) filter.status = normalizeSupplierStatus(status);
        const q = toOptionalString(req.query.q);
        if (q) {
          const rx = { $regex: escapeRegex(q), $options: "i" };
          filter.$or = [
            { name: rx },
            { companyName: rx },
            { phone: rx },
            { email: rx },
          ];
        }

        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
        const skip = (page - 1) * limit;

        const [total, rows] = await Promise.all([
          db.collection("suppliers").countDocuments(filter),
          db
            .collection("suppliers")
            .find(filter)
            .sort({ name: 1 })
            .skip(skip)
            .limit(limit)
            .toArray(),
        ]);

        res.json({
          suppliers: rows.map((s) => publicSupplier(s)),
          pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  app.get(
    "/suppliers/:id",
    ...tenantRoute,
    requirePermission("suppliers.view"),
    async (req, res, next) => {
      try {
        const supplier = await db.collection("suppliers").findOne({
          id: Number(req.params.id),
          ...tenantScope(req),
        });
        if (!supplier) {
          throw new AppError(404, "SUPPLIER_NOT_FOUND", "Vendor not found");
        }
        const summary = await getSupplierFinancialSummary(db, {
          businessId: req.tenant.businessId,
          supplierId: supplier.id,
        });
        res.json(
          publicSupplier(supplier, {
            totalPurchases: summary.totalPurchases,
            totalPaid: summary.totalPaid,
            outstandingPayable: summary.outstandingPayable,
          })
        );
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/suppliers",
    ...tenantRoute,
    requirePermission("suppliers.create"),
    async (req, res, next) => {
      try {
        const name = toOptionalString(req.body.name);
        if (!name) {
          throw new AppError(400, "VALIDATION_ERROR", "name is required");
        }

        const supplier = {
          id: await nextTenantId(db, "suppliers", req.tenant.businessId),
          businessId: req.tenant.businessId,
          name,
          companyName: toOptionalString(req.body.companyName),
          phone: toOptionalString(req.body.phone),
          email: toOptionalString(req.body.email),
          address: toOptionalString(req.body.address),
          city: toOptionalString(req.body.city),
          taxNumber: toOptionalString(req.body.taxNumber),
          notes: toOptionalString(req.body.notes),
          status: normalizeSupplierStatus(req.body.status),
          openingBalance: 0,
          currentBalance: 0,
          createdBy: req.auth.user.id,
          updatedBy: req.auth.user.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await db.collection("suppliers").insertOne(supplier);

        await writeAuditLog(db, {
          businessId: req.tenant.businessId,
          actorId: req.auth.user.id,
          actorName: actorDisplayName(req.auth.user),
          action: "SUPPLIER_CREATED",
          entity: "supplier",
          entityId: supplier.id,
          newValues: { name: supplier.name, status: supplier.status },
        });

        res.status(201).json(publicSupplier(supplier));
      } catch (error) {
        next(error);
      }
    }
  );

  app.patch(
    "/suppliers/:id",
    ...tenantRoute,
    requirePermission("suppliers.update"),
    async (req, res, next) => {
      try {
        const filter = {
          id: Number(req.params.id),
          ...tenantScope(req),
        };
        const existing = await db.collection("suppliers").findOne(filter);
        if (!existing) {
          throw new AppError(404, "SUPPLIER_NOT_FOUND", "Vendor not found");
        }

        const updates = { updatedBy: req.auth.user.id, updatedAt: new Date() };
        for (const key of [
          "name",
          "companyName",
          "phone",
          "email",
          "address",
          "city",
          "taxNumber",
          "notes",
        ]) {
          if (Object.prototype.hasOwnProperty.call(req.body, key)) {
            updates[key] =
              key === "name"
                ? toOptionalString(req.body[key]) || existing.name
                : toOptionalString(req.body[key]);
          }
        }
        if (Object.prototype.hasOwnProperty.call(req.body, "status")) {
          updates.status = normalizeSupplierStatus(req.body.status);
        }

        await db.collection("suppliers").updateOne(filter, { $set: updates });
        const updated = await db.collection("suppliers").findOne(filter);

        await writeAuditLog(db, {
          businessId: req.tenant.businessId,
          actorId: req.auth.user.id,
          actorName: actorDisplayName(req.auth.user),
          action: "SUPPLIER_UPDATED",
          entity: "supplier",
          entityId: updated.id,
          oldValues: { name: existing.name, status: existing.status },
          newValues: { name: updated.name, status: updated.status },
        });

        res.json(publicSupplier(updated));
      } catch (error) {
        next(error);
      }
    }
  );

  app.delete(
    "/suppliers/:id",
    ...tenantRoute,
    requirePermission("suppliers.delete"),
    async (req, res, next) => {
      try {
        const filter = {
          id: Number(req.params.id),
          ...tenantScope(req),
        };
        const existing = await db.collection("suppliers").findOne(filter);
        if (!existing) {
          throw new AppError(404, "SUPPLIER_NOT_FOUND", "Vendor not found");
        }

        const purchaseCount = await db.collection("purchases").countDocuments({
          businessId: req.tenant.businessId,
          supplierId: existing.id,
        });
        const ledgerCount = await db
          .collection("supplier_ledger_entries")
          .countDocuments({
            businessId: req.tenant.businessId,
            supplierId: existing.id,
          });

        if (purchaseCount > 0 || ledgerCount > 0) {
          await db.collection("suppliers").updateOne(filter, {
            $set: {
              status: SUPPLIER_STATUSES.ARCHIVED,
              updatedBy: req.auth.user.id,
              updatedAt: new Date(),
            },
          });
          const archived = await db.collection("suppliers").findOne(filter);

          await writeAuditLog(db, {
            businessId: req.tenant.businessId,
            actorId: req.auth.user.id,
            actorName: actorDisplayName(req.auth.user),
            action: "SUPPLIER_ARCHIVED",
            entity: "supplier",
            entityId: archived.id,
            oldValues: { status: existing.status },
            newValues: { status: SUPPLIER_STATUSES.ARCHIVED },
            meta: { reason: "has_purchase_or_ledger_history" },
          });

          res.json(publicSupplier(archived));
          return;
        }

        await db.collection("suppliers").deleteOne(filter);

        await writeAuditLog(db, {
          businessId: req.tenant.businessId,
          actorId: req.auth.user.id,
          actorName: actorDisplayName(req.auth.user),
          action: "SUPPLIER_ARCHIVED",
          entity: "supplier",
          entityId: existing.id,
          oldValues: { status: existing.status },
          newValues: { deleted: true },
          meta: { hardDelete: true },
        });

        res.json({ message: "Vendor deleted", id: existing.id });
      } catch (error) {
        next(error);
      }
    }
  );

  // ---------- Supplier ledger & payments ----------

  app.get(
    "/suppliers/:id/ledger",
    ...tenantRoute,
    requirePermission("supplier_ledger.view"),
    async (req, res, next) => {
      try {
        const supplier = await db.collection("suppliers").findOne({
          id: Number(req.params.id),
          ...tenantScope(req),
        });
        if (!supplier) {
          throw new AppError(404, "SUPPLIER_NOT_FOUND", "Vendor not found");
        }

        const entries = await db
          .collection("supplier_ledger_entries")
          .find({
            businessId: req.tenant.businessId,
            supplierId: supplier.id,
          })
          .sort({ createdAt: -1, id: -1 })
          .toArray();

        const summary = await getSupplierFinancialSummary(db, {
          businessId: req.tenant.businessId,
          supplierId: supplier.id,
        });

        res.json({
          supplier: publicSupplier(supplier, summary),
          entries: entries.map(publicLedgerEntry),
          summary,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  app.get(
    "/suppliers/:id/payments",
    ...tenantRoute,
    requirePermission("supplier_payments.view"),
    async (req, res, next) => {
      try {
        const supplier = await db.collection("suppliers").findOne({
          id: Number(req.params.id),
          ...tenantScope(req),
        });
        if (!supplier) {
          throw new AppError(404, "SUPPLIER_NOT_FOUND", "Vendor not found");
        }

        const payments = await db
          .collection("supplier_payments")
          .find({
            businessId: req.tenant.businessId,
            supplierId: supplier.id,
          })
          .sort({ paymentDate: -1, id: -1 })
          .toArray();

        res.json({ payments: payments.map(publicPayment) });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/suppliers/:id/payments",
    ...tenantRoute,
    requirePermission("supplier_payments.create"),
    async (req, res, next) => {
      try {
        const supplierId = Number(req.params.id);
        const amount = toOptionalNumber(req.body.amount);
        if (amount == null || amount <= 0) {
          throw new AppError(
            400,
            "VALIDATION_ERROR",
            "amount must be greater than 0"
          );
        }

        const supplier = await db.collection("suppliers").findOne({
          id: supplierId,
          ...tenantScope(req),
        });
        if (!supplier) {
          throw new AppError(404, "SUPPLIER_NOT_FOUND", "Vendor not found");
        }

        const outstanding = await getOutstandingBalance(db, {
          businessId: req.tenant.businessId,
          supplierId,
        });
        if (amount > outstanding + 0.001) {
          throw new AppError(
            400,
            "OVERPAYMENT_NOT_ALLOWED",
            `Payment ${amount} exceeds outstanding payable ${outstanding}. Advance supplier credits are not supported in Phase 3.`
          );
        }

        const session = mongoClient.startSession();
        let payment;
        let ledgerEntry;
        try {
          await session.withTransaction(async () => {
            const outstandingNow = await getOutstandingBalance(
              db,
              { businessId: req.tenant.businessId, supplierId },
              { session }
            );
            if (amount > outstandingNow + 0.001) {
              throw new AppError(
                400,
                "OVERPAYMENT_NOT_ALLOWED",
                `Payment ${amount} exceeds outstanding payable ${outstandingNow}`
              );
            }

            const { entry } = await appendLedgerEntry(
              db,
              {
                businessId: req.tenant.businessId,
                supplierId,
                entryType: ENTRY_TYPES.PAYMENT,
                referenceType: "supplier_payment",
                referenceId: null,
                debit: amount,
                credit: 0,
                description:
                  toOptionalString(req.body.notes) ||
                  `Vendor payment ${toMoney(amount)}`,
                createdBy: req.auth.user.id,
              },
              { session }
            );
            ledgerEntry = entry;

            payment = {
              id: await nextTenantId(db, "supplier_payments", req.tenant.businessId, {
                session,
              }),
              businessId: req.tenant.businessId,
              supplierId,
              amount: toMoney(amount),
              paymentDate: req.body.paymentDate
                ? new Date(req.body.paymentDate)
                : new Date(),
              paymentMethod: toOptionalString(req.body.paymentMethod) || "cash",
              reference: toOptionalString(req.body.reference),
              notes: toOptionalString(req.body.notes),
              ledgerEntryId: entry.id,
              createdBy: req.auth.user.id,
              createdAt: new Date(),
            };

            await db
              .collection("supplier_payments")
              .insertOne(payment, { session });

            await db.collection("supplier_ledger_entries").updateOne(
              { businessId: req.tenant.businessId, id: entry.id },
              { $set: { referenceId: String(payment.id) } },
              { session }
            );
            ledgerEntry = { ...entry, referenceId: String(payment.id) };
          });
        } finally {
          await session.endSession();
        }

        await writeAuditLog(db, {
          businessId: req.tenant.businessId,
          actorId: req.auth.user.id,
          actorName: actorDisplayName(req.auth.user),
          action: "SUPPLIER_PAYMENT_CREATED",
          entity: "supplier_payment",
          entityId: payment.id,
          newValues: {
            supplierId,
            amount: payment.amount,
            ledgerEntryId: ledgerEntry.id,
          },
        });

        res.status(201).json({
          payment: publicPayment(payment),
          ledgerEntry: publicLedgerEntry(ledgerEntry),
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // ---------- Purchases ----------

  app.get(
    "/purchases",
    ...tenantRoute,
    requirePermission("purchases.view"),
    async (req, res, next) => {
      try {
        const filter = { ...tenantScope(req) };
        const status = toOptionalString(req.query.status);
        if (status) filter.status = String(status).toUpperCase();
        const supplierId = toOptionalNumber(req.query.supplierId);
        if (supplierId != null) filter.supplierId = supplierId;
        const q = toOptionalString(req.query.q);
        if (q) {
          const rx = { $regex: escapeRegex(q), $options: "i" };
          filter.$or = [{ purchaseNumber: rx }, { supplierName: rx }, { notes: rx }];
        }

        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
        const skip = (page - 1) * limit;

        const [total, rows] = await Promise.all([
          db.collection("purchases").countDocuments(filter),
          db
            .collection("purchases")
            .find(filter)
            .sort({ purchaseDate: -1, id: -1 })
            .skip(skip)
            .limit(limit)
            .toArray(),
        ]);

        res.json({
          purchases: rows.map(publicPurchase),
          pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  app.get(
    "/purchases/:id",
    ...tenantRoute,
    requirePermission("purchases.view"),
    async (req, res, next) => {
      try {
        const purchase = await db.collection("purchases").findOne({
          id: Number(req.params.id),
          ...tenantScope(req),
        });
        if (!purchase) {
          throw new AppError(404, "PURCHASE_NOT_FOUND", "Purchase not found");
        }
        res.json(publicPurchase(purchase));
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/purchases",
    ...tenantRoute,
    requirePermission("purchases.create"),
    async (req, res, next) => {
      try {
        const supplierId = toOptionalNumber(req.body.supplierId);
        if (supplierId == null) {
          throw new AppError(400, "VALIDATION_ERROR", "supplierId is required");
        }

        let supplier;
        try {
          supplier = await assertActiveSupplier(
            db,
            req.tenant.businessId,
            supplierId
          );
        } catch (error) {
          throwApp(AppError, error);
        }

        let calculated;
        let hydrated;
        try {
          calculated = calculatePurchaseTotals(
            req.body.items,
            req.body.discount,
            req.body.tax
          );
          hydrated = await hydratePurchaseItems(
            db,
            req.tenant.businessId,
            calculated.items
          );
          calculated = calculatePurchaseTotals(
            hydrated,
            req.body.discount,
            req.body.tax
          );
        } catch (error) {
          throwApp(AppError, error);
        }

        const paidAmount = toMoney(req.body.paidAmount || 0);
        if (paidAmount < 0) {
          throw new AppError(400, "VALIDATION_ERROR", "paidAmount cannot be negative");
        }

        const id = await nextTenantId(db, "purchases", req.tenant.businessId);
        const purchaseNumber =
          toOptionalString(req.body.purchaseNumber) ||
          `PO-${String(id).padStart(5, "0")}`;

        const purchase = {
          id,
          businessId: req.tenant.businessId,
          supplierId: supplier.id,
          supplierName: supplier.name,
          purchaseNumber,
          purchaseDate: req.body.purchaseDate
            ? new Date(req.body.purchaseDate)
            : new Date(),
          items: calculated.items,
          subtotal: calculated.subtotal,
          discount: calculated.discount,
          tax: calculated.tax,
          grandTotal: calculated.grandTotal,
          paidAmount,
          remainingAmount: toMoney(calculated.grandTotal - paidAmount),
          status: PURCHASE_STATUSES.DRAFT,
          notes: toOptionalString(req.body.notes),
          stockApplied: false,
          createdBy: req.auth.user.id,
          updatedBy: req.auth.user.id,
          confirmedBy: null,
          confirmedAt: null,
          cancelledBy: null,
          cancelledAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await db.collection("purchases").insertOne(purchase);

        await writeAuditLog(db, {
          businessId: req.tenant.businessId,
          actorId: req.auth.user.id,
          actorName: actorDisplayName(req.auth.user),
          action: "PURCHASE_CREATED",
          entity: "purchase",
          entityId: purchase.id,
          newValues: {
            purchaseNumber: purchase.purchaseNumber,
            supplierId: purchase.supplierId,
            grandTotal: purchase.grandTotal,
            status: purchase.status,
          },
        });

        res.status(201).json(publicPurchase(purchase));
      } catch (error) {
        next(error);
      }
    }
  );

  app.patch(
    "/purchases/:id",
    ...tenantRoute,
    requirePermission("purchases.update"),
    async (req, res, next) => {
      try {
        const filter = {
          id: Number(req.params.id),
          ...tenantScope(req),
        };
        const existing = await db.collection("purchases").findOne(filter);
        if (!existing) {
          throw new AppError(404, "PURCHASE_NOT_FOUND", "Purchase not found");
        }
        if (existing.status !== PURCHASE_STATUSES.DRAFT) {
          throw new AppError(
            409,
            "PURCHASE_NOT_EDITABLE",
            "Only DRAFT purchases can be edited"
          );
        }

        const updates = {
          updatedBy: req.auth.user.id,
          updatedAt: new Date(),
        };

        if (Object.prototype.hasOwnProperty.call(req.body, "supplierId")) {
          const supplierId = toOptionalNumber(req.body.supplierId);
          try {
            const supplier = await assertActiveSupplier(
              db,
              req.tenant.businessId,
              supplierId
            );
            updates.supplierId = supplier.id;
            updates.supplierName = supplier.name;
          } catch (error) {
            throwApp(AppError, error);
          }
        }

        if (Object.prototype.hasOwnProperty.call(req.body, "purchaseDate")) {
          updates.purchaseDate = new Date(req.body.purchaseDate);
        }
        if (Object.prototype.hasOwnProperty.call(req.body, "notes")) {
          updates.notes = toOptionalString(req.body.notes);
        }

        if (Object.prototype.hasOwnProperty.call(req.body, "items")) {
          try {
            let calculated = calculatePurchaseTotals(
              req.body.items,
              req.body.discount != null ? req.body.discount : existing.discount,
              req.body.tax != null ? req.body.tax : existing.tax
            );
            const hydrated = await hydratePurchaseItems(
              db,
              req.tenant.businessId,
              calculated.items
            );
            calculated = calculatePurchaseTotals(
              hydrated,
              req.body.discount != null ? req.body.discount : 0,
              req.body.tax != null ? req.body.tax : 0
            );
            updates.items = calculated.items;
            updates.subtotal = calculated.subtotal;
            updates.discount = calculated.discount;
            updates.tax = calculated.tax;
            updates.grandTotal = calculated.grandTotal;
            const paid = toMoney(
              req.body.paidAmount != null
                ? req.body.paidAmount
                : existing.paidAmount || 0
            );
            updates.paidAmount = paid;
            updates.remainingAmount = toMoney(calculated.grandTotal - paid);
          } catch (error) {
            throwApp(AppError, error);
          }
        } else if (
          Object.prototype.hasOwnProperty.call(req.body, "discount") ||
          Object.prototype.hasOwnProperty.call(req.body, "tax") ||
          Object.prototype.hasOwnProperty.call(req.body, "paidAmount")
        ) {
          try {
            const calculated = calculatePurchaseTotals(
              existing.items,
              req.body.discount != null ? req.body.discount : 0,
              req.body.tax != null ? req.body.tax : 0
            );
            updates.subtotal = calculated.subtotal;
            updates.discount = calculated.discount;
            updates.tax = calculated.tax;
            updates.grandTotal = calculated.grandTotal;
            const paid = toMoney(
              req.body.paidAmount != null
                ? req.body.paidAmount
                : existing.paidAmount || 0
            );
            updates.paidAmount = paid;
            updates.remainingAmount = toMoney(calculated.grandTotal - paid);
          } catch (error) {
            throwApp(AppError, error);
          }
        }

        await db.collection("purchases").updateOne(filter, { $set: updates });
        const updated = await db.collection("purchases").findOne(filter);

        await writeAuditLog(db, {
          businessId: req.tenant.businessId,
          actorId: req.auth.user.id,
          actorName: actorDisplayName(req.auth.user),
          action: "PURCHASE_UPDATED",
          entity: "purchase",
          entityId: updated.id,
          newValues: {
            grandTotal: updated.grandTotal,
            supplierId: updated.supplierId,
          },
        });

        res.json(publicPurchase(updated));
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/purchases/:id/confirm",
    ...tenantRoute,
    requirePermission("purchases.confirm"),
    async (req, res, next) => {
      try {
        if (!mongoClient) {
          throw new AppError(
            500,
            "TRANSACTIONS_UNAVAILABLE",
            "Purchase confirmation requires Mongo transactions"
          );
        }

        const session = mongoClient.startSession();
        let result;
        try {
          await session.withTransaction(async () => {
            result = await confirmPurchaseInSession(
              db,
              {
                businessId: req.tenant.businessId,
                purchaseId: req.params.id,
                userId: req.auth.user.id,
                AppError,
              },
              { session }
            );
          });
        } catch (error) {
          throwApp(AppError, error);
        } finally {
          await session.endSession();
        }

        await writeAuditLog(db, {
          businessId: req.tenant.businessId,
          actorId: req.auth.user.id,
          actorName: actorDisplayName(req.auth.user),
          action: "PURCHASE_CONFIRMED",
          entity: "purchase",
          entityId: result.purchase.id,
          newValues: {
            purchaseNumber: result.purchase.purchaseNumber,
            supplierId: result.purchase.supplierId,
            supplierName: result.supplier.name,
            grandTotal: result.purchase.grandTotal,
            movementCount: result.movements.length,
            ledgerEntryId: result.ledgerEntry.id,
          },
          meta: {
            businessId: req.tenant.businessId,
            confirmedBy: req.auth.user.id,
            confirmedAt: result.purchase.confirmedAt,
          },
        });

        res.json({
          purchase: publicPurchase(result.purchase),
          movements: result.movements.map((m) => ({
            id: m.id,
            productId: m.productId,
            quantity: m.quantity,
            balanceAfter: m.balanceAfter,
            movementType: m.movementType,
          })),
          ledgerEntry: publicLedgerEntry(result.ledgerEntry),
        });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/purchases/:id/cancel",
    ...tenantRoute,
    requirePermission("purchases.update"),
    async (req, res, next) => {
      try {
        const filter = {
          id: Number(req.params.id),
          ...tenantScope(req),
        };
        const existing = await db.collection("purchases").findOne(filter);
        if (!existing) {
          throw new AppError(404, "PURCHASE_NOT_FOUND", "Purchase not found");
        }

        if (existing.status === PURCHASE_STATUSES.CANCELLED) {
          throw new AppError(409, "INVALID_STATE", "Purchase already cancelled");
        }

        if (existing.status === PURCHASE_STATUSES.CONFIRMED) {
          throw new AppError(
            409,
            "CONFIRMED_CANCEL_DEFERRED",
            "Confirmed purchase cancellation is deferred to a later phase (requires stock + payable reversal). Cancel drafts only in Phase 3."
          );
        }

        if (existing.status !== PURCHASE_STATUSES.DRAFT) {
          throw new AppError(409, "INVALID_STATE", "Invalid purchase status");
        }

        const cancelledAt = new Date();
        await db.collection("purchases").updateOne(filter, {
          $set: {
            status: PURCHASE_STATUSES.CANCELLED,
            cancelledBy: req.auth.user.id,
            cancelledAt,
            updatedBy: req.auth.user.id,
            updatedAt: cancelledAt,
          },
        });
        const updated = await db.collection("purchases").findOne(filter);

        await writeAuditLog(db, {
          businessId: req.tenant.businessId,
          actorId: req.auth.user.id,
          actorName: actorDisplayName(req.auth.user),
          action: "PURCHASE_CANCELLED",
          entity: "purchase",
          entityId: updated.id,
          oldValues: { status: existing.status },
          newValues: { status: PURCHASE_STATUSES.CANCELLED },
        });

        res.json(publicPurchase(updated));
      } catch (error) {
        next(error);
      }
    }
  );

  app.delete(
    "/purchases/:id",
    ...tenantRoute,
    requirePermission("purchases.delete"),
    async (req, res, next) => {
      try {
        const filter = {
          id: Number(req.params.id),
          ...tenantScope(req),
        };
        const existing = await db.collection("purchases").findOne(filter);
        if (!existing) {
          throw new AppError(404, "PURCHASE_NOT_FOUND", "Purchase not found");
        }
        if (existing.status === PURCHASE_STATUSES.CONFIRMED) {
          throw new AppError(
            409,
            "PURCHASE_NOT_DELETABLE",
            "Confirmed purchases cannot be deleted"
          );
        }

        await db.collection("purchases").deleteOne(filter);

        await writeAuditLog(db, {
          businessId: req.tenant.businessId,
          actorId: req.auth.user.id,
          actorName: actorDisplayName(req.auth.user),
          action: "PURCHASE_CANCELLED",
          entity: "purchase",
          entityId: existing.id,
          oldValues: { status: existing.status },
          newValues: { deleted: true },
        });

        res.json({ message: "Purchase deleted", id: existing.id });
      } catch (error) {
        next(error);
      }
    }
  );
}

module.exports = {
  registerPurchaseRoutes,
  calculatePurchaseTotals,
  publicSupplier,
  publicPurchase,
  PURCHASE_STATUSES,
  SUPPLIER_STATUSES,
};
