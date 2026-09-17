import {
  emptyStorefrontForm,
  landingPathFromSlug,
  landingUrlFromSlug,
  shopThemeFromColor,
  storefrontToForm,
  whatsappHref,
} from "./storefront";

describe("storefront helpers", () => {
  test("builds public path and url from a business slug", () => {
    expect(landingPathFromSlug("Tufail Traders")).toBe("/b/tufail-traders");
    expect(landingUrlFromSlug("anarkali-shop", "https://example.com")).toBe(
      "https://example.com/b/anarkali-shop"
    );
    expect(landingPathFromSlug("")).toBeNull();
  });

  test("builds a WhatsApp link from a local phone", () => {
    expect(whatsappHref("03001234567")).toBe("https://wa.me/923001234567");
    expect(whatsappHref("")).toBeNull();
  });

  test("maps stored storefront into the editor form", () => {
    expect(storefrontToForm(null)).toEqual(emptyStorefrontForm());
    expect(
      storefrontToForm({ published: true, heroTitle: "Shop", city: "Lahore" })
    ).toMatchObject({
      published: true,
      heroTitle: "Shop",
      city: "Lahore",
      phone: "",
      eyebrow: "",
      ctaLabel: "",
      showcase1ImageUrl: "",
    });
  });

  test("builds a shop theme from a brand color", () => {
    expect(shopThemeFromColor("#c45c7a")["--shop-accent"]).toBe("#c45c7a");
    expect(shopThemeFromColor("")["--shop-accent"]).toBe("#c45c7a");
  });
});
