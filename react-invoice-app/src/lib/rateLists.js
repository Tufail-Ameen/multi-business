import { formatAmount } from "../utils/invoice";

export function unwrapRateList(response) {
  if (!response) return null;
  return response.rateList ?? response;
}

export function unwrapRateLists(response) {
  if (!response) return { rateLists: [], pagination: undefined };
  if (Array.isArray(response)) {
    return { rateLists: response, pagination: undefined };
  }
  return {
    rateLists: response.rateLists || response.items || [],
    pagination: response.pagination,
  };
}

export function toMoneyNumber(value) {
  if (value == null || value === "") return null;
  if (typeof value === "object") {
    return toMoneyNumber(value.amount ?? value.value ?? value.sale ?? null);
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").replace(/[^\d.-]/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function productDefaultPrice(product) {
  if (!product) return 0;
  const candidates = [
    product.salePrice,
    product.sale_price,
    product.wholesalePrice,
    product.wholesale_price,
    product.printRate,
    product.print_rate,
    product.netRate,
    product.net_rate,
    product.price,
  ];
  for (const candidate of candidates) {
    const n = toMoneyNumber(candidate);
    if (n != null && n > 0) return n;
  }
  for (const candidate of candidates) {
    const n = toMoneyNumber(candidate);
    if (n != null) return n;
  }
  return 0;
}

export function catalogSelection(products) {
  const next = {};
  for (const product of products || []) {
    next[String(product.id)] = itemFromProduct(product);
  }
  return next;
}

export function matchesRateListQuery(product, query) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return true;
  return [product.name, product.productName, product.sku, product.barcode, product.unit]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

export function splitCatalogColumns(products) {
  const list = products || [];
  const rows = Math.ceil(list.length / 2);
  return {
    left: list.slice(0, rows),
    right: list.slice(rows),
  };
}

export function paginateCatalogProducts(products, perPage, mergeIfLastBelow = 0) {
  const list = products || [];
  const size = Math.max(1, perPage);
  const pages = [];
  for (let i = 0; i < list.length; i += size) {
    pages.push(list.slice(i, i + size));
  }
  const threshold = Math.max(0, mergeIfLastBelow);
  if (threshold && pages.length > 1 && pages[pages.length - 1].length < threshold) {
    const last = pages.pop();
    pages[pages.length - 1] = pages[pages.length - 1].concat(last);
  }
  return pages;
}

export function rateListStatus(list) {
  return String(list?.status || "DRAFT").toUpperCase();
}

export function getShareToken(rateList) {
  if (rateList?.shareToken) return rateList.shareToken;
  const path = rateList?.sharePath;
  if (!path) return null;
  const parts = String(path).split("/").filter(Boolean);
  return parts[parts.length - 1] || null;
}

export function getRateListShareUrl(rateList) {
  const token = getShareToken(rateList);
  if (!token) return null;
  return `${window.location.origin}/share/rate-lists/${token}`;
}

export function getStoreShareUrl(rateList) {
  const token = getShareToken(rateList);
  if (!token) return null;
  return storeUrlFromToken(token);
}

export function storeUrlFromToken(token) {
  if (!token) return null;
  return `${window.location.origin}/store/${token}`;
}

export function isLocalhostOrigin() {
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

export function priceDelta(customPrice, defaultPrice) {
  return Number(customPrice || 0) - Number(defaultPrice || 0);
}

export function formatPrice(amount) {
  return formatAmount("Rs", amount);
}

export function formatDelta(customPrice, defaultPrice) {
  const delta = priceDelta(customPrice, defaultPrice);
  if (!delta) return { text: "—", tone: "flat" };
  const sign = delta > 0 ? "+" : "−";
  return {
    text: `${sign}${formatAmount("Rs", Math.abs(delta))}`,
    tone: delta > 0 ? "up" : "down",
  };
}

export function buildRateListItems(selected) {
  return Object.values(selected).map((item) => {
    const payload = { productId: Number(item.productId) };
    const custom = Number(item.customPrice);
    if (item.customPrice !== "" && Number.isFinite(custom) && custom >= 0) {
      payload.customPrice = custom;
    }
    return payload;
  });
}

export function itemsFromRateList(list) {
  const next = {};
  for (const item of list?.items || []) {
    const id = String(item.productId);
    const defaultPrice = productDefaultPrice({
      ...item,
      salePrice: item.defaultPrice ?? item.salePrice,
    });
    next[id] = {
      productId: item.productId,
      productName: item.productName,
      sku: item.sku,
      unit: item.unit,
      defaultPrice,
      customPrice: toMoneyNumber(item.customPrice ?? item.price) ?? defaultPrice,
    };
  }
  return next;
}

export function itemFromProduct(product) {
  const defaultPrice = productDefaultPrice(product);
  return {
    productId: product.id,
    productName: product.name,
    sku: product.sku,
    unit: product.unit || "pcs",
    defaultPrice,
    customPrice: defaultPrice,
  };
}

export function shareMessage(rateList) {
  const title = rateList?.title || "Rate list";
  const client = rateList?.clientName ? ` for ${rateList.clientName}` : "";
  return `${title}${client}`;
}

export function whatsappDigits(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("92")) return digits;
  if (digits.startsWith("0")) return `92${digits.slice(1)}`;
  return digits;
}

const CHAT_NBSP = "\u00A0";

function waBold(text) {
  const safe = String(text || "").replace(/\*/g, "•").trim();
  return safe ? `*${safe}*` : "";
}

function productChatName(product) {
  return String(product?.name || product?.productName || "").trim();
}

function catalogUnitLabel(unit) {
  const value = String(unit || "pcs").trim();
  if (!value || value.toLowerCase() === "pcs") return "";
  return value;
}

export function formatChatPrice(amount) {
  return formatPrice(amount).replace(/ /g, CHAT_NBSP);
}

export function catalogCategoryKey(product) {
  return String(product?.category || "").trim();
}

export function groupCatalogByCategory(products) {
  const list = (products || []).filter((product) => productChatName(product));
  const grouped = new Map();
  for (const product of list) {
    const category = catalogCategoryKey(product);
    const id = category ? category.toLowerCase() : "__none__";
    const rank = Number(product?.categorySortOrder);
    if (!grouped.has(id)) {
      grouped.set(id, {
        category: category || null,
        sortOrder: Number.isFinite(rank) ? rank : null,
        items: [],
      });
    } else if (Number.isFinite(rank)) {
      const group = grouped.get(id);
      if (group.sortOrder == null || rank < group.sortOrder) {
        group.sortOrder = rank;
      }
    }
    grouped.get(id).items.push(product);
  }

  const named = [...grouped.values()]
    .filter((group) => group.category)
    .sort((a, b) => {
      if (a.sortOrder != null && b.sortOrder != null && a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      if (a.sortOrder != null && b.sortOrder == null) return -1;
      if (a.sortOrder == null && b.sortOrder != null) return 1;
      return a.category.localeCompare(b.category, undefined, { sensitivity: "base" });
    });
  const none = grouped.get("__none__");
  if (none?.items.length) {
    named.push(none);
  }
  return named;
}

export function applyCategorySort(products, categories) {
  if (!categories?.length) return products || [];
  const byId = new Map();
  const byName = new Map();
  for (const [index, category] of categories.entries()) {
    const rank = Number.isFinite(Number(category?.sortOrder))
      ? Number(category.sortOrder)
      : index;
    if (category?.id != null) byId.set(Number(category.id), rank);
    const name = String(category?.name || "").trim().toLowerCase();
    if (name) byName.set(name, rank);
  }
  return (products || []).map((product) => {
    const fromId = byId.get(Number(product?.categoryId));
    const fromName = byName.get(catalogCategoryKey(product).toLowerCase());
    const rank = fromId ?? fromName;
    if (rank == null) return product;
    return { ...product, categorySortOrder: rank };
  });
}

export function sortProductsByCategory(products, categories) {
  const stamped = applyCategorySort(products, categories);
  return [...stamped].sort(compareByCategoryOrder);
}

export function applyNamedCategoryOrder(products, orderedNames) {
  const names = (orderedNames || []).map((name) => String(name || "").trim()).filter(Boolean);
  if (!names.length) return products || [];
  const rank = new Map(names.map((name, index) => [name.toLowerCase(), index]));
  return (products || []).map((product) => {
    const key = catalogCategoryKey(product).toLowerCase();
    if (!rank.has(key)) return product;
    return { ...product, categorySortOrder: rank.get(key) };
  });
}

export function moveItem(items, fromIndex, toIndex) {
  const list = [...(items || [])];
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= list.length ||
    toIndex >= list.length
  ) {
    return list;
  }
  const next = [...list];
  const [row] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, row);
  return next;
}

