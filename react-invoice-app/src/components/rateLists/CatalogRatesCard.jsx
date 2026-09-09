import { useMemo } from "react";
import { formatPrice, productDefaultPrice, splitCatalogColumns } from "../../lib/rateLists";
import EmptyState from "../ui/EmptyState";

function matchesQuery(product, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [product.name, product.sku, product.barcode, product.unit]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

function CatalogColumn({ products, startIndex = 1 }) {
  const cellBorder = "border-0 border-b border-solid border-[#d4cfc4] text-left";
  return (
    <table className="product-table w-full !min-w-0 border-separate border-spacing-0">
      <thead>
        <tr>
          <th className={`col-index ${cellBorder}`}>#</th>
          <th className={cellBorder}>Product</th>
          <th className={`w-16 ${cellBorder}`}>Unit</th>
          <th className={`w-24 ${cellBorder}`}>Rate</th>
        </tr>
      </thead>
      <tbody>
        {products.map((product, index) => (
          <tr key={product.key || product.id}>
            <td className={`col-index ${cellBorder}`}>{startIndex + index}</td>
            <td className={`table-text-size ${cellBorder}`}>
              {product.name}
            </td>
            <td className={`cell-muted ${cellBorder}`}>
              {product.unit || "pcs"}
            </td>
            <td className={`price whitespace-nowrap ${cellBorder}`}>
              {formatPrice(productDefaultPrice(product))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function CatalogRatesCard({ products, isLoading, search = "", onSearchChange }) {
  const visibleProducts = useMemo(
    () => products.filter((product) => matchesQuery(product, search)),
    [products, search]
  );

  let body = null;
  if (isLoading) {
    body = <p className="textcklr m-0 px-4 py-5">Loading catalog…</p>;
  } else if (!products.length) {
    body = (
      <EmptyState
        className="!border-0 !bg-transparent !shadow-none"
        title="No catalog rates"
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
      <div className="flex flex-col md:flex-row">
        <div className="min-w-0 flex-1">
          <CatalogColumn products={left} startIndex={1} />
        </div>
        {right.length ? (
          <>
            <div
              className="h-px w-full shrink-0 bg-[var(--color-border-strong)] md:h-auto md:min-h-full md:w-[2px] md:self-stretch"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <CatalogColumn products={right} startIndex={left.length + 1} />
            </div>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="form-card product-list-card client-list-card">
      <div className="client-list-toolbar flex items-center border-b border-[var(--color-border)] px-3 py-3">
        <input
          type="search"
          className="form-control input-settings h-10 w-full rounded-[10px] md:max-w-[420px]"
          placeholder="Search name, SKU, or barcode…"
          value={search}
          onChange={(event) => onSearchChange?.(event.target.value)}
          aria-label="Search rate list"
        />
      </div>
      <div className="product-table-scroll client-table-scroll">{body}</div>
    </div>
  );
}
