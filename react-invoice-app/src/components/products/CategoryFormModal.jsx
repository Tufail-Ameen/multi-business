import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ErrorMessage, Field, Form, Formik } from "formik";
import { useEffect } from "react";
import * as Yup from "yup";
import StatusToggle from "../ui/StatusToggle";

const emptyForm = {
  name: "",
  description: "",
  status: "active",
};

const validationSchema = Yup.object({
  name: Yup.string().trim().required("Name required"),
  description: Yup.string(),
  status: Yup.string().oneOf(["active", "inactive"]),
});

function categoryToForm(category) {
  if (!category) return emptyForm;
  return {
    name: category.name || "",
    description: category.description || "",
    status: category.status || "active",
  };
}

export default function CategoryFormModal({ category, isSaving, onClose, onSubmit }) {
  const isEdit = Boolean(category);

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
      initialValues={categoryToForm(category)}
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
              aria-labelledby="category-modal-title"
            >
              <header className="invoice-modal-head">
                <div>
                  <p className="invoice-modal-kicker">
                    {isEdit ? "Edit category" : "New category"}
                  </p>
                  <h2 id="category-modal-title" className="invoice-modal-title">
                    {isEdit ? category.name || "Update details" : "Add product category"}
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
                    <label className="invoice-label" htmlFor="category-name">
                      Name
                    </label>
                    <Field
                      name="name"
                      id="category-name"
                      className="form-control input-settings"
                      placeholder="Category name"
                      autoFocus
                    />
                    <ErrorMessage name="name" component="div" className="invoice-field-error" />
                  </div>

                  <div className="invoice-field">
                    <label className="invoice-label" htmlFor="category-description">
                      Description
                    </label>
                    <Field
                      name="description"
                      id="category-description"
                      className="form-control input-settings"
                      placeholder="Optional"
                    />
                  </div>

                  <div className="invoice-field">
                    <span className="invoice-label" id="category-status-label">
                      Status
                    </span>
                    <StatusToggle name="status" id="category-status" />
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
                  {isEdit ? "Save changes" : "Add category"}
                </button>
              </footer>
            </div>
          </div>
        </Form>
      )}
    </Formik>
  );
}