export function swapAdjacent(items, index, delta) {
  return moveItem(items, index, index + delta);
}

export function categoryIdsAfterVisibleMove(allCategories, visibleNames, fromIndex, toIndex) {
  const nextVisible = moveItem(visibleNames, fromIndex, toIndex);
  const byName = new Map(
    (allCategories || []).map((category) => [
      String(category?.name || "").trim().toLowerCase(),
      category,
    ])
  );
  const visibleSet = new Set(
    (visibleNames || []).map((name) => String(name || "").trim().toLowerCase()).filter(Boolean)
  );
  const next = [...(allCategories || [])];
  const slots = [];
  next.forEach((category, slot) => {
    if (visibleSet.has(String(category?.name || "").trim().toLowerCase())) {
      slots.push(slot);
    }
  });
  nextVisible.forEach((name, i) => {
    const category = byName.get(String(name || "").trim().toLowerCase());
    if (category && slots[i] != null) next[slots[i]] = category;
  });
  return next.map((category) => category.id).filter((id) => id != null);
}

export function categoryIdsAfterVisibleSwap(allCategories, visibleNames, index, delta) {
  return categoryIdsAfterVisibleMove(allCategories, visibleNames, index, index + delta);
}

export function messageCategoryNames(products) {
  return groupCatalogByCategory(products)
    .map((group) => group.category)
    .filter(Boolean);
}

