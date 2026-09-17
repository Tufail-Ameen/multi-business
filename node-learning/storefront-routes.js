/**
 * Per-business public landing:
 * GET    /public/businesses/:slug
 * GET    /storefront
 * PATCH  /storefront
 */

const crypto = require("crypto");
const {
  defaultStorefront,
  ensureBusinessSettings,
  slugify,
} = require("./database");
const { writeAuditLog, actorDisplayName } = require("./audit");
const { parseContact } = require("./validation");
const { sortCatalogItems } = require("./catalogSort");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const FEATURED_LIMIT = 6;
const CATEGORY_LIMIT = 6;
const PRODUCT_BADGES = ["Bestseller", "New Arrival", "Top Rated"];

const STOREFRONT_STRING_LIMITS = {
  logoUrl: 500,
  coverUrl: 500,
  storyImageUrl: 500,
  instagramUrl: 500,
  facebookUrl: 500,
  primaryColor: 7,
  eyebrow: 80,
  heroTitle: 120,
  heroSubtitle: 280,
  ctaLabel: 40,
  storyTitle: 120,
  about: 2000,
  highlightTitle: 80,
  highlightText: 220,
  showcaseTitle: 80,
  showcaseText: 160,
  email: 120,
  address: 200,
  city: 80,
};

function toOptionalString(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function clip(value, max) {
  return String(value || "").trim().slice(0, max);
}

function productUnitPrice(product) {
  const n = Number(
    product?.salePrice ?? product?.printRate ?? product?.price ?? 0
  );
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function newStoreToken() {
  return crypto.randomBytes(32).toString("hex");
}

function defaultHighlights(city) {
  const place = city || "your city";
  return [
    {
      title: "Authentic Products",
      text: "100% genuine products sourced directly from trusted brands.",
    },
    {
      title: `Fast Delivery in ${place}`,
      text: "Same-day and next-day delivery on eligible orders.",
    },
    {
      title: "Best Prices",
      text: "Competitive rates with regular deals and discounts.",
    },
  ];
}

function normalizeStorefront(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    published: src.published === true,
    logoUrl: clip(src.logoUrl, STOREFRONT_STRING_LIMITS.logoUrl),
    coverUrl: clip(src.coverUrl, STOREFRONT_STRING_LIMITS.coverUrl),
    storyImageUrl: clip(src.storyImageUrl, STOREFRONT_STRING_LIMITS.storyImageUrl),
    primaryColor: clip(src.primaryColor, STOREFRONT_STRING_LIMITS.primaryColor),
    eyebrow: clip(src.eyebrow, STOREFRONT_STRING_LIMITS.eyebrow),
    heroTitle: clip(src.heroTitle, STOREFRONT_STRING_LIMITS.heroTitle),
    heroSubtitle: clip(src.heroSubtitle, STOREFRONT_STRING_LIMITS.heroSubtitle),
    ctaLabel: clip(src.ctaLabel, STOREFRONT_STRING_LIMITS.ctaLabel),
    storyTitle: clip(src.storyTitle, STOREFRONT_STRING_LIMITS.storyTitle),
    about: clip(src.about, STOREFRONT_STRING_LIMITS.about),
    highlight1Title: clip(src.highlight1Title, STOREFRONT_STRING_LIMITS.highlightTitle),
    highlight1Text: clip(src.highlight1Text, STOREFRONT_STRING_LIMITS.highlightText),
    highlight2Title: clip(src.highlight2Title, STOREFRONT_STRING_LIMITS.highlightTitle),
    highlight2Text: clip(src.highlight2Text, STOREFRONT_STRING_LIMITS.highlightText),
    highlight3Title: clip(src.highlight3Title, STOREFRONT_STRING_LIMITS.highlightTitle),
    highlight3Text: clip(src.highlight3Text, STOREFRONT_STRING_LIMITS.highlightText),
    whatsapp: clip(src.whatsapp, 11),
    phone: clip(src.phone, 11),
    email: clip(src.email, STOREFRONT_STRING_LIMITS.email),
    address: clip(src.address, STOREFRONT_STRING_LIMITS.address),
    city: clip(src.city, STOREFRONT_STRING_LIMITS.city),
    instagramUrl: clip(src.instagramUrl, STOREFRONT_STRING_LIMITS.instagramUrl),
    facebookUrl: clip(src.facebookUrl, STOREFRONT_STRING_LIMITS.facebookUrl),
    showcase1Title: clip(src.showcase1Title, STOREFRONT_STRING_LIMITS.showcaseTitle),
    showcase1Text: clip(src.showcase1Text, STOREFRONT_STRING_LIMITS.showcaseText),
    showcase1ImageUrl: clip(src.showcase1ImageUrl, STOREFRONT_STRING_LIMITS.coverUrl),
    showcase2Title: clip(src.showcase2Title, STOREFRONT_STRING_LIMITS.showcaseTitle),
    showcase2Text: clip(src.showcase2Text, STOREFRONT_STRING_LIMITS.showcaseText),
    showcase2ImageUrl: clip(src.showcase2ImageUrl, STOREFRONT_STRING_LIMITS.coverUrl),
    showcase3Title: clip(src.showcase3Title, STOREFRONT_STRING_LIMITS.showcaseTitle),
    showcase3Text: clip(src.showcase3Text, STOREFRONT_STRING_LIMITS.showcaseText),
    showcase3ImageUrl: clip(src.showcase3ImageUrl, STOREFRONT_STRING_LIMITS.coverUrl),
    showcase4Title: clip(src.showcase4Title, STOREFRONT_STRING_LIMITS.showcaseTitle),
    showcase4Text: clip(src.showcase4Text, STOREFRONT_STRING_LIMITS.showcaseText),
    showcase4ImageUrl: clip(src.showcase4ImageUrl, STOREFRONT_STRING_LIMITS.coverUrl),
  };
}

function publicHighlights(storefront) {
  const fallback = defaultHighlights(storefront.city);
  const custom = [
    { title: storefront.highlight1Title, text: storefront.highlight1Text },
    { title: storefront.highlight2Title, text: storefront.highlight2Text },
    { title: storefront.highlight3Title, text: storefront.highlight3Text },
  ];
  return custom.map((item, index) => ({
    title: item.title || fallback[index].title,
    text: item.text || fallback[index].text,
  }));
}

function publicShowcases(storefront) {
  return [1, 2, 3, 4]
    .map((index) => ({
      title: storefront[`showcase${index}Title`] || "",
      text: storefront[`showcase${index}Text`] || "",
      imageUrl: storefront[`showcase${index}ImageUrl`] || "",
    }))
    .filter((item) => item.imageUrl || item.title);
}

function publicStorefront(storefront, businessName) {
  const city = storefront.city || "";
  return {
    logoUrl: storefront.logoUrl || "",
    coverUrl: storefront.coverUrl || "",
    storyImageUrl: storefront.storyImageUrl || storefront.coverUrl || "",
    primaryColor: storefront.primaryColor || "",
    eyebrow:
      storefront.eyebrow ||
      (city ? `${city}'s favourite store` : "Handpicked for you"),
    heroTitle: storefront.heroTitle || businessName || "Welcome",
    heroSubtitle:
      storefront.heroSubtitle ||
      (city
        ? `Authentic products delivered to your door in ${city}.`
        : "Authentic products, delivered to your door."),
    ctaLabel: storefront.ctaLabel || "Shop Now",
    storyTitle: storefront.storyTitle || "Our Story",
    about:
      storefront.about ||
      `${businessName || "We"} bring you genuine products, fair prices, and reliable delivery.`,
    highlights: publicHighlights(storefront),
    whatsapp: storefront.whatsapp || "",
    phone: storefront.phone || "",
    email: storefront.email || "",
    address: storefront.address || "",
    city,
    instagramUrl: storefront.instagramUrl || "",
    facebookUrl: storefront.facebookUrl || "",
    showcases: publicShowcases(storefront),
  };
}

function parseOptionalUrl(value, AppError, label) {
  const raw = toOptionalString(value);
  if (raw == null) return "";
  if (raw.length > STOREFRONT_STRING_LIMITS.logoUrl) {
    throw new AppError(400, "VALIDATION_ERROR", `${label} is too long`);
  }
  if (/^https?:\/\//i.test(raw) || raw.startsWith("/")) return raw;
  throw new AppError(
    400,
    "VALIDATION_ERROR",
    `${label} must be an http(s) URL or a path starting with /`
  );
}

function parseOptionalColor(value, AppError) {
  const raw = toOptionalString(value);
  if (raw == null) return "";
  if (!COLOR_PATTERN.test(raw)) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Brand color must be a hex value like #2d6a56"
    );
  }
  return raw.toLowerCase();
}

