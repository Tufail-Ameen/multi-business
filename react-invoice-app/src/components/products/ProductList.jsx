import { faPen, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Can } from "../../auth/guards";
import { PERMISSIONS } from "../../lib/permissions";
import { formatAmount } from "../../utils/invoice";
import EmptyState from "../ui/EmptyState";

function formatCell(value) {
  if (value === null || value === undefined || value === "") return "—";
  return value;
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "—";
  return formatAmount("Rs", value);
}

export default function ProductList({
  products = [],
  isLoading,
  search = "",
  onSearchChange,
  onEdit,
  onDelete,
  onSelectProduct,
}) {
  const editButton = (product) => (
    <button
      type="button"
      className="btn btn-table-edit"
      onClick={() => onEdit?.(product)}
      title="Edit product"
    >
      <FontAwesomeIcon icon={faPen} />
      Edit
    </button>
  );

  const deleteButton = (product) => (
    <button
      type="button"
      className="btn btn-table-remove"
      onClick={() => onDelete?.(product)}
      title="Archive product"
    >
      <FontAwesomeIcon icon={faTrash} />
      Archive
    </button>
  );

  let body = null;
  if (isLoading) {
    body = <p className="textcklr m-0 px-4 py-5">Loading…</p>;
  } else if (!products.length) {
    body = (
      <EmptyState
        className="!border-0 !bg-transparent !shadow-none"
        title={search.trim() ? "No matching products" : "No products"}
        message={
          search.trim()
            ? "Try a different name, SKU, or barcode."
            : "Add a product to manage stock."
        }
      />
    );
  } else {
    body = (
      <table className="product-table w-full min-w-[52rem] md:min-w-full">
        <thead>
          <tr>
            <th className="col-index text-left">#</th>
            <th className="text-left">Name</th>
            <th className="text-left">Category</th>
            <th className="text-left">Purchase</th>
            <th className="text-left">Sale</th>
            <th className="text-left">Printed</th>
            <th className="text-left">Stock</th>
            <th className="text-left">Min</th>
            <th className="text-left">Status</th>
            <th className="w-[1%] whitespace-nowrap text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product, index) => (
            <tr key={product.key || product.id}>
              <td className="col-index text-left">{index + 1}</td>
              <td className="table-text-size text-left">
                <button
                  type="button"
                  className="cursor-pointer border-0 bg-transparent p-0 text-left font-bold text-[var(--color-primary)] hover:underline"
                  onClick={() => onSelectProduct?.(product)}
                >
                  {product.name}
                </button>
                {product.brand ? <div className="cell-muted small">{product.brand}</div> : null}
              </td>
              <td className="text-left">
                {product.category ? (
                  <span className="category-badge">{product.category}</span>
                ) : (
                  <span className="cell-muted">—</span>
                )}
              </td>
              <td className="price text-left">{formatMoney(product.purchasePrice)}</td>
              <td className="price text-left">{formatMoney(product.salePrice)}</td>
              <td className="price text-left">{formatMoney(product.printRate)}</td>
              <td className="text-left">
                <strong>{formatCell(product.currentStock)}</strong>
              </td>
              <td className="cell-muted text-left">{formatCell(product.minimumStockLevel)}</td>
              <td className="text-left">
                <span
                  className={`status-badge ${
                    product.stockStatus === "LOW_STOCK"
                      ? "inactive"
                      : product.status === "active"
                        ? "active"
                        : "inactive"
                  }`}
                >
                  {product.stockStatus === "LOW_STOCK" ? "Low stock" : formatCell(product.status)}
                </span>
              </td>
              <td className="w-[1%] whitespace-nowrap pl-2 text-right">
                <div className="table-actions inline-flex justify-end">
                  <Can permission={PERMISSIONS.PRODUCTS_UPDATE}>{editButton(product)}</Can>
                  <Can permission={PERMISSIONS.PRODUCTS_DELETE}>{deleteButton(product)}</Can>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
          aria-label="Search products"
        />
      </div>
      <div className="product-table-scroll client-table-scroll">{body}</div>
    </div>
  );
}
