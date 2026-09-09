# Business ERP — Phased Implementation Plan

**Status:** Phase 2 implemented — waiting for approval before Phase 3.  
**Companion:** [BUSINESS_ERP_ARCHITECTURE.md](./BUSINESS_ERP_ARCHITECTURE.md)  
**Phase 1 report:** [PHASE_1_IMPLEMENTATION.md](./PHASE_1_IMPLEMENTATION.md)  
**Phase 2 report:** [PHASE_2_IMPLEMENTATION.md](./PHASE_2_IMPLEMENTATION.md)

This plan evolves the existing Express + MongoDB + CRA invoice app. Each phase is shippable. Do not attempt all modules at once.

---

## Global rules (every phase)

1. Preserve working auth, platform businesses, clients, and products flows.
2. Enforce `businessId` server-side on every new endpoint.
3. Use Mongo transactions for stock + ledger + document confirmation.
4. Extend `src/lib/permissions.js` and seed roles whenever new permissions appear.
5. Prefer extending `invoiceApi` (RTK) over a second API client.
6. Add/adjust indexes with migrations in `database.js` (or phase-specific migrate scripts).
7. Write focused tests for tenant isolation + the phase’s critical transaction.
8. No ecommerce (`start:ecommerce`) work unless requested.

---

## PHASE 1 — Foundation + Multi-business + RBAC

**Status: DONE** (see [PHASE_1_IMPLEMENTATION.md](./PHASE_1_IMPLEMENTATION.md))

**Goal:** Harden tenancy and complete team/RBAC APIs so frontend team screens work against the real backend. Fix owner permission gaps.

### Database changes

- Ensure collections: `users`, `businesses`, `roles`, `business_memberships`, `refresh_tokens`, `audit_logs` (create if missing).
- Indexes: existing unique indexes + `audit_logs { businessId, createdAt }`, `{ businessId, entity, entityId }`.
- Migration: set `business_owner.permissions` to `["*"]` (business-scoped wildcard) **or** full expanded permission list matching frontend catalog.
- Optional: seed system roles per business (`admin`, `invoice_operator`, `inventory_manager`, `order_booker`, `accountant`, `viewer`) with default permission sets (can stub booker/purchase perms until later phases).
- Add `business_settings` collection (minimal stub: currency, allowNegativeStock defaults) — full settings UI in Phase 8; create document on register/platform create.

### Backend / API

| Endpoint | Action |
|----------|--------|
| `GET/POST /users`, `PATCH/DELETE /users/:id` | Implement (invite/membership) |
| `GET/POST /roles`, `PATCH/DELETE /roles/:id` | Implement; protect system roles |
| `GET /audit-logs` | Implement read; write helper for team mutations |
| Auth / platform | Keep; align register owner permissions |
| Middleware | Extract or clarify `authenticate`, `resolveTenant`, `requirePermission` |

- Fix permission matrix: routes requiring `clients.update` etc. must match owner grants.
- Align response envelopes with frontend (`{ data: … }` or current RTK normalizers — pick one and document).

### Frontend

- Wire team pages to live APIs (already calling them — verify end-to-end).
- Add `<Can>` gates on clients/stock/invoice mutating controls (view-only users cannot click create).
- No new major screens required.

### Permissions

- Expand catalog only if needed for stubs.
- Ensure `roles.manage`, `users.*`, `audit.view`, `business.settings` work for owner.

### Validation

- Invite email unique globally or per policy; membership unique `(userId, businessId)`.
- Cannot delete last owner / self-remove last owner.
- Cannot delete system roles or roles in use (409).

### Tests

- Extend `test/auth.test.js`:
  - Owner has update/delete on clients/products.
  - Cross-tenant 403.
  - Role CRUD + permission enforcement.
  - Non-member cannot access with forged `X-Business-Id`.

### Migration requirements

- Startup migration updates existing `business_owner` roles.
- Backfill `audit_logs` empty OK.
- Create default `business_settings` for existing businesses.

### Risks

| Risk | Mitigation |
|------|------------|
| Existing owners suddenly get `*` | Intended; document |
| Frontend expects different user DTO | Match `RBAC_API_CONTRACT.md` shapes |
| Monolith grows further | Start extracting `modules/team` router only |

### Exit criteria

- Team Users / Roles / Audit pages work without mocks.
- Owner can update/delete clients & products.
- Tenant isolation tests green.

---

## PHASE 2 — Products + Categories + Inventory + Stock Ledger

