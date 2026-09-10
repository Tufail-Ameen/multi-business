import { useGetPurchasePriceHintsQuery } from "../../services/invoiceApi";
import { formatRate, formatRateDate, RateChange } from "./rateDisplay";

export default function PurchaseRateHint({
  productId,
  supplierId,
  onUseRate,
}) {
  const skip = !productId;
  const { data, isFetching } = useGetPurchasePriceHintsQuery(
    { productId, supplierId },
    { skip }
  );

  if (skip) return null;

  if (isFetching && !data) {
    return <p className="purchase-rate-hint">Checking last vendor rates…</p>;
  }

  if (!data) return null;

  const hasHistory = Boolean(data.lastAny || data.vendors?.length);
  if (!hasHistory) {
    return (
      <p className="purchase-rate-hint">
        No confirmed purchase yet
        {data.catalogPurchasePrice != null
          ? ` · catalog ${formatRate(data.catalogPurchasePrice)}`
          : ""}
        .
      </p>
    );
  }

  return (
    <div className="purchase-rate-hint">
      <div className="purchase-rate-hint-row">
        {data.lastFromVendor ? (
          <span>
            Last from this vendor: <strong>{formatRate(data.lastFromVendor.unitPrice)}</strong>
            {data.lastFromVendor.purchasedAt
              ? ` (${formatRateDate(data.lastFromVendor.purchasedAt)})`
              : ""}
            {data.previousFromVendor ? (
              <>
                {" "}
                · was {formatRate(data.previousFromVendor.unitPrice)}{" "}
                <RateChange diff={data.vendorRateDiff} change={data.vendorRateChange} />
              </>
            ) : null}
          </span>
        ) : (
          <span>This vendor has not sold this product yet.</span>
        )}
        {data.cheapest ? (
          <span>
            Cheapest:{" "}
            <strong className="vendor-rate-inline is-cheap">
              {data.cheapest.supplierName} {formatRate(data.cheapest.unitPrice)}
            </strong>
          </span>
        ) : null}
        {data.mostExpensive &&
        data.cheapest &&
        Number(data.mostExpensive.supplierId) !== Number(data.cheapest.supplierId) ? (
          <span>
            Costliest:{" "}
            <strong className="vendor-rate-inline is-dear">
              {data.mostExpensive.supplierName} {formatRate(data.mostExpensive.unitPrice)}
            </strong>
          </span>
        ) : null}
      </div>
      <div className="purchase-rate-hint-actions">
        {data.lastFromVendor ? (
          <button
            type="button"
            className="btn edit py-1 px-2"
            onClick={() => onUseRate?.(data.lastFromVendor.unitPrice)}
          >
            Use last
          </button>
        ) : null}
        {data.cheapest ? (
          <button
            type="button"
            className="btn edit py-1 px-2"
            onClick={() => onUseRate?.(data.cheapest.unitPrice)}
          >
            Use cheapest
          </button>
        ) : null}
      </div>
    </div>
  );
}
