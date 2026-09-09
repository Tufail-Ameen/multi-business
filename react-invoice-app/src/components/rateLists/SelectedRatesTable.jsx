import { faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { formatDelta, formatPrice } from "../../lib/rateLists";

function deltaClass(tone) {
  if (tone === "up") return "font-bold text-[var(--color-paid)]";
  if (tone === "down") return "font-bold text-[var(--color-danger)]";
  return "text-[var(--color-text-subtle)]";
}

export default function SelectedRatesTable({
  items,
  onChangePrice,
  onRemove,
  readOnly = false,
  showDifference = true,
}) {
  if (!items.length) {
    return <p className="textcklr small mb-0">Included products for this client.</p>;
  }

  return (
    <div className="product-table-scroll client-table-scroll">
      <table className="product-table w-full min-w-[48rem] md:min-w-full">
        <thead>
          <tr>
            <th className="col-index text-left">#</th>
            <th className="text-left">Product</th>
            <th className="text-left">Default</th>
            <th className="text-left">Custom rate</th>
            {showDifference && <th className="text-left">Difference</th>}
            {!readOnly && <th className="w-[1%] whitespace-nowrap text-right"> </th>}
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const delta = formatDelta(item.customPrice, item.defaultPrice);
            return (
              <tr key={String(item.productId)}>
                <td className="col-index text-left">{index + 1}</td>
                <td className="text-left">
                  <div className="table-text-size">{item.productName}</div>
                  <div className="cell-muted small">
                    {item.sku ? `${item.sku} · ` : ""}
                    {item.unit || "pcs"}
                  </div>
                </td>
                <td className="cell-muted text-left">{formatPrice(item.defaultPrice)}</td>
                <td className="text-left">
                  {readOnly ? (
                    <span className="price">{formatPrice(item.customPrice)}</span>
                  ) : (
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="form-control input-settings input-compact min-w-[6.5rem] max-w-[8rem]"
                      value={item.customPrice}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === "") {
                          onChangePrice(item.productId, "");
                          return;
                        }
                        const n = Number(value);
                        if (!Number.isFinite(n) || n < 0) return;
                        onChangePrice(item.productId, n);
                      }}
                      aria-label={`Custom rate for ${item.productName}`}
                    />
                  )}
                </td>
                {showDifference && (
                  <td className={`text-left ${deltaClass(delta.tone)}`}>{delta.text}</td>
                )}
                {!readOnly && (
                  <td className="w-[1%] whitespace-nowrap pl-2 text-right">
                    <button
                      type="button"
                      className="btn cancel px-2 py-1"
                      onClick={() => onRemove(item.productId)}
                      aria-label={`Remove ${item.productName}`}
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