**Status: DONE** (see [PHASE_2_IMPLEMENTATION.md](./PHASE_2_IMPLEMENTATION.md))

**Goal:** Generic catalog + stock ledger as source of truth.

### Database changes

**categories**

```
id, businessId, name, parentId?, status, createdAt, updatedAt
unique: (businessId, name)
```

**products** (evolve existing)

- Add: `sku`, `barcode`, `brand`, `categoryId`, `purchasePrice`, `salePrice`, `wholesalePrice`, `minStock`, `currentStock` (rename/alias from `stock`), `attributes` (object), `trackVariants`.
- Keep legacy `tpRate` / `printRate` / `discountPercent` / `netRate` as optional aliases mapped in API normalizer for backward compatibility.
- Stop accepting arbitrary `stock` on update.

**product_variants** (optional, enable when needed)

```
id, businessId, productId, sku, barcode?, attributes { size, color, … },
purchasePrice?, salePrice?, currentStock, status
unique: (businessId, sku)
```

**stock_movements** (evolve `inventory_movements`)

- Required fields per architecture: `type`, `quantity`, `balanceAfter`, `referenceType`, `referenceId`, `reason`, `createdBy`, `unitCost?`, `variantId?`.
- Migration: for each product with stock > 0 and no movements, insert `opening` movement and set `balanceAfter`.

**counters** (recommended)

```
businessId, key (e.g. "products"), seq
```

Replace racy `nextTenantId` for new writes.

### Backend / API

| Endpoint | Notes |
|----------|-------|
| Categories CRUD | `/categories` |
| Products CRUD | Reject stock on PATCH; opening stock via service |
| `POST /inventory/adjust` | Transaction: movement + currentStock |
| `GET /inventory/movements` | Filter productId, type, date; wrap `{ movements }` |
| Align `PATCH` vs `PUT` | Support PATCH for products |

Implement shared `stockService.applyMovement({ session, businessId, productId, … })`.

### Frontend

- Extend Stock page: tabs for Products / Categories / Movements / Low stock.
- Product form: generic fields; optional size/color/brand; don’t require all fields.
- Map display price from `salePrice` with fallback to `printRate`.
- Barcode field ready (input + search hook stub).

### Permissions

```
categories.view|create|update|delete
inventory.adjust (enforce on adjust route)
```

### Validation

- SKU unique per business; barcode unique when present.
- Adjust quantity ≠ 0; reason required.
- No negative stock unless settings allow (settings stub from Phase 1).

### Tests

- Opening stock creates movement.
- Adjust updates balanceAfter chain.
- Concurrent adjust does not desync (transaction).
- Tenant isolation on categories/products.

### Migration requirements

- Field backfill: `currentStock = stock`, `salePrice = printRate || price`.
- Opening movements for existing qty.
- Indexes on `sku`, `barcode`, `categoryId`, movements `productId`.

### Risks

| Risk | Mitigation |
|------|------------|
| Breaking Stock UI field names | Normalizers keep aliases |
| Historical stock without cost | Opening unitCost null OK |
| Variants complexity | Ship products first; variants behind flag |

### Exit criteria

- Adjust API works; product update cannot silently change stock.
- Movements list shows opening + adjusts.
- Low-stock query works when `minStock` set.

---

## PHASE 3 — Suppliers + Purchases + Supplier Ledger

**Goal:** Procurement flow updates stock and payables.

### Database changes

**suppliers**

```
id, businessId, name, phone, address, email?,
openingBalance, currentBalance, status, notes, createdAt, updatedAt
```

**purchases** + **purchase_items**

```
purchase: number, supplierId, date, status (draft|confirmed|cancelled),
discount, tax, total, paidAmount, balanceDue, notes, createdBy, stockApplied
items: productId, variantId?, quantity, unitPrice, discount, lineTotal
```

**supplier_ledger_entries**

**supplier_price_history**

```
businessId, supplierId, productId, unitPrice, purchasedAt, purchaseId
```

Indexes: `(businessId, number)` unique on purchases; ledger by supplier+date.

### Backend / API

- Suppliers CRUD.
- Purchases CRUD; `POST /purchases/:id/confirm` transactional:
  1. Lock/validate products
  2. Stock movements `purchase`
  3. Update `currentStock`
  4. Supplier ledger + `currentBalance`
  5. Price history rows
  6. `stockApplied = true`
