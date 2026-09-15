import {
  applyCategorySort,
  applyNamedCategoryOrder,
  categoryIdsAfterVisibleMove,
  categoryIdsAfterVisibleSwap,
  catalogSelection,
  clientOutreachMessage,
  formatBroadcastNumbers,
  buildWhatsAppQueue,
  formatCatalogLine,
  groupOutreachRecipients,
  isLocalhostOrigin,
  itemsFromRateList,
  matchesRateListQuery,
  paginateCatalogProducts,
  pickSendableRateList,
  rateListFingerprint,
  productDefaultPrice,
  RATE_LIST_SORT,
  rateListItemsForMessage,
  sortProductsByCategory,
  sortRateListProducts,
  splitCatalogColumns,
  swapAdjacent,
  moveItem,
  toMoneyNumber,
  whatsappDigits,
  openWhatsAppWindow,
  WHATSAPP_WINDOW_NAME,
  whatsappOpenHref,
  whatsappPrefillHref,
  whatsappShareHref,
  whatsappWebSendHref,
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
    expect(message).toContain("Assalamualaikum *Adnan Face Wash Hub*,");
    expect(message).toContain("*Archi* ki latest rates");
    expect(message).toContain("1. Archi Cap — *Rs\u00A045*");
    expect(message).toContain("Order: https://example.com/store/ab");
  });

  test("includes every assigned item, not a 20-item cap", () => {
    const products = Array.from({ length: 24 }, (_, index) => ({
      name: `Sku${index + 1} Widget`,
      unit: "pcs",
      salePrice: 10,
    }));
    const message = clientOutreachMessage({
      clientName: "Akram Wholesale",
      products,
    });
    expect(message).toContain("Sku1 Widget — *Rs\u00A010*");
    expect(message).toContain("Sku24 Widget — *Rs\u00A010*");
    expect(message).not.toContain("Aur ");
    expect(message).not.toContain("PDF");
  });

  test("groups items by category and keeps full product names", () => {
    const message = clientOutreachMessage({
      clientName: "Hussani Cosmetics",
      businessName: "Tufail Traders",
      products: [
        { name: "Glame Fical Kit", category: "Facial", unit: "pcs", salePrice: 295 },
        { name: "Glame Hair Remove Spray (100 ml)", category: "Hair Spray", unit: "pcs", salePrice: 165 },
        { name: "Sabalon Hair Spray (Large)", category: "Hair Spray", unit: "pcs", salePrice: 350 },
        { name: "Sabalon Hair Color Spray", category: "Hair Color", unit: "pcs", salePrice: 220 },
        { name: "Sabalon Apply Color", category: "Hair Color", unit: "pcs", salePrice: 1700 },
        { name: "White Roze Jar Large", category: "General Items", unit: "pcs", salePrice: 180 },
      ],
    });
    expect(message).toContain("*Facial*");
    expect(message).toContain("*Hair Color*");
    expect(message).toContain("*Hair Spray*");
    expect(message).toContain("*General Items*");
    expect(message).toContain("• Sabalon Hair Color Spray — *Rs\u00A0220*");
    expect(message).toContain("• Glame Hair Remove Spray (100 ml) — *Rs\u00A0165*");
    expect(message).toContain("• Sabalon Hair Spray (Large) — *Rs\u00A0350*");
    expect(message.indexOf("*Hair Color*")).toBeLessThan(message.indexOf("*Hair Spray*"));
    expect(message.indexOf("*Hair Color*")).toBeLessThan(message.indexOf("Sabalon Hair Color Spray"));
    expect(message.indexOf("Sabalon Hair Color Spray")).toBeLessThan(message.indexOf("*Hair Spray*"));
    expect(message).not.toContain("*Glame*");
    expect(message).not.toContain("*Sabalon*");
    expect(message).not.toContain("pcs");
  });

  test("does not group by brand when products have no category", () => {
    const message = clientOutreachMessage({
      clientName: "Hafiz Cosmetics",
      businessName: "Tufail Traders",
      products: [
        { name: "Glame Fical Kit", unit: "pcs", salePrice: 295 },
        { name: "Sabalon Gel", unit: "pcs", salePrice: 200 },
      ],
    });
    expect(message).toContain("1. Glame Fical Kit — *Rs\u00A0295*");
    expect(message).toContain("2. Sabalon Gel — *Rs\u00A0200*");
    expect(message).not.toContain("*Glame*");
    expect(message).not.toContain("*Sabalon*");
  });

  test("orders category sections by saved category order", () => {
    const message = clientOutreachMessage({
      clientName: "Abdullah Cosmetics",
      businessName: "Tufail Traders",
      products: [
        { name: "Sabalon Apply Color", category: "Hair Color", categorySortOrder: 2, salePrice: 1700 },
        { name: "Glame Fical Kit", category: "Fical Kit", categorySortOrder: 0, salePrice: 295 },
        { name: "Sabalon Gel", category: "Gel", categorySortOrder: 1, salePrice: 200 },
      ],
    });
    expect(message.indexOf("*Fical Kit*")).toBeLessThan(message.indexOf("*Gel*"));
    expect(message.indexOf("*Gel*")).toBeLessThan(message.indexOf("*Hair Color*"));
  });
});

