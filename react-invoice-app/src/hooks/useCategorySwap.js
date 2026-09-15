import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import {
  applyCategorySort,
  applyNamedCategoryOrder,
  categoryIdsAfterVisibleMove,
  messageCategoryNames,
  moveItem,
} from "../lib/rateLists";
import { getErrorMessage } from "../lib/rtkBaseQuery";
import {
  useGetCategoriesQuery,
  useReorderCategoriesMutation,
} from "../services/invoiceApi";

export function useCategorySwap(products, resetKey = "") {
  const { data } = useGetCategoriesQuery({ per_page: 500 });
  const categories = useMemo(() => data?.categories || [], [data]);
  const [reorderCategories, reorderState] = useReorderCategoriesMutation();
  const [overrideNames, setOverrideNames] = useState(null);

  const stamped = useMemo(
    () => applyCategorySort(products, categories),
    [products, categories]
  );
  const sectionNames = useMemo(() => messageCategoryNames(stamped), [stamped]);
  const orderedNames = overrideNames || sectionNames;
  const productsForMessage = useMemo(
    () => applyNamedCategoryOrder(stamped, orderedNames),
    [stamped, orderedNames]
  );

  useEffect(() => {
    setOverrideNames(null);
  }, [resetKey]);

  const stamp = useCallback(
    (rows) => applyNamedCategoryOrder(applyCategorySort(rows, categories), orderedNames),
    [categories, orderedNames]
  );

  const moveSectionTo = useCallback(
    async (fromIndex, toIndex) => {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
      if (fromIndex >= orderedNames.length || toIndex >= orderedNames.length) return;
      const moved = moveItem(orderedNames, fromIndex, toIndex);
      if (moved.join("\0") === orderedNames.join("\0")) return;
      setOverrideNames(moved);
      if (!categories.length) return;
      try {
        await reorderCategories({
          ids: categoryIdsAfterVisibleMove(categories, orderedNames, fromIndex, toIndex),
        }).unwrap();
      } catch (error) {
        toast.error(getErrorMessage(error, "Could not save category order"));
      }
    },
    [categories, orderedNames, reorderCategories]
  );

  const moveSection = useCallback(
    (index, delta) => moveSectionTo(index, index + delta),
    [moveSectionTo]
  );

  return {
    productsForMessage,
    sectionNames: orderedNames,
    moveSection,
    moveSectionTo,
    moving: reorderState.isLoading,
    stamp,
  };
}
