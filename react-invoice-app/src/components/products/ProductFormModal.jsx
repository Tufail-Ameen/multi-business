import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ErrorMessage, Field, Form, Formik, useFormikContext } from "formik";
import { useEffect, useMemo } from "react";
import * as Yup from "yup";
import StatusToggle from "../ui/StatusToggle";

const UNIT_OPTIONS = ["pcs", "kg", "box", "pack", "liter", "meter", "dozen"];

const requiredMoney = (message) =>
  Yup.number()
    .transform((value, originalValue) =>
      originalValue === "" || originalValue == null ? undefined : value
    )
    .typeError(message)
    .required(message)
    .min(0, "Must be 0 or more");

const productSchema = Yup.object({
  name: Yup.string().required("Name required"),
  sku: Yup.string().trim(),
  barcode: Yup.string().trim(),
  brand: Yup.string().trim(),
  categoryId: Yup.string().required("Category required"),
  unit: Yup.string().default("pcs"),
  purchasePrice: requiredMoney("Purchase price required"),
  salePrice: requiredMoney("Sale price required"),
  printRate: requiredMoney("Printed price required"),
  minimumStockLevel: Yup.number().integer().min(0).required("Min stock required"),
  openingStock: Yup.number().integer().min(0),
  description: Yup.string(),
  status: Yup.string().oneOf(["active", "inactive"]),
});

const productEditSchema = productSchema.omit(["openingStock"]);

const emptyProductForm = {
  name: "",
  sku: "",
  barcode: "",
  brand: "",
  categoryId: "",
  unit: "pcs",
  purchasePrice: "",
  salePrice: "",
  printRate: "",
  minimumStockLevel: 0,
  openingStock: 0,
  description: "",
  status: "active",
};

function productToForm(product) {
  if (!product) return emptyProductForm;
  return {
    name: product.name ?? "",
    sku: product.sku ?? "",
    barcode: product.barcode ?? "",
    brand: product.brand ?? "",
    categoryId: product.categoryId != null ? String(product.categoryId) : "",
    unit: product.unit || "pcs",
    purchasePrice: product.purchasePrice ?? "",
    salePrice: product.salePrice ?? product.price ?? "",
    printRate: product.printRate ?? product.wholesalePrice ?? "",
    minimumStockLevel: product.minimumStockLevel ?? product.minStock ?? 0,
    openingStock: 0,
    description: product.description ?? "",
    status: product.status || "active",
  };
}

function toOptionalNumber(value) {
  return value === "" || value == null ? null : Number(value);
}

export function toProductPayload(values) {
  const printRate = toOptionalNumber(values.printRate);
  return {
    name: values.name.trim(),
    sku: values.sku?.trim() || null,
    barcode: values.barcode?.trim() || null,
    brand: values.brand?.trim() || null,
    categoryId: values.categoryId ? Number(values.categoryId) : null,
    unit: values.unit || "pcs",
    purchasePrice: toOptionalNumber(values.purchasePrice),
    salePrice: toOptionalNumber(values.salePrice),
    printRate,
    wholesalePrice: printRate,
    minimumStockLevel: Number(values.minimumStockLevel) || 0,
    description: values.description?.trim() || null,
    status: values.status || "active",
  };
}

