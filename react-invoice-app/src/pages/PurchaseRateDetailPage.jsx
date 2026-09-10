import { faAngleLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import EmptyState from "../components/ui/EmptyState";
import { RateChange, formatCell, formatRate, formatRateDate } from "../components/purchases/rateDisplay";
import { getErrorMessage } from "../lib/rtkBaseQuery";
import { useGetPurchasePriceDetailQuery } from "../services/invoiceApi";

export default function PurchaseRateDetailPage() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useGetPurchasePriceDetailQuery(productId);

  useEffect(() => {
    if (isError) toast.error(getErrorMessage(error, "Failed to load vendor rates"));
  }, [isError, error]);

  if (isLoading) {
    return (
      <div className="page-wrap">
        <p className="textcklr">Loading…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        title="No rate history"
        message="Confirm a purchase for this product to compare vendor rates."
      />
    );
  }

  const vendors = data.vendors || [];
  const history = data.history || [];

  return (
    <div className="page-wrap">
      <div className="invoice-doc-nav">
        <button type="button" className="back-link invoice-doc-back" onClick={() => navigate("/purchases/rates")}>
          <FontAwesomeIcon className="icon me-2" icon={faAngleLeft} size="2xs" />
          Vendor rates
        </button>
      </div>

      <div className="invoice-doc-sheet mb-4">
        <div className="invoice-doc-hero">
          <div>
            <p className="invoice-doc-kicker">Vendor rate comparison</p>
            <div className="invoice-doc-title-row">
              <h1>{formatCell(data.productName)}</h1>
            </div>
            {data.sku ? <p className="textcklr small mb-0">{data.sku}</p> : null}
          </div>
          <div className="invoice-doc-hero-amount">
            <span className="edit-discription">Last paid</span>
            <strong>{formatRate(data.last?.unitPrice)}</strong>
            <div className="cell-muted">
              {data.last?.supplierName || "—"}
              {data.last?.purchasedAt ? ` · ${formatRateDate(data.last.purchasedAt)}` : ""}
            </div>
            <RateChange diff={data.rateDiff} change={data.rateChange} />
          </div>
        </div>

        <div className="purchase-rate-compare">
          <div className="purchase-rate-compare-card is-cheap">
            <span className="edit-discription">Cheapest vendor</span>
            {data.cheapest ? (
              <>
                <Link to={`/vendors/${data.cheapest.supplierId}`} className="purchase-rate-compare-name">
                  {data.cheapest.supplierName}
                </Link>
                <strong>{formatRate(data.cheapest.unitPrice)}</strong>
              </>
            ) : (
              <span>—</span>
            )}
          </div>
          <div className="purchase-rate-compare-card is-dear">
            <span className="edit-discription">Costliest vendor</span>
            {data.mostExpensive ? (
              <>
                <Link to={`/vendors/${data.mostExpensive.supplierId}`} className="purchase-rate-compare-name">
                  {data.mostExpensive.supplierName}
                </Link>
                <strong>{formatRate(data.mostExpensive.unitPrice)}</strong>
              </>
            ) : (
              <span>—</span>
            )}
          </div>
        </div>
      </div>

      <h2 className="page-title mb-3">Vendors</h2>
      {!vendors.length ? (
        <EmptyState title="No vendors yet" message="Rates appear after a purchase is confirmed." />
      ) : (
        <div className="form-card product-list-card mb-4">
          <div className="product-table-scroll">
            <table className="product-table w-full min-w-[48rem] md:min-w-full">
              <thead>
                <tr>
                  <th className="text-left">Vendor</th>
                  <th className="text-left">Last rate</th>
                  <th className="text-left">Previous</th>
                  <th className="text-left">Difference</th>
                  <th className="text-left">Lowest</th>
                  <th className="text-left">Highest</th>
                  <th className="text-left">Times bought</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((vendor) => (
                  <tr key={vendor.supplierId}>
                    <td className="table-text-size text-left">
                      <Link
                        to={`/vendors/${vendor.supplierId}`}
                        className="font-bold text-[var(--color-primary)] no-underline hover:underline"
                      >
                        {vendor.supplierName}
                      </Link>
                      <div className="cell-muted">{formatRateDate(vendor.lastPurchasedAt)}</div>
                    </td>
                    <td className="price text-left">{formatRate(vendor.lastPrice)}</td>
                    <td className="cell-muted text-left">{formatRate(vendor.previousPrice)}</td>
                    <td className="text-left">
                      <RateChange diff={vendor.rateDiff} change={vendor.rateChange} />
                    </td>
                    <td className="cell-muted text-left">{formatRate(vendor.minPrice)}</td>
                    <td className="cell-muted text-left">{formatRate(vendor.maxPrice)}</td>
                    <td className="cell-muted text-left">{vendor.purchaseCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <h2 className="page-title mb-3">Rate history</h2>
      {!history.length ? (
        <EmptyState title="No history" message="Confirmed purchase lines appear here." />
      ) : (
        <div className="form-card product-list-card">
          <div className="product-table-scroll">
            <table className="product-table w-full min-w-[36rem] md:min-w-full">
              <thead>
                <tr>
                  <th className="text-left">Date</th>
                  <th className="text-left">Vendor</th>
                  <th className="text-left">Rate</th>
                  <th className="text-left">Purchase</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row, index) => (
                  <tr key={`${row.purchaseId}-${index}`}>
                    <td className="cell-muted text-left">{formatRateDate(row.purchasedAt)}</td>
                    <td className="table-text-size text-left">
                      {row.supplierId != null ? (
                        <Link
                          to={`/vendors/${row.supplierId}`}
                          className="font-bold text-[var(--color-primary)] no-underline hover:underline"
                        >
                          {row.supplierName}
                        </Link>
                      ) : (
                        formatCell(row.supplierName)
                      )}
                    </td>
                    <td className="price text-left">{formatRate(row.unitPrice)}</td>
                    <td className="text-left">
                      {row.purchaseId != null ? (
                        <Link
                          to={`/purchases/${row.purchaseId}`}
                          className="font-bold text-[var(--color-primary)] no-underline hover:underline"
                        >
                          View PO
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
