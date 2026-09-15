import { faAngleLeft, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ErrorMessage, Field, Form, Formik, useFormikContext } from "formik";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import * as Yup from "yup";
import EmptyState from "../components/ui/EmptyState";
import PurchaseRateHint from "../components/purchases/PurchaseRateHint";
import { useProducts } from "../hooks/useProducts";
import { useSuppliers } from "../hooks/useSuppliers";
import {
  applyProductCost,
  emptyPurchaseLine,
  patchPurchaseLine,
  purchaseLineFromItem,
  summarizePurchaseLines,
} from "../lib/purchaseLines";
import { getErrorMessage } from "../lib/rtkBaseQuery";
import {
  useCreatePurchaseMutation,
  useGetPurchaseQuery,
  useUpdatePurchaseMutation,
} from "../services/invoiceApi";
import { formatAmount } from "../utils/invoice";

const schema = Yup.object({
  supplierId: Yup.string().required("Vendor required"),
  purchaseDate: Yup.string(),
});

export default function PurchaseFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const { suppliers } = useSuppliers({ status: "ACTIVE", limit: 100 });
  const { products } = useProducts({ status: "active", limit: 100 });
  const { data, isLoading, isError, error } = useGetPurchaseQuery(id, { skip: !isEdit });
  const [createPurchase] = useCreatePurchaseMutation();
  const [updatePurchase] = useUpdatePurchaseMutation();

  const purchase = data?.purchase;
  const [lines, setLines] = useState([emptyPurchaseLine()]);

  useEffect(() => {
    if (isError) toast.error(getErrorMessage(error, "Purchase not found"));
  }, [isError, error]);

  useEffect(() => {
    if (purchase?.items?.length) {
      setLines(purchase.items.map(purchaseLineFromItem));
    }
  }, [purchase]);

  const preview = useMemo(() => summarizePurchaseLines(lines), [lines]);
  const filledCount = lines.filter((line) => line.productId).length;

  if (isEdit && isLoading) {
    return (
      <div className="page-wrap">
        <p className="textcklr">Loading…</p>
      </div>
    );
  }

  if (isEdit && !purchase) {
    return (
      <EmptyState title="Purchase not found" message="This purchase does not exist or was deleted." />
    );
  }

  if (isEdit && String(purchase.status).toUpperCase() !== "DRAFT") {
    return (
      <div className="page-wrap">
        <EmptyState
          title="Only drafts can be edited"
          message={`This purchase is ${purchase.status}. Open the detail page instead.`}
        />
        <Link to={`/purchases/${id}`} className="btn edit py-2 px-3">
          View purchase
        </Link>
      </div>
    );
  }

  const initialValues = {
    supplierId: purchase?.supplierId != null ? String(purchase.supplierId) : "",
    purchaseDate: purchase?.purchaseDate
      ? new Date(purchase.purchaseDate).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10),
  };

  const updateLine = (key, field, value) => {
    setLines((prev) =>
      prev.map((line) => (line.key === key ? patchPurchaseLine(line, field, value) : line))
    );
  };

  const onProductChange = (key, productId) => {
    const product = products.find((p) => String(p.id) === String(productId));
    const catalogCost = product?.purchasePrice ?? product?.costPrice ?? "";
    setLines((prev) =>
      prev.map((line) =>
        line.key === key ? applyProductCost(line, productId, catalogCost) : line
      )
    );
  };

  const saveDraft = async (values) => {
    const items = lines
      .filter((line) => line.productId)
      .map((line) => ({
        productId: Number(line.productId),
        quantity: Number(line.quantity),
        unitCost: line.unitCost === "" ? NaN : Number(line.unitCost),
        discount: Number(line.discount) || 0,
        tax: Number(line.tax) || 0,
      }));

    if (!items.length) {
      toast.error("Add at least one product line");
      return;
    }
    if (items.some((item) => !item.quantity || item.quantity <= 0)) {
      toast.error("Each line needs a quantity");
      return;
    }
    if (items.some((item) => !Number.isFinite(item.unitCost) || item.unitCost < 0)) {
      toast.error("Enter a total so piece cost can be calculated");
      return;
    }

    const payload = {
      supplierId: Number(values.supplierId),
      purchaseDate: values.purchaseDate || undefined,
      items,
    };

    try {
      if (isEdit) {
        await updatePurchase({ id, ...payload }).unwrap();
        toast.success("Draft updated");
        navigate(`/purchases/${id}`);
      } else {
        const result = await createPurchase(payload).unwrap();
        toast.success("Draft saved");
        navigate(`/purchases/${result.purchase?.id ?? result.id}`);
      }
    } catch (err) {
      toast.error(getErrorMessage(err, "Save failed"));
    }
  };

  return (
    <div className="page-wrap purchase-form">
      <button
        type="button"
        className="back-link"
        onClick={() => navigate(isEdit ? `/purchases/${id}` : "/purchases")}
      >
        <FontAwesomeIcon className="icon me-2" icon={faAngleLeft} size="2xs" />
        Go back
      </button>

      <Formik
        initialValues={initialValues}
        enableReinitialize
        validationSchema={schema}
        onSubmit={saveDraft}
      >
        <Form className="form-card purchase-form-card">
          <div className="purchase-form-head">
            <div>
              <h1 className="purchase-form-title">{isEdit ? "Edit draft" : "New purchase"}</h1>
              <p className="purchase-form-hint">
                Saves as draft. Stock increases when you confirm on the detail page.
              </p>
            </div>
            <span className="btn draftbtn px-3 py-1">Draft</span>
          </div>

          <div className="purchase-form-meta">
            <div className="invoice-field">
              <label className="invoice-label" htmlFor="supplierId">
                Vendor
              </label>
              <Field
                as="select"
                name="supplierId"
                id="supplierId"
                className="form-select input-settings"
              >
                <option value="">Select vendor…</option>
                {suppliers.map((s) => (
                  <option key={s.key || s.id} value={String(s.id)}>
                    {s.name}
                    {s.companyName ? ` (${s.companyName})` : ""}
                  </option>
                ))}
              </Field>
              <ErrorMessage name="supplierId" component="div" className="invoice-field-error" />
            </div>
            <div className="invoice-field">
              <label className="invoice-label" htmlFor="purchaseDate">
                Purchase date
              </label>
              <Field
                type="date"
                name="purchaseDate"
                id="purchaseDate"
                className="form-control input-settings"
              />
            </div>
          </div>

          <PurchaseLines
            lines={lines}
            products={products}
            preview={preview}
            filledCount={filledCount}
            updateLine={updateLine}
            onProductChange={onProductChange}
            setLines={setLines}
          />

          <div className="purchase-form-totals">
            <div>
              <span>Subtotal</span>
              <strong>{formatAmount("Rs", preview.subtotal)}</strong>
            </div>
            <div>
              <span>Discount</span>
              <strong>{formatAmount("Rs", preview.discount)}</strong>
            </div>
            <div>
              <span>Tax</span>
              <strong>{formatAmount("Rs", preview.tax)}</strong>
            </div>
            <div className="is-grand">
              <span>Grand total</span>
              <strong>{formatAmount("Rs", preview.grandTotal)}</strong>
            </div>
          </div>

          <div className="purchase-form-actions">
            <button type="submit" className="btn input-clr1 save-changes py-2 px-4">
              Save Draft
            </button>
            <button
              type="button"
              className="btn cancel py-2 px-3"
              onClick={() => navigate(isEdit ? `/purchases/${id}` : "/purchases")}
            >
              Cancel
            </button>
          </div>
        </Form>
      </Formik>
    </div>
  );
}

