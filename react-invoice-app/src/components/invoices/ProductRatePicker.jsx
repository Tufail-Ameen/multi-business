import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchListKeyboard } from "../../hooks/useSearchListKeyboard";
import { INVOICE_CURRENCY, formatAmount } from "../../utils/invoice";

function rateLabel(value) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return formatAmount(INVOICE_CURRENCY, n);
}

export default function ProductRatePicker({ products, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [panelStyle, setPanelStyle] = useState({});
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const searchRef = useRef(null);

  const selected = products.find((product) => String(product.id) === String(value));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((product) => {
      const name = String(product.name || "").toLowerCase();
      const sku = String(product.sku || "").toLowerCase();
      return name.includes(q) || sku.includes(q);
    });
  }, [products, search]);

  const pick = (product) => {
    onChange(product ? String(product.id) : "");
    setSearch("");
    setOpen(false);
  };

  const { activeIndex, onSearchKeyDown, setRowRef, rowId, resultsId, activeRowId } =
    useSearchListKeyboard({
      itemCount: filtered.length,
      resetKey: `${open}:${search}`,
      idPrefix: "invoice-product-search",
      onActivate: (index) => pick(filtered[index]),
    });

  useEffect(() => {
    if (!open) return undefined;

    const place = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const width = Math.min(Math.max(rect.width, 460), window.innerWidth - 24);
      const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
      const spaceBelow = window.innerHeight - rect.bottom - 12;
      const openUp = spaceBelow < 240 && rect.top > spaceBelow;
      const maxHeight = Math.min(320, openUp ? rect.top - 16 : spaceBelow);
      setPanelStyle({
        position: "fixed",
        left,
        width,
        maxHeight: Math.max(180, maxHeight),
        top: openUp ? undefined : rect.bottom + 6,
        bottom: openUp ? window.innerHeight - rect.top + 6 : undefined,
        zIndex: 1200,
      });
    };

    place();
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
    };
    const onPointerDown = (event) => {
      if (triggerRef.current?.contains(event.target)) return;
      if (panelRef.current?.contains(event.target)) return;
      setOpen(false);
    };

    window.addEventListener("resize", place);
    document.addEventListener("scroll", place, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("mousedown", onPointerDown);
    window.requestAnimationFrame(() => searchRef.current?.focus());

    return () => {
      window.removeEventListener("resize", place);
      document.removeEventListener("scroll", place, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  return (
    <div className="invoice-rate-picker">
      <button
        ref={triggerRef}
        type="button"
        className="invoice-rate-picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={selected ? "" : "is-placeholder"}>
          {selected ? selected.name : "Select product…"}
        </span>
        <FontAwesomeIcon icon={faChevronDown} />
      </button>

      {open
        ? createPortal(
            <div ref={panelRef} className="invoice-rate-picker-panel" style={panelStyle}>
              <div className="invoice-rate-picker-search">
                <input
                  ref={searchRef}
                  type="search"
                  value={search}
                  placeholder="Search product…"
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={onSearchKeyDown}
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={filtered.length > 0}
                  aria-controls={resultsId}
                  aria-activedescendant={activeRowId}
                />
              </div>
              <div className="invoice-rate-picker-head" aria-hidden="true">
                <span>Product</span>
                <span>Purchase</span>
                <span>Sale</span>
                <span>Printed</span>
              </div>
              <div id={resultsId} className="invoice-rate-picker-list" role="listbox">
                {!filtered.length ? (
                  <p className="invoice-rate-picker-empty">No products match.</p>
                ) : (
                  filtered.map((product, index) => {
                    const isSelected = String(product.id) === String(value);
                    const isActive = activeIndex === index;
                    return (
                      <button
                        key={product.id}
                        id={rowId(index)}
                        ref={setRowRef(index)}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        className={`invoice-rate-picker-row${isSelected ? " is-selected" : ""}${
                          isActive ? " is-keyboard-active" : ""
                        }`}
                        onClick={() => pick(product)}
                      >
                        <span className="invoice-rate-picker-name">{product.name}</span>
                        <span>{rateLabel(product.purchasePrice)}</span>
                        <span>{rateLabel(product.salePrice ?? product.price)}</span>
                        <span>{rateLabel(product.printRate)}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
