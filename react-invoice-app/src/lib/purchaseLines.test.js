import {
  applyProductCost,
  calcPurchaseLineTotal,
  emptyPurchaseLine,
  patchPurchaseLine,
  purchaseLineFromItem,
  roundMoney,
  summarizePurchaseLines,
} from "./purchaseLines";

describe("patchPurchaseLine", () => {
  test("fills piece cost from qty and total", () => {
    const line = { ...emptyPurchaseLine(), quantity: 12, costSource: "total" };
    const next = patchPurchaseLine(line, "lineAmount", 1944);
    expect(next.unitCost).toBe(162);
    expect(next.costSource).toBe("total");
  });

  test("recalculates piece cost when qty changes after total", () => {
    const line = patchPurchaseLine(
      { ...emptyPurchaseLine(), quantity: 10 },
      "lineAmount",
      1620
    );
    const next = patchPurchaseLine(line, "quantity", 12);
    expect(next.unitCost).toBe(135);
    expect(next.lineAmount).toBe(1620);
  });

  test("fills total from qty and unit cost", () => {
    const line = { ...emptyPurchaseLine(), unitCost: 162 };
    const next = patchPurchaseLine(line, "quantity", 12);
    expect(next.lineAmount).toBe(1944);
    expect(next.unitCost).toBe(162);
  });

  test("updates total when piece cost is typed", () => {
    const line = { ...emptyPurchaseLine(), quantity: 12, unitCost: 162, lineAmount: 1944 };
    const next = patchPurchaseLine(line, "unitCost", 150);
    expect(next.lineAmount).toBe(1800);
    expect(next.costSource).toBe("unit");
  });

  test("does not divide when qty is empty", () => {
    const next = patchPurchaseLine(emptyPurchaseLine(), "lineAmount", 1944);
    expect(next.unitCost).toBe("");
    expect(next.lineAmount).toBe(1944);
  });
});

describe("applyProductCost", () => {
  test("sets catalog cost and total when qty is already filled", () => {
    const line = { ...emptyPurchaseLine(), quantity: 12 };
    const next = applyProductCost(line, "7", 162);
    expect(next.productId).toBe("7");
    expect(next.unitCost).toBe(162);
    expect(next.lineAmount).toBe(1944);
  });

  test("does not overwrite a bill total the user already entered", () => {
    const line = patchPurchaseLine(
      { ...emptyPurchaseLine(), quantity: 12 },
      "lineAmount",
      1800
    );
    const next = applyProductCost(line, "7", 162);
    expect(next.productId).toBe("7");
    expect(next.lineAmount).toBe(1800);
    expect(next.unitCost).toBe(150);
  });
});

describe("calcPurchaseLineTotal", () => {
  test("applies discount and tax on top of qty x cost", () => {
    expect(
      calcPurchaseLineTotal({
        quantity: 12,
        unitCost: 162,
        discount: 44,
        tax: 20,
      })
    ).toBe(1920);
  });
});

describe("summarizePurchaseLines", () => {
  test("rolls up subtotal discount tax and grand total", () => {
    const summary = summarizePurchaseLines([
      { quantity: 12, unitCost: 162, discount: 44, tax: 20 },
      { quantity: 2, unitCost: 50, discount: 0, tax: 0 },
    ]);
    expect(summary.subtotal).toBe(2044);
    expect(summary.discount).toBe(44);
    expect(summary.tax).toBe(20);
    expect(summary.grandTotal).toBe(2020);
    expect(summary.lineTotals).toEqual([1920, 100]);
  });
});

describe("purchaseLineFromItem", () => {
  test("restores bill total from saved qty and unit cost", () => {
    const line = purchaseLineFromItem({
      productId: 9,
      quantity: 12,
      unitCost: 162,
      discount: 0,
      tax: 0,
    });
    expect(line.productId).toBe("9");
    expect(line.lineAmount).toBe(1944);
  });
});

describe("roundMoney", () => {
  test("rounds half up to 2 decimals", () => {
    expect(roundMoney(162.125)).toBe(162.13);
  });
});
