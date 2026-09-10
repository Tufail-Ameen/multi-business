const assert = require("node:assert/strict");
const {
  rateChange,
  moneyDiff,
  summarizeProductPrices,
  buildPurchasePriceHints,
} = require("../purchasePriceService");

const tests = [];
function test(name, run) {
  tests.push({ name, run });
}

test("rateChange and moneyDiff", () => {
  assert.equal(rateChange(110, 100), "up");
  assert.equal(rateChange(90, 100), "down");
  assert.equal(rateChange(100, 100), "same");
  assert.equal(rateChange(100, null), null);
  assert.equal(moneyDiff(110, 100), 10);
  assert.equal(moneyDiff(90, 100), -10);
});

test("summarizeProductPrices ranks cheapest and costliest by last vendor rate", () => {
  const suppliersById = new Map([
    [1, { id: 1, name: "Saeed Traders" }],
    [2, { id: 2, name: "Umar Saleem" }],
  ]);
  const product = { id: 9, name: "Cement", sku: "CEM-1", purchasePrice: 95 };
  const history = [
    {
      id: 3,
      supplierId: 1,
      productId: 9,
      unitPrice: 110,
      purchasedAt: "2026-09-10",
      purchaseId: 3,
    },
    {
      id: 2,
      supplierId: 1,
      productId: 9,
      unitPrice: 100,
      purchasedAt: "2026-08-01",
      purchaseId: 2,
    },
    {
      id: 1,
      supplierId: 2,
      productId: 9,
      unitPrice: 90,
      purchasedAt: "2026-09-05",
      purchaseId: 1,
    },
  ];

  const summary = summarizeProductPrices({
    productId: 9,
    product,
    history,
    suppliersById,
    includeHistory: true,
  });

  assert.equal(summary.productName, "Cement");
  assert.equal(summary.vendorCount, 2);
  assert.equal(summary.last.unitPrice, 110);
  assert.equal(summary.last.supplierName, "Saeed Traders");
  assert.equal(summary.previous.unitPrice, 90);
  assert.equal(summary.rateDiff, 20);
  assert.equal(summary.rateChange, "up");
  assert.equal(summary.cheapest.supplierName, "Umar Saleem");
  assert.equal(summary.cheapest.unitPrice, 90);
  assert.equal(summary.mostExpensive.supplierName, "Saeed Traders");
  assert.equal(summary.mostExpensive.unitPrice, 110);
  assert.equal(summary.vendors[0].supplierName, "Umar Saleem");
  assert.equal(summary.vendors[1].rateDiff, 10);
  assert.equal(summary.vendors[1].rateChange, "up");
  assert.equal(summary.history.length, 3);
});

test("hints expose last-from-vendor vs cheapest", () => {
  const suppliersById = new Map([
    [1, { id: 1, name: "Saeed Traders" }],
    [2, { id: 2, name: "Umar Saleem" }],
  ]);
  const product = { id: 9, name: "Cement", purchasePrice: 95 };
  const history = [
    {
      id: 2,
      supplierId: 1,
      unitPrice: 110,
      purchasedAt: "2026-09-10",
      purchaseId: 3,
    },
    {
      id: 1,
      supplierId: 2,
      unitPrice: 90,
      purchasedAt: "2026-09-05",
      purchaseId: 1,
    },
  ];

  const hints = buildPurchasePriceHints({
    product,
    supplierId: 1,
    history,
    suppliersById,
  });

  assert.equal(hints.lastFromVendor.unitPrice, 110);
  assert.equal(hints.cheapest.unitPrice, 90);
  assert.equal(hints.cheapest.supplierName, "Umar Saleem");
  assert.equal(hints.mostExpensive.supplierName, "Saeed Traders");
  assert.equal(hints.catalogPurchasePrice, 95);
});

async function run() {
  let failed = 0;
  for (const t of tests) {
    try {
      await t.run();
      console.log(`ok - ${t.name}`);
    } catch (error) {
      failed += 1;
      console.error(`not ok - ${t.name}`);
      console.error(error);
    }
  }
  if (failed) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
  }
  console.log(`\n${tests.length} test(s) passed`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