function ProductFormFields({ editing, categories }) {
  const { values } = useFormikContext();
  const unitOptions = useMemo(() => {
    const options = [...UNIT_OPTIONS];
    if (values.unit && !options.includes(values.unit)) options.unshift(values.unit);
    return options;
  }, [values.unit]);

  const categoryOptions = useMemo(() => {
    const options = categories.filter((category) => category.status !== "inactive");
    const selected = categories.find((category) => String(category.id) === String(values.categoryId));
    if (selected && !options.some((category) => String(category.id) === String(selected.id))) {
      options.unshift(selected);
    }
    return options;
  }, [categories, values.categoryId]);

  return (
    <section className="invoice-modal-section">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="invoice-field md:col-span-2">
          <label className="invoice-label" htmlFor="product-name">
            Name
          </label>
          <Field
            name="name"
            id="product-name"
            className="form-control input-settings"
            placeholder="Product name"
            autoFocus
          />
          <ErrorMessage name="name" component="div" className="invoice-field-error" />
        </div>
        <div className="invoice-field">
          <label className="invoice-label" htmlFor="product-sku">
            SKU
          </label>
          <Field
            name="sku"
            id="product-sku"
            className="form-control input-settings"
            placeholder="Optional"
          />
        </div>
        <div className="invoice-field">
          <label className="invoice-label" htmlFor="product-barcode">
            Barcode
          </label>
          <Field
            name="barcode"
            id="product-barcode"
            className="form-control input-settings"
            placeholder="Optional"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="invoice-field">
          <label className="invoice-label" htmlFor="product-brand">
            Brand
          </label>
          <Field
            name="brand"
            id="product-brand"
            className="form-control input-settings"
            placeholder="Optional"
          />
        </div>
        <div className="invoice-field">
          <label className="invoice-label" htmlFor="product-unit">
            Unit
          </label>
          <Field as="select" id="product-unit" name="unit" className="form-select input-settings">
            {unitOptions.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </Field>
        </div>
        <div className="invoice-field">
          <label className="invoice-label" htmlFor="product-category">
            Category
          </label>
          <Field
            as="select"
            id="product-category"
            name="categoryId"
            className="form-select input-settings"
          >
            <option value="">Select…</option>
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Field>
          <ErrorMessage name="categoryId" component="div" className="invoice-field-error" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="invoice-field">
          <label className="invoice-label" htmlFor="product-purchase">
            Purchase price
          </label>
          <Field
            id="product-purchase"
            name="purchasePrice"
            type="number"
            min="0"
            className="form-control input-settings"
          />
          <ErrorMessage name="purchasePrice" component="div" className="invoice-field-error" />
        </div>
        <div className="invoice-field">
          <label className="invoice-label" htmlFor="product-sale">
            Sale price
          </label>
          <Field
            id="product-sale"
            name="salePrice"
            type="number"
            min="0"
            className="form-control input-settings"
          />
          <ErrorMessage name="salePrice" component="div" className="invoice-field-error" />
        </div>
        <div className="invoice-field">
          <label className="invoice-label" htmlFor="product-print">
            Printed price
          </label>
          <Field
            id="product-print"
            name="printRate"
            type="number"
            min="0"
            className="form-control input-settings"
          />
          <ErrorMessage name="printRate" component="div" className="invoice-field-error" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="invoice-field">
          <label className="invoice-label" htmlFor="product-min-stock">
            Min stock
          </label>
          <Field
            id="product-min-stock"
            name="minimumStockLevel"
            type="number"
            min="0"
            className="form-control input-settings"
          />
          <ErrorMessage name="minimumStockLevel" component="div" className="invoice-field-error" />
        </div>
        {!editing && (
          <div className="invoice-field">
            <label className="invoice-label" htmlFor="product-opening-stock">
              Opening stock
            </label>
            <Field
              id="product-opening-stock"
              name="openingStock"
              type="number"
              min="0"
              className="form-control input-settings"
            />
          </div>
        )}
        <div className="invoice-field">
          <span className="invoice-label" id="product-status-label">
            Status
          </span>
          <StatusToggle name="status" id="product-status" />
        </div>
      </div>

      <div className="invoice-field">
        <label className="invoice-label" htmlFor="product-description">
          Description
        </label>
        <Field
          id="product-description"
          name="description"
          className="form-control input-settings"
          placeholder="Optional notes"
        />
      </div>
    </section>
  );
}

export default function ProductFormModal({
  product,
  categories = [],
  isSaving,
  onClose,
  onSubmit,
}) {
  const isEdit = Boolean(product);

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
    <Formik
      initialValues={productToForm(product)}
      enableReinitialize
      validationSchema={isEdit ? productEditSchema : productSchema}
      onSubmit={onSubmit}
    >
      {({ isSubmitting }) => (
        <Form>
          <div className="invoice-modal" onClick={onClose} role="presentation">
            <div
              className="invoice-modal-panel w-full max-w-3xl md:max-w-[840px]"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="product-modal-title"
            >
              <header className="invoice-modal-head">
                <div>
                  <p className="invoice-modal-kicker">
                    {isEdit ? "Edit product" : "New product"}
                  </p>
                  <h2 id="product-modal-title" className="invoice-modal-title">
                    {isEdit ? product.name || "Update details" : "Add catalog product"}
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
                <ProductFormFields editing={isEdit} categories={categories} />
              </div>

              <footer className="invoice-modal-foot">
                <button type="button" className="btn invoice-btn-ghost" onClick={onClose}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn invoice-btn-primary"
                  disabled={isSaving || isSubmitting}
                >
                  {isEdit ? "Save changes" : "Add product"}
                </button>
              </footer>
            </div>
          </div>
        </Form>
      )}
    </Formik>
  );
}
