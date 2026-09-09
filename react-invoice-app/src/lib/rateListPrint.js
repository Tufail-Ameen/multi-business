import {
  formatPrice,
  paginateCatalogProducts,
  productDefaultPrice,
  splitCatalogColumns,
  toMoneyNumber,
} from "./rateLists";

const PRODUCTS_PER_PAGE = 40;

export function toPrintRow(item) {
  const custom = toMoneyNumber(item?.customPrice);
  return {
    name: item?.name || item?.productName || "",
    unit: item?.unit || "pcs",
    salePrice: custom != null ? custom : productDefaultPrice(item),
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function columnTable(products, startIndex) {
  const rows = products
    .map((product, index) => {
      const name = escapeHtml(product.name);
      const unit = escapeHtml(product.unit || "pcs");
      const rate = escapeHtml(formatPrice(productDefaultPrice(product)));
      return `<tr>
        <td class="num">${startIndex + index}</td>
        <td class="name">${name}</td>
        <td class="unit">${unit}</td>
        <td class="rate">${rate}</td>
      </tr>`;
    })
    .join("");

  return `<table>
    <thead>
      <tr>
        <th class="num">#</th>
        <th>Product</th>
        <th>Unit</th>
        <th>Rate</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function pageHtml(products, { title, pageIndex, pageCount, startIndex }) {
  const { left, right } = splitCatalogColumns(products);
  const pageLabel = pageCount > 1 ? ` · ${pageIndex + 1}/${pageCount}` : "";
  return `<section class="sheet">
    <header>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(new Date().toLocaleDateString())}${pageLabel}</p>
    </header>
    <div class="cols">
      ${columnTable(left, startIndex)}
      ${right.length ? `<div class="divider"></div>${columnTable(right, startIndex + left.length)}` : ""}
    </div>
  </section>`;
}

function buildPrintHtml(products, title) {
  const rows = (products || []).map(toPrintRow);
  const pages = paginateCatalogProducts(rows, PRODUCTS_PER_PAGE, 8);
  let startIndex = 1;
  const body = pages
    .map((page, index) => {
      const html = pageHtml(page, {
        title,
        pageIndex: index,
        pageCount: pages.length,
        startIndex,
      });
      startIndex += page.length;
      return html;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #fff;
      color: #1c2320;
      font-family: system-ui, sans-serif;
    }
    .sheet {
      width: 210mm;
      min-height: 297mm;
      padding: 14mm;
      page-break-after: always;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 14px;
    }
    h1 { margin: 0; font-size: 22px; }
    header p { margin: 0; color: #5c6b64; font-size: 13px; }
    .cols { display: flex; gap: 16px; align-items: flex-start; }
    .divider { width: 2px; align-self: stretch; background: #d0c9b8; }
    table { flex: 1; width: 100%; border-collapse: collapse; }
    th, td {
      padding: 8px 6px;
      border-bottom: 1px solid #d4cfc4;
      font-size: 14px;
      text-align: left;
      vertical-align: middle;
    }
    th {
      font-size: 11px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #8a958f;
      background: #f7f5f0;
    }
    .unit { color: #5c6b64; width: 52px; }
    .num { color: #8a958f; width: 28px; font-variant-numeric: tabular-nums; }
    .rate { font-weight: 700; white-space: nowrap; width: 84px; }
  </style>
</head>
<body>
  ${body}
</body>
</html>`;
}

export function openRateListPrint(products, { title = "Rate list" } = {}) {
  const html = buildPrintHtml(products, title);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;";
  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  if (!frameWindow) {
    iframe.remove();
    return false;
  }

  frameWindow.document.open();
  frameWindow.document.write(html);
  frameWindow.document.close();

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    iframe.remove();
  };
  frameWindow.addEventListener("afterprint", cleanup);
  window.setTimeout(cleanup, 120000);
  try {
    frameWindow.focus();
    frameWindow.print();
  } catch {
    cleanup();
    return false;
  }
  return true;
}
