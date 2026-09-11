import { faBagShopping, faMinus, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { formatPrice } from "../lib/rateLists";
import { getErrorCode, getErrorMessage } from "../lib/rtkBaseQuery";
import {
  cartCount,
  clearCart,
  loadCart,
  productImageSrc,
  saveCart,
} from "../lib/storeCart";
import {
  useGetPublicStoreQuery,
  usePlacePublicStoreOrderMutation,
} from "../services/invoiceApi";

function StoreState({ title, message }) {
  return (
    <div className="store-page">
      <div className="store-sheet store-sheet-center">
        <h1 className="store-title">{title}</h1>
        <p className="textcklr">{message}</p>
      </div>
    </div>
  );
}

export default function PublicStorePage() {
  const { token } = useParams();
  const { data: store, isLoading, isError, error } = useGetPublicStoreQuery(token, {
    skip: !token,
  });
  const [placeOrder, placeState] = usePlacePublicStoreOrderMutation();
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState(() => loadCart(token));
  const [notes, setNotes] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [placed, setPlaced] = useState(null);

  useEffect(() => {
    setCart(loadCart(token));
    setPlaced(null);
    setNotes("");
    setCustomerName("");
    setCustomerPhone("");
  }, [token]);

  useEffect(() => {
    saveCart(token, cart);
  }, [token, cart]);

  const items = useMemo(() => store?.items || [], [store]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      [item.name, item.sku, item.unit].join(" ").toLowerCase().includes(q)
    );
  }, [items, query]);

  const lines = useMemo(() => {
    return items
      .map((item) => {
        const quantity = Number(cart[item.productId] || 0);
        if (quantity <= 0) return null;
        return { ...item, quantity, lineTotal: quantity * Number(item.price || 0) };
      })
      .filter(Boolean);
  }, [items, cart]);

  const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const count = cartCount(cart);

  const setQty = (productId, quantity) => {
    const nextQty = Math.max(0, Math.min(10000, Number(quantity) || 0));
    setCart((prev) => {
      const next = { ...prev };
      if (nextQty <= 0) delete next[productId];
      else next[productId] = nextQty;
      return next;
    });
  };

  const needsCustomer = store?.requiresCustomer === true || store?.kind === "catalog";

  const onPlaceOrder = async () => {
    if (!lines.length) {
      toast.error("Add products to the cart first");
      return;
    }
    if (needsCustomer) {
      if (!customerName.trim()) {
        toast.error("Enter your name");
        return;
      }
      if (customerPhone.replace(/\D/g, "").length < 7) {
        toast.error("Enter a valid phone number");
        return;
      }
    }
    try {
      const order = await placeOrder({
        token,
        notes: notes.trim() || undefined,
        clientName: needsCustomer ? customerName.trim() : undefined,
        clientPhone: needsCustomer ? customerPhone.trim() : undefined,
        items: lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
        })),
      }).unwrap();
      clearCart(token);
      setCart({});
      setCartOpen(false);
      setPlaced(order);
      toast.success(`Order ${order.number} placed`);
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not place order"));
    }
  };

  if (isLoading) {
    return (
      <div className="store-page">
        <p className="textcklr">Loading store…</p>
      </div>
    );
  }

  if (isError || !store) {
    const code = getErrorCode(error);
    const expired = error?.status === 410 || code === "SHARE_LINK_EXPIRED";
    return (
      <StoreState
        title={expired ? "Link expired" : "Store not found"}
        message={
          expired
            ? "This store link has expired. Ask for a new rate list link."
            : "This store link is invalid. Check the URL or ask for a new one."
        }
      />
    );
  }

  if (placed) {
    return (
      <div className="store-page">
        <div className="store-sheet store-sheet-center">
          <p className="store-kicker">Order placed</p>
          <h1 className="store-title">Thanks, {placed.clientName || store.clientName}</h1>
          <p className="textcklr">
            Your order <strong>{placed.number}</strong> is in. We will confirm it shortly.
          </p>
          <ul className="store-receipt">
            {(placed.items || []).map((item) => (
              <li key={`${item.productId}-${item.name}`}>
                <span>
                  {item.name} × {item.quantity}
                </span>
                <strong>{formatPrice(item.lineTotal)}</strong>
              </li>
            ))}
          </ul>
          <p className="store-receipt-total">
            Total <strong>{formatPrice(placed.total)}</strong>
          </p>
          <button
            type="button"
            className="btn save-changes px-4 py-2"
            onClick={() => setPlaced(null)}
          >
            Shop again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="store-page">
      <header className="store-header">
        <div>
          <p className="store-kicker">{store.businessName || "Store"}</p>
          <h1 className="store-title">{store.title || "Order now"}</h1>
          {store.clientName ? <p className="textcklr m-0">{store.clientName}</p> : (
            <p className="textcklr m-0">Anyone can order from this list</p>
          )}
        </div>
        <button
          type="button"
          className="btn save-changes px-3 py-2"
          onClick={() => setCartOpen(true)}
        >
          <FontAwesomeIcon icon={faBagShopping} className="me-2" />
          Cart ({count})
        </button>
      </header>

      <input
        type="search"
        className="form-control input-settings store-search"
        placeholder="Search products…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="Search products"
      />

      {!filtered.length ? (
        <p className="textcklr mt-6">No products match this search.</p>
      ) : (
        <div className="store-grid">
          {filtered.map((item) => {
            const qty = Number(cart[item.productId] || 0);
            const src = productImageSrc(item.imageUrl);
            return (
              <article key={item.productId} className="store-card">
                <div className="store-card-image">
                  {src ? (
                    <img src={src} alt={item.name} />
                  ) : (
                    <span>{(item.name || "?").slice(0, 1).toUpperCase()}</span>
                  )}
                </div>
                <div className="store-card-body">
                  <h2>{item.name}</h2>
                  <p className="store-card-meta">
                    {item.unit || "pcs"}
                    {item.currentStock != null ? ` · ${item.currentStock} in stock` : ""}
                  </p>
                  <p className="store-card-price">{formatPrice(item.price)}</p>
                  {qty <= 0 ? (
                    <button
                      type="button"
                      className="btn save-changes w-full py-2"
                      onClick={() => setQty(item.productId, 1)}
                    >
                      Add to cart
                    </button>
                  ) : (
                    <div className="store-qty">
                      <button type="button" onClick={() => setQty(item.productId, qty - 1)}>
                        <FontAwesomeIcon icon={faMinus} />
                      </button>
                      <span>{qty}</span>
                      <button type="button" onClick={() => setQty(item.productId, qty + 1)}>
                        <FontAwesomeIcon icon={faPlus} />
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {cartOpen ? (
        <div className="store-cart-overlay" onClick={() => setCartOpen(false)} role="presentation">
          <aside className="store-cart" onClick={(event) => event.stopPropagation()} role="dialog">
            <header className="store-cart-head">
              <h2>Cart</h2>
              <button type="button" className="btn invoice-btn-ghost py-1 px-2" onClick={() => setCartOpen(false)}>
                Close
              </button>
            </header>
            {!lines.length ? (
              <p className="textcklr">Cart is empty.</p>
            ) : (
              <>
                <ul className="store-cart-lines">
                  {lines.map((line) => (
                    <li key={line.productId}>
                      <div>
                        <strong>{line.name}</strong>
                        <p className="m-0 textcklr">{formatPrice(line.price)}</p>
                      </div>
                      <div className="store-qty store-qty-sm">
                        <button type="button" onClick={() => setQty(line.productId, line.quantity - 1)}>
                          <FontAwesomeIcon icon={faMinus} />
                        </button>
                        <span>{line.quantity}</span>
                        <button type="button" onClick={() => setQty(line.productId, line.quantity + 1)}>
                          <FontAwesomeIcon icon={faPlus} />
                        </button>
                        <button type="button" onClick={() => setQty(line.productId, 0)} aria-label="Remove">
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                {needsCustomer ? (
                  <div className="store-customer">
                    <label className="invoice-label" htmlFor="store-customer-name">
                      Your name
                    </label>
                    <input
                      id="store-customer-name"
                      className="form-control input-settings"
                      value={customerName}
                      onChange={(event) => setCustomerName(event.target.value)}
                      placeholder="Name"
                      autoComplete="name"
                    />
                    <label className="invoice-label" htmlFor="store-customer-phone">
                      Phone
                    </label>
                    <input
                      id="store-customer-phone"
                      className="form-control input-settings"
                      value={customerPhone}
                      onChange={(event) => setCustomerPhone(event.target.value)}
                      placeholder="03xx xxxxxxx"
                      autoComplete="tel"
                    />
                  </div>
                ) : null}
                <label className="invoice-label" htmlFor="store-notes">
                  Notes
                </label>
                <textarea
                  id="store-notes"
                  className="form-control input-settings"
                  rows={3}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Optional delivery note"
                />
                <p className="store-cart-total">
                  Total <strong>{formatPrice(total)}</strong>
                </p>
                <button
                  type="button"
                  className="btn save-changes w-full py-2"
                  disabled={placeState.isLoading}
                  onClick={onPlaceOrder}
                >
                  {placeState.isLoading ? "Placing…" : "Place order"}
                </button>
              </>
            )}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
