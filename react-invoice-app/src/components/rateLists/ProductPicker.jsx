import { useEffect, useMemo, useRef } from "react";
import { useSearchListKeyboard } from "../../hooks/useSearchListKeyboard";
import {
  formatDelta,
  formatPrice,
  matchesRateListQuery,
  productDefaultPrice,
  splitCatalogColumns,
} from "../../lib/rateLists";
import EmptyState from "../ui/EmptyState";

const cellBorder = "border-0 border-b border-solid border-[#d4cfc4] text-left";

function EditorColumn({
  products,
  startIndex = 1,
  selected,
  headerCheckRef,
  showHeaderCheck,
  allVisibleSelected,
  visibleProducts,
  activeIndex = -1,
  setRowRef,
  rowId,
  onToggleVisible,
  onToggle,
  onSetRate,
}) {
  return (
    <table className="product-table w-full !min-w-0 border-separate border-spacing-0">
      <thead>
        <tr>
          <th className={`w-8 px-2 ${cellBorder}`}>
            {showHeaderCheck ? (
              <input
                ref={headerCheckRef}
                type="checkbox"
                className="size-4 accent-[var(--color-primary)]"
                checked={allVisibleSelected}
                onChange={() => onToggleVisible(visibleProducts, !allVisibleSelected)}
                aria-label="Select all visible products"
              />
            ) : (
              <span className="inline-block size-4" aria-hidden="true" />
            )}
          </th>
          <th className={`col-index ${cellBorder}`}>#</th>
          <th className={cellBorder}>Product</th>
          <th className={`w-16 ${cellBorder}`}>Unit</th>
          <th className={`w-[6.5rem] ${cellBorder}`}>Rate</th>
        </tr>
      </thead>
      <tbody>
        {products.map((product, index) => {
          const id = String(product.id);
          const listIndex = startIndex - 1 + index;
          const isSelected = Boolean(selected[id]);
          const defaultPrice = selected[id]?.defaultPrice ?? productDefaultPrice(product);
          const customPrice = isSelected ? selected[id].customPrice : defaultPrice;
          const delta = formatDelta(customPrice, defaultPrice);
          return (
            <tr
              key={product.key || id}
              id={rowId?.(listIndex)}
              ref={setRowRef?.(listIndex)}
              className={[
                isSelected
                  ? "bg-[var(--color-primary-soft)] hover:bg-[var(--color-primary-soft)]"
                  : undefined,
                activeIndex === listIndex ? "is-keyboard-active" : undefined,
              ]
                .filter(Boolean)
                .join(" ") || undefined}
            >
              <td className={`w-8 px-2 ${cellBorder}`}>
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-primary)]"
                  checked={isSelected}
                  onChange={() => onToggle(product)}
                  aria-label={`Select ${product.name}`}
                />
              </td>
              <td className={`col-index ${cellBorder}`}>{startIndex + index}</td>
              <td className={`table-text-size ${cellBorder}`}>{product.name}</td>
              <td className={`cell-muted ${cellBorder}`}>{product.unit || "pcs"}</td>
              <td className={`whitespace-nowrap ${cellBorder}`}>
                <div className="flex items-center gap-1">
                  <span className="price !text-[0.95rem] !leading-none">Rs</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={`catalog-rate-input form-control input-settings ${
                      isSelected && delta.tone === "up"
                        ? "is-up"
                        : isSelected && delta.tone === "down"
                          ? "is-down"
                          : ""
                    }`}
                    value={customPrice}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value === "") {
                        onSetRate(product, "");
                        return;
                      }
                      const n = Number(value);
                      if (!Number.isFinite(n) || n < 0) return;
                      onSetRate(product, n);
                    }}
                    aria-label={`Custom rate for ${product.name}`}
                    title={
                      isSelected && delta.tone !== "flat"
                        ? `Default ${formatPrice(defaultPrice)} · ${delta.text}`
                        : `Default ${formatPrice(defaultPrice)}`
                    }
                  />
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function ProductPicker({
  products,
  isLoading,
  search,
  categoryId,
  categories,
  selected,
  onSearch,
  onCategory,
  onToggle,
  onToggleVisible,
  onSetRate,
  topSlot,
}) {
  const headerCheckRef = useRef(null);
  const visibleProducts = useMemo(
    () =>
      products.filter((product) => {
        if (categoryId && String(product.categoryId) !== String(categoryId)) return false;
        return matchesRateListQuery(product, search);
      }),
    [products, search, categoryId]
  );
  const { activeIndex, onSearchKeyDown, setRowRef, rowId, resultsId, activeRowId } =
    useSearchListKeyboard({
      itemCount: visibleProducts.length,
      resetKey: `${search}:${categoryId}`,
      idPrefix: "rate-list-search",
      onActivate: (index) => {
        const product = visibleProducts[index];
        if (product) onToggle(product);
      },
    });
  const selectedVisible = visibleProducts.filter((product) => selected[String(product.id)]).length;
  const allVisibleSelected = visibleProducts.length > 0 && selectedVisible === visibleProducts.length;
  const someVisibleSelected = selectedVisible > 0 && !allVisibleSelected;

  useEffect(() => {
    if (headerCheckRef.current) {
      headerCheckRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  let body = null;
  if (isLoading) {
    body = <p className="textcklr m-0 px-4 py-5">Loading products…</p>;
  } else if (!products.length) {
    body = (
      <EmptyState
        className="!border-0 !bg-transparent !shadow-none"
        title="No products"
        message="Add product sale prices in Products & Stock first."
      />
    );
  } else if (!visibleProducts.length) {
    body = (
      <EmptyState
        className="!border-0 !bg-transparent !shadow-none"
        title="No matching products"
        message="Try a different name, SKU, or barcode."
      />
    );
  } else {
    const { left, right } = splitCatalogColumns(visibleProducts);
    body = (
      <div id={resultsId} className="flex flex-col md:flex-row">
        <div className="min-w-0 flex-1">
          <EditorColumn
            products={left}
            startIndex={1}
            selected={selected}
            headerCheckRef={headerCheckRef}
            showHeaderCheck
            allVisibleSelected={allVisibleSelected}
            visibleProducts={visibleProducts}
            activeIndex={activeIndex}
            setRowRef={setRowRef}
            rowId={rowId}
            onToggleVisible={onToggleVisible}
            onToggle={onToggle}
            onSetRate={onSetRate}
          />
        </div>
        {right.length ? (
          <>
            <div
              className="h-px w-full shrink-0 bg-[var(--color-border-strong)] md:h-auto md:min-h-full md:w-[2px] md:self-stretch"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <EditorColumn
                products={right}
                startIndex={left.length + 1}
                selected={selected}
                showHeaderCheck={false}
                allVisibleSelected={allVisibleSelected}
                visibleProducts={visibleProducts}
                activeIndex={activeIndex}
                setRowRef={setRowRef}
                rowId={rowId}
                onToggleVisible={onToggleVisible}
                onToggle={onToggle}
                onSetRate={onSetRate}
              />
            </div>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="form-card product-list-card client-list-card">
      {topSlot ? (
        <div className="shrink-0 border-b border-[var(--color-border)] px-3 py-3">{topSlot}</div>
      ) : null}
      <div className="client-list-toolbar flex flex-col gap-2 border-b border-[var(--color-border)] px-3 py-3 sm:flex-row sm:items-center">
        <input
          id="rate-list-product-search"
          type="search"
          className="form-control input-settings h-10 w-full rounded-[10px] md:max-w-[420px]"
          placeholder="Search name, SKU, or barcode…"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          onKeyDown={onSearchKeyDown}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={visibleProducts.length > 0}
          aria-controls={resultsId}
          aria-activedescendant={activeRowId}
          aria-label="Search rate list"
        />
        <div className="flex w-full flex-col gap-2 sm:ml-auto sm:w-auto sm:flex-row sm:items-center">
          <select
            id="rate-list-product-category"
            className="form-select input-settings h-10 w-full rounded-[10px] sm:w-44"
            value={categoryId}
            onChange={(event) => onCategory(event.target.value)}
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn save h-10 w-full px-3 py-2 sm:w-auto"
            disabled={!visibleProducts.length}
            onClick={() => onToggleVisible(visibleProducts, !allVisibleSelected)}
          >
            {allVisibleSelected ? "Clear visible" : "Add all visible"}
          </button>
        </div>
      </div>
      <div className="product-table-scroll client-table-scroll">{body}</div>
    </div>
  );
}