describe("category swap helpers", () => {
  test("swaps adjacent section names", () => {
    expect(swapAdjacent(["Hair Color", "Hair Spray", "Gel"], 1, -1)).toEqual([
      "Hair Spray",
      "Hair Color",
      "Gel",
    ]);
  });

  test("applies a custom section order onto the chat message", () => {
    const products = applyNamedCategoryOrder(
      [
        { name: "Sabalon Apply Color", category: "Hair Color", salePrice: 1700 },
        { name: "Sabalon Gel", category: "Gel", salePrice: 200 },
        { name: "Glame Fical Kit", category: "Fical Kit", salePrice: 295 },
      ],
      ["Hair Color", "Gel", "Fical Kit"]
    );
    const message = clientOutreachMessage({ products });
    expect(message.indexOf("*Hair Color*")).toBeLessThan(message.indexOf("*Gel*"));
    expect(message.indexOf("*Gel*")).toBeLessThan(message.indexOf("*Fical Kit*"));
  });

  test("moves a section onto another row", () => {
    expect(moveItem(["Hair Color", "Gel", "Hair Spray", "Wax"], 0, 2)).toEqual([
      "Gel",
      "Hair Spray",
      "Hair Color",
      "Wax",
    ]);
  });

  test("keeps unused categories in place when dropping a message section", () => {
    const ids = categoryIdsAfterVisibleMove(
      [
        { id: 1, name: "Tape" },
        { id: 2, name: "Hair Color" },
        { id: 3, name: "Soap" },
        { id: 4, name: "Hair Spray" },
        { id: 5, name: "Gel" },
      ],
      ["Hair Color", "Hair Spray", "Gel"],
      0,
      2
    );
    expect(ids).toEqual([1, 4, 3, 5, 2]);
  });

  test("keeps unused categories in place when swapping message sections", () => {
    const ids = categoryIdsAfterVisibleSwap(
      [
        { id: 1, name: "Tape" },
        { id: 2, name: "Hair Color" },
        { id: 3, name: "Soap" },
        { id: 4, name: "Hair Spray" },
      ],
      ["Hair Color", "Hair Spray"],
      0,
      1
    );
    expect(ids).toEqual([1, 4, 3, 2]);
  });

  test("stamps live category sortOrder onto products", () => {
    const products = applyCategorySort(
      [{ name: "Gel", category: "Gel", categoryId: 9, categorySortOrder: 80 }],
      [{ id: 9, name: "Gel", sortOrder: 1 }]
    );
    expect(products[0].categorySortOrder).toBe(1);
  });

  test("sorts products by saved category order then name", () => {
    const products = sortProductsByCategory(
      [
        { id: 1, name: "Zebra Wax", category: "Wax", categoryId: 3 },
        { id: 2, name: "Apple Color", category: "Hair Color", categoryId: 1 },
        { id: 3, name: "Beta Spray", category: "Hair Spray", categoryId: 2 },
        { id: 4, name: "Alpha Spray", category: "Hair Spray", categoryId: 2 },
      ],
      [
        { id: 2, name: "Hair Spray", sortOrder: 0 },
        { id: 3, name: "Wax", sortOrder: 1 },
        { id: 1, name: "Hair Color", sortOrder: 2 },
      ]
    );
    expect(products.map((row) => row.name)).toEqual([
      "Alpha Spray",
      "Beta Spray",
      "Zebra Wax",
      "Apple Color",
    ]);
  });
});

