import {
  faBagShopping,
  faBars,
  faBorderAll,
  faBoxOpen,
  faCircleCheck,
  faListUl,
  faMagnifyingGlass,
  faMinus,
  faPlus,
  faTrash,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
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

const UNCATEGORIZED = "__none__";
const fieldClass =
  "w-full min-h-11 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 font-[inherit] text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]";
const iconBtnClass =
  "inline-flex h-10 w-10 shrink-0 cursor-pointer appearance-none items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]";
const primaryBtnClass =
  "inline-flex min-h-11 w-full cursor-pointer appearance-none items-center justify-center rounded-xl border-0 bg-[var(--color-primary)] px-4 font-[inherit] text-sm font-bold text-white shadow-[var(--shadow-btn)] hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50";

function storeInitials(name) {
  const parts = String(name || "S")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return (
    parts
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "S"
  );
}

function storeHeading(store) {
  const business = store.businessName || "Store";
  let eyebrow = store.kind === "catalog" ? "Wholesale catalog" : "Rate list";
  let title = store.title || "Order now";
  if (store.businessName && title.startsWith(`${store.businessName} — `)) {
    eyebrow = title.slice(store.businessName.length + 3) || eyebrow;
    title = store.businessName;
  }
  return { business, eyebrow, title };
}

function itemCategory(item) {
  const name = String(item?.category || "").trim();
  return name || null;
}

function loadView(token) {
  try {
    return localStorage.getItem(`store-view:${token}`) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

function StoreCardImage({ src, name, compact = false }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(180deg,#fbfaf6_0%,var(--color-surface-2)_100%)]">
        <span
          className={`inline-flex items-center justify-center rounded-2xl border border-[var(--color-border)] bg-white font-extrabold tracking-wide text-[var(--color-primary)] shadow-[var(--shadow-card)] ${
            compact ? "h-10 w-10 text-[0.7rem]" : "h-14 w-14 text-sm"
          }`}
        >
          {storeInitials(name)}
        </span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="h-full max-h-none w-full object-contain p-3"
      onError={() => setFailed(true)}
    />
  );
}

function QtyControl({ name, qty, onChange }) {
  return (
    <div className="inline-flex items-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]">
      <button
        type="button"
        className="inline-flex h-9 w-9 cursor-pointer appearance-none items-center justify-center rounded-[10px] border-0 bg-[var(--color-surface)] text-[var(--color-primary)]"
        onClick={() => onChange(qty - 1)}
        aria-label={`Decrease ${name}`}
      >
        <FontAwesomeIcon icon={faMinus} />
      </button>
      <span className="min-w-[1.75rem] text-center text-sm font-extrabold">{qty}</span>
      <button
        type="button"
        className="inline-flex h-9 w-9 cursor-pointer appearance-none items-center justify-center rounded-[10px] border-0 bg-[var(--color-surface)] text-[var(--color-primary)]"
        onClick={() => onChange(qty + 1)}
        aria-label={`Increase ${name}`}
      >
        <FontAwesomeIcon icon={faPlus} />
      </button>
    </div>
  );
}

function AddOrQty({ item, qty, onQty }) {
  if (qty <= 0) {
    return (
      <button type="button" className={primaryBtnClass} onClick={() => onQty(item.productId, 1)}>
        <span className="sm:hidden">Add</span>
        <span className="hidden sm:inline">Add to cart</span>
      </button>
    );
  }
  return <QtyControl name={item.name} qty={qty} onChange={(next) => onQty(item.productId, next)} />;
}

function CategoryNav({ categories, selected, onSelect }) {
  return (
    <nav aria-label="Product categories">
      <p className="mb-3 text-[0.7rem] font-extrabold uppercase tracking-[0.14em] text-[var(--color-accent)]">
        Categories
      </p>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {categories.map((row) => {
          const active = selected === row.id;
          return (
            <li key={row.id}>
              <button
                type="button"
                className={`flex w-full cursor-pointer appearance-none items-center justify-between rounded-xl border-0 px-3 py-2.5 text-left font-[inherit] text-sm ${
                  active
                    ? "bg-[var(--color-primary)] font-bold text-white"
                    : "bg-transparent font-semibold text-[var(--color-text)] hover:bg-[var(--color-primary-soft)]"
                }`}
                onClick={() => onSelect(row.id)}
                aria-current={active ? "true" : undefined}
              >
                <span className="min-w-0 truncate">{row.label}</span>
                <em
                  className={`ml-2 not-italic text-xs ${
                    active ? "text-white/80" : "text-[var(--color-text-subtle)]"
                  }`}
                >
                  {row.count}
                </em>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function StoreState({ title, message }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg rounded-[22px] border border-[var(--color-border)] bg-white p-8 text-center shadow-[var(--shadow-card)]">
        <h1 className="m-0 text-2xl font-extrabold tracking-tight">{title}</h1>
        <p className="mb-0 mt-3 text-[var(--color-text-muted)]">{message}</p>
      </div>
    </div>
  );
}

function StoreSkeletons() {
  return (
    <div className="min-h-screen px-4 py-8">
      <div className="mx-auto grid w-[min(1280px,100%)] grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <div
            key={index}
            className="overflow-hidden rounded-[20px] border border-[var(--color-border)] bg-white"
            aria-hidden="true"
          >
            <div className="aspect-square animate-pulse bg-[var(--color-surface-2)]" />
            <div className="space-y-2 p-3">
              <div className="h-3.5 w-4/5 animate-pulse rounded bg-[var(--color-surface-2)]" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--color-surface-2)]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PublicStorePage() {
  const { token } = useParams();
  const { data: store, isLoading, isError, error } = useGetPublicStoreQuery(
    { token, per_page: 200 },
    { skip: !token }
  );
  const [placeOrder, placeState] = usePlacePublicStoreOrderMutation();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [view, setView] = useState(() => loadView(token));
  const [cart, setCart] = useState(() => loadCart(token));
  const [notes, setNotes] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [placed, setPlaced] = useState(null);

  useEffect(() => {
    setCart(loadCart(token));
    setView(loadView(token));
    setPlaced(null);
    setNotes("");
    setCustomerName("");
    setCustomerPhone("");
    setCartOpen(false);
    setFiltersOpen(false);
    setPreview(null);
    setCategory("all");
    setQuery("");
  }, [token]);

  useEffect(() => {
    saveCart(token, cart);
  }, [token, cart]);

  useEffect(() => {
    if (!token) return;
    localStorage.setItem(`store-view:${token}`, view);
  }, [token, view]);

  useEffect(() => {
    if (!cartOpen && !preview && !filtersOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (preview) setPreview(null);
      else if (cartOpen) setCartOpen(false);
      else setFiltersOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [cartOpen, preview, filtersOpen]);

  const items = useMemo(() => store?.items || [], [store]);
  const categories = useMemo(() => {
    const counts = new Map();
    items.forEach((item) => {
      const name = itemCategory(item) || UNCATEGORIZED;
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    const rows = [{ id: "all", label: "All products", count: items.length }];
    [...counts.entries()]
      .sort((a, b) => {
        if (a[0] === UNCATEGORIZED) return 1;
        if (b[0] === UNCATEGORIZED) return -1;
        return a[0].localeCompare(b[0]);
      })
      .forEach(([id, count]) => {
        rows.push({
          id,
          label: id === UNCATEGORIZED ? "Uncategorized" : id,
          count,
        });
      });
    return rows;
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      const name = itemCategory(item);
      if (category === UNCATEGORIZED && name) return false;
      if (category !== "all" && category !== UNCATEGORIZED && name !== category) return false;
      if (!q) return true;
      return [item.name, item.sku, item.unit, name].join(" ").toLowerCase().includes(q);
    });
  }, [items, query, category]);

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
  const selectedCategory = categories.find((row) => row.id === category) || categories[0];

  const setQty = (productId, quantity) => {
    const nextQty = Math.max(0, Math.min(10000, Number(quantity) || 0));
    setCart((prev) => {
      const next = { ...prev };
      if (nextQty <= 0) delete next[productId];
      else next[productId] = nextQty;
      return next;
    });
  };

  const pickCategory = (id) => {
    setCategory(id);
    setFiltersOpen(false);
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

  if (isLoading) return <StoreSkeletons />;

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

  const heading = storeHeading(store);

  if (placed) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="flex w-full max-w-lg flex-col items-center rounded-[22px] border border-[var(--color-border)] bg-white p-8 text-center shadow-[var(--shadow-card)]">
          <span className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-[18px] bg-[var(--color-paid-soft)] text-2xl text-[var(--color-primary)]">
            <FontAwesomeIcon icon={faCircleCheck} />
          </span>
          <p className="m-0 text-[0.7rem] font-extrabold uppercase tracking-[0.14em] text-[var(--color-accent)]">
            Order placed
          </p>
          <h1 className="mb-2 mt-1 text-2xl font-extrabold tracking-tight">
            Thanks, {placed.clientName || store.clientName || heading.title}
          </h1>
          <p className="m-0 text-[var(--color-text-muted)]">
            Your order <strong>{placed.number}</strong> is in. We will confirm it shortly.
          </p>
          <ul className="my-5 w-full list-none p-0 text-left">
            {(placed.items || []).map((item) => (
              <li
                key={`${item.productId}-${item.name}`}
                className="flex justify-between gap-4 border-b border-[var(--color-border)] py-2.5"
              >
                <span>
                  {item.name} × {item.quantity}
                </span>
                <strong>{formatPrice(item.lineTotal)}</strong>
              </li>
            ))}
          </ul>
          <p className="mb-4 flex w-full justify-between text-lg">
            Total <strong>{formatPrice(placed.total)}</strong>
          </p>
          <button type="button" className={primaryBtnClass} onClick={() => setPlaced(null)}>
            Shop again
          </button>
        </div>
      </div>
    );
  }

  const renderProduct = (item) => {
    const qty = Number(cart[item.productId] || 0);
    const src = productImageSrc(item.imageUrl);
    const stock = item.currentStock;
    const lowStock = stock != null && Number(stock) <= 5;
    const cat = itemCategory(item);

    if (view === "list") {
      return (
        <article
          key={item.productId}
          className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-white p-3 shadow-[var(--shadow-card)] sm:grid-cols-[88px_minmax(0,1fr)_auto] sm:gap-4 sm:p-4"
        >
          <button
            type="button"
            className="h-[72px] w-[72px] cursor-zoom-in appearance-none overflow-hidden rounded-xl border-0 bg-[var(--color-surface-2)] p-0 disabled:cursor-default sm:h-[88px] sm:w-[88px]"
            onClick={() => src && setPreview(item)}
            disabled={!src}
            aria-label={src ? `View photo of ${item.name}` : undefined}
          >
            <StoreCardImage src={src} name={item.name} compact />
          </button>
          <div className="min-w-0">
            <h2 className="m-0 line-clamp-2 text-[0.95rem] font-bold leading-snug">{item.name}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-muted)]">
              <span>{item.unit || "pcs"}</span>
              {cat ? <span>· {cat}</span> : null}
              {stock != null ? (
                <span
                  className={`rounded-full px-2 py-0.5 font-bold ${
                    lowStock
                      ? "bg-[var(--color-pending-soft)] text-[var(--color-pending)]"
                      : "bg-[var(--color-paid-soft)] text-[var(--color-primary)]"
                  }`}
                >
                  {stock} in stock
                </span>
              ) : null}
            </p>
            <p className="mb-0 mt-2 text-base font-extrabold text-[var(--color-primary)] sm:hidden">
              {formatPrice(item.price)}
            </p>
            <div className="mt-2 sm:hidden">
              <AddOrQty item={item} qty={qty} onQty={setQty} />
            </div>
          </div>
          <div className="hidden min-w-[148px] flex-col items-end gap-2 sm:flex">
            <p className="m-0 text-lg font-extrabold text-[var(--color-primary)]">
              {formatPrice(item.price)}
            </p>
            <div className="w-[148px]">
              <AddOrQty item={item} qty={qty} onQty={setQty} />
            </div>
          </div>
        </article>
      );
    }

    return (
      <article
        key={item.productId}
        className="flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-[var(--color-border)] bg-white shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-hover)]"
      >
        <button
          type="button"
          className="aspect-square w-full cursor-zoom-in appearance-none border-0 bg-[linear-gradient(180deg,#fbfaf6_0%,var(--color-surface-2)_100%)] p-0 disabled:cursor-default disabled:opacity-100"
          onClick={() => src && setPreview(item)}
          disabled={!src}
          aria-label={src ? `View photo of ${item.name}` : undefined}
        >
          <StoreCardImage src={src} name={item.name} />
        </button>
        <div className="flex flex-1 flex-col gap-2 p-3 sm:p-3.5">
          <h2 className="m-0 line-clamp-2 min-h-[2.5em] text-[0.92rem] font-bold leading-snug">
            {item.name}
          </h2>
          <p className="m-0 flex flex-wrap items-center gap-1.5 text-[0.72rem] text-[var(--color-text-muted)]">
            <span>{item.unit || "pcs"}</span>
            {stock != null ? (
              <span
                className={`rounded-full px-2 py-0.5 font-bold ${
                  lowStock
                    ? "bg-[var(--color-pending-soft)] text-[var(--color-pending)]"
                    : "bg-[var(--color-paid-soft)] text-[var(--color-primary)]"
                }`}
              >
                {stock} in stock
              </span>
            ) : null}
          </p>
          <p className="mb-0 mt-auto text-base font-extrabold tracking-tight text-[var(--color-primary)]">
            {formatPrice(item.price)}
          </p>
          <AddOrQty item={item} qty={qty} onQty={setQty} />
        </div>
      </article>
    );
  };

  return (
    <div className={`min-h-screen overflow-x-hidden text-[var(--color-text)] ${count > 0 && !cartOpen ? "pb-24" : "pb-8"}`}>
      <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[rgba(255,255,255,0.88)] backdrop-blur-xl">
        <div className="mx-auto grid w-[min(1280px,calc(100%-24px))] min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 py-3 [grid-template-areas:'menu_brand_cart'_'search_search_search'] min-[720px]:flex min-[720px]:w-[min(1280px,calc(100%-32px))] min-[720px]:flex-wrap min-[720px]:gap-3 min-[720px]:[grid-template-areas:none]">
          <button
            type="button"
            className={`${iconBtnClass} [grid-area:menu] lg:hidden`}
            onClick={() => setFiltersOpen(true)}
            aria-label="Open categories"
          >
            <FontAwesomeIcon icon={faBars} />
          </button>

          <div className="flex min-w-0 items-center gap-3 [grid-area:brand] min-[720px]:flex-1">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[var(--color-primary)] text-xs font-extrabold tracking-wide text-white shadow-[var(--shadow-btn)]">
              {storeInitials(heading.business)}
            </span>
            <div className="min-w-0">
              <p className="m-0 text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-[var(--color-accent)]">
                {heading.eyebrow}
              </p>
              <h1 className="m-0 truncate text-base font-extrabold tracking-tight sm:text-xl">
                {heading.title}
              </h1>
            </div>
          </div>

          <button
            type="button"
            className="inline-flex h-11 max-w-none shrink-0 cursor-pointer appearance-none items-center gap-2 rounded-full border-0 bg-[var(--color-primary)] py-0 pl-3 pr-2 font-[inherit] font-bold text-white shadow-[var(--shadow-btn)] [grid-area:cart] min-[720px]:order-4 min-[720px]:pl-4"
            onClick={() => setCartOpen(true)}
            aria-label={`Open cart, ${count} items`}
          >
            <FontAwesomeIcon icon={faBagShopping} />
            <span className="hidden sm:inline">Cart</span>
            <em className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-[var(--color-accent-bright)] px-1.5 text-xs not-italic font-extrabold text-[var(--color-edit-text)]">
              {count}
            </em>
          </button>

          <label className="relative w-full [grid-area:search] min-[720px]:order-3 min-[720px]:max-w-md min-[720px]:flex-1">
            <FontAwesomeIcon
              icon={faMagnifyingGlass}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-subtle)]"
            />
            <input
              type="search"
              className={`${fieldClass} pl-10`}
              placeholder="Search products…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search products"
            />
          </label>
        </div>
      </header>

      <div className="mx-auto flex w-[min(1280px,calc(100%-24px))] gap-6 py-5 sm:w-[min(1280px,calc(100%-32px))]">
        <aside className="sticky top-[88px] hidden h-fit w-60 shrink-0 rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-card)] lg:block">
          <CategoryNav categories={categories} selected={category} onSelect={pickCategory} />
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="m-0 text-lg font-extrabold tracking-tight sm:text-xl">
                {selectedCategory?.label || "Products"}
              </h2>
              <p className="mb-0 mt-1 text-sm text-[var(--color-text-muted)]">
                {store.clientName ? `For ${store.clientName}` : "Anyone can order from this list"}
                {" · "}
                {filtered.length} product{filtered.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="inline-flex overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
              <button
                type="button"
                className={`inline-flex h-10 w-10 cursor-pointer appearance-none items-center justify-center border-0 ${
                  view === "grid"
                    ? "bg-[var(--color-primary)] text-white"
                    : "bg-transparent text-[var(--color-text-muted)]"
                }`}
                onClick={() => setView("grid")}
                aria-label="Card view"
                aria-pressed={view === "grid"}
              >
                <FontAwesomeIcon icon={faBorderAll} />
              </button>
              <button
                type="button"
                className={`inline-flex h-10 w-10 cursor-pointer appearance-none items-center justify-center border-0 ${
                  view === "list"
                    ? "bg-[var(--color-primary)] text-white"
                    : "bg-transparent text-[var(--color-text-muted)]"
                }`}
                onClick={() => setView("list")}
                aria-label="List view"
                aria-pressed={view === "list"}
              >
                <FontAwesomeIcon icon={faListUl} />
              </button>
            </div>
          </div>

          {!filtered.length ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] bg-white px-4 py-16 text-center text-[var(--color-text-subtle)]">
              <FontAwesomeIcon icon={faBoxOpen} className="text-2xl" />
              <h3 className="mb-1 mt-3 text-lg font-bold text-[var(--color-text)]">No products found</h3>
              <p className="m-0">Try another search or category.</p>
            </div>
          ) : view === "list" ? (
            <div className="flex flex-col gap-3">{filtered.map(renderProduct)}</div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">{filtered.map(renderProduct)}</div>
          )}
        </main>
      </div>

      {count > 0 && !cartOpen ? (
        <button
          type="button"
          className="fixed bottom-4 left-3 right-3 z-20 mx-auto flex max-w-md cursor-pointer appearance-none items-center justify-between rounded-full border-0 bg-[var(--color-sidebar)] px-2 py-2 pl-5 font-[inherit] text-sm text-[var(--color-on-sidebar)] shadow-[0_16px_40px_rgba(26,36,32,0.28)] sm:left-auto sm:right-6 sm:w-[min(420px,calc(100%-32px))]"
          onClick={() => setCartOpen(true)}
        >
          <span>
            {count} item{count === 1 ? "" : "s"} · {formatPrice(total)}
          </span>
          <strong className="inline-flex min-h-[38px] items-center rounded-full bg-[var(--color-primary)] px-4 text-white">
            View cart
          </strong>
        </button>
      ) : null}

      {filtersOpen ? (
        <div className="fixed inset-0 z-40 bg-[var(--color-overlay)] lg:hidden" onClick={() => setFiltersOpen(false)} role="presentation">
          <aside
            className="absolute inset-y-0 left-0 flex h-full w-[min(300px,88%)] flex-col overflow-auto bg-white p-5 shadow-[18px_0_48px_rgba(28,35,32,0.16)]"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="store-filters-title"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 id="store-filters-title" className="m-0 text-lg font-extrabold">
                Menu
              </h2>
              <button type="button" className={iconBtnClass} onClick={() => setFiltersOpen(false)} aria-label="Close menu">
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>
            <CategoryNav categories={categories} selected={category} onSelect={pickCategory} />
          </aside>
        </div>
      ) : null}

      {cartOpen ? (
        <div className="fixed inset-0 z-40 bg-[var(--color-overlay)] backdrop-blur-sm" onClick={() => setCartOpen(false)} role="presentation">
          <aside
            className="absolute inset-y-0 right-0 flex h-full w-[min(440px,100%)] flex-col bg-white shadow-[-18px_0_48px_rgba(28,35,32,0.16)]"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="store-cart-title"
          >
            <header className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
              <div>
                <p className="m-0 text-[0.7rem] font-extrabold uppercase tracking-[0.14em] text-[var(--color-accent)]">
                  Checkout
                </p>
                <h2 id="store-cart-title" className="m-0 text-2xl font-extrabold tracking-tight">
                  Your cart
                </h2>
                <p className="mb-0 mt-1 text-sm text-[var(--color-text-muted)]">
                  {count} item{count === 1 ? "" : "s"}
                </p>
              </div>
              <button type="button" className={iconBtnClass} onClick={() => setCartOpen(false)} aria-label="Close cart">
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </header>

            {!lines.length ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-[var(--color-text-subtle)]">
                <FontAwesomeIcon icon={faBagShopping} className="text-3xl" />
                <p className="m-0 font-semibold">Your cart is empty</p>
                <p className="m-0 text-sm">Add products from the list to place an order.</p>
              </div>
            ) : (
              <>
                <ul className="m-0 flex-1 list-none overflow-auto px-5 py-3">
                  {lines.map((line) => (
                    <li key={line.productId} className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 border-b border-[var(--color-border)] py-3">
                      <div className="h-16 w-16 overflow-hidden rounded-xl bg-[var(--color-surface-2)]">
                        <StoreCardImage src={productImageSrc(line.imageUrl)} name={line.name} compact />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <strong className="line-clamp-2 text-sm">{line.name}</strong>
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 shrink-0 cursor-pointer appearance-none items-center justify-center rounded-[10px] border-0 bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
                            onClick={() => setQty(line.productId, 0)}
                            aria-label={`Remove ${line.name}`}
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </button>
                        </div>
                        <p className="mb-2 mt-1 text-xs text-[var(--color-text-muted)]">
                          {formatPrice(line.price)} · {line.unit || "pcs"}
                        </p>
                        <div className="flex items-center justify-between gap-3">
                          <QtyControl
                            name={line.name}
                            qty={line.quantity}
                            onChange={(next) => setQty(line.productId, next)}
                          />
                          <strong className="text-sm">{formatPrice(line.lineTotal)}</strong>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)] px-5 py-4">
                  {needsCustomer ? (
                    <div className="mb-3 grid gap-1.5 rounded-2xl border border-[var(--color-border)] bg-white p-3">
                      <label className="text-xs font-bold text-[var(--color-text-muted)]" htmlFor="store-customer-name">
                        Your name
                      </label>
                      <input
                        id="store-customer-name"
                        className={fieldClass}
                        value={customerName}
                        onChange={(event) => setCustomerName(event.target.value)}
                        placeholder="Name"
                        autoComplete="name"
                      />
                      <label className="mt-1 text-xs font-bold text-[var(--color-text-muted)]" htmlFor="store-customer-phone">
                        Phone
                      </label>
                      <input
                        id="store-customer-phone"
                        className={fieldClass}
                        value={customerPhone}
                        onChange={(event) => setCustomerPhone(event.target.value)}
                        placeholder="03xx xxxxxxx"
                        autoComplete="tel"
                      />
                    </div>
                  ) : null}
                  <label className="text-xs font-bold text-[var(--color-text-muted)]" htmlFor="store-notes">
                    Notes
                  </label>
                  <textarea
                    id="store-notes"
                    className={`${fieldClass} mt-1 mb-3 resize-y py-2.5`}
                    rows={2}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Optional delivery note"
                  />
                  <div className="mb-3 flex items-center justify-between text-lg">
                    <span className="text-[var(--color-text-muted)]">Total</span>
                    <strong>{formatPrice(total)}</strong>
                  </div>
                  <button
                    type="button"
                    className={primaryBtnClass}
                    disabled={placeState.isLoading}
                    onClick={onPlaceOrder}
                  >
                    {placeState.isLoading ? "Placing…" : "Place order"}
                  </button>
                </div>
              </>
            )}
          </aside>
        </div>
      ) : null}

      {preview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-overlay)] p-4 backdrop-blur-md" onClick={() => setPreview(null)} role="presentation">
          <div
            className="w-[min(680px,100%)] overflow-hidden rounded-[22px] border border-[var(--color-border)] bg-white shadow-[0_28px_70px_rgba(28,35,32,0.2)]"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="store-preview-title"
          >
            <header className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
              <h2 id="store-preview-title" className="m-0 text-base font-bold">
                {preview.name}
              </h2>
              <button type="button" className={iconBtnClass} onClick={() => setPreview(null)} aria-label="Close photo">
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </header>
            <img
              src={productImageSrc(preview.imageUrl)}
              alt={preview.name}
              className="mx-auto max-h-[min(72dvh,680px)] w-full object-contain bg-[var(--color-surface-2)] p-5"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
