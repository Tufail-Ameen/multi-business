import { faPen, faTrash, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useState } from "react";
import { Can } from "../../auth/guards";
import { useSearchListKeyboard } from "../../hooks/useSearchListKeyboard";
import { PERMISSIONS } from "../../lib/permissions";
import { productImageSrc } from "../../lib/productImage";
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

function ProductImageModal({ product, onClose }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div className="invoice-modal" onClick={onClose} role="presentation">
      <div
        className="invoice-modal-panel product-image-modal-panel"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-image-modal-title"
      >
        <header className="invoice-modal-head">
          <div>
            <p className="invoice-modal-kicker">Product photo</p>
            <h2 id="product-image-modal-title" className="invoice-modal-title">
              {product.name}
            </h2>
          </div>
          <button
            type="button"
            className="invoice-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </header>
        <div className="product-image-modal-body">
          <img src={productImageSrc(product.imageUrl)} alt={product.name} />
        </div>
      </div>
    </div>
  );
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
  const [previewProduct, setPreviewProduct] = useState(null);
  const { activeIndex, onSearchKeyDown, setRowRef, rowId, resultsId, activeRowId } =
    useSearchListKeyboard({
      itemCount: products.length,
      resetKey: search,
      idPrefix: "product-search",
      onActivate: (index) => {
        const product = products[index];
        if (product) onSelectProduct?.(product);
      },
    });

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
      <table
        id={resultsId}
        className="product-table w-full min-w-[52rem] md:min-w-full"
      >
        <thead>
          <tr>
            <th className="col-index text-left">#</th>
            <th className="text-left">Photo</th>
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
            <tr
              key={product.key || product.id}
              id={rowId(index)}
              ref={setRowRef(index)}
              className={activeIndex === index ? "is-keyboard-active" : undefined}
            >
              <td className="col-index text-left">{index + 1}</td>
              <td className="text-left">
                {product.imageUrl ? (
                  <button
                    type="button"
                    className="store-thumb store-thumb-sm store-thumb-btn"
                    onClick={() => setPreviewProduct(product)}
                    title={`View photo of ${product.name}`}
                    aria-label={`View photo of ${product.name}`}
                  >
                    <img src={productImageSrc(product.imageUrl)} alt="" />
                  </button>
                ) : (
                  <div className="store-thumb store-thumb-sm">
                    <span>—</span>
                  </div>
                )}
              </td>
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
          onKeyDown={onSearchKeyDown}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={products.length > 0}
          aria-controls={resultsId}
          aria-activedescendant={activeRowId}
          aria-label="Search products"
        />
      </div>
      <div className="product-table-scroll client-table-scroll">{body}</div>
      {previewProduct ? (
        <ProductImageModal product={previewProduct} onClose={() => setPreviewProduct(null)} />
      ) : null}
    </div>
  );
}
