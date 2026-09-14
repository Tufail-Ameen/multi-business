const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  isAllowedImageUrl,
  parseStoredImagePath,
  parseImageBase64,
} = require("../product-image");

test("allows http(s) and /uploads image URLs", () => {
  assert.equal(isAllowedImageUrl("https://cdn.example.com/a.png"), true);
  assert.equal(isAllowedImageUrl("/uploads/products/1/a.png"), true);
  assert.equal(isAllowedImageUrl("/uploads/../secret"), false);
  assert.equal(isAllowedImageUrl("ftp://x"), false);
});

test("parses stored upload paths and rejects traversal", () => {
  assert.deepEqual(parseStoredImagePath("/uploads/products/biz-1/2-abc.png"), {
    businessId: "biz-1",
    filename: "2-abc.png",
    key: "biz-1/2-abc.png",
  });
  assert.equal(parseStoredImagePath("/uploads/products/../etc/passwd"), null);
  assert.equal(parseStoredImagePath("https://cdn.example.com/a.png"), null);
});

test("parses data URL image payloads", () => {
  const parsed = parseImageBase64(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="
  );
  assert.equal(parsed.mimeType, "image/png");
  assert.ok(parsed.buffer.length > 0);
});