function parseOptionalEmail(value, AppError) {
  const raw = toOptionalString(value);
  if (raw == null) return "";
  const email = raw.toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > STOREFRONT_STRING_LIMITS.email) {
    throw new AppError(400, "VALIDATION_ERROR", "A valid email is required");
  }
  return email;
}

function parseOptionalContact(value, AppError, label) {
  const parsed = parseContact(value, { required: false });
  if (!parsed.ok) {
    throw new AppError(400, "VALIDATION_ERROR", `${label}: ${parsed.error}`);
  }
  return parsed.value || "";
}

function parseOptionalText(value, max, AppError, label) {
  if (value == null) return null;
  const text = String(value).trim();
  if (text.length > max) {
    throw new AppError(400, "VALIDATION_ERROR", `${label} is too long`);
  }
  return text;
}

function landingNotFound(AppError) {
  return new AppError(404, "LANDING_NOT_FOUND", "This page is not available");
}

function parseStorefrontPatch(body, AppError) {
  const src =
    body && typeof body.storefront === "object" && body.storefront
      ? { ...body, ...body.storefront }
      : body || {};
  const updates = {};

  if (src.published != null) {
    if (typeof src.published !== "boolean") {
      throw new AppError(400, "VALIDATION_ERROR", "published must be true or false");
    }
    updates.published = src.published;
  }

  const urlFields = [
    ["logoUrl", "Logo URL"],
    ["coverUrl", "Cover URL"],
    ["storyImageUrl", "Story image URL"],
    ["showcase1ImageUrl", "Showcase 1 image"],
    ["showcase2ImageUrl", "Showcase 2 image"],
    ["showcase3ImageUrl", "Showcase 3 image"],
    ["showcase4ImageUrl", "Showcase 4 image"],
    ["instagramUrl", "Instagram URL"],
    ["facebookUrl", "Facebook URL"],
  ];
  for (const [key, label] of urlFields) {
    if (src[key] != null) updates[key] = parseOptionalUrl(src[key], AppError, label);
  }

  if (src.primaryColor != null) {
    updates.primaryColor = parseOptionalColor(src.primaryColor, AppError);
  }

  const textFields = [
    ["eyebrow", STOREFRONT_STRING_LIMITS.eyebrow, "Eyebrow"],
    ["heroTitle", STOREFRONT_STRING_LIMITS.heroTitle, "Hero title"],
    ["heroSubtitle", STOREFRONT_STRING_LIMITS.heroSubtitle, "Hero subtitle"],
    ["ctaLabel", STOREFRONT_STRING_LIMITS.ctaLabel, "Button label"],
    ["storyTitle", STOREFRONT_STRING_LIMITS.storyTitle, "Story title"],
    ["about", STOREFRONT_STRING_LIMITS.about, "About"],
    ["highlight1Title", STOREFRONT_STRING_LIMITS.highlightTitle, "Highlight 1 title"],
    ["highlight1Text", STOREFRONT_STRING_LIMITS.highlightText, "Highlight 1 text"],
    ["highlight2Title", STOREFRONT_STRING_LIMITS.highlightTitle, "Highlight 2 title"],
    ["highlight2Text", STOREFRONT_STRING_LIMITS.highlightText, "Highlight 2 text"],
    ["highlight3Title", STOREFRONT_STRING_LIMITS.highlightTitle, "Highlight 3 title"],
    ["highlight3Text", STOREFRONT_STRING_LIMITS.highlightText, "Highlight 3 text"],
    ["showcase1Title", STOREFRONT_STRING_LIMITS.showcaseTitle, "Showcase 1 title"],
    ["showcase1Text", STOREFRONT_STRING_LIMITS.showcaseText, "Showcase 1 text"],
    ["showcase2Title", STOREFRONT_STRING_LIMITS.showcaseTitle, "Showcase 2 title"],
    ["showcase2Text", STOREFRONT_STRING_LIMITS.showcaseText, "Showcase 2 text"],
    ["showcase3Title", STOREFRONT_STRING_LIMITS.showcaseTitle, "Showcase 3 title"],
    ["showcase3Text", STOREFRONT_STRING_LIMITS.showcaseText, "Showcase 3 text"],
    ["showcase4Title", STOREFRONT_STRING_LIMITS.showcaseTitle, "Showcase 4 title"],
    ["showcase4Text", STOREFRONT_STRING_LIMITS.showcaseText, "Showcase 4 text"],
    ["address", STOREFRONT_STRING_LIMITS.address, "Address"],
    ["city", STOREFRONT_STRING_LIMITS.city, "City"],
  ];
  for (const [key, max, label] of textFields) {
    if (src[key] != null) {
      updates[key] = parseOptionalText(src[key], max, AppError, label);
    }
  }

  if (src.whatsapp != null) {
    updates.whatsapp = parseOptionalContact(src.whatsapp, AppError, "WhatsApp");
  }
  if (src.phone != null) {
    updates.phone = parseOptionalContact(src.phone, AppError, "Phone");
  }
  if (src.email != null) {
    updates.email = parseOptionalEmail(src.email, AppError);
  }

  return updates;
}