describe("formatCatalogLine", () => {
  test("formats name and sale price without a pcs unit", () => {
    expect(formatCatalogLine({ name: "Archi Cap", unit: "pcs", salePrice: 45 })).toBe(
      "Archi Cap — *Rs\u00A045*"
    );
  });

  test("prefers the client's custom rate and keeps non-pcs units", () => {
    expect(
      formatCatalogLine({
        productName: "Soap",
        unit: "dz",
        customPrice: 1300,
        salePrice: 1250,
      })
    ).toBe("Soap (dz) — *Rs\u00A01,300*");
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
        category: "Caps",
        soldQty: 12,
        lastBoughtAt: "2026-09-01T00:00:00.000Z",
      },
    ]);
    expect(products[0]).toMatchObject({
      name: "Cap",
      customPrice: 55,
      productId: 9,
      soldQty: 12,
      category: "Caps",
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

describe("groupOutreachRecipients", () => {
  test("splits identical lists from custom lists", () => {
    const groups = groupOutreachRecipients([
      {
        fingerprint: rateListFingerprint([
          { productId: 1, customPrice: 80 },
          { productId: 2, customPrice: 40 },
        ]),
        phone: "03001111001",
        name: "A",
        items: [{ productId: 1, customPrice: 80 }],
      },
      {
        fingerprint: rateListFingerprint([
          { productId: 2, customPrice: 40 },
          { productId: 1, customPrice: 80 },
        ]),
        phone: "03001111002",
        name: "B",
        items: [{ productId: 1, customPrice: 80 }],
      },
      {
        fingerprint: rateListFingerprint([{ productId: 1, customPrice: 99 }]),
        phone: "03001111003",
        name: "C",
        items: [{ productId: 1, customPrice: 99 }],
      },
    ]);
    expect(groups[0].kind).toBe("shared");
    expect(groups[0].recipients).toHaveLength(2);
    expect(groups[1].kind).toBe("custom");
    expect(formatBroadcastNumbers(groups[0].recipients)).toBe("03001111001\n03001111002");
  });
});

describe("buildWhatsAppQueue", () => {
  const products = [{ name: "Cap", unit: "pcs", customPrice: 80 }];

  test("builds one pasteable chat link per shop", () => {
    const queue = buildWhatsAppQueue(
      [
        { clientId: 1, name: "AlBaig Store", phone: "03014180382" },
        { clientId: 2, name: "City Mart", phone: "03001234001" },
      ],
      { businessName: "Hamari shop", products }
    );

    expect(queue).toHaveLength(2);
    expect(queue[0].href).toContain("phone=923014180382");
    expect(queue[0].href).toContain(encodeURIComponent("Assalamualaikum *AlBaig Store*,"));
    expect(queue[1].href).toContain("phone=923001234001");
    expect(queue[1].href).toContain(encodeURIComponent("Assalamualaikum *City Mart*,"));
    expect(queue[0].href).not.toBe(queue[1].href);
  });

  test("skips shops with no phone", () => {
    const queue = buildWhatsAppQueue(
      [
        { clientId: 1, name: "No Phone", phone: "" },
        { clientId: 2, name: "City Mart", phone: "03001234001" },
      ],
      { products }
    );

    expect(queue).toHaveLength(1);
    expect(queue[0].name).toBe("City Mart");
  });
});

describe("whatsappPrefillHref", () => {
  test("prefills short messages", () => {
    const result = whatsappPrefillHref("Rate list", "03001234001");
    expect(result.mode).toBe("prefill");
    expect(result.href).toContain(encodeURIComponent("Rate list"));
  });
});

describe("whatsappOpenHref", () => {
  test("opens WhatsApp Web with the message already in the chat box", () => {
    const text = encodeURIComponent("Rate list");
    expect(whatsappWebSendHref("Rate list", "", "03001234001")).toBe(
      `https://web.whatsapp.com/send?phone=923001234001&type=phone_number&app_absent=0&text=${text}`
    );
    expect(whatsappOpenHref("Rate list", "", "03001234001", "Mozilla/5.0")).toBe(
      `https://web.whatsapp.com/send?phone=923001234001&type=phone_number&app_absent=0&text=${text}`
    );
  });

  test("uses wa.me on phones so the WhatsApp app opens", () => {
    expect(whatsappOpenHref("Rate list", "", "03001234001", "Mozilla/5.0 (iPhone)")).toBe(
      `https://wa.me/923001234001?text=${encodeURIComponent("Rate list")}`
    );
  });
});

describe("openWhatsAppWindow", () => {
  test("does not open a second WhatsApp Web tab", () => {
    const open = jest.spyOn(window, "open");
    const href =
      "https://web.whatsapp.com/send?phone=923001234001&type=phone_number&app_absent=0&text=Hi";

    expect(openWhatsAppWindow(href)).toBeNull();
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  test("still opens wa.me on phones in one named tab", () => {
    const popup = { opener: window, focus: jest.fn() };
    const open = jest.spyOn(window, "open").mockReturnValue(popup);
    const href = "https://wa.me/923001234001?text=Hi";

    openWhatsAppWindow(href);

    expect(open).toHaveBeenCalledWith(href, WHATSAPP_WINDOW_NAME);
    open.mockRestore();
  });
});
