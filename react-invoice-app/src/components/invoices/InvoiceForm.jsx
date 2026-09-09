import { faPlus, faTrash, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ErrorMessage, Field, Form, Formik } from "formik";
import { useEffect, useState } from "react";
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
import { calcLineTotal, formatAmount } from "../../utils/invoice";

const schema = Yup.object({
  clientId: Yup.string().required("Client required"),
  issueDate: Yup.string().required("Date required"),
  dueDate: Yup.string().required("Due date required"),
  description: Yup.string(),
  currency: Yup.string().required(),
});

function emptyLine() {
  return { key: Math.random().toString(36).slice(2), productId: "", quantity: 1, tax: 0 };
}

export default function InvoiceForm({ invoice, onClose, onSaved }) {
  const { clients } = useClients();
  const { data: productsData } = useGetProductsQuery({ per_page: 100, status: "active" });
  const [createInvoice] = useCreateInvoiceMutation();
  const [updateInvoice] = useUpdateInvoiceMutation();
  const [updateStatus] = useUpdateInvoiceStatusMutation();

  const products = productsData?.products || [];
  const isEdit = Boolean(invoice);

  const [lines, setLines] = useState(
    invoice?.items?.length
      ? invoice.items.map((item) => ({
          key: Math.random().toString(36).slice(2),
          productId: item.productId,
          quantity: item.quantity,
          tax: item.tax || 0,
        }))
      : [emptyLine()]
  );

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

  const productById = (id) => products.find((p) => p.id === id);

  const updateLine = (index, patch) => {
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line))
    );
  };

  const grandTotal = lines.reduce((sum, line) => {
    const product = productById(line.productId);
    return sum + (calcLineTotal(line.quantity, product?.price, line.tax) || 0);
  }, 0);

  const initialValues = {
    clientId: invoice?.clientId || "",
    issueDate: invoice?.issueDate || new Date().toISOString().slice(0, 10),
    dueDate: invoice?.dueDate || new Date().toISOString().slice(0, 10),
    description: invoice?.description || "",
    currency: invoice?.currency || "Rs",
  };

  const buildPayload = (values, status) => ({
    clientId: values.clientId,
    issueDate: values.issueDate,
    dueDate: values.dueDate,
    description: values.description,
    currency: values.currency,
    status,
    items: lines
      .filter((line) => line.productId)
      .map((line) => ({
        productId: line.productId,
        quantity: Number(line.quantity),
        tax: Number(line.tax) || 0,
      })),
  });

  const save = async (values, status) => {
    const payload = buildPayload(values, status);
    if (!payload.items.length) {
      toast.error("Kam az kam 1 product select karo");
      return;
    }
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

                  <div className="invoice-field-grid">
                    <div className="invoice-field">
                      <label className="invoice-label" htmlFor="invoice-issue-date">
                        Invoice date
                      </label>
                      <Field
                        type="date"
                        id="invoice-issue-date"
                        name="issueDate"
                        className="form-control input-settings"
                      />
                    </div>
                    <div className="invoice-field">
                      <label className="invoice-label" htmlFor="invoice-due-date">
                        Due date
                      </label>
                      <Field
                        type="date"
                        id="invoice-due-date"
                        name="dueDate"
                        className="form-control input-settings"
                      />
                    </div>
                    <div className="invoice-field">
                      <label className="invoice-label" htmlFor="invoice-currency">
                        Currency
                      </label>
                      <Field
                        as="select"
                        id="invoice-currency"
                        name="currency"
                        className="form-select input-settings"
                      >
                        <option value="Rs">Rs</option>
                        <option value="$">$</option>
                      </Field>
                    </div>
                  </div>

                  <div className="invoice-field">
                    <label className="invoice-label" htmlFor="invoice-description">
                      Description
                    </label>
                    <Field
                      as="textarea"
                      id="invoice-description"
                      name="description"
                      rows={3}
                      className="form-control input-settings invoice-textarea"
                      placeholder="Optional note for the client"
                    />
                  </div>
                </section>

                <section className="invoice-modal-section">
                  <div className="invoice-lines-head">
                    <div>
                      <h3 className="invoice-lines-title">Line items</h3>
                      <p className="invoice-lines-hint">Products come from stock. Creating an invoice deducts quantity.</p>
                    </div>
                  </div>

                  <div className="invoice-lines">
                    <div className="invoice-line-row is-head" aria-hidden="true">
                      <span>Product</span>
                      <span>Qty</span>
                      <span>Price</span>
                      <span>Tax %</span>
                      <span>Total</span>
                      <span />
                    </div>

                    {lines.map((line, index) => {
                      const product = productById(line.productId);
                      const lineTotal = calcLineTotal(line.quantity, product?.price, line.tax);
                      return (
                        <div className="invoice-line-row" key={line.key}>
                          <label className="invoice-label md:hidden">Product</label>
                          <select
                            className="form-select input-settings"
                            value={line.productId}
                            onChange={(e) => updateLine(index, { productId: e.target.value })}
                          >
                            <option value="">Select product…</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} — stock {p.stock} — {formatAmount(values.currency, p.price)}
                              </option>
                            ))}
                          </select>

                          <label className="invoice-label md:hidden">Qty</label>
                          <input
                            type="number"
                            min={1}
                            className="form-control input-settings"
                            value={line.quantity}
                            onChange={(e) => updateLine(index, { quantity: e.target.value })}
                          />

                          <label className="invoice-label md:hidden">Price</label>
                          <div className="invoice-line-static">
                            {product ? formatAmount(values.currency, product.price) : "—"}
                          </div>

                          <label className="invoice-label md:hidden">Tax %</label>
                          <input
                            type="number"
                            min={0}
                            className="form-control input-settings"
                            value={line.tax}
                            onChange={(e) => updateLine(index, { tax: e.target.value })}
                          />

                          <div className="invoice-line-total">
                            {formatAmount(values.currency, lineTotal)}
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

                  <button
                    type="button"
                    className="invoice-add-line"
                    onClick={() => setLines([...lines, emptyLine()])}
                  >
                    <FontAwesomeIcon icon={faPlus} />
                    Add product line
                  </button>

                  <div className="invoice-total-card">
                    <span>Amount due</span>
                    <strong>{formatAmount(values.currency, grandTotal)}</strong>
                  </div>
                </section>
              </div>

              <footer className="invoice-modal-foot">
                <button type="button" className="btn invoice-btn-ghost" onClick={onClose}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn invoice-btn-secondary"
                  onClick={() => save(values, "draft")}
                >
                  Save draft
                </button>
                <button
                  type="button"
                  className="btn invoice-btn-primary"
                  onClick={() => save(values, "pending")}
                >
                  {isEdit ? "Save invoice" : "Create invoice"}
                </button>
              </footer>
            </div>
          </div>
        </Form>
      )}
    </Formik>
  );
}
