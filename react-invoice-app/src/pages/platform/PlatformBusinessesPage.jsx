import { faCirclePlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ErrorMessage, Field, Form, Formik } from "formik";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import * as Yup from "yup";
import { Can } from "../../auth/guards";
import EmptyState from "../../components/ui/EmptyState";
import { PERMISSIONS } from "../../lib/permissions";
import { getErrorMessage } from "../../lib/rtkBaseQuery";
import {
  useCreatePlatformBusinessMutation,
  useGetPlatformBusinessesQuery,
  useUpdatePlatformBusinessMutation,
} from "../../services/invoiceApi";

const schema = Yup.object({
  name: Yup.string().required("Business name required"),
  ownerEmail: Yup.string().email("Invalid email").required("Owner email required"),
  ownerFirstName: Yup.string().required("Required"),
  ownerLastName: Yup.string().required("Required"),
  ownerPassword: Yup.string().min(8, "Min 8 chars").required("Required"),
});

/**
 * Platform Super Admin — sab businesses yahan se add / suspend.
 * Backend: GET/POST/PATCH /platform/businesses
 */
export default function PlatformBusinessesPage() {
  const [showForm, setShowForm] = useState(false);
  const { data, isLoading, isError, error, refetch } = useGetPlatformBusinessesQuery();
  const [createBusiness] = useCreatePlatformBusinessMutation();
  const [updateBusiness] = useUpdatePlatformBusinessMutation();
  const businesses = data?.businesses || [];

  useEffect(() => {
    if (isError) toast.error(getErrorMessage(error, "Businesses load nahi hue"));
  }, [isError, error]);

  const toggleStatus = async (business) => {
    const next = business.status === "active" ? "suspended" : "active";
    try {
      await updateBusiness({ id: business.id, status: next }).unwrap();
      toast.success(`Business ${next}`);
    } catch (err) {
      toast.error(getErrorMessage(err, "Update fail"));
    }
  };

  return (
    <div className="page-wrap">
      <div className="invoices-header">
        <p className="count-invoices-tect mb-0">
          Aap platform owner ho — yahan nayi companies add / manage karti hain.
        </p>
        <Can permission={PERMISSIONS.PLATFORM_MANAGE_BUSINESSES}>
          <button type="button" className="btn new-invoice" onClick={() => setShowForm(true)}>
            <span className="circle-plus me-2">
              <FontAwesomeIcon icon={faCirclePlus} />
            </span>
            Add Business
          </button>
        </Can>
      </div>

      {isLoading && <p className="textcklr mt-4">Loading…</p>}

      {!isLoading && !businesses.length && (
        <EmptyState
          title="Abhi koi business nahi"
          message="Backend /platform/businesses connect hone ke baad list yahan aayegi. Pehle Add Business try karein."
        />
      )}

      <div className="rbac-card-grid mt-3">
        {businesses.map((b) => (
          <article key={b.id} className="data-card rbac-entity-card">
            <div className="rbac-entity-head">
              <div>
                <h2 className="rbac-entity-title">{b.name}</h2>
                <p className="textcklr mb-0 small">{b.slug}</p>
              </div>
              <span className={`rbac-status-pill status-${b.status || "active"}`}>
                {b.status || "active"}
              </span>
            </div>
            <p className="textcklr small mb-3">
              Members: {b.memberCount ?? "—"} · Owner: {b.ownerUserId || "—"}
            </p>
            <button
              type="button"
              className="btn filter py-1 px-3"
              onClick={() => toggleStatus(b)}
            >
              {b.status === "suspended" ? "Activate" : "Suspend"}
            </button>
          </article>
        ))}
      </div>

      {showForm && (
        <div className="rbac-modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="form-card rbac-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="page-title mb-2" style={{ fontSize: "1.35rem" }}>
              New business
            </h2>
            <p className="textcklr mb-3">
              Business + owner account create hoga (owner ko Business Owner role milega).
            </p>
            <Formik
              initialValues={{
                name: "",
                ownerEmail: "",
                ownerFirstName: "",
                ownerLastName: "",
                ownerPassword: "Password123!",
              }}
              validationSchema={schema}
              onSubmit={async (values, { setSubmitting }) => {
                try {
                  await createBusiness(values).unwrap();
                  toast.success("Business create ho gaya");
                  setShowForm(false);
                  refetch();
                } catch (err) {
                  toast.error(getErrorMessage(err, "Create fail"));
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {({ isSubmitting }) => (
                <Form>
                  <div className="mb-3">
                    <label className="form-label input-clr">Business name</label>
                    <Field name="name" className="form-control input-settings" />
                    <ErrorMessage name="name" component="div" className="text-red-600" />
                  </div>
                  <div className="grid grid-cols-12 gap-2">
                    <div className="md:col-span-6">
                      <label className="form-label input-clr">Owner first name</label>
                      <Field name="ownerFirstName" className="form-control input-settings" />
                      <ErrorMessage name="ownerFirstName" component="div" className="text-red-600" />
                    </div>
                    <div className="md:col-span-6">
                      <label className="form-label input-clr">Owner last name</label>
                      <Field name="ownerLastName" className="form-control input-settings" />
                      <ErrorMessage name="ownerLastName" component="div" className="text-red-600" />
                    </div>
                  </div>
                  <div className="mb-3 mt-2">
                    <label className="form-label input-clr">Owner email</label>
                    <Field name="ownerEmail" type="email" className="form-control input-settings" />
                    <ErrorMessage name="ownerEmail" component="div" className="text-red-600" />
                  </div>
                  <div className="mb-3">
                    <label className="form-label input-clr">Owner password</label>
                    <Field name="ownerPassword" type="password" className="form-control input-settings" />
                    <ErrorMessage name="ownerPassword" component="div" className="text-red-600" />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button type="button" className="btn filter" onClick={() => setShowForm(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn new-invoice" disabled={isSubmitting}>
                      {isSubmitting ? "Saving…" : "Create"}
                    </button>
                  </div>
                </Form>
              )}
            </Formik>
          </div>
        </div>
      )}
    </div>
  );
}
