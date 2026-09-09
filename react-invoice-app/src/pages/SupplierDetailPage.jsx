import { faAngleLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ErrorMessage, Field, Form, Formik } from "formik";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import * as Yup from "yup";
import { useAuth } from "../auth/AuthContext";
import { Can } from "../auth/guards";
import EmptyState from "../components/ui/EmptyState";
import StatusBadge from "../components/ui/StatusBadge";
import { PERMISSIONS } from "../lib/permissions";
import { getErrorMessage } from "../lib/rtkBaseQuery";
import {
  useCreateSupplierPaymentMutation,
  useGetSupplierLedgerQuery,
  useGetSupplierQuery,
} from "../services/invoiceApi";
import { formatAmount } from "../utils/invoice";

const paymentSchema = Yup.object({
  amount: Yup.number().positive("Amount must be > 0").required("Amount required"),
  paymentMethod: Yup.string().max(50),
  reference: Yup.string().max(100),
  notes: Yup.string().max(500),
});

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return String(value);
  }
}

export default function SupplierDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const canViewLedger = can(PERMISSIONS.SUPPLIER_LEDGER_VIEW);

  const {
    data: supplierData,
    isLoading: supplierLoading,
    isError: supplierError,
    error: supplierErr,
  } = useGetSupplierQuery(id);
  const {
    data: ledgerData,
    isLoading: ledgerLoading,
    isError: ledgerError,
    error: ledgerErr,
  } = useGetSupplierLedgerQuery(id, { skip: !canViewLedger });
  const [createPayment] = useCreateSupplierPaymentMutation();

  const supplier = supplierData?.supplier;
  const entries = ledgerData?.entries || [];
  const summary = {
    totalPurchases: supplier?.totalPurchases ?? ledgerData?.summary?.totalPurchases ?? 0,
    totalPaid: supplier?.totalPaid ?? ledgerData?.summary?.totalPaid ?? 0,
    outstandingPayable:
      supplier?.outstandingPayable ?? ledgerData?.summary?.outstandingPayable ?? 0,
  };

  useEffect(() => {
    if (supplierError) toast.error(getErrorMessage(supplierErr, "Supplier not found"));
  }, [supplierError, supplierErr]);

  useEffect(() => {
    if (ledgerError) toast.error(getErrorMessage(ledgerErr, "Failed to load ledger"));
  }, [ledgerError, ledgerErr]);

  const onPayment = async (values, { resetForm }) => {
    try {
      await createPayment({
        id,
        amount: Number(values.amount),
        paymentMethod: values.paymentMethod || undefined,
        reference: values.reference || undefined,
        notes: values.notes || undefined,
      }).unwrap();
      toast.success("Payment recorded");
      resetForm();
    } catch (err) {
      toast.error(getErrorMessage(err, "Payment failed"));
    }
  };

  if (supplierLoading || (canViewLedger && ledgerLoading)) {
    return (
      <div className="page-wrap">
        <p className="textcklr">Loading…</p>
      </div>
    );
  }

  if (!supplier) {
    return (
      <EmptyState title="Supplier not found" message="This supplier does not exist or was deleted." />
    );
  }

  return (
    <div className="page-wrap invoice-detail">
      <button type="button" className="back-link" onClick={() => navigate("/suppliers")}>
        <FontAwesomeIcon className="icon me-2" icon={faAngleLeft} size="2xs" />
        Go back
      </button>

      <div className="detail-toolbar">
        <div className="flex items-center gap-3">
          <h1 className="page-title mb-0">{supplier.name}</h1>
          <StatusBadge status={supplier.status} compact />
        </div>
      </div>

      <div className="detail-card mb-4">
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 md:col-span-6">
            <span className="block edit-discription">Company</span>
            <span className="block date-bill-email">{supplier.companyName || "—"}</span>
            <span className="block edit-discription mt-3">Phone</span>
            <span className="block date-bill-email">{supplier.phone || "—"}</span>
            <span className="block edit-discription mt-3">Email</span>
            <span className="block date-bill-email">{supplier.email || "—"}</span>
          </div>
          <div className="col-span-12 md:col-span-6">
            <span className="block edit-discription">Address</span>
            <span className="block date-bill-email">
              {[supplier.address, supplier.city].filter(Boolean).join(", ") || "—"}
            </span>
            <span className="block edit-discription mt-3">Tax Number</span>
            <span className="block date-bill-email">{supplier.taxNumber || "—"}</span>
            <span className="block edit-discription mt-3">Notes</span>
            <span className="block date-bill-email">{supplier.notes || "—"}</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-12 gap-3">
          <div className="col-span-4">
            <span className="block edit-discription">Total Purchases</span>
            <span className="block price">{formatAmount("Rs", summary.totalPurchases)}</span>
          </div>
          <div className="col-span-4">
            <span className="block edit-discription">Total Paid</span>
            <span className="block price">{formatAmount("Rs", summary.totalPaid)}</span>
          </div>
          <div className="col-span-4">
            <span className="block edit-discription">Outstanding Payable</span>
            <span className="block price">{formatAmount("Rs", summary.outstandingPayable)}</span>
          </div>
        </div>
      </div>

      <Can permission={PERMISSIONS.SUPPLIER_PAYMENTS_CREATE}>
        <Formik
          initialValues={{ amount: "", paymentMethod: "", reference: "", notes: "" }}
          validationSchema={paymentSchema}
          onSubmit={onPayment}
        >
          <Form className="form-card mb-4">
            <h2 className="page-title">Record Payment</h2>
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 md:col-span-3">
                <label className="form-label input-clr" htmlFor="amount">
                  Amount
                </label>
                <Field
                  name="amount"
                  id="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  className="form-control input-settings"
                />
                <ErrorMessage name="amount" component="div" className="text-red-600" />
              </div>
              <div className="col-span-12 md:col-span-3">
                <label className="form-label input-clr" htmlFor="paymentMethod">
                  Payment Method
                </label>
                <Field
                  name="paymentMethod"
                  id="paymentMethod"
                  className="form-control input-settings"
                  placeholder="Cash / Bank / …"
                />
              </div>
              <div className="col-span-12 md:col-span-3">
                <label className="form-label input-clr" htmlFor="reference">
                  Reference
                </label>
                <Field name="reference" id="reference" className="form-control input-settings" />
              </div>
              <div className="col-span-12 md:col-span-3">
                <label className="form-label input-clr" htmlFor="notes">
                  Notes
                </label>
                <Field name="notes" id="notes" className="form-control input-settings" />
              </div>
              <div className="col-span-12">
                <button type="submit" className="btn input-clr1 save-changes py-2 px-4">
                  Save Payment
                </button>
              </div>
            </div>
          </Form>
        </Formik>
      </Can>

      <h2 className="page-title mb-3">Ledger</h2>
      <Can
        permission={PERMISSIONS.SUPPLIER_LEDGER_VIEW}
        fallback={<p className="textcklr">You do not have permission to view the ledger.</p>}
      >
        {!entries.length ? (
          <EmptyState title="No ledger entries" message="Confirmed purchases and payments appear here." />
        ) : (
          <div className="overflow-x-auto table-setting">
            <table className="table m-0">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Reference</th>
                  <th>Debit</th>
                  <th>Credit</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, index) => (
                  <tr key={entry.id}>
                    <td>{index + 1}</td>
                    <td>{formatDate(entry.createdAt)}</td>
                    <td>{entry.entryType}</td>
                    <td>
                      {entry.referenceType
                        ? `${entry.referenceType}${entry.referenceId != null ? ` #${entry.referenceId}` : ""}`
                        : entry.description || "—"}
                    </td>
                    <td>{formatAmount("Rs", entry.debit)}</td>
                    <td>{formatAmount("Rs", entry.credit)}</td>
                    <td>{formatAmount("Rs", entry.balanceAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Can>
    </div>
  );
}