export function formatCatalogLine(product) {
  const name = productChatName(product);
  if (!name) return "";
  const unit = catalogUnitLabel(product?.unit);
  const price =
    toMoneyNumber(product?.customPrice ?? product?.price) ?? productDefaultPrice(product);
  const unitPart = unit ? ` (${unit})` : "";
  return `${name}${unitPart} — ${waBold(formatChatPrice(price))}`;
}

export function formatCatalogMessageLines(products) {
  const groups = groupCatalogByCategory(products);
  if (!groups.length) return [];

  const useHeaders = groups.some((group) => group.category && group.items.length);
  if (!useHeaders) {
    return groups
      .flatMap((group) => group.items)
      .map((product, index) => `${index + 1}. ${formatCatalogLine(product)}`)
      .filter((line) => line.length > 3);
  }

  const lines = [];
  for (const group of groups) {
    const heading = group.category || "Other";
    if (lines.length) lines.push("");
    lines.push(waBold(heading));
    for (const product of group.items) {
      const line = formatCatalogLine(product);
      if (line) lines.push(`• ${line}`);
    }
  }
  return lines;
}

export function rateListItemsForMessage(items) {
  return (items || [])
    .map((item) => ({
      productId: item.productId,
      name: item.productName || item.name,
      productName: item.productName || item.name,
      unit: item.unit || "pcs",
      customPrice: item.customPrice ?? item.price,
      salePrice: item.defaultPrice ?? item.salePrice,
      category: item.category || null,
      categoryId: item.categoryId ?? null,
      categorySortOrder: Number.isFinite(Number(item.categorySortOrder))
        ? Number(item.categorySortOrder)
        : null,
      soldQty: Number(item.soldQty) || 0,
      lastBoughtAt: item.lastBoughtAt || null,
    }))
    .filter((item) => item.name);
}

export const RATE_LIST_SORT = Object.freeze({
  BUYS_MOST: "buys_most",
  RECENT: "recent",
  NEW_FIRST: "new_first",
  NAME: "name",
  SAVED: "saved",
});

export const RATE_LIST_SORT_OPTIONS = [
  { id: RATE_LIST_SORT.BUYS_MOST, label: "This shop buys most" },
  { id: RATE_LIST_SORT.RECENT, label: "Recently bought" },
  { id: RATE_LIST_SORT.NEW_FIRST, label: "New items first" },
  { id: RATE_LIST_SORT.NAME, label: "A–Z" },
  { id: RATE_LIST_SORT.SAVED, label: "Saved order" },
];

const RATE_LIST_SORT_HINTS = {
  [RATE_LIST_SORT.BUYS_MOST]: "Items this shop already buys stay at the top.",
  [RATE_LIST_SORT.RECENT]: "Latest purchases first, then items they have not bought.",
  [RATE_LIST_SORT.NEW_FIRST]: "Items they have not bought yet stay at the top.",
  [RATE_LIST_SORT.NAME]: "Alphabetical by product name.",
  [RATE_LIST_SORT.SAVED]: "Same order as the saved rate list.",
};

export function rateListSortHint(mode) {
  return RATE_LIST_SORT_HINTS[mode] || RATE_LIST_SORT_HINTS[RATE_LIST_SORT.BUYS_MOST];
}

export function isRateListSortMode(value) {
  return RATE_LIST_SORT_OPTIONS.some((row) => row.id === value);
}

