/**
 * Product images: persist in MongoDB (Vercel has no durable disk) and
 * optionally mirror to /uploads for local dev.
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

const MIME_FROM_EXT = Object.freeze({
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
});

const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
const PRODUCT_IMAGES = "product_images";

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

function parseStoredImagePath(imageUrl) {
  const url = String(imageUrl || "").trim();
  const match = url.match(/^\/uploads\/products\/([^/]+)\/([^/]+)$/);
  if (!match) return null;
  const businessId = match[1];
  const filename = match[2];
  if (
    businessId.includes("..") ||
    filename.includes("..") ||
    !/^[A-Za-z0-9._-]+$/.test(businessId) ||
    !/^[A-Za-z0-9._-]+$/.test(filename)
  ) {
    return null;
  }
  return {
    businessId,
    filename,
    key: `${businessId}/${filename}`,
  };
}

function mimeFromFilename(filename) {
  const ext = path.extname(String(filename || "")).slice(1).toLowerCase();
  return MIME_FROM_EXT[ext] || "application/octet-stream";
}

function toBuffer(data) {
  if (!data) return null;
  if (Buffer.isBuffer(data)) return data;
  if (data.buffer) return Buffer.from(data.buffer);
  return null;
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

async function writeDiskCopy(businessId, filename, buffer) {
  const dir = path.join(uploadsRoot(), "products", String(businessId));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), buffer);
}

async function saveProductImageBuffer({
  db,
  businessId,
  productId,
  mimeType,
  buffer,
}) {
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
  if (!db) {
    throw new Error("saveProductImageBuffer requires db");
  }

  const filename = `${productId}-${crypto.randomBytes(8).toString("hex")}.${ext}`;
  const key = `${businessId}/${filename}`;
  await db.collection(PRODUCT_IMAGES).insertOne({
    key,
    businessId,
    productId,
    filename,
    mimeType,
    data: buffer,
    createdAt: new Date(),
  });

  try {
    await writeDiskCopy(businessId, filename, buffer);
  } catch {
    // Vercel / read-only FS — MongoDB is the source of truth.
  }

  return `/uploads/products/${businessId}/${filename}`;
}

async function removeLocalProductImage(imageUrl) {
  const parsed = parseStoredImagePath(imageUrl);
  if (!parsed) return;

  const abs = path.resolve(
    uploadsRoot(),
    "products",
    parsed.businessId,
    parsed.filename
  );
  const root = path.resolve(uploadsRoot());
  if (abs !== root && !abs.startsWith(root + path.sep)) return;
  await fs.unlink(abs).catch(() => {});
}

async function removeProductImage(db, imageUrl) {
  const parsed = parseStoredImagePath(imageUrl);
  if (parsed && db) {
    await db.collection(PRODUCT_IMAGES).deleteOne({ key: parsed.key });
  }
  await removeLocalProductImage(imageUrl);
}

async function loadProductImage(db, parsed) {
  if (!parsed) return null;

  if (db) {
    const doc = await db.collection(PRODUCT_IMAGES).findOne({ key: parsed.key });
    const buffer = toBuffer(doc?.data);
    if (buffer && buffer.length) {
      return {
        buffer,
        mimeType: doc.mimeType || mimeFromFilename(parsed.filename),
      };
    }
  }

  const abs = path.resolve(
    uploadsRoot(),
    "products",
    parsed.businessId,
    parsed.filename
  );
  const root = path.resolve(uploadsRoot());
  if (abs === root || !abs.startsWith(root + path.sep)) return null;

  try {
    const buffer = await fs.readFile(abs);
    if (db) {
      await db
        .collection(PRODUCT_IMAGES)
        .updateOne(
          { key: parsed.key },
          {
            $setOnInsert: {
              key: parsed.key,
              businessId: parsed.businessId,
              filename: parsed.filename,
              mimeType: mimeFromFilename(parsed.filename),
              data: buffer,
              createdAt: new Date(),
            },
          },
          { upsert: true }
        )
        .catch(() => {});
    }
    return { buffer, mimeType: mimeFromFilename(parsed.filename) };
  } catch {
    return null;
  }
}

async function syncDiskProductImagesToMongo(db) {
  if (!db) return 0;
  const root = path.join(uploadsRoot(), "products");
  let businessDirs;
  try {
    businessDirs = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return 0;
  }

  let count = 0;
  for (const dir of businessDirs) {
    if (!dir.isDirectory()) continue;
    const files = await fs.readdir(path.join(root, dir.name));
    for (const filename of files) {
      const parsed = parseStoredImagePath(
        `/uploads/products/${dir.name}/${filename}`
      );
      if (!parsed) continue;
      const existing = await db
        .collection(PRODUCT_IMAGES)
        .findOne({ key: parsed.key }, { projection: { _id: 1 } });
      if (existing) continue;
      const buffer = await fs
        .readFile(path.join(root, dir.name, filename))
        .catch(() => null);
      if (!buffer || !buffer.length) continue;
      await db.collection(PRODUCT_IMAGES).insertOne({
        key: parsed.key,
        businessId: dir.name,
        filename,
        mimeType: mimeFromFilename(filename),
        data: buffer,
        createdAt: new Date(),
      });
      count += 1;
    }
  }
  return count;
}

function registerProductImageRoutes(app, db) {
  app.get("/uploads/products/:businessId/:filename", async (req, res, next) => {
    try {
      const parsed = parseStoredImagePath(
        `/uploads/products/${req.params.businessId}/${req.params.filename}`
      );
      if (!parsed) {
        res.status(404).end();
        return;
      }
      const image = await loadProductImage(db, parsed);
      if (!image) {
        res.status(404).end();
        return;
      }
      res.setHeader("Content-Type", image.mimeType);
      res.setHeader("Cache-Control", "public, max-age=86400, immutable");
      res.send(image.buffer);
    } catch (error) {
      next(error);
    }
  });
}

module.exports = {
  MAX_IMAGE_BYTES,
  isAllowedImageUrl,
  parseImageBase64,
  parseStoredImagePath,
  saveProductImageBuffer,
  removeLocalProductImage,
  removeProductImage,
  loadProductImage,
  syncDiskProductImagesToMongo,
  registerProductImageRoutes,
  uploadsRoot,
};