- Draft edits allowed; confirmed immutable except cancel/return (return in Phase 5).
- Report helper: last/avg/min price, best supplier (can be GET on product).

### Frontend

- Suppliers list/form.
- Purchase create UI (line items, product search).
- Supplier ledger page (basic).
- Nav links under Purchasing section.
- Show last purchase price on product detail (read-only).

### Permissions

```
suppliers.view|create|update|delete
purchases.view|create|update|delete|confirm
supplier_ledger.view
```

Seed onto `inventory_manager` + owner.

### Validation

- Confirm requires ≥1 line, qty > 0, supplier exists.
- Cannot confirm twice (`stockApplied`).
- Invoice numbers / purchase numbers unique per business.

### Tests

- Confirm purchase increases stock + ledger.
- Draft does not.
- Price history recorded.
- Cross-tenant blocked.

### Migration requirements

- New collections only; no break to products if Phase 2 done.
- Number sequence `PO-` via counters.

### Risks

| Risk | Mitigation |
|------|------------|
| Partial confirm failure | Single transaction |
| Editing confirmed purchase | Disallow; use returns later |

### Exit criteria

- Confirmed purchase visible in movements and supplier balance.
- Best/last price query returns data.

---

## PHASE 4 — Customers + Sales + Estimates + Invoices

**Goal:** Complete sales side; wire existing invoice UI to real backend.

### Database changes

- Evolve **clients** → treat as **customers** (keep collection name `clients` for compatibility **or** rename with alias layer — prefer keep `clients` collection, API path `/clients` + optional `/customers` alias).
- Add fields: `phone`, `customerType`, `assignedBookerId`, `creditLimit`, `openingBalance`, `currentBalance`.
- **estimates** + items (or `invoices` with `docType: estimate|invoice` — **recommend separate `estimates`** to avoid status confusion).
- **invoices** + **invoice_items** (implement for real).
- **customer_ledger_entries**.
- **payments** (optional in this phase: minimal paidAmount on invoice; full payment module can land Phase 5).

Invoice fields: number, status, stockApplied, paymentType, customerId, estimateId?, orderId?, salesmanId?, currency, totals, paidAmount, balanceDue, snapshots.

### Backend / API

Implement frontend contract from `invoiceApi.js`:

- `GET/POST /invoices`, `GET/PATCH /invoices/:id`, `PATCH /invoices/:id/status`, `DELETE /invoices/:id`
- Estimates CRUD + `POST /estimates/:id/convert`
- Status machine:
  - draft → confirmed/pending (apply stock) → paid / cancelled
  - Align naming: map UI `pending` to “confirmed/awaiting payment” without breaking UI (keep `pending` enum if UI already uses it)
- On confirm: validate stock → movements `sale` → customer ledger if credit → set stockApplied
- Cancel after stockApplied: reverse movements + ledger
- Server computes line prices from product (do not trust client unit prices blindly; allow price override with permission later)
- Convert estimate: create invoice draft/confirmed linked; **stock only on invoice confirm**

### Frontend

- Keep InvoiceForm/List/Detail; fix any DTO mismatches.
- Add Estimates page + “Convert to invoice”.
- Extend customer form with credit fields.
- Default landing for owner → dashboard can wait until Phase 7; optionally route to invoices still.
- Gate invoice actions with `<Can>`.

### Permissions

```
estimates.view|create|update|delete|convert
invoices.* (existing)
customer_ledger.view
# keep clients.* for compatibility
```

### Validation

- Cannot sell above stock unless `allowNegativeStock`.
- Cannot apply stock twice.
- Unique invoice numbers per business.
- Paid invoice delete blocked.

### Tests

- Create pending invoice deducts stock once.
- Cancel restocks once.
- Estimate does not deduct.
- Convert then confirm deducts once.
- Credit sale updates customer balance.

### Migration requirements

- If any orphan invoice docs exist, leave draft or migrate carefully.
- Number sequences `INV-`, `EST-`.

### Risks

| Risk | Mitigation |
|------|------------|
| UI status labels vs backend | Explicit mapping table in API docs |
| Price fields (tpRate vs salePrice) | Server resolution order documented |
| Double deduction bugs | stockApplied + unique movement refs |

### Exit criteria

- Full invoice lifecycle works against Mongo.
- Stock and movements match sales.
- Estimates convertible without stock side effects.

---

## PHASE 5 — Returns + Payments + Expenses

**Goal:** Returns adjust stock and ledgers; expenses tracked; payments first-class.

