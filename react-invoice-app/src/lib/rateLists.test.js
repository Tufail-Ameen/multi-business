import {
  catalogSelection,
  isLocalhostOrigin,
  itemsFromRateList,
  paginateCatalogProducts,
  productDefaultPrice,
  splitCatalogColumns,
  toMoneyNumber,
} from "./rateLists";
import { toPrintRow } from "./rateListPrint";

describe("productDefaultPrice", () => {
  test("uses salePrice first", () => {
    expect(productDefaultPrice({ salePrice: 120, wholesalePrice: 90 })).toBe(120);
  });

  test("skips zero salePrice and uses wholesale", () => {
    expect(productDefaultPrice({ salePrice: 0, wholesalePrice: 250 })).toBe(250);
  });

  test("reads snake_case sale_price", () => {
    expect(productDefaultPrice({ sale_price: "1,250" })).toBe(1250);
  });

  test("reads nested amount objects", () => {
    expect(productDefaultPrice({ salePrice: { amount: 80 } })).toBe(80);
  });
});

describe("itemsFromRateList", () => {
  test("fills missing custom rate from default", () => {
    const selected = itemsFromRateList({
      items: [{ productId: 1, productName: "Cap", defaultPrice: 40 }],
    });
    expect(selected["1"].customPrice).toBe(40);
  });
});

describe("catalogSelection", () => {
  test("builds items with catalog rates", () => {
    const selected = catalogSelection([
      { id: 4, name: "Archi Cap", sku: "PRD-0007", unit: "pcs", salePrice: 45 },
    ]);
    expect(selected["4"]).toMatchObject({
      productId: 4,
      customPrice: 45,
      defaultPrice: 45,
    });
  });
});

describe("toMoneyNumber", () => {
  test("returns null for empty values", () => {
    expect(toMoneyNumber(null)).toBe(null);
    expect(toMoneyNumber("")).toBe(null);
  });
});

describe("splitCatalogColumns", () => {
  test("puts extra item on the left", () => {
    const { left, right } = splitCatalogColumns([1, 2, 3]);
    expect(left).toEqual([1, 2]);
    expect(right).toEqual([3]);
  });
});

describe("paginateCatalogProducts", () => {
  test("chunks products into pages", () => {
    expect(paginateCatalogProducts([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  test("merges a tiny leftover page into the previous page", () => {
    expect(paginateCatalogProducts([1, 2, 3, 4, 5], 2, 2)).toEqual([
      [1, 2],
      [3, 4, 5],
    ]);
  });
});

describe("isLocalhostOrigin", () => {
  test("treats jsdom hostname as local", () => {
    expect(isLocalhostOrigin()).toBe(true);
  });
});

describe("toPrintRow", () => {
  test("uses catalog name and sale price", () => {
    expect(toPrintRow({ name: "Cap", unit: "pcs", salePrice: 45 })).toEqual({
      name: "Cap",
      unit: "pcs",
      salePrice: 45,
    });
  });

  test("uses custom rate from a client list item", () => {
    expect(
      toPrintRow({
        productName: "Cap",
        unit: "dz",
        defaultPrice: 40,
        customPrice: 55,
      })
    ).toEqual({
      name: "Cap",
      unit: "dz",
      salePrice: 55,
    });
  });
});
