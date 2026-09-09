/**
 * Unit tests for stockService helpers (no Mongo required).
 */
const assert = require("node:assert/strict");
const {
  MOVEMENT_TYPES,
  MOVEMENT_TYPE_SET,
  stockFieldsFromQuantity,
} = require("../stockService");

const tests = [];
function test(name, run) {
  tests.push({ name, run });
}

test("movement types include Phase 2 ledger set", () => {
  for (const key of [
    "OPENING_STOCK",
    "PURCHASE",
    "SALE",
    "SALE_RETURN",
    "PURCHASE_RETURN",
    "DAMAGE",
    "ADJUSTMENT",
    "STOCK_TRANSFER",
  ]) {
    assert.equal(MOVEMENT_TYPES[key], key);
    assert.equal(MOVEMENT_TYPE_SET.has(key), true);
  }
});

test("stockFieldsFromQuantity mirrors currentStock and legacy stock", () => {
  assert.deepEqual(stockFieldsFromQuantity(12), {
    currentStock: 12,
    stock: 12,
  });
  assert.deepEqual(stockFieldsFromQuantity("7"), {
    currentStock: 7,
    stock: 7,
  });
});

(async () => {
  let passed = 0;
  for (const { name, run } of tests) {
    await run();
    passed += 1;
    console.log(`ok - ${name}`);
  }
  console.log(`${passed}/${tests.length} stockService unit tests passed`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