### Database changes

**sales_returns** + items (link to invoice optional)  
**purchase_returns** + items (link to purchase optional)  
**payments** (customer/supplier, method, amount, date, references)  
**expenses** + **expense_categories** (or string category + settings list)

### Backend / API

- Sales return confirm → movement `customer_return` → customer ledger credit.
- Purchase return confirm → movement `purchase_return` → supplier ledger.
- Payment allocate to invoice/purchase; update balances.
- Expenses CRUD.

### Frontend

- Returns from invoice/purchase detail actions.
- Payments on customer/supplier pages.
- Expenses page.
- Nav updates.

### Permissions

```
sales_returns.view|create
purchase_returns.view|create
payments.view|create
expenses.view|create|update|delete
```

### Validation

- Return qty ≤ original sold/purchased (when linked).
- Payment amount > 0; methods from settings.

### Tests

- Return restocks and adjusts ledger.
- Expense does not touch stock.
- Payment reduces receivable/payable.

### Migration requirements

- New collections; indexes on reference ids.

### Risks

| Risk | Mitigation |
|------|------------|
| Unlinked returns abuse | Prefer linked returns; permission for adjustment-type |
| Partial payment complexity | Start simple; allocate FIFO later if needed |

### Exit criteria

- End-to-end: sale → return → balances correct.
- Purchase → purchase return → stock/payable correct.
- Expenses list + totals for a date range.

---

## PHASE 6 — Order Bookers + Orders + Salesman Tracking

**Goal:** Field orders → invoices; performance attribution.

### Database changes

**orders** + **order_items**

```
bookerId, customerId, status (booked|confirmed|converted|cancelled),
convertedInvoiceId?, totals, notes, orderDate
```

- Customer `assignedBookerId` (from Phase 4).
- Invoice/order link fields.

### Backend / API

- Orders CRUD scoped by permission (`orders.view` vs `orders.view_own`).
- Convert order → invoice (no stock until invoice confirm).
- Performance endpoints: `/reports/salesmen` or `/bookers/:id/stats`.

### Frontend

- Booker home: assigned customers, create order, my orders.
- Owner: all orders + salesman performance widget (full dashboard Phase 7).
- Assignment UI on customer form.

### Permissions

```
orders.view|view_own|create|update|convert
bookers.view|manage
```

### Validation

- Booker can only access assigned customers unless broader permission.
- Convert once.

### Tests

- Scope isolation for booker.
- Convert does not double-stock with invoice confirm.
- Stats count converted orders / sales value.

### Migration requirements

- Seed `order_booker` role permissions.
- No change to historical invoices beyond nullable `salesmanId`.

### Risks

| Risk | Mitigation |
|------|------------|
| Overlapping convert paths (estimate vs order) | Clear source links; stock only on invoice |
| Booker over-permission | Default view_own |

### Exit criteria

- Booker can book and convert per rules.
- Sale attribution visible on invoice and stats API.

---

## PHASE 7 — Dashboard + Reports + Analytics

**Goal:** Owner cockpit + date-filtered reports.

### Database changes

- Mostly aggregations; optional **daily_sales_stats** materialized docs for speed:

```
businessId, date, invoiceCount, grossSales, returns, netSales,
cashSales, creditSales, purchaseTotal, expenseTotal
```

Update on confirm/return/expense (transactional side effect) **or** compute live first, materialize later if slow.

### Backend / API

- `GET /dashboard/summary?date=today`
- Report endpoints listed in architecture (sales, purchase, inventory, low stock, ledgers, profit, expenses, salesman, product, best price, stock movements).
- All accept `from` / `to` and enforce tenant + report permissions.

### Frontend

- New `/dashboard` default for business users.
- Cards: today’s sales/purchases/expenses, receivables/payables, low stock, top products, recent docs, salesman performance.
- Click-through to filtered invoice list.
- Reports section with date filters.
- Keep UI focused — no cluttered widget spam.

### Permissions

```
reports.sales|inventory|purchase|profit|expenses|performance
```

Dashboard may require any of view sales + purchases or a `dashboard.view` shorthand.

### Validation

- Date range max span (e.g. 366 days) to protect DB.

### Tests

- Summary matches fixture invoices for a day.
- Tenant isolation on reports.

### Migration requirements

- Optional backfill of daily stats from historical invoices/purchases.

### Risks

