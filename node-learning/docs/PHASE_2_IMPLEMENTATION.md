# Phase 2 Implementation — Products + Categories + Inventory + Stock Ledger

**Status:** Complete (awaiting approval before Phase 3)  
**Date:** 2026-09-07  
**Sources of truth:** [BUSINESS_ERP_ARCHITECTURE.md](./BUSINESS_ERP_ARCHITECTURE.md), [BUSINESS_ERP_IMPLEMENTATION_PLAN.md](./BUSINESS_ERP_IMPLEMENTATION_PLAN.md)

---

## What changed

Phase 2 delivers a **generic multi-business catalog** and treats the **stock movement ledger** as the inventory source of truth. Purchases, sales/invoices stock deduction, suppliers, returns, expenses, orders, dashboard analytics, and reports are **not** implemented.

### Product model (generalized)

Core fields (business-scoped):

| Field | Notes |
|-------|-------|
| `businessId`, `id` | Tenant + numeric id |
| `name`, `sku`, `barcode` | SKU/barcode unique per business (partial unique indexes) |
| `categoryId`, `category` | FK to categories + denormalized name |
| `brand`, `unit`, `description` | Optional |
| `purchasePrice`, `salePrice`, `wholesalePrice` | Generic pricing |
| `minimumStockLevel` / `minStock` | Low-stock threshold |
| `currentStock` / `stock` | **Cache only** — updated by stock service |
| `status` | `active` / `inactive` / `archived` |
| `trackVariants`, `attributes` | Variant foundation |
| `createdBy`, `updatedBy`, timestamps | Audit-friendly |

**Deprecated / legacy (kept for compatibility):** `tpRate`, `discountPercent`, `netRate`, `printRate`, `price`. API normalizer maps them to/from purchase/sale prices. They are no longer the primary UI model.

**Critical rule:** `PATCH`/`PUT` `/products/:id` **ignores** `stock` / `currentStock` / `openingStock`. Inventory changes only via stock service movements.

### Category model

Collection: `categories`

- Unique `(businessId, name)` — same name allowed across businesses
- Soft-archive when products still reference the category
- Hard delete only when no active product references remain

### Variant foundation

Collection: `product_variants`

- Optional per-product variants (`name`, `sku`, `barcode`, `attributes`, prices, stock cache)
- Stock movements support `variantId`
- Parent `currentStock` = sum of variant caches when variants exist
- Extensible `attributes` map (size/color/etc.) — not over-engineered

### Stock ledger architecture

Collection: **`inventory_movements`** (existing name retained)

| Field | Notes |
|-------|-------|
| `movementType` | Canonical type (also mirrored as `type`) |
| `quantity` | Signed |
| `previousQuantity`, `resultingQuantity`, `balanceAfter` | Balance chain |
| `referenceType`, `referenceId` | Future purchase/invoice links |
| `reason`, `unitCost`, `createdBy`, `createdAt` | |
| `variantId` | Optional |

**Movement types:**

```
OPENING_STOCK | PURCHASE | SALE | SALE_RETURN | PURCHASE_RETURN
DAMAGE | ADJUSTMENT | STOCK_TRANSFER
```

**Source of truth:** ledger sum. `products.currentStock` (and legacy `stock`) is a synchronized cache updated inside the same transactional `applyMovement` call.

**Service:** `stockService.js`

- `getCurrentStock(businessId, productId, variantId?)`
- `checkAvailableStock(...)` — respects `business_settings.allowNegativeStock`
- `applyMovement` / `applyMovementTransactional`

**Opening stock:** product create with `openingStock`/`stock` > 0 creates `OPENING_STOCK`. Dedicated `POST /inventory/opening-stock` only when no movements exist yet.

**Adjustments:** `POST /inventory/adjust` requires non-zero quantity + reason; writes `ADJUSTMENT` + audit log.

---

## APIs

| Method | Path | Permission |
|--------|------|------------|
| GET/POST | `/categories` | `categories.view` / `categories.create` |
| GET/PATCH/DELETE | `/categories/:id` | view / update / delete |
| GET | `/products` | `products.view` — supports `q`, `sku`, `barcode`, `categoryId`, `status`, `lowStock` |
| GET | `/products/low-stock` | `inventory.view` |
| GET/POST | `/products` / `/products/:id` | view / create |
| PATCH/PUT/DELETE | `/products/:id` | update / delete (archive) |
| GET/POST | `/products/:id/variants` | view / create |
| PATCH | `/products/:productId/variants/:variantId` | update |
| GET | `/inventory/movements` | `inventory.view` |
| GET | `/inventory/stock/:productId` | `inventory.view` |
| GET | `/inventory/low-stock` | `inventory.view` |
| POST | `/inventory/check-stock` | `inventory.view` |
| POST | `/inventory/adjust` | `inventory.adjust` |
| POST | `/inventory/opening-stock` | `inventory.adjust` |