function PurchaseLines({
  lines,
  products,
  preview,
  filledCount,
  updateLine,
  onProductChange,
  setLines,
}) {
  const { values } = useFormikContext();

  return (
    <section className="invoice-lines-card purchase-lines-card">
      <div className="invoice-lines-head">
        <div>
          <h2 className="invoice-lines-title">Line items</h2>
          <p className="invoice-lines-hint">Enter qty and total — piece cost fills in automatically.</p>
        </div>
        <span className="invoice-lines-count">
          {filledCount} {filledCount === 1 ? "item" : "items"}
        </span>
      </div>

      <div className="purchase-line-row is-head" aria-hidden="true">
        <span>Product</span>
        <span>Qty</span>
        <span>Total</span>
        <span>Cost</span>
        <span>Disc.</span>
        <span>Tax</span>
        <span>Line</span>
        <span />
      </div>

      <div className="invoice-lines-list">
        {lines.map((line, index) => {
          const hasCost = line.unitCost !== "" && Number.isFinite(Number(line.unitCost));
          return (
            <div
              key={line.key}
              className={`purchase-line-row${line.productId ? " is-filled" : ""}`}
            >
              <label className="invoice-label">Product</label>
              <select
                className="form-select input-settings"
                value={line.productId}
                onChange={(e) => onProductChange(line.key, e.target.value)}
              >
                <option value="">Select product…</option>
                {products.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.name}
                    {p.sku ? ` (${p.sku})` : ""}
                  </option>
                ))}
              </select>

              <label className="invoice-label">Qty</label>
              <input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                className="form-control input-settings"
                placeholder="0"
                value={line.quantity}
                onChange={(e) => updateLine(line.key, "quantity", e.target.value)}
              />

              <label className="invoice-label">Total</label>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                className="form-control input-settings purchase-line-total-input"
                placeholder="0"
                value={line.lineAmount}
                onChange={(e) => updateLine(line.key, "lineAmount", e.target.value)}
              />

              <label className="invoice-label">Cost</label>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                className={`form-control input-settings purchase-line-cost${
                  line.costSource === "total" ? " is-auto" : ""
                }`}
                placeholder="—"
                value={line.unitCost}
                onChange={(e) => updateLine(line.key, "unitCost", e.target.value)}
                aria-label="Piece cost"
              />

              <label className="invoice-label">Disc.</label>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                className="form-control input-settings"
                value={line.discount}
                onChange={(e) => updateLine(line.key, "discount", e.target.value)}
              />

              <label className="invoice-label">Tax</label>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                className="form-control input-settings"
                value={line.tax}
                onChange={(e) => updateLine(line.key, "tax", e.target.value)}
              />

              <label className="invoice-label">Line</label>
              <div className={`purchase-line-net${hasCost ? "" : " is-empty"}`}>
                {hasCost ? formatAmount("Rs", preview.lineTotals[index]) : "—"}
              </div>

              <button
                type="button"
                className="invoice-line-remove"
                disabled={lines.length <= 1}
                onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                aria-label="Remove line"
              >
                <FontAwesomeIcon icon={faTrash} />
              </button>

              {line.productId ? (
                <div className="purchase-line-hint">
                  <PurchaseRateHint
                    productId={line.productId}
                    supplierId={values.supplierId}
                    onUseRate={(unitCost) => updateLine(line.key, "unitCost", unitCost)}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="invoice-lines-add">
        <button
          type="button"
          className="invoice-add-line"
          onClick={() => setLines((prev) => [...prev, emptyPurchaseLine()])}
        >
          <FontAwesomeIcon icon={faPlus} />
          Add line
        </button>
      </div>
    </section>
  );
}
