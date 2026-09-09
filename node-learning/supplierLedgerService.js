/**
 * Supplier financial ledger — append-only payable history.
 *
 * Semantics:
 *   PURCHASE credit  → outstanding payable increases
 *   PAYMENT  debit   → outstanding payable decreases
 *
 * balanceAfter = previousOutstanding + credit - debit
 * Supplier.currentBalance is a cache updated in the same transaction.
 */

const { nextTenantId } = require("./database");

const ENTRY_TYPES = Object.freeze({
  PURCHASE: "PURCHASE",
  PAYMENT: "PAYMENT",
  ADJUSTMENT: "ADJUSTMENT",
});

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function getOutstandingBalance(
  db,
  { businessId, supplierId },
  { session } = {}
) {
  const supplier = await db.collection("suppliers").findOne(
    { businessId, id: Number(supplierId) },
    { session }
  );
  if (!supplier) return null;

  if (supplier.currentBalance != null && Number.isFinite(Number(supplier.currentBalance))) {
    return toNumber(supplier.currentBalance, 0);
  }

  const rows = await db
    .collection("supplier_ledger_entries")
    .aggregate(
      [
        { $match: { businessId, supplierId: Number(supplierId) } },
        {
          $group: {
            _id: null,
            credits: { $sum: "$credit" },
            debits: { $sum: "$debit" },
          },
        },
      ],
      session ? { session } : undefined
    )
    .toArray();

  if (!rows.length) return 0;
  return toNumber(rows[0].credits, 0) - toNumber(rows[0].debits, 0);
}

async function getSupplierFinancialSummary(
  db,
  { businessId, supplierId },
  { session } = {}
) {
  const rows = await db
    .collection("supplier_ledger_entries")
    .aggregate(
      [
        { $match: { businessId, supplierId: Number(supplierId) } },
        {
          $group: {
            _id: null,
            totalPurchases: {
              $sum: {
                $cond: [{ $eq: ["$entryType", ENTRY_TYPES.PURCHASE] }, "$credit", 0],
              },
            },
            totalPaid: {
              $sum: {
                $cond: [{ $eq: ["$entryType", ENTRY_TYPES.PAYMENT] }, "$debit", 0],
              },
            },
            credits: { $sum: "$credit" },
            debits: { $sum: "$debit" },
          },
        },
      ],
      session ? { session } : undefined
    )
    .toArray();

  const totalPurchases = toNumber(rows[0]?.totalPurchases, 0);
  const totalPaid = toNumber(rows[0]?.totalPaid, 0);
  const outstandingPayable =
    toNumber(rows[0]?.credits, 0) - toNumber(rows[0]?.debits, 0);

  return {
    totalPurchases,
    totalPaid,
    outstandingPayable,
  };
}

/**
 * Append a ledger entry and update supplier.currentBalance cache.
 * Must run inside a Mongo session when used with purchase confirm / payment.
 */
async function appendLedgerEntry(
  db,
  {
    businessId,
    supplierId,
    entryType,
    referenceType = null,
    referenceId = null,
    debit = 0,
    credit = 0,
    description = null,
    createdBy = null,
  },
  { session } = {}
) {
  if (!businessId) {
    throw Object.assign(new Error("businessId is required"), {
      status: 400,
      code: "VALIDATION_ERROR",
    });
  }
  if (!ENTRY_TYPES[entryType] && !Object.values(ENTRY_TYPES).includes(entryType)) {
    throw Object.assign(new Error(`Invalid ledger entry type: ${entryType}`), {
      status: 400,
      code: "INVALID_ENTRY_TYPE",
    });
  }

  const debitAmt = toNumber(debit, 0);
  const creditAmt = toNumber(credit, 0);
  if (debitAmt < 0 || creditAmt < 0) {
    throw Object.assign(new Error("debit/credit cannot be negative"), {
      status: 400,
      code: "VALIDATION_ERROR",
    });
  }
  if (debitAmt === 0 && creditAmt === 0) {
    throw Object.assign(new Error("ledger entry amount must be non-zero"), {
      status: 400,
      code: "VALIDATION_ERROR",
    });
  }
  if (debitAmt > 0 && creditAmt > 0) {
    throw Object.assign(new Error("ledger entry cannot have both debit and credit"), {
      status: 400,
      code: "VALIDATION_ERROR",
    });
  }

  const supplier = await db.collection("suppliers").findOne(
    { businessId, id: Number(supplierId) },
    { session }
  );
  if (!supplier) {
    throw Object.assign(new Error("Supplier not found"), {
      status: 404,
      code: "SUPPLIER_NOT_FOUND",
    });
  }

  const previousBalance = await getOutstandingBalance(
    db,
    { businessId, supplierId: supplier.id },
    { session }
  );
  const balanceAfter = previousBalance + creditAmt - debitAmt;
  const amount = creditAmt > 0 ? creditAmt : debitAmt;

  const entryId = await nextTenantId(db, "supplier_ledger_entries", businessId, {
    session,
  });

  const entry = {
    id: entryId,
    businessId,
    supplierId: supplier.id,
    entryType,
    referenceType: referenceType || null,
    referenceId: referenceId == null ? null : String(referenceId),
    debit: debitAmt,
    credit: creditAmt,
    amount,
    balanceAfter,
    description: description ? String(description).trim() : null,
    createdBy: createdBy || null,
    createdAt: new Date(),
  };

  await db
    .collection("supplier_ledger_entries")
    .insertOne(entry, session ? { session } : undefined);

  await db.collection("suppliers").updateOne(
    { businessId, id: supplier.id },
    {
      $set: {
        currentBalance: balanceAfter,
        updatedAt: new Date(),
      },
    },
    session ? { session } : undefined
  );

  return { entry, previousBalance, balanceAfter };
}

module.exports = {
  ENTRY_TYPES,
  getOutstandingBalance,
  getSupplierFinancialSummary,
  appendLedgerEntry,
};
