import { calcNetRate } from "./normalizeProduct";

describe("calcNetRate", () => {
  test("applies % less to TP rate", () => {
    expect(calcNetRate(100, 10)).toBe(90);
    expect(calcNetRate(250, 12.5)).toBe(218.75);
  });

  test("returns TP when % less is empty", () => {
    expect(calcNetRate(100, "")).toBe(100);
    expect(calcNetRate(100, null)).toBe(100);
  });

  test("returns null when TP is empty", () => {
    expect(calcNetRate("", 10)).toBeNull();
    expect(calcNetRate(null, 10)).toBeNull();
  });
});
