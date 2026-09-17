export function landingPathFromSlug(slug) {
  const value = String(slug || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!value) return null;
  return `/b/${value}`;
}

export function landingUrlFromSlug(slug, origin = window.location.origin) {
  const path = landingPathFromSlug(slug);
  if (!path) return null;
  return `${String(origin || "").replace(/\/$/, "")}${path}`;
}

export function whatsappHref(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  const intl = digits.startsWith("0") ? `92${digits.slice(1)}` : digits;
  return `https://wa.me/${intl}`;
}

export function emptyStorefrontForm() {
  return {
    published: false,
    logoUrl: "",
    coverUrl: "",
    storyImageUrl: "",
    primaryColor: "",
    eyebrow: "",
    heroTitle: "",
    heroSubtitle: "",
    ctaLabel: "",
    storyTitle: "",
    about: "",
    highlight1Title: "",
    highlight1Text: "",
    highlight2Title: "",
    highlight2Text: "",
    highlight3Title: "",
    highlight3Text: "",
    whatsapp: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    instagramUrl: "",
    facebookUrl: "",
    showcase1Title: "",
    showcase1Text: "",
    showcase1ImageUrl: "",
    showcase2Title: "",
    showcase2Text: "",
    showcase2ImageUrl: "",
    showcase3Title: "",
    showcase3Text: "",
    showcase3ImageUrl: "",
    showcase4Title: "",
    showcase4Text: "",
    showcase4ImageUrl: "",
  };
}

export function storefrontToForm(storefront) {
  const empty = emptyStorefrontForm();
  const src = storefront && typeof storefront === "object" ? storefront : {};
  return {
    ...empty,
    published: src.published === true,
    logoUrl: src.logoUrl || "",
    coverUrl: src.coverUrl || "",
    storyImageUrl: src.storyImageUrl || "",
    primaryColor: src.primaryColor || "",
    eyebrow: src.eyebrow || "",
    heroTitle: src.heroTitle || "",
    heroSubtitle: src.heroSubtitle || "",
    ctaLabel: src.ctaLabel || "",
    storyTitle: src.storyTitle || "",
    about: src.about || "",
    highlight1Title: src.highlight1Title || "",
    highlight1Text: src.highlight1Text || "",
    highlight2Title: src.highlight2Title || "",
    highlight2Text: src.highlight2Text || "",
    highlight3Title: src.highlight3Title || "",
    highlight3Text: src.highlight3Text || "",
    whatsapp: src.whatsapp || "",
    phone: src.phone || "",
    email: src.email || "",
    address: src.address || "",
    city: src.city || "",
    instagramUrl: src.instagramUrl || "",
    facebookUrl: src.facebookUrl || "",
    showcase1Title: src.showcase1Title || "",
    showcase1Text: src.showcase1Text || "",
    showcase1ImageUrl: src.showcase1ImageUrl || "",
    showcase2Title: src.showcase2Title || "",
    showcase2Text: src.showcase2Text || "",
    showcase2ImageUrl: src.showcase2ImageUrl || "",
    showcase3Title: src.showcase3Title || "",
    showcase3Text: src.showcase3Text || "",
    showcase3ImageUrl: src.showcase3ImageUrl || "",
    showcase4Title: src.showcase4Title || "",
    showcase4Text: src.showcase4Text || "",
    showcase4ImageUrl: src.showcase4ImageUrl || "",
  };
}

export function shopThemeFromColor(hex) {
  const value = String(hex || "").trim();
  const accent = /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : "#c45c7a";
  const r = parseInt(accent.slice(1, 3), 16);
  const g = parseInt(accent.slice(3, 5), 16);
  const b = parseInt(accent.slice(5, 7), 16);
  const hover = `#${[r, g, b]
    .map((channel) => Math.max(0, Math.round(channel * 0.82)).toString(16).padStart(2, "0"))
    .join("")}`;
  return {
    "--shop-accent": accent,
    "--shop-accent-hover": hover,
    "--shop-accent-soft": `rgba(${r}, ${g}, ${b}, 0.12)`,
    "--shop-accent-ring": `rgba(${r}, ${g}, ${b}, 0.28)`,
  };
}
