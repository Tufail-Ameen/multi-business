import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ErrorMessage, Field, Form, Formik } from "formik";
import { useEffect } from "react";
import * as Yup from "yup";

export const DEFAULT_CLIENT_CITY = "Lahore";
export const DEFAULT_CLIENT_COUNTRY = "Pakistan";

const emptyForm = {
  name: "",
  phone: "",
  area: "",
  address: "",
  city: DEFAULT_CLIENT_CITY,
  country: DEFAULT_CLIENT_COUNTRY,
};

const validationSchema = Yup.object({
  name: Yup.string().min(3).max(50).required("Shop name required"),
  phone: Yup.string()
    .required("Phone required")
    .test("phone", "Enter a valid phone number", (value) => {
      const digits = String(value || "").replace(/\D/g, "");
      return digits.length >= 10 && digits.length <= 13;
    }),
  area: Yup.string().required("Area required"),
  address: Yup.string().required("Address required"),
  city: Yup.string().required("City required"),
  country: Yup.string().required("Country required"),
});

function clientToForm(client) {
  if (!client) return emptyForm;
  return {
    name: client.name || "",
    phone: client.phone || "",
    area: client.area || "",
    address: client.address || "",
    city: client.city || DEFAULT_CLIENT_CITY,
    country: client.country || DEFAULT_CLIENT_COUNTRY,
  };
}

export function toClientPayload(values) {
  return {
    name: values.name.trim(),
    phone: values.phone.trim(),
    area: values.area.trim(),
    address: values.address.trim(),
    city: values.city.trim() || DEFAULT_CLIENT_CITY,
    country: DEFAULT_CLIENT_COUNTRY,
  };
}

export default function ClientFormModal({ client, isSaving, onClose, onSubmit }) {
  const isEdit = Boolean(client);

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
      initialValues={clientToForm(client)}
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
              aria-labelledby="client-modal-title"
            >
              <header className="invoice-modal-head">
                <div>
                  <p className="invoice-modal-kicker">
                    {isEdit ? "Edit client" : "New client"}
                  </p>
                  <h2 id="client-modal-title" className="invoice-modal-title">
                    {isEdit ? client.name || "Update details" : "Add billing client"}
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
                      <label className="invoice-label" htmlFor="client-name">
                        Shop name
                      </label>
                      <Field
                        name="name"
                        id="client-name"
                        className="form-control input-settings"
                        placeholder="Shop name"
                        autoFocus
                      />
                      <ErrorMessage name="name" component="div" className="invoice-field-error" />
                    </div>
                    <div className="invoice-field">
                      <label className="invoice-label" htmlFor="client-phone">
                        Phone number
                      </label>
                      <Field
                        name="phone"
                        id="client-phone"
                        type="tel"
                        className="form-control input-settings"
                        placeholder="03xxxxxxxxx"
                      />
                      <ErrorMessage name="phone" component="div" className="invoice-field-error" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="invoice-field">
                      <label className="invoice-label" htmlFor="client-area">
                        Area
                      </label>
                      <Field
                        name="area"
                        id="client-area"
                        className="form-control input-settings"
                        placeholder="Area"
                      />
                      <ErrorMessage name="area" component="div" className="invoice-field-error" />
                    </div>
                    <div className="invoice-field">
                      <label className="invoice-label" htmlFor="client-address">
                        Address
                      </label>
                      <Field
                        name="address"
                        id="client-address"
                        className="form-control input-settings"
                        placeholder="Street, building"
                      />
                      <ErrorMessage name="address" component="div" className="invoice-field-error" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="invoice-field">
                      <label className="invoice-label" htmlFor="client-city">
                        City
                      </label>
                      <Field
                        name="city"
                        id="client-city"
                        className="form-control input-settings"
                        placeholder={DEFAULT_CLIENT_CITY}
                      />
                      <ErrorMessage name="city" component="div" className="invoice-field-error" />
                    </div>
                    <div className="invoice-field">
                      <label className="invoice-label" htmlFor="client-country">
                        Country
                      </label>
                      <Field
                        name="country"
                        id="client-country"
                        className="form-control input-settings input-computed"
                        readOnly
                        tabIndex={-1}
                      />
                    </div>
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
                  {isEdit ? "Save changes" : "Add client"}
                </button>
              </footer>
            </div>
          </div>
        </Form>
      )}
    </Formik>
  );
}
