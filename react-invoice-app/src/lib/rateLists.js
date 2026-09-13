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

export function formatCatalogLine(product) {
  const name = product?.name || product?.productName || "";
  const unit = product?.unit || "pcs";
  const price =
    toMoneyNumber(product?.customPrice ?? product?.price) ?? productDefaultPrice(product);
  return `${name} — ${unit} — ${formatPrice(price)}`;
}

export function rateListItemsForMessage(items) {
  return (items || [])
    .map((item) => ({
      name: item.productName || item.name,
      productName: item.productName || item.name,
      unit: item.unit || "pcs",
      customPrice: item.customPrice ?? item.price,
      salePrice: item.defaultPrice ?? item.salePrice,
    }))
    .filter((item) => item.name);
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

export function clientOutreachMessage({
  clientName,
  businessName,
  shareUrl,
  products = [],
} = {}) {
  const shop = String(clientName || "").trim();
  const brand = String(businessName || "").trim() || "Hamari shop";
  const greeting = shop ? `Assalamualaikum ${shop},` : "Assalamualaikum,";
  const lines = [greeting, "", `${brand} ki latest rates:`];
  const catalog = (products || []).map(formatCatalogLine).filter(Boolean);
  if (catalog.length) {
    lines.push("", ...catalog);
  }
  if (shareUrl) {
    lines.push("", `Order: ${shareUrl}`);
  }
  return lines.join("\n");
}

export function catalogShareMessage(products) {
  const lines = (products || []).map(formatCatalogLine);
  return ["Rate list", "", ...lines].join("\n");
}

export const WHATSAPP_HREF_MAX_LENGTH = 2000;

export function whatsappShareHref(message, shareUrl, phone) {
  const text = shareUrl ? `${message}\n${shareUrl}` : message;
  const digits = whatsappDigits(phone);
  const path = digits ? `/${digits}` : "/";
  const encoded = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me${path}${encoded}`;
}

export function whatsappPrefillHref(message, phone) {
  const href = whatsappShareHref(message, "", phone);
  if (href.length <= WHATSAPP_HREF_MAX_LENGTH) {
    return { href, mode: "prefill" };
  }
  return { href: whatsappShareHref("", "", phone), mode: "paste" };
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
