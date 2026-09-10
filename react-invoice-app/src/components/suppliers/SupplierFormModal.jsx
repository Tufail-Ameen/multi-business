import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ErrorMessage, Field, Form, Formik, useFormikContext } from "formik";
import { useEffect } from "react";
import * as Yup from "yup";
import ContactField from "../ui/ContactField";
import { contactSchema, sanitizeContact } from "../../lib/validation";

export const DEFAULT_SUPPLIER_CITY = "Lahore";

const emptyForm = {
  name: "",
  companyName: "",
  phone: "",
  city: DEFAULT_SUPPLIER_CITY,
  status: "ACTIVE",
};

const validationSchema = Yup.object({
  name: Yup.string().min(2).max(100).required("Name required"),
  companyName: Yup.string().max(150),
  phone: contactSchema({ required: false }),
  city: Yup.string().max(80),
  status: Yup.string().oneOf(["ACTIVE", "ARCHIVED"]),
});

function supplierToForm(supplier) {
  if (!supplier) return emptyForm;
  const status = String(supplier.status || "ACTIVE").toUpperCase();
  return {
    name: supplier.name || "",
    companyName: supplier.companyName || "",
    phone: supplier.phone || "",
    city: supplier.city || DEFAULT_SUPPLIER_CITY,
    status: status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE",
  };
}

export function toSupplierPayload(values) {
  return {
    name: values.name.trim(),
    companyName: values.companyName.trim() || null,
    phone: sanitizeContact(values.phone) || null,
    city: values.city.trim() || null,
    status: values.status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE",
  };
}

function StatusToggle() {
  const { values, setFieldValue } = useFormikContext();
  const options = [
    { value: "ACTIVE", label: "Active" },
    { value: "ARCHIVED", label: "Archived" },
  ];

  return (
    <div className="stock-tab-nav !bg-[var(--color-surface-2)]" role="group" aria-label="Status">
      {options.map((option) => {
        const selected = values.status === option.value;
        return (
          <button
            key={option.value}
            type="button"
            className={`stock-tab-btn ${selected ? "active" : ""}`}
            aria-pressed={selected}
            onClick={() => setFieldValue("status", option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export default function SupplierFormModal({ supplier, isSaving, onClose, onSubmit }) {
  const isEdit = Boolean(supplier);

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
      initialValues={supplierToForm(supplier)}
      enableReinitialize
      validationSchema={validationSchema}
      onSubmit={onSubmit}
    >
      {({ isSubmitting }) => (
        <Form>
          <div className="invoice-modal" onClick={onClose} role="presentation">
            <div
              className="invoice-modal-panel w-full max-w-xl md:max-w-[640px]"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="supplier-modal-title"
            >
              <header className="invoice-modal-head">
                <div>
                  <p className="invoice-modal-kicker">
                    {isEdit ? "Edit vendor" : "New vendor"}
                  </p>
                  <h2 id="supplier-modal-title" className="invoice-modal-title">
                    {isEdit ? supplier.name || "Update details" : "Add vendor"}
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
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="invoice-field">
                      <label className="invoice-label" htmlFor="supplier-name">
                        Name
                      </label>
                      <Field
                        name="name"
                        id="supplier-name"
                        className="form-control input-settings"
                        placeholder="Vendor name"
                        autoFocus
                      />
                      <ErrorMessage name="name" component="div" className="invoice-field-error" />
                    </div>
                    <div className="invoice-field">
                      <label className="invoice-label" htmlFor="supplier-company">
                        Company name
                      </label>
                      <Field
                        name="companyName"
                        id="supplier-company"
                        className="form-control input-settings"
                        placeholder="Company name"
                      />
                      <ErrorMessage
                        name="companyName"
                        component="div"
                        className="invoice-field-error"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="invoice-field">
                      <label className="invoice-label" htmlFor="supplier-phone">
                        Phone
                      </label>
                      <ContactField
                        name="phone"
                        id="supplier-phone"
                        className="form-control input-settings"
                      />
                      <ErrorMessage name="phone" component="div" className="invoice-field-error" />
                    </div>
                    <div className="invoice-field">
                      <label className="invoice-label" htmlFor="supplier-city">
                        City
                      </label>
                      <Field
                        name="city"
                        id="supplier-city"
                        className="form-control input-settings"
                        placeholder={DEFAULT_SUPPLIER_CITY}
                      />
                      <ErrorMessage name="city" component="div" className="invoice-field-error" />
                    </div>
                  </div>

                  <div className="invoice-field">
                    <label className="invoice-label" htmlFor="supplier-status">
                      Status
                    </label>
                    <StatusToggle />
                  </div>
                </section>
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
                  {isEdit ? "Save changes" : "Add vendor"}
                </button>
              </footer>
            </div>
          </div>
        </Form>
      )}
    </Formik>
  );
}
