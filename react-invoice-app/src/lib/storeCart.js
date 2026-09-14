export function cartStorageKey(token) {
  return `store-cart:${token}`;
}

export function loadCart(token) {
  if (!token) return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(cartStorageKey(token)) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function saveCart(token, cart) {
  if (!token) return;
  localStorage.setItem(cartStorageKey(token), JSON.stringify(cart));
}

export function clearCart(token) {
  if (!token) return;
  localStorage.removeItem(cartStorageKey(token));
}

export function cartCount(cart) {
  return Object.values(cart || {}).reduce((sum, qty) => sum + Number(qty || 0), 0);
}

export { productImageSrc } from "./productImage";
