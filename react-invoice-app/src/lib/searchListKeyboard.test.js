import { isSearchListMoveKey, moveSearchListIndex } from "./searchListKeyboard";

describe("moveSearchListIndex", () => {
  test("starts at the first row on ArrowDown", () => {
    expect(moveSearchListIndex(-1, 4, "ArrowDown")).toBe(0);
  });

  test("moves down without wrapping past the last row", () => {
    expect(moveSearchListIndex(0, 4, "ArrowDown")).toBe(1);
    expect(moveSearchListIndex(3, 4, "ArrowDown")).toBe(3);
  });

  test("moves up without wrapping past the first row", () => {
    expect(moveSearchListIndex(-1, 4, "ArrowUp")).toBe(0);
    expect(moveSearchListIndex(2, 4, "ArrowUp")).toBe(1);
    expect(moveSearchListIndex(0, 4, "ArrowUp")).toBe(0);
  });

  test("returns -1 when the list is empty", () => {
    expect(moveSearchListIndex(0, 0, "ArrowDown")).toBe(-1);
    expect(moveSearchListIndex(2, 0, "ArrowUp")).toBe(-1);
  });
});

describe("isSearchListMoveKey", () => {
  test("treats arrow keys as list movement", () => {
    expect(isSearchListMoveKey("ArrowDown")).toBe(true);
    expect(isSearchListMoveKey("ArrowUp")).toBe(true);
    expect(isSearchListMoveKey("Enter")).toBe(false);
  });
});
