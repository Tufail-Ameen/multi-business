const MOVE_KEYS = new Set(["ArrowDown", "ArrowUp"]);

export function moveSearchListIndex(current, itemCount, key) {
  if (!itemCount) return -1;
  if (key === "ArrowDown") {
    return current < 0 ? 0 : Math.min(current + 1, itemCount - 1);
  }
  if (key === "ArrowUp") {
    return current < 0 ? 0 : Math.max(current - 1, 0);
  }
  return current;
}

export function isSearchListMoveKey(key) {
  return MOVE_KEYS.has(key);
}
