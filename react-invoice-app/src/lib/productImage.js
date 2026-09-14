const API_ORIGIN = process.env.REACT_APP_API_BASE_URL || "";

export function productImageSrc(url, baseUrl = API_ORIGIN) {
  if (!url) return null;
  const value = String(url).trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value) || value.startsWith("data:")) return value;
  if (value.startsWith("/")) {
    const base = String(baseUrl || "").replace(/\/$/, "");
    return `${base}${value}`;
  }
  return value;
}
