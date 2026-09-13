import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSearchListKeyboard } from "../../hooks/useSearchListKeyboard";
import EmptyState from "../ui/EmptyState";
import { formatCell, formatRate, formatRateDate, RateChange, VendorRateCell } from "./rateDisplay";

export default function PurchaseRateList({
  products = [],
  isLoading,
  query = "",
  onQueryChange,
}) {
  const navigate = useNavigate();
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return products;
    return products.filter((row) =>
      [row.productName, row.sku, row.cheapest?.supplierName, row.mostExpensive?.supplierName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [products, query]);
  const { activeIndex, onSearchKeyDown, setRowRef, rowId, resultsId, activeRowId } =
    useSearchListKeyboard({
      itemCount: visible.length,
      resetKey: query,
      idPrefix: "purchase-rate-search",
      onActivate: (index) => {
        const row = visible[index];
        if (row?.productId != null) navigate(`/purchases/rates/${row.productId}`);
      },
    });

  let body = null;
  if (isLoading) {
    body = <p className="textcklr m-0 px-4 py-5">Loading…</p>;
  } else if (!products.length) {
    body = (
      <EmptyState
        className="!border-0 !bg-transparent !shadow-none"
        title="No vendor rates yet"
        message="Confirm a purchase order to compare last vs current rates by vendor."
      />
    );
  } else if (!visible.length) {
    body = (
      <EmptyState
        className="!border-0 !bg-transparent !shadow-none"
        title="No matching products"
        message="Try a different product or vendor name."
      />
    );
  } else {
    body = (
      <table
        id={resultsId}
        className="product-table w-full min-w-[60rem] md:min-w-full"
      >
        <thead>
          <tr>
            <th className="col-index text-left">#</th>
            <th className="text-left">Product</th>
            <th className="text-left">Last rate</th>
            <th className="text-left">vs last buy</th>
            <th className="text-left">Cheapest vendor</th>
            <th className="text-left">Costliest vendor</th>
            <th className="text-left">Vendors</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row, index) => (
            <tr
              key={row.productId}
              id={rowId(index)}
              ref={setRowRef(index)}
              className={activeIndex === index ? "is-keyboard-active" : undefined}
            >
              <td className="col-index text-left">{index + 1}</td>
              <td className="table-text-size text-left">
                <Link
                  to={`/purchases/rates/${row.productId}`}
                  className="font-bold text-[var(--color-primary)] no-underline hover:underline"
                >
                  {formatCell(row.productName)}
                </Link>
                {row.sku ? <div className="cell-muted">{row.sku}</div> : null}
              </td>
              <td className="price text-left">
                {formatRate(row.last?.unitPrice)}
                <div className="cell-muted">
                  {row.last?.supplierName || "—"}
                  {row.last?.purchasedAt ? ` · ${formatRateDate(row.last.purchasedAt)}` : ""}
                </div>
              </td>
              <td className="text-left">
                <RateChange diff={row.rateDiff} change={row.rateChange} />
              </td>
              <td className="table-text-size text-left">
                <VendorRateCell vendor={row.cheapest} tone="cheap" />
              </td>
              <td className="table-text-size text-left">
                <VendorRateCell vendor={row.mostExpensive} tone="dear" />
              </td>
              <td className="cell-muted text-left">{row.vendorCount || 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <div className="form-card product-list-card client-list-card">
      <div className="client-list-toolbar flex flex-col gap-3 border-b border-[var(--color-border)] px-3 py-3 sm:flex-row sm:items-center">
        <input
          type="search"
          className="form-control input-settings h-10 w-full rounded-[10px] md:max-w-[420px]"
          placeholder="Search product or vendor…"
          value={query}
          onChange={(event) => onQueryChange?.(event.target.value)}
          onKeyDown={onSearchKeyDown}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={visible.length > 0}
          aria-controls={resultsId}
          aria-activedescendant={activeRowId}
          aria-label="Search vendor rates"
        />
      </div>
      <div className="product-table-scroll client-table-scroll">{body}</div>
    </div>
  );
}
