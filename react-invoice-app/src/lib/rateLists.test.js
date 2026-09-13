import {
  catalogSelection,
  clientOutreachMessage,
  formatCatalogLine,
  isLocalhostOrigin,
  itemsFromRateList,
  matchesRateListQuery,
  paginateCatalogProducts,
  pickSendableRateList,
  productDefaultPrice,
  RATE_LIST_SORT,
  rateListItemsForMessage,
  sortRateListProducts,
  splitCatalogColumns,
  toMoneyNumber,
  whatsappDigits,
  whatsappPrefillHref,
  whatsappShareHref,
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

describe("matchesRateListQuery", () => {
  test("matches name, sku, and barcode", () => {
    const product = { name: "Archi Cap", sku: "PRD-0007", barcode: "12345", unit: "pcs" };
    expect(matchesRateListQuery(product, "cap")).toBe(true);
    expect(matchesRateListQuery(product, "prd-0007")).toBe(true);
    expect(matchesRateListQuery(product, "12345")).toBe(true);
    expect(matchesRateListQuery(product, "missing")).toBe(false);
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

describe("whatsappDigits", () => {
  test("converts Pakistani 03 numbers to 92", () => {
    expect(whatsappDigits("03001234001")).toBe("923001234001");
    expect(whatsappDigits("0315-1234016")).toBe("923151234016");
  });

  test("keeps international digits", () => {
    expect(whatsappDigits("923001234001")).toBe("923001234001");
    expect(whatsappDigits("00923001234001")).toBe("923001234001");
  });

  test("returns empty for missing phone", () => {
    expect(whatsappDigits("")).toBe("");
    expect(whatsappDigits(null)).toBe("");
  });
});

describe("whatsappShareHref", () => {
  test("opens a blank chat when no phone is given", () => {
    expect(whatsappShareHref("Hello", "https://example.com/store/ab")).toBe(
      `https://wa.me/?text=${encodeURIComponent("Hello\nhttps://example.com/store/ab")}`
    );
  });

  test("opens that client's WhatsApp chat", () => {
    const href = whatsappShareHref("Rate list", "", "03001234001");
    expect(href.startsWith("https://wa.me/923001234001?text=")).toBe(true);
    expect(href).toContain(encodeURIComponent("Rate list"));
  });
});

describe("clientOutreachMessage", () => {
  test("includes shop, rates, and store link", () => {
    const message = clientOutreachMessage({
      clientName: "Adnan Face Wash Hub",
      businessName: "Archi",
      shareUrl: "https://example.com/store/ab",
      products: [{ name: "Archi Cap", unit: "pcs", salePrice: 45 }],
    });
    expect(message).toContain("Assalamualaikum Adnan Face Wash Hub,");
    expect(message).toContain("Archi ki latest rates:");
    expect(message).toContain("Archi Cap — pcs — Rs 45");
    expect(message).toContain("Order: https://example.com/store/ab");
  });

  test("includes every assigned item, not a 20-item cap", () => {
    const products = Array.from({ length: 24 }, (_, index) => ({
      name: `Item ${index + 1}`,
      unit: "pcs",
      salePrice: 10,
    }));
    const message = clientOutreachMessage({
      clientName: "Akram Wholesale",
      products,
    });
    expect(message).toContain("Item 1 — pcs — Rs 10");
    expect(message).toContain("Item 24 — pcs — Rs 10");
    expect(message).not.toContain("Aur ");
    expect(message).not.toContain("PDF");
  });
});

describe("formatCatalogLine", () => {
  test("formats name, unit, and sale price", () => {
    expect(formatCatalogLine({ name: "Archi Cap", unit: "pcs", salePrice: 45 })).toBe(
      "Archi Cap — pcs — Rs 45"
    );
  });

  test("prefers the client's custom rate", () => {
    expect(
      formatCatalogLine({
        productName: "Soap",
        unit: "dz",
        customPrice: 1300,
        salePrice: 1250,
      })
    ).toBe("Soap — dz — Rs 1,300");
  });
});

describe("rateListItemsForMessage", () => {
  test("maps rate list items onto chat lines", () => {
    const products = rateListItemsForMessage([
      {
        productId: 9,
        productName: "Cap",
        unit: "pcs",
        customPrice: 55,
        defaultPrice: 45,
        soldQty: 12,
        lastBoughtAt: "2026-09-01T00:00:00.000Z",
      },
    ]);
    expect(products[0]).toMatchObject({
      name: "Cap",
      customPrice: 55,
      productId: 9,
      soldQty: 12,
    });
  });
});

describe("sortRateListProducts", () => {
  const items = [
    { productId: 1, name: "Oil", soldQty: 2, lastBoughtAt: "2026-08-01T00:00:00.000Z" },
    { productId: 2, name: "Soap", soldQty: 0, lastBoughtAt: null },
    { productId: 3, name: "Cap", soldQty: 9, lastBoughtAt: "2026-07-01T00:00:00.000Z" },
    { productId: 4, name: "Biscuit", soldQty: 0, lastBoughtAt: null },
  ];

  test("puts this shop's biggest sellers first", () => {
    expect(sortRateListProducts(items, RATE_LIST_SORT.BUYS_MOST).map((row) => row.name)).toEqual([
      "Cap",
      "Oil",
      "Biscuit",
      "Soap",
    ]);
  });

  test("puts the most recently bought items first", () => {
    expect(sortRateListProducts(items, RATE_LIST_SORT.RECENT).map((row) => row.name)).toEqual([
      "Oil",
      "Cap",
      "Biscuit",
      "Soap",
    ]);
  });

  test("puts items they have not bought yet first", () => {
    expect(sortRateListProducts(items, RATE_LIST_SORT.NEW_FIRST).map((row) => row.name)).toEqual([
      "Biscuit",
      "Soap",
      "Cap",
      "Oil",
    ]);
  });

  test("sorts A–Z by name", () => {
    expect(sortRateListProducts(items, RATE_LIST_SORT.NAME).map((row) => row.name)).toEqual([
      "Biscuit",
      "Cap",
      "Oil",
      "Soap",
    ]);
  });

  test("keeps saved order", () => {
    expect(sortRateListProducts(items, RATE_LIST_SORT.SAVED).map((row) => row.name)).toEqual([
      "Oil",
      "Soap",
      "Cap",
      "Biscuit",
    ]);
  });
});

describe("pickSendableRateList", () => {
  test("skips archived lists and picks the newest", () => {
    const picked = pickSendableRateList([
      { id: 1, status: "ARCHIVED", updatedAt: "2026-09-12T10:00:00.000Z" },
      { id: 2, status: "DRAFT", updatedAt: "2026-09-10T10:00:00.000Z" },
      { id: 3, status: "SENT", updatedAt: "2026-09-11T10:00:00.000Z" },
    ]);
    expect(picked.id).toBe(3);
  });
});

describe("whatsappPrefillHref", () => {
  test("prefills short messages", () => {
    const result = whatsappPrefillHref("Rate list", "03001234001");
    expect(result.mode).toBe("prefill");
    expect(result.href.startsWith("https://wa.me/923001234001?text=")).toBe(true);
  });
});