Tenant isolation: `authenticate` + `resolveTenant` + `businessId` from `tenantScope` only.

---

## Permissions

Added to catalog (backend + frontend):

```
categories.view|create|update|delete
```

Role template updates:

| Role | Change |
|------|--------|
| Inventory Manager | + categories.* + `products.delete` |
| Invoice Operator | + `categories.view` + `inventory.view` (still **no** adjust) |
| Manager | + `categories.view` |

Startup migration merges missing template permissions onto existing system roles.

---

## Database / migration

`migratePhase2Catalog` on startup:

1. Sync system role category/inventory permission gaps
2. Backfill `currentStock`, `salePrice`, `purchasePrice`, `minimumStockLevel`, `status`, `trackVariants`
3. For products with stock > 0 and **no** movements: insert `OPENING_STOCK` backfill movement

**Indexes added:**

- `categories`: `{ businessId, id }` unique, `{ businessId, name }` unique
- `products`: partial unique `{ businessId, sku }`, `{ businessId, barcode }`; `{ businessId, categoryId }`, `{ businessId, name }`
- `product_variants`: same SKU/barcode partial uniques; `{ businessId, productId }`
- `inventory_movements`: `{ businessId, productId, createdAt }`, `{ businessId, referenceType, referenceId }`

---

## Frontend

- `StockPage` tabs: Products / Categories / Adjust / Stock history
- Generic product form (SKU, barcode, brand, prices, min stock, opening stock)
- Search + category + status + low-stock filters
- Stock history table with type, qty, reason, balance
- RTK: categories CRUD, low-stock query, product query params
- Permission catalog includes categories

---

## Testing

| Suite | Script |
|-------|--------|
| Permissions + stockService unit | `npm run test:unit` |
| Auth / Phase 1 regression | `npm run test:integration:memory` (auth.test.js) |
| Phase 2 catalog/inventory | `test/catalog.test.js` |

Covered: product/category CRUD, SKU cross-business OK / same-business conflict, PATCH ignores stock, opening + adjust chain, low stock, checkAvailableStock, variants, RBAC (manager vs clerk vs booker), tenant isolation, category archive.

---

## Files changed

### Backend

| File | Change |
|------|--------|
| `stockService.js` | **New** — ledger apply/get/check |
| `catalog-routes.js` | **New** — categories/products/variants/inventory |
| `database.js` | Phase 2 migration + indexes |
| `permissions.js` | categories.* + role template updates |
| `app-http.js` | Mount catalog routes; remove inline product/inventory handlers |
| `test/catalog.test.js` | **New** |
| `test/stockService.test.js` | **New** |
| `test/auth.test.js` | Align with ledger create + stock-ignore PATCH |
| `test/permissions.test.js` | Category permission asserts |
| `package.json` | Test scripts include catalog suite |

### Frontend

| File | Change |
|------|--------|
| `src/pages/StockPage.jsx` | Generic catalog + categories + history UI |
| `src/services/invoiceApi.js` | Categories, low-stock, product params |
| `src/lib/normalizeProduct.js` | Generic field normalization |
| `src/lib/permissions.js` | categories.* |
| `src/hooks/useProducts.js` | Accept query params |

### Docs

| File | Change |
|------|--------|
| `docs/PHASE_2_IMPLEMENTATION.md` | This file |
| `docs/BUSINESS_ERP_ARCHITECTURE.md` | Phase 2 status |
| `docs/BUSINESS_ERP_IMPLEMENTATION_PLAN.md` | Phase 2 marked done |

---

## Deferred (Phase 3+)

- Purchase / supplier stock-in
- Sales/invoice stock-out
- Returns, transfers UI beyond type support
- Cached stock reconciliation jobs
- Advanced reports / dashboard analytics
- Full barcode scanner hardware integration
- Counters collection for ID allocation (still using `nextTenantId`)

---

## Known limitations

1. Mongo transactions require replica set (tests use memory replSet; standalone local mongod may error on transactional adjust — production Atlas OK).
2. Product list low-stock filter is applied after fetch for correctness with mixed field names; large catalogs may need a Mongo expression later.
3. Variant stock history UI is API-ready; Stock page focuses on product-level history in Phase 2.
4. Legacy pharma fields remain readable/writable for compatibility but are not shown as primary form fields.
