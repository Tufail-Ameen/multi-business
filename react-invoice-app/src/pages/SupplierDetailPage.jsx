import { faAngleLeft, faMoneyBill, faPen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ErrorMessage, Field, Form, Formik } from "formik";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import * as Yup from "yup";
import { useAuth } from "../auth/AuthContext";
import { Can } from "../auth/guards";
import EmptyState from "../components/ui/EmptyState";
import SupplierFormModal, { toSupplierPayload } from "../components/suppliers/SupplierFormModal";
import { useSupplierMutations } from "../hooks/useSuppliers";
import { PERMISSIONS } from "../lib/permissions";
import { getErrorMessage } from "../lib/rtkBaseQuery";
import {
  useCreateSupplierPaymentMutation,
  useGetSupplierLedgerQuery,
  useGetSupplierQuery,
} from "../services/invoiceApi";
import { formatAmount, formatInvoiceDate } from "../utils/invoice";

const paymentSchema = Yup.object({
  amount: Yup.number().positive("Amount must be > 0").required("Amount required"),
  paymentMethod: Yup.string().max(50),
  reference: Yup.string().max(100),
  notes: Yup.string().max(500),
});

function formatCell(value) {
  if (value === null || value === undefined || value === "") return "—";
  return value;
}

function initials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "V";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function telHref(phone) {
  const digits = String(phone || "").replace(/[^\d+]/g, "");
  return digits.length >= 7 ? `tel:${digits}` : null;
}