function publicProduct(product, index) {
  return {
    productId: product.id,
    name: product.name,
    unit: product.unit || "pcs",
    price: productUnitPrice(product),
    category: product.category || null,
    badge: PRODUCT_BADGES[index] || null,
  };
}

function loadShopSections(products, categories) {
  const sortedProducts = sortCatalogItems(products, categories);
  const sortedCategories = [...(categories || [])].sort((a, b) => {
    const ao = Number.isFinite(Number(a?.sortOrder)) ? Number(a.sortOrder) : 999;
    const bo = Number.isFinite(Number(b?.sortOrder)) ? Number(b.sortOrder) : 999;
    if (ao !== bo) return ao - bo;
    return String(a?.name || "").localeCompare(String(b?.name || ""));
  });

  const categoryCards = sortedCategories.slice(0, CATEGORY_LIMIT).map((category) => ({
    id: category.id,
    name: category.name,
  }));

  return {
    featuredProducts: sortedProducts.slice(0, FEATURED_LIMIT).map(publicProduct),
    categories: categoryCards,
    productCount: sortedProducts.length,
  };
}

async function loadLandingCatalog(db, businessId) {
  const filter = {
    businessId,
    $or: [{ status: "active" }, { status: { $exists: false } }, { status: null }],
  };
  const [products, categories] = await Promise.all([
    db.collection("products").find(filter).toArray(),
    db
      .collection("categories")
      .find({
        businessId,
        $or: [{ status: "active" }, { status: { $exists: false } }, { status: null }],
      })
      .toArray(),
  ]);
  return loadShopSections(products, categories);
}

