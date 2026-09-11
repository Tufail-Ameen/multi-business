/**
 * Product image helpers: remote URL or base64 saved under /uploads.
 */

const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const ALLOWED_MIME = Object.freeze({
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
});

const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;

function uploadsRoot() {
  return process.env.UPLOADS_DIR || path.join(__dirname, "uploads");
}

function isAllowedImageUrl(value) {
  const url = String(value || "").trim();
  if (!url) return false;
  if (url.startsWith("/uploads/")) return !url.includes("..");
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function parseImageBase64(imageBase64, mimeType) {
  const raw = String(imageBase64 || "").trim();
  if (!raw) return null;

  const dataUrl = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i);
  if (dataUrl) {
    return {
      mimeType: dataUrl[1].toLowerCase(),
      buffer: Buffer.from(dataUrl[2], "base64"),
    };
  }

  const mime = String(mimeType || "").trim().toLowerCase();
  if (!mime) return null;
  return {
    mimeType: mime,
    buffer: Buffer.from(raw, "base64"),
  };
}

async function saveProductImageBuffer({ businessId, productId, mimeType, buffer }) {
  const ext = ALLOWED_MIME[mimeType];
  if (!ext) {
    const err = new Error("Unsupported image type. Use jpeg, png, webp, or gif");
    err.status = 400;
    err.code = "INVALID_IMAGE_TYPE";
    throw err;
  }
  if (!buffer || !buffer.length) {
    const err = new Error("Image data is empty");
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    const err = new Error("Image must be 1.5MB or smaller");
    err.status = 400;
    err.code = "IMAGE_TOO_LARGE";
    throw err;
  }

  const dir = path.join(uploadsRoot(), "products", String(businessId));
  await fs.mkdir(dir, { recursive: true });
  const filename = `${productId}-${crypto.randomBytes(8).toString("hex")}.${ext}`;
  await fs.writeFile(path.join(dir, filename), buffer);
  return `/uploads/products/${businessId}/${filename}`;
}

async function removeLocalProductImage(imageUrl) {
  const url = String(imageUrl || "");
  if (!url.startsWith("/uploads/")) return;

  const relative = url.replace(/^\/uploads\/?/, "");
  const abs = path.resolve(uploadsRoot(), relative);
  const root = path.resolve(uploadsRoot());
  if (abs !== root && !abs.startsWith(root + path.sep)) return;
  await fs.unlink(abs).catch(() => {});
}

module.exports = {
  MAX_IMAGE_BYTES,
  isAllowedImageUrl,
  parseImageBase64,
  saveProductImageBuffer,
  removeLocalProductImage,
  uploadsRoot,
};