function productSortKey(item) {
  return String(item?.productId ?? item?.id ?? "");
}

function productSortName(item) {
  return String(item?.name || item?.productName || "").toLowerCase();
}

function compareByName(a, b) {
  const byName = productSortName(a).localeCompare(productSortName(b));
  if (byName) return byName;
  return productSortKey(a).localeCompare(productSortKey(b));
}

function compareByCategoryOrder(a, b) {
  const ao = Number(a?.categorySortOrder);
  const bo = Number(b?.categorySortOrder);
  const aRank = Number.isFinite(ao) ? ao : Number.POSITIVE_INFINITY;
  const bRank = Number.isFinite(bo) ? bo : Number.POSITIVE_INFINITY;
  if (aRank !== bRank) return aRank - bRank;
  return compareByName(a, b);
}

function soldQtyOf(item, stats) {
  if (stats instanceof Map) {
    const row = stats.get(productSortKey(item)) || stats.get(Number(item?.productId));
    if (row) return Number(row.qty ?? row.soldQty) || 0;
  }
  return Number(item?.soldQty) || 0;
}

function lastBoughtOf(item, stats) {
  if (stats instanceof Map) {
    const row = stats.get(productSortKey(item)) || stats.get(Number(item?.productId));
    if (row?.lastBoughtAt) return new Date(row.lastBoughtAt).getTime() || 0;
  }
  if (item?.lastBoughtAt) return new Date(item.lastBoughtAt).getTime() || 0;
  return 0;
}

export function sortRateListProducts(products, mode = RATE_LIST_SORT.BUYS_MOST, stats) {
  const list = [...(products || [])];
  if (!list.length || mode === RATE_LIST_SORT.SAVED) return list;
  if (mode === RATE_LIST_SORT.NAME) return list.sort(compareByName);

  const bought = [];
  const never = [];
  for (const item of list) {
    if (soldQtyOf(item, stats) > 0) bought.push(item);
    else never.push(item);
  }
  never.sort(compareByName);

  const byQtyThenRecent = (a, b) => {
    const qty = soldQtyOf(b, stats) - soldQtyOf(a, stats);
    if (qty) return qty;
    const recency = lastBoughtOf(b, stats) - lastBoughtOf(a, stats);
    if (recency) return recency;
    return compareByName(a, b);
  };
  const byRecentThenQty = (a, b) => {
    const recency = lastBoughtOf(b, stats) - lastBoughtOf(a, stats);
    if (recency) return recency;
    const qty = soldQtyOf(b, stats) - soldQtyOf(a, stats);
    if (qty) return qty;
    return compareByName(a, b);
  };

  if (mode === RATE_LIST_SORT.RECENT) {
    bought.sort(byRecentThenQty);
    return [...bought, ...never];
  }
  if (mode === RATE_LIST_SORT.NEW_FIRST) {
    bought.sort(byQtyThenRecent);
    return [...never, ...bought];
  }
  bought.sort(byQtyThenRecent);
  return [...bought, ...never];
}

export function pickSendableRateList(rateLists) {
  const open = (rateLists || []).filter(
    (list) => String(list?.status || "DRAFT").toUpperCase() !== "ARCHIVED"
  );
  if (!open.length) return null;
  return [...open].sort((a, b) => {
    const aTime = new Date(a.updatedAt || a.sentAt || a.createdAt || 0).getTime();
    const bTime = new Date(b.updatedAt || b.sentAt || b.createdAt || 0).getTime();
    return bTime - aTime;
  })[0];
}

export function rateListFingerprint(items) {
  return (items || [])
    .map((item) => {
      const id = item?.productId ?? item?.id;
      const price =
        toMoneyNumber(item?.customPrice ?? item?.price) ?? productDefaultPrice(item) ?? 0;
      return `${id}:${price}`;
    })
    .filter((part) => !part.startsWith("undefined:") && !part.startsWith("null:"))
    .sort()
    .join("|");
}

export function groupOutreachRecipients(rows) {
  const byKey = new Map();
  for (const row of rows || []) {
    const key = row.fingerprint || "";
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(row);
  }
  return [...byKey.values()]
    .map((recipients) => ({
      kind: recipients.length >= 2 ? "shared" : "custom",
      fingerprint: recipients[0].fingerprint,
      itemCount: recipients[0].itemCount || recipients[0].items?.length || 0,
      items: recipients[0].items || [],
      recipients,
    }))
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "shared" ? -1 : 1;
      return b.recipients.length - a.recipients.length;
    });
}

