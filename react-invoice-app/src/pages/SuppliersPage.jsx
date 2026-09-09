import { ErrorMessage, Field, Form, Formik } from "formik";
import { useState } from "react";
import { toast } from "react-toastify";
import * as Yup from "yup";
import { useAuth } from "../auth/AuthContext";
import SupplierList from "../components/suppliers/SupplierList";
import { useSupplierMutations } from "../hooks/useSuppliers";
import { PERMISSIONS } from "../lib/permissions";
import { getErrorMessage } from "../lib/rtkBaseQuery";

const emptyForm = {
  name: "",
  companyName: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  taxNumber: "",
  notes: "",
};

const validationSchema = Yup.object({
  name: Yup.string().min(2).max(100).required("Name required"),
  companyName: Yup.string().max(150),
  phone: Yup.string().max(30),
  email: Yup.string().email("Invalid email"),
  address: Yup.string().max(250),
  city: Yup.string().max(80),
  taxNumber: Yup.string().max(50),
  notes: Yup.string().max(500),
});

export default function SuppliersPage() {
  const [editing, setEditing] = useState(null);
  const { can } = useAuth();
  const { createSupplier, updateSupplier, deleteSupplier } = useSupplierMutations();
  const canShowForm = editing
    ? can(PERMISSIONS.SUPPLIERS_UPDATE)
    : can(PERMISSIONS.SUPPLIERS_CREATE);

  const onSubmit = async (values, { resetForm }) => {
    try {
      if (editing) {
        await updateSupplier({ id: editing.id, ...values }).unwrap();
        toast.success("Supplier updated");
        setEditing(null);
      } else {
        await createSupplier(values).unwrap();
        toast.success("Supplier added");
      }
      resetForm();
    } catch (err) {
      toast.error(getErrorMessage(err, "Save failed"));
    }
  };

  const onDelete = async (supplier) => {
    if (!window.confirm(`Delete ${supplier.name}?`)) return;
    try {
      await deleteSupplier(supplier.id).unwrap();
      toast.success("Deleted");
    } catch (err) {
      toast.error(getErrorMessage(err, "Delete failed"));
    }
  };

  return (
    <div className="page-wrap">
      {canShowForm && (
        <Formik
          initialValues={
            editing
              ? {
                  name: editing.name || "",
                  companyName: editing.companyName || "",
                  phone: editing.phone || "",
                  email: editing.email || "",
                  address: editing.address || "",
                  city: editing.city || "",
                  taxNumber: editing.taxNumber || "",
                  notes: editing.notes || "",
                }
              : emptyForm
          }
          enableReinitialize
          validationSchema={validationSchema}
          onSubmit={onSubmit}
        >
          {({ resetForm }) => (
            <Form className="form-card mb-4">
              <h2 className="bill-form mb-3">{editing ? "Edit Supplier" : "Add Supplier"}</h2>
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-12 md:col-span-6">
                  <label className="form-label input-clr" htmlFor="name">
                    Name
                  </label>
                  <Field name="name" id="name" className="form-control input-settings" />
                  <ErrorMessage name="name" component="div" className="text-red-600" />
                </div>
                <div className="col-span-12 md:col-span-6">
                  <label className="form-label input-clr" htmlFor="companyName">
                    Company Name
                  </label>
                  <Field
                    name="companyName"
                    id="companyName"
                    className="form-control input-settings"
                  />
                  <ErrorMessage name="companyName" component="div" className="text-red-600" />
                </div>
                <div className="col-span-12 md:col-span-6">
                  <label className="form-label input-clr" htmlFor="phone">
                    Phone
                  </label>
                  <Field name="phone" id="phone" className="form-control input-settings" />
                  <ErrorMessage name="phone" component="div" className="text-red-600" />
                </div>
                <div className="col-span-12 md:col-span-6">
                  <label className="form-label input-clr" htmlFor="email">
                    Email
                  </label>
                  <Field
                    name="email"
                    id="email"
                    type="email"
                    className="form-control input-settings"
                  />
                  <ErrorMessage name="email" component="div" className="text-red-600" />
                </div>
                <div className="col-span-12 md:col-span-6">
                  <label className="form-label input-clr" htmlFor="address">
                    Address
                  </label>
                  <Field name="address" id="address" className="form-control input-settings" />
                  <ErrorMessage name="address" component="div" className="text-red-600" />
                </div>
                <div className="col-span-12 md:col-span-6">
                  <label className="form-label input-clr" htmlFor="city">
                    City
                  </label>
                  <Field name="city" id="city" className="form-control input-settings" />
                  <ErrorMessage name="city" component="div" className="text-red-600" />
                </div>
                <div className="col-span-12 md:col-span-6">
                  <label className="form-label input-clr" htmlFor="taxNumber">
                    Tax Number
                  </label>
                  <Field
                    name="taxNumber"
                    id="taxNumber"
                    className="form-control input-settings"
                  />
                  <ErrorMessage name="taxNumber" component="div" className="text-red-600" />
                </div>
                <div className="col-span-12 md:col-span-6">
                  <label className="form-label input-clr" htmlFor="notes">
                    Notes
                  </label>
                  <Field name="notes" id="notes" className="form-control input-settings" />
                  <ErrorMessage name="notes" component="div" className="text-red-600" />
                </div>
                <div className="col-span-12 flex gap-2">
                  <button type="submit" className="btn input-clr1 save-changes py-2 px-4">
                    {editing ? "Update" : "Add Supplier"}
                  </button>
                  {editing && (
                    <button
                      type="button"
                      className="btn cancel py-2 px-3"
                      onClick={() => {
                        setEditing(null);
                        resetForm();
                      }}
                    >
                      Cancel edit
                    </button>
                  )}
                </div>
              </div>
            </Form>
          )}
        </Formik>
      )}

      <SupplierList
        onEdit={(supplier) => {
          if (can(PERMISSIONS.SUPPLIERS_UPDATE)) setEditing(supplier);
        }}
        onDelete={onDelete}
        canEditPermission={PERMISSIONS.SUPPLIERS_UPDATE}
        canDeletePermission={PERMISSIONS.SUPPLIERS_DELETE}
      />
    </div>
  );
}