| Risk | Mitigation |
|------|------------|
| Slow aggregations | Indexes + optional daily stats |
| Misleading profit | Label as gross estimate; document COGS source |

### Exit criteria

- Owner sees today’s numbers and can drill into invoices.
- Core reports exportable as JSON/CSV (CSV optional stretch).

---

## PHASE 8 — Audit Logs + Notifications + Business Settings

**Goal:** Compliance, settings UI, lightweight notifications.

### Database changes

- Harden `audit_logs` coverage.
- **notifications**: `userId`, `businessId`, `type`, `title`, `body`, `readAt`, `createdAt`.
- Expand **business_settings** (logo, tax, invoice prefixes, negative stock, payment methods, credit policy).

### Backend / API

- Audit writer used from sales/inventory/team/settings services (central helper).
- `GET/PATCH /business/settings`
- Notifications list/mark-read; emit on low stock / order assigned (minimal).

### Frontend

- Business Settings page (`business.settings`).
- Audit page filters (actor, entity, date).
- Notification bell (simple).

### Permissions

```
business.settings
audit.view
notifications.view
```

### Validation

- Settings patch allowlist fields only.
- Logo upload: URL or later file storage — start with URL.

### Tests

- Editing invoice writes audit with old/new qty.
- Settings change audited.
- Non-owner cannot patch settings.

### Migration requirements

- Backfill settings defaults for all businesses.

### Risks

| Risk | Mitigation |
|------|------------|
| Audit volume | Index + retention policy later |
| File uploads | Defer binary storage |

### Exit criteria

- Settings drive negative-stock and invoice prefix behavior.
- Critical actions visible in audit UI.

---

## PHASE 9 — Performance + Security + Testing + Production Hardening

**Goal:** Production readiness.

### Database changes

- Review all indexes (tenant + date + status + sku).
- TTL/retention for notifications; archive strategy for audit.
- Counter-based numbering everywhere.

### Backend / API

- Split remaining monolith into module routers.
- Rate limiting, helmet, consistent error codes.
- Refresh tokens: document httpOnly cookie migration path (optional implement).
- Request validation library (e.g. zod/joi) across modules.
- Idempotency keys for confirm endpoints (optional).
- Stock reconciliation command: sum(movements) vs currentStock.

### Frontend

- Pagination/search on all large lists.
- Remove dead code (UsersPage, Recoil, duplicate endpoints).
- Permission gating audit.
- Loading/error empty states consistency.
- Bundle/perf pass.

### Permissions

- Final matrix review vs seed roles.
- Penetration-style checklist: IDOR on `:id` without businessId.

### Validation / Tests

- Full integration suite per module.
- Load test confirm-invoice under concurrency.
- Security review of tenant middleware.

### Migration requirements

- Document upgrade path from current DB to fully migrated schema.
- Backup/restore runbook.

### Risks

| Risk | Mitigation |
|------|------------|
| Large refactor regressions | Module split with characterization tests first |
| Mongo transaction requirement (replica set) | Document Atlas/local replica set for dev |

### Exit criteria

- Checklist signed: isolation, transactions, no estimate stock bugs, CI tests green.
- Ops docs updated (`SETUP.md` + this plan status).

---

## Cross-phase dependency graph

```
Phase 1 (RBAC/tenant harden)
    ↓
Phase 2 (stock ledger)
    ↓
Phase 3 (purchases) ──┐
    ↓                 │
Phase 4 (sales)  ←────┘  (sales can start after 2; 3 parallelizable carefully)
    ↓
Phase 5 (returns/payments/expenses)
    ↓
Phase 6 (orders/bookers)
    ↓
Phase 7 (dashboard/reports)
    ↓
Phase 8 (audit/settings/notifications polish)
    ↓
Phase 9 (harden)
```

**Parallel note:** After Phase 2, Phase 3 and Phase 4 can proceed in parallel if staffing allows, but share `stockService` carefully.

---

## Suggested first approval checkpoint

Approve **Phase 1 only** to begin. After Phase 1 ships, re-approve Phase 2 before catalog/stock work.

---

## Document ownership

| Doc | Role |
|-----|------|
| `docs/BUSINESS_ERP_ARCHITECTURE.md` | Target design |
| `docs/BUSINESS_ERP_IMPLEMENTATION_PLAN.md` | This phased plan |
| `react-invoice-app/docs/*` | Historical contracts — update or mark superseded when APIs change |

---

**Waiting for approval before any Phase 1 implementation.**