export function formatBroadcastNumbers(recipients) {
  return (recipients || [])
    .map((row) => String(row.phone || "").trim())
    .filter(Boolean)
    .join("\n");
}

export function buildWhatsAppQueue(recipients, { businessName, products = [], shareUrl = "" } = {}) {
  return (recipients || [])
    .filter((row) => whatsappDigits(row?.phone))
    .map((row) => {
      const message = clientOutreachMessage({
        clientName: row.name,
        businessName,
        shareUrl,
        products,
      });
      const { href, mode } = whatsappPrefillHref(message, row.phone);
      return {
        clientId: row.clientId,
        name: row.name,
        phone: row.phone,
        itemCount: products.length,
        message,
        href,
        mode,
      };
    });
}

export function clientOutreachMessage({
  clientName,
  businessName,
  shareUrl,
  products = [],
} = {}) {
  const shop = String(clientName || "").trim();
  const brand = String(businessName || "").trim() || "Hamari shop";
  const greeting = shop ? `Assalamualaikum ${waBold(shop)},` : "Assalamualaikum,";
  const lines = [
    greeting,
    "",
    `${waBold(brand)} se order booker hoon.`,
    "Aaj ka order lene aya hoon — rates yeh hain:",
  ];
  const catalog = formatCatalogMessageLines(products);
  if (catalog.length) {
    lines.push("", ...catalog);
  }
  lines.push(
    "",
    "Jo maal chahiye uski quantity reply mein bhej dein, order book kar leta hoon."
  );
  if (shareUrl) {
    lines.push("", `Order link: ${shareUrl}`);
  }
  return lines.join("\n");
}

export function catalogShareMessage(products) {
  const lines = formatCatalogMessageLines(products);
  return ["Rate list", "", ...lines].join("\n");
}

export const WHATSAPP_HREF_MAX_LENGTH = 2000;
export const WHATSAPP_WINDOW_NAME = "whatsapp";

export function whatsappShareHref(message, shareUrl, phone) {
  const text = shareUrl ? `${message}\n${shareUrl}` : message;
  const digits = whatsappDigits(phone);
  const path = digits ? `/${digits}` : "/";
  const encoded = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me${path}${encoded}`;
}

export function isMobileWhatsAppClient(
  userAgent = typeof navigator !== "undefined" ? navigator.userAgent : ""
) {
  return /Android|iPhone|iPad|iPod/i.test(userAgent);
}

export function whatsappWebSendHref(message, shareUrl, phone) {
  const text = shareUrl ? `${message}\n${shareUrl}` : message;
  const digits = whatsappDigits(phone);
  const parts = [];
  if (digits) {
    parts.push(`phone=${digits}`);
    parts.push("type=phone_number");
    parts.push("app_absent=0");
  }
  if (text) parts.push(`text=${encodeURIComponent(text)}`);
  return `https://web.whatsapp.com/send${parts.length ? `?${parts.join("&")}` : ""}`;
}

export function whatsappOpenHref(message, shareUrl, phone, userAgent) {
  if (isMobileWhatsAppClient(userAgent)) {
    return whatsappShareHref(message, shareUrl, phone);
  }
  return whatsappWebSendHref(message, shareUrl, phone);
}

export function whatsappPrefillHref(message, phone) {
  const href = whatsappOpenHref(message, "", phone);
  if (href.length <= WHATSAPP_HREF_MAX_LENGTH) {
    return { href, mode: "prefill" };
  }
  return { href: whatsappOpenHref("", "", phone), mode: "paste" };
}

export function openWhatsAppWindow(href) {
  if (!href || typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }
  // WhatsApp Web uses COOP, so a second web.whatsapp.com tab cannot join
  // the tab that is already logged in — it only kicks that session out.
  if (/^https:\/\/web\.whatsapp\.com/i.test(href)) {
    return null;
  }
  if (href.startsWith("whatsapp:")) {
    const link = document.createElement("a");
    link.href = href;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return link;
  }
  const popup = window.open(href, WHATSAPP_WINDOW_NAME);
  if (popup) {
    try {
      popup.opener = null;
    } catch {
      /* ignore */
    }
    try {
      popup.focus();
    } catch {
      /* ignore */
    }
  }
  return popup;
}

export function mailtoShareHref(rateList, shareUrl) {
  const subject = rateList?.title || "Rate list";
  const body = `${shareMessage(rateList)}\n${shareUrl}`;
  const email = rateList?.clientEmail || "";
  const prefix = email ? `mailto:${encodeURIComponent(email)}` : "mailto:";
  return `${prefix}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export async function copyText(value) {
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
