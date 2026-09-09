import { useEffect, useMemo, useRef } from "react";
import { formatDelta, formatPrice, productDefaultPrice } from "../../lib/rateLists";
import EmptyState from "../ui/EmptyState";

function deltaClass(tone) {
  if (tone === "up") return "font-bold text-[var(--color-paid)]";
  if (tone === "down") return "font-bold text-[var(--color-danger)]";
  return "text-[var(--color-text-subtle)]";
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
}) {
  const headerCheckRef = useRef(null);
  const visibleIds = useMemo(() => products.map((product) => String(product.id)), [products]);
  const selectedVisible = visibleIds.filter((id) => selected[id]).length;
  const allVisibleSelected = products.length > 0 && selectedVisible === products.length;
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
        message="No catalog items match this search."
      />
    );
  } else {
    body = (
      <table className="product-table w-full min-w-[52rem] md:min-w-full">
        <thead>
          <tr>
            <th className="w-10 text-center">
              <input
                ref={headerCheckRef}
                type="checkbox"
                className="size-4 accent-[var(--color-primary)]"
                checked={allVisibleSelected}
                onChange={() => onToggleVisible(products, !allVisibleSelected)}
                aria-label="Select all visible products"
              />
            </th>
            <th className="col-index text-left">#</th>
            <th className="text-left">Product</th>
            <th className="text-left">SKU</th>
            <th className="text-left">Default rate</th>
            <th className="w-36 text-left">Custom rate</th>
            <th className="text-left">Difference</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product, index) => {
            const id = String(product.id);
            const isSelected = Boolean(selected[id]);
            const defaultPrice = selected[id]?.defaultPrice ?? productDefaultPrice(product);
            const customPrice = isSelected ? selected[id].customPrice : defaultPrice;
            const delta = formatDelta(customPrice, defaultPrice);
            return (
              <tr
                key={product.key || id}
                className={
                  isSelected
                    ? "bg-[var(--color-primary-soft)] hover:bg-[var(--color-primary-soft)]"
                    : undefined
                }
              >
                <td className="w-10 text-center">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-primary)]"
                    checked={isSelected}
                    onChange={() => onToggle(product)}
                    aria-label={`Select ${product.name}`}
                  />
                </td>
                <td className="col-index text-left">{index + 1}</td>
                <td className="table-text-size text-left">
                  {product.name}
                  <div className="cell-muted small">{product.unit || "pcs"}</div>
                </td>
                <td className="cell-muted text-left">{product.sku || "—"}</td>
                <td className="price text-left">{formatPrice(defaultPrice)}</td>
                <td className="w-36 text-left">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="form-control input-settings input-compact min-w-[6.5rem] max-w-[8rem]"
                    value={customPrice}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === "") {
                        onSetRate(product, "");
                        return;
                      }
                      const n = Number(value);
                      if (!Number.isFinite(n) || n < 0) return;
                      onSetRate(product, n);
                    }}
                    aria-label={`Custom rate for ${product.name}`}
                  />
                </td>
                <td className={`text-left ${deltaClass(delta.tone)}`}>
                  {isSelected ? delta.text : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  return (
    <div className="form-card product-list-card client-list-card">
      <div className="flex shrink-0 flex-col gap-3 border-b border-[var(--color-border)] px-3 py-3 md:flex-row md:items-end">
        <div className="min-w-0 flex-1">
          <label className="form-label input-clr mb-1" htmlFor="rate-list-product-search">
            Search
          </label>
          <input
            id="rate-list-product-search"
            className="form-control input-settings h-10 w-full rounded-[10px]"
            placeholder="Name or SKU…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
        <div className="w-full md:w-48">
          <label className="form-label input-clr mb-1" htmlFor="rate-list-product-category">
            Category
          </label>
          <select
            id="rate-list-product-category"
            className="form-select input-settings h-10 w-full rounded-[10px]"
            value={categoryId}
            onChange={(e) => onCategory(e.target.value)}
          >
            <option value="">All</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="btn save h-10 w-full px-3 py-2 md:w-auto"
          disabled={!products.length}
          onClick={() => onToggleVisible(products, !allVisibleSelected)}
        >
          {allVisibleSelected ? "Clear visible" : "Add all visible"}
        </button>
      </div>
      <div className="product-table-scroll client-table-scroll">{body}</div>
    </div>
  );
}
