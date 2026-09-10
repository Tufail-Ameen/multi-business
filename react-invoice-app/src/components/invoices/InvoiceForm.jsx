import { faMinus, faPlus, faTrash, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ErrorMessage, Field, Form, Formik } from "formik";
import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import * as Yup from "yup";
import { useClients } from "../../hooks/useClients";
import { getErrorMessage } from "../../lib/rtkBaseQuery";
import {
  useCreateInvoiceMutation,
  useGetProductsQuery,
  useUpdateInvoiceMutation,
  useUpdateInvoiceStatusMutation,
} from "../../services/invoiceApi";
import {
  INVOICE_CURRENCY,
  calcLineTotal,
  formatAmount,
  productUnitPrice,
} from "../../utils/invoice";
import ProductRatePicker from "./ProductRatePicker";

const schema = Yup.object({
  clientId: Yup.string().required("Client required"),
  issueDate: Yup.string().required("Date required"),
});

function emptyLine() {
  return { key: Math.random().toString(36).slice(2), productId: "", quantity: 1 };
}

function nextQty(current, delta) {
  const n = Number(current);
  const base = Number.isFinite(n) && n > 0 ? n : 1;
  return Math.max(1, base + delta);
}

export default function InvoiceForm({ invoice, onClose, onSaved }) {
  const { clients } = useClients();
  const { data: productsData } = useGetProductsQuery({ per_page: 500, status: "active" });
  const [createInvoice] = useCreateInvoiceMutation();
  const [updateInvoice] = useUpdateInvoiceMutation();
  const [updateStatus] = useUpdateInvoiceStatusMutation();

  const products = productsData?.products || [];
  const isEdit = Boolean(invoice);
  const isDraftEdit = !invoice || String(invoice.status).toLowerCase() === "draft";

  const [lines, setLines] = useState(
    invoice?.items?.length
      ? invoice.items.map((item) => ({
          key: Math.random().toString(36).slice(2),
          productId: item.productId != null ? String(item.productId) : "",
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice) || 0,
        }))
      : [emptyLine()]
  );
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const linesListRef = useRef(null);
  const prevLineCountRef = useRef(lines.length);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (event.defaultPrevented) return;
      onClose?.();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    const grew = lines.length > prevLineCountRef.current;
    prevLineCountRef.current = lines.length;
    if (!grew) return;
    const list = linesListRef.current;
    if (!list) return;
    list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [lines.length]);

  const productById = (id) => products.find((p) => String(p.id) === String(id));

  const updateLine = (index, patch) => {
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line))
    );
  };

  const lineAmount = (line) => {
    const product = productById(line.productId);
    const unitPrice = product
      ? productUnitPrice(product)
      : Number(line.unitPrice) || 0;
    return calcLineTotal(line.quantity, unitPrice);
  };

  const grandTotal = lines.reduce((sum, line) => sum + lineAmount(line), 0);
  const filledCount = lines.filter((line) => line.productId).length;

  const initialValues = {
    clientId: invoice?.clientId != null ? String(invoice.clientId) : "",
    issueDate: invoice?.issueDate || new Date().toISOString().slice(0, 10),
  };

  const buildPayload = (values, status) => ({
    clientId: values.clientId,
    issueDate: values.issueDate,
    dueDate: values.issueDate,
    description: "",
    currency: INVOICE_CURRENCY,
    status,
    items: lines
      .filter((line) => line.productId)
      .map((line) => ({
        productId: line.productId,
        quantity: Number(line.quantity),
        tax: 0,
      })),
  });

  const save = async (values, status) => {
    if (savingRef.current) return;
    const payload = buildPayload(values, status);
    if (!payload.items.length) {
      toast.error("Kam az kam 1 product select karo");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      if (invoice) {
        await updateInvoice({ id: invoice.id, ...payload }).unwrap();
        if (status !== "draft" && invoice.status === "draft") {
          await updateStatus({ id: invoice.id, status }).unwrap();
        }
        toast.success("Invoice updated");
      } else {
        await createInvoice(payload).unwrap();
        toast.success(status === "draft" ? "Draft saved" : "Invoice created");
      }
      onSaved?.();
      onClose?.();
    } catch (err) {
      toast.error(getErrorMessage(err, "Save failed"));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Formik initialValues={initialValues} validationSchema={schema} enableReinitialize onSubmit={() => {}}>
      {({ values }) => (
        <Form>
          <div className="invoice-modal" onClick={onClose} role="presentation">
            <div
              className="invoice-modal-panel"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="invoice-modal-title"
            >
              <header className="invoice-modal-head">
                <div>
                  <p className="invoice-modal-kicker">{isEdit ? "Edit invoice" : "New invoice"}</p>
                  <h2 id="invoice-modal-title" className="invoice-modal-title">
                    {invoice?.number ? `#${invoice.number}` : "Create invoice"}
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

              <div className="invoice-modal-body">
                <section className="invoice-modal-section">
                  <div className="invoice-field-grid">
                    <div className="invoice-field">
                      <label className="invoice-label" htmlFor="invoice-client">
                        Client
                      </label>
                      <Field
                        as="select"
                        id="invoice-client"
                        name="clientId"
                        className="form-select input-settings"
                      >
                        <option value="">Select client…</option>
                        {clients.map((c) => (
                          <option key={c.key || c._id || c.id} value={String(c.id)}>
                            {c.phone ? `${c.name} (${c.phone})` : c.name}
                          </option>
                        ))}
                      </Field>
                      <ErrorMessage name="clientId" component="div" className="invoice-field-error" />
                    </div>

                    <div className="invoice-field">
                      <label className="invoice-label" htmlFor="invoice-issue-date">
                        Invoice date
                      </label>
                      <div className="invoice-date-wrap">
                        <Field
                          type="date"
                          id="invoice-issue-date"
                          name="issueDate"
                          className="form-control input-settings"
                        />
                        <span className="invoice-currency-chip" title="Currency">
                          {INVOICE_CURRENCY}
                        </span>
                      </div>
                      <ErrorMessage name="issueDate" component="div" className="invoice-field-error" />
                    </div>
                  </div>
                </section>

                <section className="invoice-lines-card">
                  <div className="invoice-lines-head">
                    <div>
                      <h3 className="invoice-lines-title">Products</h3>
                      <p className="invoice-lines-hint">Stock is deducted when this invoice is created.</p>
                    </div>
                    <span className="invoice-lines-count">
                      {filledCount} {filledCount === 1 ? "item" : "items"}
                    </span>
                  </div>

                  <div className="invoice-line-row is-head" aria-hidden="true">
                    <span>Product</span>
                    <span>Qty</span>
                    <span>Price</span>
                    <span>Total</span>
                    <span />
                  </div>

                  <div className="invoice-lines-list" ref={linesListRef}>
                  {lines.map((line, index) => {
                    const product = productById(line.productId);
                    const unitPrice = product
                      ? productUnitPrice(product)
                      : Number(line.unitPrice) || 0;
                    const lineTotal = calcLineTotal(line.quantity, unitPrice);
                    const hasPrice = Boolean(product || unitPrice);
                    return (
                      <div
                        className={`invoice-line-row${line.productId ? " is-filled" : ""}`}
                        key={line.key}
                      >
                        <label className="invoice-label md:hidden">Product</label>
                        <ProductRatePicker
                          products={products}
                          value={line.productId}
                          onChange={(productId) => {
                            const selected = productById(productId);
                            updateLine(index, {
                              productId,
                              unitPrice: selected ? productUnitPrice(selected) : 0,
                            });
                          }}
                        />

                        <label className="invoice-label md:hidden">Qty</label>
                        <div className="invoice-qty">
                          <button
                            type="button"
                            onClick={() => updateLine(index, { quantity: nextQty(line.quantity, -1) })}
                            aria-label="Decrease quantity"
                          >
                            <FontAwesomeIcon icon={faMinus} />
                          </button>
                          <input
                            type="number"
                            min={1}
                            inputMode="numeric"
                            value={line.quantity}
                            onChange={(e) => updateLine(index, { quantity: e.target.value })}
                          />
                          <button
                            type="button"
                            onClick={() => updateLine(index, { quantity: nextQty(line.quantity, 1) })}
                            aria-label="Increase quantity"
                          >
                            <FontAwesomeIcon icon={faPlus} />
                          </button>
                        </div>

                        <div className="invoice-line-money">
                          <label className="invoice-label md:hidden">Price</label>
                          <div className={`invoice-line-static${hasPrice ? "" : " is-empty"}`}>
                            {hasPrice ? formatAmount(INVOICE_CURRENCY, unitPrice) : "—"}
                          </div>
                        </div>

                        <div className="invoice-line-money">
                          <label className="invoice-label md:hidden">Total</label>
                          <div className={`invoice-line-total${hasPrice ? "" : " is-empty"}`}>
                            {formatAmount(INVOICE_CURRENCY, lineTotal)}
                          </div>
                        </div>

                        <button
                          type="button"
                          className="invoice-line-remove"
                          onClick={() => setLines(lines.filter((_, i) => i !== index))}
                          aria-label="Remove line"
                          disabled={lines.length === 1}
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      </div>
                    );
                  })}
                  </div>

                  <div className="invoice-lines-add">
                    <button
                      type="button"
                      className="invoice-add-line"
                      onClick={() => setLines((current) => [...current, emptyLine()])}
                    >
                      <FontAwesomeIcon icon={faPlus} />
                      Add product
                    </button>
                  </div>
                </section>
              </div>

              <footer className="invoice-modal-foot">
                <div className="invoice-total-card">
                  <span>Amount due</span>
                  <strong>{formatAmount(INVOICE_CURRENCY, grandTotal)}</strong>
                </div>
                <div className="invoice-modal-foot-actions">
                  <button type="button" className="btn invoice-btn-ghost" onClick={onClose} disabled={saving}>
                    Cancel
                  </button>
                  {isDraftEdit ? (
                    <button
                      type="button"
                      className="btn invoice-btn-secondary"
                      onClick={() => save(values, "draft")}
                      disabled={saving}
                    >
                      {saving ? "Saving…" : "Save draft"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn invoice-btn-primary"
                    onClick={() => save(values, isDraftEdit ? "pending" : invoice.status)}
                    disabled={saving}
                  >
                    {saving ? "Saving…" : isEdit ? "Save invoice" : "Create invoice"}
                  </button>
                </div>
              </footer>
            </div>
          </div>
        </Form>
      )}
    </Formik>
  );
}