function uniqueLine(parts) {
  const seen = new Set();
  return parts
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .filter((part) => {
      const key = part.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(" · ");
}

function statusLabel(status) {
  return String(status || "").toUpperCase() === "ARCHIVED" ? "Archived" : "Active";
}

function entryTypeLabel(type) {
  const key = String(type || "").trim().toLowerCase();
  if (key === "purchase") return "Purchase";
  if (key === "payment") return "Payment";
  return type || "—";
}

function RecordRow({ label, value, href, wide = false }) {
  const text = formatCell(value);
  return (
    <div className={`client-record-row${wide ? " is-wide" : ""}`}>
      <dt>{label}</dt>
      <dd>
        {href && text !== "—" ? <a href={href}>{text}</a> : text}
      </dd>
    </div>
  );
}

export default function SupplierDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const canViewLedger = can(PERMISSIONS.SUPPLIER_LEDGER_VIEW);
  const canPay = can(PERMISSIONS.SUPPLIER_PAYMENTS_CREATE);
  const [tab, setTab] = useState("details");
  const [editOpen, setEditOpen] = useState(false);
  const { updateSupplier, isSaving } = useSupplierMutations();

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
  } = useGetSupplierLedgerQuery({ id, per_page: 100 }, { skip: !canViewLedger });
  const [createPayment] = useCreateSupplierPaymentMutation();

  const supplier = supplierData?.supplier;
  const entries = ledgerData?.entries || [];
  const summary = {
    totalPurchases: supplier?.totalPurchases ?? ledgerData?.summary?.totalPurchases ?? 0,
    totalPaid: supplier?.totalPaid ?? ledgerData?.summary?.totalPaid ?? 0,
    outstandingPayable:
      supplier?.outstandingPayable ?? ledgerData?.summary?.outstandingPayable ?? 0,
  };
  const phoneHref = telHref(supplier?.phone);
  const place = uniqueLine([supplier?.companyName, supplier?.city]);

  useEffect(() => {
    if (supplierError) toast.error(getErrorMessage(supplierErr, "Vendor not found"));
  }, [supplierError, supplierErr]);

  useEffect(() => {
    if (ledgerError) toast.error(getErrorMessage(ledgerErr, "Failed to load ledger"));
  }, [ledgerError, ledgerErr]);

  const onSaveVendor = async (values, { resetForm }) => {
    try {
      await updateSupplier({ id: supplier.id, ...toSupplierPayload(values) }).unwrap();
      toast.success("Vendor updated");
      resetForm();
      setEditOpen(false);
    } catch (err) {
      toast.error(getErrorMessage(err, "Save failed"));
    }
  };

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
      if (canViewLedger) setTab("ledger");
    } catch (err) {
      toast.error(getErrorMessage(err, "Payment failed"));
    }
  };

  if (supplierLoading) {
    return (
      <div className="client-profile">
        <p className="textcklr">Loading…</p>
      </div>
    );
  }

  if (!supplier) {
    return (
      <EmptyState title="Vendor not found" message="This vendor does not exist or was deleted." />
    );
  }

  return (
    <div className="client-profile">
      <article className="client-record">
        <div className="client-record-toolbar no-print">
          <button type="button" className="client-record-back" onClick={() => navigate("/vendors")}>
            <FontAwesomeIcon icon={faAngleLeft} size="2xs" />
            Vendors
          </button>
          <div className="client-record-actions">
            <Can permission={PERMISSIONS.SUPPLIERS_UPDATE}>
              <button type="button" className="btn edit py-2 px-3" onClick={() => setEditOpen(true)}>
                <FontAwesomeIcon icon={faPen} />
                Edit
              </button>
            </Can>
            {canPay ? (
              <button
                type="button"
                className="btn save-changes py-2 px-3"
                onClick={() => setTab("payment")}
              >
                <FontAwesomeIcon icon={faMoneyBill} />
                Record payment
              </button>
            ) : null}
          </div>
        </div>

        <header className="client-record-letterhead">
          <div className="client-record-brand">
            <span className="client-record-mark" aria-hidden="true">
              {initials(supplier.name)}
            </span>
            <div className="min-w-0">
              <h1>{formatCell(supplier.name)}</h1>
              {place ? <p>{place}</p> : null}
              {phoneHref ? (
                <a href={phoneHref}>{supplier.phone}</a>
              ) : (
                <p>{formatCell(supplier.phone)}</p>
              )}
            </div>
          </div>
          <div className="client-record-doctype">
            <span>Vendor record</span>
            <strong>{statusLabel(supplier.status)}</strong>
          </div>
        </header>

        <section className="client-record-stats" aria-label="Vendor summary">
          <div>
            <span>Purchases</span>
            <strong>{formatAmount("Rs", summary.totalPurchases)}</strong>
          </div>
          <div>
            <span>Paid</span>
            <strong>{formatAmount("Rs", summary.totalPaid)}</strong>
          </div>
          <div>
            <span>{Number(summary.outstandingPayable) < 0 ? "Advance" : "Outstanding"}</span>
            <strong>
              {formatAmount(
                "Rs",
                Number(summary.outstandingPayable) < 0
                  ? Math.abs(summary.outstandingPayable)
                  : summary.outstandingPayable
              )}
            </strong>
          </div>
        </section>

        <nav className="client-record-tabs" aria-label="Vendor sections">
          <button
            type="button"
            className={tab === "details" ? "is-active" : undefined}
            onClick={() => setTab("details")}
          >
            Details
          </button>
          {canViewLedger ? (
            <button
              type="button"
              className={tab === "ledger" ? "is-active" : undefined}
              onClick={() => setTab("ledger")}
            >
              Ledger
            </button>
          ) : null}
          {canPay ? (
            <button
              type="button"
              className={tab === "payment" ? "is-active" : undefined}
              onClick={() => setTab("payment")}
            >
              Payment
            </button>
          ) : null}
        </nav>

        {tab === "details" ? (
          <dl className="client-record-particulars">
            <RecordRow label="Phone" value={supplier.phone} href={phoneHref} />
            <RecordRow label="Company" value={supplier.companyName} />
            <RecordRow label="City" value={supplier.city} />
            <RecordRow label="Email" value={supplier.email} href={supplier.email ? `mailto:${supplier.email}` : null} />
            {supplier.address ? <RecordRow label="Address" value={supplier.address} wide /> : null}
            <RecordRow label="Tax no." value={supplier.taxNumber} />
            {supplier.notes ? <RecordRow label="Notes" value={supplier.notes} wide /> : null}
          </dl>
        ) : null}

        {tab === "ledger" ? (
          <div className="client-record-body">
            {!canViewLedger ? (
              <p className="textcklr mb-0">You do not have permission to view the ledger.</p>
            ) : ledgerLoading ? (
              <p className="textcklr mb-0">Loading ledger…</p>
            ) : !entries.length ? (
              <EmptyState
                className="!border-0 !bg-transparent !shadow-none !p-6"
                title="No ledger entries"
                message="Confirmed purchases and payments appear here."
              />
            ) : (
              <div className="invoice-doc-table-wrap vendor-ledger">
                <table className="invoice-doc-table purchase-doc-table">
                  <thead>
                    <tr>
                      <th className="is-index">#</th>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Reference</th>
                      <th className="is-num">Debit</th>
                      <th className="is-num">Credit</th>
                      <th className="is-num">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry, index) => (
                      <tr key={entry.id}>
                        <td className="is-index">{index + 1}</td>
                        <td>{formatInvoiceDate(entry.createdAt)}</td>
                        <td>{entryTypeLabel(entry.entryType)}</td>
                        <td>
                          {entry.referenceType
                            ? `${entry.referenceType}${entry.referenceId != null ? ` #${entry.referenceId}` : ""}`
                            : entry.description || "—"}
                        </td>
                        <td className="is-num">{formatAmount("Rs", entry.debit)}</td>
                        <td className="is-num">{formatAmount("Rs", entry.credit)}</td>
                        <td className="is-num is-total">{formatAmount("Rs", entry.balanceAfter)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}

        {tab === "payment" && canPay ? (
          <div className="client-record-body">
            <Formik
              initialValues={{ amount: "", paymentMethod: "", reference: "", notes: "" }}
              validationSchema={paymentSchema}
              onSubmit={onPayment}
            >
              <Form className="vendor-pay-grid">
                <div className="invoice-field">
                  <label className="invoice-label" htmlFor="amount">
                    Amount
                  </label>
                  <Field
                    name="amount"
                    id="amount"
                    type="number"
                    min="0"
                    step="0.01"
                    className="form-control input-settings"
                    placeholder="0"
                  />
                  <ErrorMessage name="amount" component="div" className="invoice-field-error" />
                </div>
                <div className="invoice-field">
                  <label className="invoice-label" htmlFor="paymentMethod">
                    Method
                  </label>
                  <Field
                    name="paymentMethod"
                    id="paymentMethod"
                    className="form-control input-settings"
                    placeholder="Cash / Bank"
                  />
                </div>
                <div className="invoice-field">
                  <label className="invoice-label" htmlFor="reference">
                    Reference
                  </label>
                  <Field name="reference" id="reference" className="form-control input-settings" />
                </div>
                <div className="invoice-field">
                  <label className="invoice-label" htmlFor="notes">
                    Notes
                  </label>
                  <Field name="notes" id="notes" className="form-control input-settings" />
                </div>
                <div className="vendor-pay-actions">
                  <button type="submit" className="btn save-changes py-2 px-4">
                    Save payment
                  </button>
                </div>
              </Form>
            </Formik>
          </div>
        ) : null}
      </article>

      {editOpen ? (
        <SupplierFormModal
          supplier={supplier}
          isSaving={isSaving}
          onClose={() => setEditOpen(false)}
          onSubmit={onSaveVendor}
        />
      ) : null}
    </div>
  );
}
