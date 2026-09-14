import { productImageSrc } from "./productImage";

describe("productImageSrc", () => {
  test("returns null for empty values", () => {
    expect(productImageSrc(null)).toBeNull();
    expect(productImageSrc("")).toBeNull();
    expect(productImageSrc("   ")).toBeNull();
  });

  test("keeps remote and data URLs unchanged", () => {
    expect(productImageSrc("https://cdn.example.com/a.png")).toBe(
      "https://cdn.example.com/a.png"
    );
    expect(productImageSrc("data:image/png;base64,abc")).toBe(
      "data:image/png;base64,abc"
    );
  });

  test("prefixes /uploads paths with the API origin in production", () => {
    expect(
      productImageSrc("/uploads/products/1/a.png", "https://api.example.com")
    ).toBe("https://api.example.com/uploads/products/1/a.png");
  });

  test("leaves /uploads relative when API origin is empty (local proxy)", () => {
    expect(productImageSrc("/uploads/products/1/a.png", "")).toBe(
      "/uploads/products/1/a.png"
    );
  });
});