function ownerPayload(business, storefront, storeToken) {
  return {
    slug: business.slug,
    businessName: business.name,
    publicPath: `/b/${business.slug}`,
    storeToken: storeToken || null,
    storefront,
  };
}

function registerStorefrontRoutes({
  app,
  db,
  AppError,
  tenantRoute,
  requirePermission,
}) {
  app.get("/public/businesses/:slug", async (req, res, next) => {
    try {
      const slug = slugify(req.params.slug);
      if (!slug) throw landingNotFound(AppError);

      const business = await db.collection("businesses").findOne({ slug });
      if (!business || business.status !== "active") {
        throw landingNotFound(AppError);
      }

      const settings = await ensureBusinessSettings(db, business.id);
      const storefront = normalizeStorefront(settings.storefront);
      if (!storefront.published) throw landingNotFound(AppError);

      const storeToken = settings.catalogStoreToken || null;
      const catalog = await loadLandingCatalog(db, business.id);

      res.json({
        business: { name: business.name, slug: business.slug },
        storefront: publicStorefront(storefront, business.name),
        store: storeToken
          ? { token: storeToken, path: `/store/${storeToken}` }
          : null,
        featuredProducts: catalog.featuredProducts,
        categories: catalog.categories,
        productCount: catalog.productCount,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get(
    "/storefront",
    ...tenantRoute,
    requirePermission("business.settings"),
    async (req, res, next) => {
      try {
        const settings = await ensureBusinessSettings(db, req.tenant.businessId);
        res.json(
          ownerPayload(
            req.tenant.business,
            normalizeStorefront(settings.storefront),
            settings.catalogStoreToken || null
          )
        );
      } catch (error) {
        next(error);
      }
    }
  );

  app.patch(
    "/storefront",
    ...tenantRoute,
    requirePermission("business.settings"),
    async (req, res, next) => {
      try {
        const updates = parseStorefrontPatch(req.body, AppError);
        if (!Object.keys(updates).length) {
          throw new AppError(400, "VALIDATION_ERROR", "No storefront fields to update");
        }

        const settings = await ensureBusinessSettings(db, req.tenant.businessId);
        const previous = normalizeStorefront(settings.storefront);
        const next = { ...previous, ...updates };

        const setFields = { storefront: next, updatedAt: new Date() };
        let storeToken = settings.catalogStoreToken || null;
        if (next.published && !storeToken) {
          storeToken = newStoreToken();
          setFields.catalogStoreToken = storeToken;
        }

        await db.collection("business_settings").updateOne(
          { businessId: req.tenant.businessId },
          { $set: setFields }
        );

        await writeAuditLog(db, {
          businessId: req.tenant.businessId,
          actorId: req.auth.user.id,
          actorName: actorDisplayName(req.auth.user),
          action: "STOREFRONT_UPDATED",
          entity: "storefront",
          entityId: req.tenant.businessId,
          oldValues: { published: previous.published },
          newValues: { published: next.published },
        });

        res.json(ownerPayload(req.tenant.business, next, storeToken));
      } catch (error) {
        next(error);
      }
    }
  );
}

module.exports = {
  registerStorefrontRoutes,
  normalizeStorefront,
  defaultStorefront,
  publicStorefront,
};
