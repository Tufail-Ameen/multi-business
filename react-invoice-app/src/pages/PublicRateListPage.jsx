import { faPrint } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Fragment } from "react";
import { Link, useParams } from "react-router-dom";
import { getErrorCode } from "../lib/rtkBaseQuery";
import { formatPrice } from "../lib/rateLists";
import { useGetPublicRateListQuery } from "../services/invoiceApi";

const COLUMNS = 3;
const cellClass =
  "border-b border-[var(--color-border)] px-[0.35rem] py-[0.42rem] text-left align-middle text-[0.88rem] print:px-[0.3rem] print:py-[0.26rem] print:text-[0.8rem]";
const headClass = `${cellClass} text-[0.68rem] font-bold uppercase tracking-wider text-[var(--color-text-muted)]`;
const unitClass = `${cellClass} w-[2.6rem] text-[var(--color-text-muted)]`;
const rateClass = `${cellClass} w-[4.6rem] whitespace-nowrap font-bold`;
const gapClass =
  "w-3 border-b-0 border-l border-[var(--color-border)] p-0";

const pageClass =
  "min-h-screen bg-[var(--color-bg)] px-4 py-8 pb-12 print:bg-white print:p-0";
const sheetClass =
  "mx-auto max-w-[1180px] rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface)] p-7 shadow-[var(--shadow-card)] print:max-w-none print:border-0 print:p-0 print:shadow-none";

function PublicState({ title, message }) {
  return (
    <div className={pageClass}>
      <div className={`${sheetClass} text-center`}>
        <h1 className="m-0 text-[1.7rem] tracking-tight">{title}</h1>
        <p className="textcklr">{message}</p>
        <Link to="/login" className="btn save-changes px-4 py-2">
          Go to login
        </Link>
      </div>
    </div>
  );
}

function chunkItems(items, size) {
  const rows = [];
  for (let i = 0; i < items.length; i += size) {
    const row = items.slice(i, i + size);
    while (row.length < size) row.push(null);
    rows.push(row);
  }
  return rows;
}

function ColumnHead() {
  return (
    <>
      <th className={`${headClass} w-[1.5rem]`}>#</th>
      <th className={headClass}>Product</th>
      <th className={`${headClass} w-[2.6rem]`}>Unit</th>
      <th className={`${headClass} w-[4.6rem]`}>Rate</th>
    </>
  );
}

function EmptyCells() {
  return (
    <>
      <td className={cellClass} />
      <td className={cellClass} />
      <td className={unitClass} />
      <td className={rateClass} />
    </>
  );
}

function RateCells({ item, index }) {
  return (
    <>
      <td className={`${cellClass} text-[var(--color-text-muted)]`}>{index}</td>
      <td className={cellClass}>{item.productName}</td>
      <td className={unitClass}>{item.unit || "pcs"}</td>
      <td className={rateClass}>
        {formatPrice(item.price ?? item.customPrice ?? item.defaultPrice)}
      </td>
    </>
  );
}

export default function PublicRateListPage() {
  const { token } = useParams();
  const { data: list, isLoading, isError, error } = useGetPublicRateListQuery(token, {
    skip: !token,
  });

  if (isLoading) {
    return (
      <div className={pageClass}>
        <p className="textcklr">Loading rate list…</p>
      </div>
    );
  }

  if (isError || !list) {
    const code = getErrorCode(error);
    const expired = error?.status === 410 || code === "SHARE_LINK_EXPIRED";
    if (expired) {
      return (
        <PublicState
          title="Link expired"
          message="This rate list link is no longer valid. Ask the sender for a new one."
        />
      );
    }
    return (
      <PublicState
        title="Link invalid"
        message="This share link was not found. Check the URL or ask for a new list."
      />
    );
  }

  const items = list.items || [];
  const rows = chunkItems(items, COLUMNS);
  const colIndexes = Array.from({ length: COLUMNS }, (_, i) => i);

  return (
    <div className={pageClass}>
      <style>{`@page { size: A4 landscape; margin: 10mm; }`}</style>
      <article className={sheetClass}>
        <header className="mb-6 flex items-start justify-between gap-4 print:mb-3">
          <div>
            <p className="m-0 text-[0.8rem] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
              {list.number}
            </p>
            <h1 className="mb-[0.35rem] mt-1 text-[1.7rem] tracking-tight print:text-[1.35rem]">
              {list.title || "Rate list"}
            </h1>
            {list.clientName ? (
              <p className="m-0 text-[var(--color-text-muted)]">{list.clientName}</p>
            ) : null}
            {list.sentAt ? (
              <p className="m-0 text-[var(--color-text-muted)]">
                Sent {new Date(list.sentAt).toLocaleDateString()}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="btn save-changes px-3 py-2 print:hidden"
            onClick={() => window.print()}
          >
            <FontAwesomeIcon icon={faPrint} className="me-1" />
            Print
          </button>
        </header>

        <table className="w-full table-fixed">
          <thead>
            <tr>
              {colIndexes.map((col) => (
                <Fragment key={`head-${col}`}>
                  {col > 0 ? <th className={gapClass} aria-hidden="true" /> : null}
                  <ColumnHead />
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((cols, index) => (
              <tr key={index}>
                {cols.map((item, col) => (
                  <Fragment key={`${index}-${col}`}>
                    {col > 0 ? <td className={gapClass} aria-hidden="true" /> : null}
                    {item ? (
                      <RateCells item={item} index={index * COLUMNS + col + 1} />
                    ) : (
                      <EmptyCells />
                    )}
                  </Fragment>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </div>
  );
}
