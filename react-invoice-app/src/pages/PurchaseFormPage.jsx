import { faAngleLeft, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ErrorMessage, Field, Form, Formik } from "formik";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import * as Yup from "yup";
import EmptyState from "../components/ui/EmptyState";
import { useProducts } from "../hooks/useProducts";
import { useSuppliers } from "../hooks/useSuppliers";
import { getErrorMessage } from "../lib/rtkBaseQuery";
import {
  useCreatePurchaseMutation,
  useGetPurchaseQuery,
  useUpdatePurchaseMutation,
} from "../services/invoiceApi";
import { formatAmount } from "../utils/invoice";

const schema = Yup.object({
  supplierId: Yup.string().required("Supplier required"),
  purchaseDate: Yup.string(),
  notes: Yup.string().max(500),
});

function emptyLine() {
  return {
    key: Math.random().toString(36).slice(2),
    productId: "",
    variantId: "",
    quantity: 1,
    unitCost: 0,
    discount: 0,
    tax: 0,
  };
}

function calcLine(line) {
  const quantity = Number(line.quantity) || 0;
  const unitCost = Number(line.unitCost) || 0;
  const discount = Number(line.discount) || 0;
  const tax = Number(line.tax) || 0;
  const gross = quantity * unitCost;
  return Math.round((gross - discount + tax) * 100) / 100;
}

