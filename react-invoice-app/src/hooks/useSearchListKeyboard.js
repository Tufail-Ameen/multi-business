import { useCallback, useEffect, useRef, useState } from "react";
import { isSearchListMoveKey, moveSearchListIndex } from "../lib/searchListKeyboard";

export function useSearchListKeyboard({
  itemCount = 0,
  resetKey,
  idPrefix = "search-list",
  onActivate,
} = {}) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const rowRefs = useRef([]);
  const activeIndexRef = useRef(activeIndex);
  const onActivateRef = useRef(onActivate);
  activeIndexRef.current = activeIndex;
  onActivateRef.current = onActivate;

  useEffect(() => {
    setActiveIndex(-1);
  }, [resetKey]);

  useEffect(() => {
    setActiveIndex((current) => {
      if (!itemCount) return -1;
      if (current >= itemCount) return itemCount - 1;
      return current;
    });
  }, [itemCount]);

  useEffect(() => {
    if (activeIndex < 0) return;
    rowRefs.current[activeIndex]?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [activeIndex]);

  const setRowRef = useCallback((index) => (node) => {
    rowRefs.current[index] = node;
  }, []);

  const onSearchKeyDown = useCallback(
    (event) => {
      if (isSearchListMoveKey(event.key)) {
        event.preventDefault();
        setActiveIndex((current) => moveSearchListIndex(current, itemCount, event.key));
        return;
      }
      if (event.key === "Enter") {
        const index = activeIndexRef.current;
        if (index < 0 || index >= itemCount) return;
        event.preventDefault();
        onActivateRef.current?.(index);
        return;
      }
      if (event.key === "Escape") {
        setActiveIndex(-1);
      }
    },
    [itemCount]
  );

  const rowId = useCallback((index) => `${idPrefix}-row-${index}`, [idPrefix]);
  const resultsId = `${idPrefix}-results`;
  const activeRowId = activeIndex >= 0 ? rowId(activeIndex) : undefined;

  return {
    activeIndex,
    setActiveIndex,
    onSearchKeyDown,
    setRowRef,
    rowId,
    resultsId,
    activeRowId,
  };
}