export default function PurchaseFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const { suppliers } = useSuppliers({ status: "ACTIVE", limit: 100 });
  const { products } = useProducts({ status: "active", limit: 100 });
  const {
    data,
    isLoading,
    isError,
    error,
  } = useGetPurchaseQuery(id, { skip: !isEdit });
  const [createPurchase] = useCreatePurchaseMutation();
  const [updatePurchase] = useUpdatePurchaseMutation();

  const purchase = data?.purchase;

  const [lines, setLines] = useState([emptyLine()]);

  useEffect(() => {
    if (isError) toast.error(getErrorMessage(error, "Purchase not found"));
  }, [isError, error]);

  useEffect(() => {
    if (purchase?.items?.length) {
      setLines(
        purchase.items.map((item) => ({
          key: Math.random().toString(36).slice(2),
          productId: item.productId != null ? String(item.productId) : "",
          variantId: item.variantId != null ? String(item.variantId) : "",
          quantity: item.quantity ?? 1,
          unitCost: item.unitCost ?? 0,
          discount: item.discount ?? 0,
          tax: item.tax ?? 0,
        }))
      );
    }
  }, [purchase]);

  const preview = useMemo(() => {
    const lineTotals = lines.map(calcLine);
    const linesSubtotal = lineTotals.reduce((sum, t, i) => {
      const qty = Number(lines[i].quantity) || 0;
      const cost = Number(lines[i].unitCost) || 0;
      return sum + qty * cost;
    }, 0);
    const linesDiscount = lines.reduce((s, l) => s + (Number(l.discount) || 0), 0);
    const linesTax = lines.reduce((s, l) => s + (Number(l.tax) || 0), 0);
    return {
      lineTotals,
      subtotal: Math.round(linesSubtotal * 100) / 100,
      discount: Math.round(linesDiscount * 100) / 100,
      tax: Math.round(linesTax * 100) / 100,
      grandTotal: Math.round(
        (linesSubtotal - linesDiscount + linesTax) * 100
      ) / 100,
    };
  }, [lines]);

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
    notes: purchase?.notes || "",
  };

  const updateLine = (key, patch) => {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  const onProductChange = (key, productId) => {
    const product = products.find((p) => String(p.id) === String(productId));
    updateLine(key, {
      productId,
      unitCost: product?.purchasePrice ?? product?.costPrice ?? 0,
    });
  };

  const saveDraft = async (values) => {
    const items = lines
      .filter((line) => line.productId)
      .map((line) => ({
        productId: Number(line.productId),
        ...(line.variantId !== "" && line.variantId != null
          ? { variantId: Number(line.variantId) }
          : {}),
        quantity: Number(line.quantity),
        unitCost: Number(line.unitCost),
        discount: Number(line.discount) || 0,
        tax: Number(line.tax) || 0,
      }));

    if (!items.length) {
      toast.error("Add at least one product line");
      return;
    }

    const payload = {
      supplierId: Number(values.supplierId),
      purchaseDate: values.purchaseDate || undefined,
      notes: values.notes || undefined,
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
    <div className="page-wrap">
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
        <Form className="form-card">
          <div className="invoices-header mb-3">
            <p className="count-invoices-tect mb-0">
              Saves as draft only. Stock increases when you confirm on the detail page.
            </p>
            <span className="btn draftbtn px-3 py-1" style={{ fontSize: "12px" }}>
              Draft
            </span>
          </div>

          <div className="mb-4 grid grid-cols-12 gap-3">
            <div className="col-span-12 md:col-span-6">
              <label className="form-label input-clr" htmlFor="supplierId">
                Supplier
              </label>
              <Field
                as="select"
                name="supplierId"
                id="supplierId"
                className="form-select input-settings"
              >
                <option value="">Select supplier…</option>
                {suppliers.map((s) => (
                  <option key={s.key || s.id} value={String(s.id)}>
                    {s.name}
                    {s.companyName ? ` (${s.companyName})` : ""}
                  </option>
                ))}
              </Field>
              <ErrorMessage name="supplierId" component="div" className="text-red-600" />
            </div>
            <div className="col-span-12 md:col-span-3">
              <label className="form-label input-clr" htmlFor="purchaseDate">
                Purchase Date
              </label>
              <Field
                type="date"
                name="purchaseDate"
                id="purchaseDate"
                className="form-control input-settings"
              />
            </div>
            <div className="col-span-12 md:col-span-3">
              <label className="form-label input-clr" htmlFor="notes">
                Notes
              </label>
              <Field name="notes" id="notes" className="form-control input-settings" />
            </div>
          </div>

          <h2 className="page-title mb-3">Line items</h2>
          <div className="flex flex-col gap-3 mb-3">
            {lines.map((line, index) => (
              <div
                key={line.key}
                className="grid grid-cols-12 items-end gap-2 invoice-row datalist py-3 px-2 m-0"
              >
                <div className="col-span-12 md:col-span-3">
                  <label className="form-label input-clr">Product</label>
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
                </div>
                <div className="col-span-6 md:col-span-1">
                  <label className="form-label input-clr">Variant</label>
                  <input
                    type="number"
                    className="form-control input-settings"
                    value={line.variantId}
                    onChange={(e) => updateLine(line.key, { variantId: e.target.value })}
                    placeholder="—"
                  />
                </div>
                <div className="col-span-6 md:col-span-1">
                  <label className="form-label input-clr">Qty</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    className="form-control input-settings"
                    value={line.quantity}
                    onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                  />
                </div>
                <div className="col-span-6 md:col-span-2">
                  <label className="form-label input-clr">Unit Cost</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="form-control input-settings"
                    value={line.unitCost}
                    onChange={(e) => updateLine(line.key, { unitCost: e.target.value })}
                  />
                </div>
                <div className="col-span-6 md:col-span-1">
                  <label className="form-label input-clr">Disc.</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="form-control input-settings"
                    value={line.discount}
                    onChange={(e) => updateLine(line.key, { discount: e.target.value })}
                  />
                </div>
                <div className="col-span-6 md:col-span-1">
                  <label className="form-label input-clr">Tax</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="form-control input-settings"
                    value={line.tax}
                    onChange={(e) => updateLine(line.key, { tax: e.target.value })}
                  />
                </div>
                <div className="col-span-6 md:col-span-2">
                  <label className="form-label input-clr">Line total</label>
                  <div className="price py-2">{formatAmount("Rs", preview.lineTotals[index])}</div>
                </div>
                <div className="col-span-6 md:col-span-1 flex justify-end">
                  <button
                    type="button"
                    className="btn cancel py-1 px-2"
                    disabled={lines.length <= 1}
                    onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                    aria-label="Remove line"
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="btn edit py-2 px-3 mb-4"
            onClick={() => setLines((prev) => [...prev, emptyLine()])}
          >
            Add line
          </button>

          <div className="detail-card mb-4">
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-6 md:col-span-3">
                <span className="block edit-discription">Subtotal</span>
                <span className="block price">{formatAmount("Rs", preview.subtotal)}</span>
              </div>
              <div className="col-span-6 md:col-span-3">
                <span className="block edit-discription">Discount</span>
                <span className="block price">{formatAmount("Rs", preview.discount)}</span>
              </div>
              <div className="col-span-6 md:col-span-3">
                <span className="block edit-discription">Tax</span>
                <span className="block price">{formatAmount("Rs", preview.tax)}</span>
              </div>
              <div className="col-span-6 md:col-span-3">
                <span className="block edit-discription">Grand Total</span>
                <span className="block price">{formatAmount("Rs", preview.grandTotal)}</span>
              </div>
            </div>
            <p className="textcklr small mt-2 mb-0">Client preview — server recalculates on save.</p>
          </div>

          <div className="flex gap-2">
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
