# Business ERP Architecture

**Status:** Architecture + Phase 1 + Phase 2 implemented — Phase 3+ not started.  
**Date:** 2026-09-07  
**Scope:** Evolve existing Tofail Invoice app into a generic multi-business / shop-management ERP.

**Phase 1 notes (implemented):** Business Owner permissions are `["*"]` (business-scoped only). System roles are seeded per business (`business_owner`, `invoice_operator`, `inventory_manager`, `order_booker`, `manager`). Team users/roles/audit-log APIs are live. See [PHASE_1_IMPLEMENTATION.md](./PHASE_1_IMPLEMENTATION.md).

**Phase 2 notes (implemented):** Generic products + categories + product variants foundation; `inventory_movements` ledger is the stock source of truth with `stockService.applyMovement`; opening stock + adjustments + low-stock; product PATCH cannot mutate stock. See [PHASE_2_IMPLEMENTATION.md](./PHASE_2_IMPLEMENTATION.md).

---

## 1. Current Architecture

### 1.1 Stack

| Layer | Technology |
|-------|------------|
| Frontend | Create React App, React 18, React Router v6 |
| State | Redux Toolkit + RTK Query (API); React Context (auth) |
| UI | Bootstrap 5 + custom CSS (`App.css`), Font Awesome, Formik/Yup, Toastify, SweetAlert2 |
| Backend | Node.js + Express 5 (CommonJS) |
| Database | MongoDB (native driver v7 — **no ODM**) |
| Auth | Custom HS256 JWT (access + refresh), scrypt password hashing |
| Ports | Frontend `:3000`, API `:5001`, optional ecommerce `:5002` |

### 1.2 Repository layout

```
tofail project/
├── react-invoice-app/                    # Main CRA frontend
│   ├── src/                              # Invoice/RBAC app
│   ├── ecommerce/                        # Separate Vite demo (not part of main ERP path)
│   └── docs/                             # Early contracts (partially outdated)
├── backend project/react-invice-app-backend/
│   ├── app.js / app-http.js              # Monolithic API (~1300 lines)
│   ├── auth.js                           # JWT, passwords, permission constants
│   ├── database.js                       # Migrations, indexes, tenant IDs
│   ├── ecommerce.js                      # Separate ecommerce API (ignore for ERP)
│   ├── migrate-multitenant.js
│   └── seed-platform-admin.js
└── docs/                                 # This architecture + implementation plan
```

### 1.3 Backend shape today

- **Flat monolith:** all routes and middleware live in `app-http.js`.
- **No** `routes/`, `models/`, `services/`, or shared validators folders.
- Collections are schema-less; shapes are enforced only in handlers.
- Mongo sessions/transactions are used for register, refresh, platform business create, and legacy migration — **not** for inventory/sales (those APIs are incomplete).

### 1.4 Multi-tenant model (already present)

```
Platform Super Admin
  └── Businesses (tenants)
        └── business_memberships (user ↔ business ↔ role)
              └── Tenant data: clients, products, invoices*, inventory_movements*
```

\* Collections indexed / anticipated; invoice write APIs not implemented.

**Isolation mechanism:**

1. JWT carries `userId`, `isPlatformAdmin`, `activeBusinessId`.
2. Client sends `Authorization: Bearer …` + `X-Business-Id`.
3. `resolveTenant` requires header/JWT business match, active business, and membership (or platform privilege).
4. Queries filter by `businessId`.

**Verdict:** Tenant foundation is real and reusable. It must be extended, not replaced.

### 1.5 Authentication (already present)

| Concern | Current |
|---------|---------|
| Register | Creates user + business + `business_owner` role + membership |
| Login | Issues access + refresh; scopes to first active membership |
| Refresh | Rotates refresh token (transactional) |
| Switch business | New tokens + `activeBusinessId` |
| Password | scrypt `salt:hash` |
| Frontend | `tokenStore` (localStorage), axios refresh interceptor, `AuthContext` |

### 1.6 RBAC (partial)

**Frontend permission catalog** (`src/lib/permissions.js`) is richer than backend owner grants.

Backend `OWNER_PERMISSIONS` today:

```
invoices.view|create|update
clients.view|create
products.view|create
inventory.view
users.view
roles.view
```

Missing on owner (but required by some routes / frontend expectations):

```
clients.update|delete
products.update|delete
inventory.adjust
invoices.delete|change_status
users.invite|update|delete
roles.manage
business.settings|manage_team
audit.view
```

**Enforcement:** `requirePermission` middleware on tenant routes. Platform admins get implicit `.view` access. UI uses `RequirePermission` on routes; `<Can>` only on team/platform screens (clients/stock/invoices buttons are not permission-gated).

### 1.7 Frontend modules today

| Route | Status |
|-------|--------|
| `/invoices`, `/invoices/:id` | UI complete; **backend missing** |
| `/clients` | UI + backend CRUD |
| `/stock` | UI complete; backend products CRUD; adjust API **missing** |
| `/team/users`, `/team/roles`, `/team/audit` | UI complete; **backend missing** |
| `/platform/businesses` | UI + backend |
| `/login`, `/register`, landing | Working |
| Dashboard | **Missing** (nav label only) |

### 1.8 Product / inventory model (Phase 2)

Products are **business-type agnostic** (grocery, garments, hardware, etc.):

- Core: `name`, `sku`, `barcode`, `categoryId`, `brand`, `unit`, `purchasePrice`, `salePrice`, `wholesalePrice`, `minimumStockLevel`, `currentStock` (cache), `status`
- Categories are a first-class collection (unique name per business)
- Optional `product_variants` foundation with `attributes` map
- Legacy pharma fields (`tpRate`, `printRate`, …) kept as deprecated aliases

**Stock ledger:** `inventory_movements` is the auditable source of truth. Product PATCH cannot change stock; use `POST /inventory/adjust` or opening-stock flows via `stockService`.

See [PHASE_2_IMPLEMENTATION.md](./PHASE_2_IMPLEMENTATION.md).

---

## 2. Current Modules — Capability Matrix

| Module | Frontend | Backend | Notes |
|--------|----------|---------|-------|
| Auth / JWT / switch business | ✅ | ✅ | Reuse |
| Multi-business tenants | ✅ | ✅ | Reuse + harden |
| Platform admin businesses | ✅ | ✅ | Reuse |
| Clients (customers) | ✅ | ✅ | Extend fields |
| Products | ✅ | ✅ | Generalize schema |
| Inventory movements (read) | ✅ | ✅ (read) | Write path missing |
| Inventory adjust | ✅ | ❌ | Must implement |
| Invoices / sales | ✅ | ❌ | Must implement |
| Team users / roles | ✅ | ❌ | Must implement |
| Audit log | ✅ (read UI) | ❌ | Must implement writes + API |
| Dashboard | ❌ | ❌ | New |
| Categories (entity) | ❌ | ❌ | New |
| Product variants | ❌ | ❌ | New |
| Stock ledger as source of truth | Partial UI | ❌ | New rules |
| Suppliers | ❌ | ❌ | New |
| Purchases | ❌ | ❌ | New |
| Supplier ledger | ❌ | ❌ | New |
| Customer ledger | ❌ | ❌ | New |
| Estimates / quotations | ❌ | ❌ | New |
| Sales / purchase returns | ❌ | ❌ | New |
| Payments (cash/credit) | ❌ | ❌ | New |
| Expenses | ❌ | ❌ | New |
| Orders / order bookers | ❌ | ❌ | New |
| Reports | ❌ | ❌ | New |
| Business settings | Permission only | ❌ | New |
| Notifications | ❌ | ❌ | New |
| Ecommerce demo | Separate app | Separate | Out of ERP scope |

---

## 3. What to Reuse vs Create

### Reuse (do not rewrite)

- Multi-tenant auth stack (`auth.js`, memberships, switch-business, `X-Business-Id`)
- Frontend `AuthContext`, `tokenStore`, `apiClient` refresh, guards, `BusinessSwitcher`
- Permission catalog pattern + Roles UI matrix
- RTK Query `invoiceApi` pattern (extend endpoints/tags)
- Layout: `DashboardLayout`, Sidebar sections, EmptyState, StatusBadge, Invoice drawer pattern
- Mongo indexes on `(businessId, id)`, refresh token TTL
- Existing clients/products screens as starting points for CRM/catalog

### Extend (evolve in place)

- Product schema → generic retail fields + optional attributes
- Clients → customers with credit limit, balance, assigned salesman
- Permissions catalog → purchases, suppliers, returns, expenses, orders, reports
- Stock page → products / categories / movements / low stock
- Backend structure → split monolith into modules **incrementally** (not big-bang rewrite)

### Create (new)

- Stock movement write service + atomic stock updates
- Purchases, suppliers, supplier price history, supplier ledger
- Estimates, invoices (backend), payments, returns
- Customer ledger
- Orders + order bookers / salesman tracking
- Expenses
- Dashboard + reports APIs
- Business settings
- Audit log writer middleware/service
- Seed roles: Owner, Invoice Operator, Inventory Manager, Order Booker, Accountant, Viewer

### Deprecate / clean later (non-blocking)

- Dead `UsersPage` / Recoil atoms / duplicate `api/endpoints.js`
- Unused ecommerce path unless explicitly requested
- Pharma-only field names as **required** UI (keep as optional aliases during migration)

---

## 4. Proposed Architecture

### 4.1 Principles

1. **Evolve, don’t rewrite** — keep Express + Mongo + CRA unless a later phase proves otherwise.
2. **Server-side tenant isolation** on every read/write.
3. **Stock ledger is the audit trail**; `currentStock` is a cached balance updated inside the same transaction as the movement.
4. **Estimates never touch stock or sales totals.**
5. **Invoices/orders convert once** — prevent double stock deduction via status flags / linked document IDs.
6. **Financial + inventory mutations are atomic** (Mongo multi-document transactions).
7. **Business-type agnostic** — optional product attributes; no confectionery/garments hardcoding.
8. **RBAC enforced in middleware**; UI only mirrors.

### 4.2 Target backend structure (incremental)

```
backend/
  app-http.js                 # createApp + mount routers
  auth.js                     # keep / extend
  database.js                 # indexes + migrations
  middleware/
    authenticate.js
    resolveTenant.js
    requirePermission.js
  modules/
    platform/
    team/
    products/
    inventory/
    customers/
    suppliers/
    purchases/
    sales/                    # estimates + invoices + returns
    orders/                   # order bookers
    expenses/
    ledgers/
    reports/
    settings/
    audit/
  services/
    stockService.js           # applyMovement() transactional
    ledgerService.js
    numberingService.js       # INV-/PO-/EST- sequences per business
```

Refactor modules **phase by phase** as features land — avoid a single “move everything” PR.

### 4.3 Target frontend structure (incremental)

```
src/
  pages/
    dashboard/
    products/ categories/ inventory/
    purchases/ suppliers/
    sales/ estimates/ invoices/ returns/
    customers/ ledgers/
    orders/ bookers/
    expenses/
    reports/
    settings/
    team/ platform/           # keep
  services/invoiceApi.js      # grow into domain APIs or split by domain
  lib/permissions.js          # extend groups
```

Reuse existing CSS tokens and layout; add shared Modal/Table only when duplication hurts (optionally borrow patterns from `ecommerce/` UI primitives).

---

## 5. Multi-Tenant Strategy

### 5.1 Tenant key

Every business-owned document includes:

```
businessId: string (UUID of businesses.id)
```

Compound uniqueness where needed:

```
{ businessId, id }           // existing pattern for clients/products
{ businessId, number }       // invoices, purchases, estimates
{ businessId, sku }          # products
{ businessId, barcode }      # when barcode present
```

### 5.2 Enforcement rules

1. Authenticate JWT.
2. Resolve tenant from membership + active business (header must match JWT scope).
3. `requirePermission(…)` against **active business role**.
4. All queries: `{ businessId: req.tenant.businessId, … }`.
5. Never trust body `businessId` from client.
6. Platform admin: platform routes only for tenant CRUD; accessing tenant data still goes through explicit tenant resolution and audit.

### 5.3 Cross-tenant guarantees

- No shared product/customer catalogs across businesses.
- User accounts may belong to multiple businesses via memberships; data never leaks across memberships.
- API tests must assert: Business A token + Business B id → `403`.

---

## 6. Database Relationships (Target)

> MongoDB collections (document model). Relationships are logical FKs by UUID/numeric id + `businessId`.

### 6.1 Core identity

```
users ──< business_memberships >── businesses
                 │
               roles (businessId | null for platform)
```

### 6.2 Catalog & stock

```
businesses ──< categories
businesses ──< products ──< product_variants (optional)
products ──< stock_movements
products ──< supplier_price_history
```

### 6.3 Procurement

```
suppliers ──< purchases ──< purchase_items >── products
purchases ──> stock_movements
suppliers ──< supplier_ledger_entries
purchases ──< purchase_returns ──> stock_movements
```

### 6.4 Sales

```
customers ──< estimates ──< estimate_items
customers ──< invoices ──< invoice_items >── products
invoices ──> stock_movements
customers ──< customer_ledger_entries
invoices ──< sales_returns ──> stock_movements
orders (booker) ──convertible──> invoices
```

### 6.5 People & ops

```
employees / memberships + role
order_booker assignment on customers
expenses (category, amount, date)
business_settings (1:1 business)
audit_logs
notifications (future)
```

### 6.6 Key collection sketches

**products**

| Field | Notes |
|-------|-------|
| businessId | required |
| name, sku, barcode | sku unique per business |
| categoryId | optional FK |
| brand, unit | optional |
| purchasePrice, salePrice, wholesalePrice | optional |
| minStock, currentStock | currentStock cache |
| status | active/inactive |
| attributes | `{ size?, color?, … }` flexible map |
| trackVariants | bool |

**stock_movements** (append-only)

| Field | Notes |
|-------|-------|
| businessId, productId, variantId? | |
| type | `opening` \| `purchase` \| `sale` \| `customer_return` \| `purchase_return` \| `damage` \| `adjustment` \| `transfer` |
| quantity | signed integer/decimal |
| balanceAfter | snapshot |
| unitCost | optional |
| referenceType / referenceId | purchase, invoice, etc. |
| reason, createdBy, createdAt | |

**invoices**

| Field | Notes |
|-------|-------|
| type | `invoice` (estimates live in `estimates` or `docType`) |
| number | unique per business |
| status | draft \| confirmed \| paid \| partially_paid \| cancelled |
| stockApplied | bool — prevents double deduction |
| paymentType | cash \| credit \| mixed |
| customerId, salesmanId?, orderId?, estimateId? | |
| totals, paidAmount, balanceDue | |

**estimates** — same line structure; **never** set `stockApplied`; conversion creates invoice with link.

---

## 7. Business Workflow

```
Purchase (confirmed)
  → stock_movements(+qty)
  → products.currentStock ↑
  → supplier_ledger (+payable)
  → supplier_price_history upsert

Sale Invoice (confirmed)
  → validate stock (unless allowNegativeStock)
  → stock_movements(-qty)
  → products.currentStock ↓
  → customer_ledger (+receivable if credit)
  → payment record if cash/partial
  → daily sales aggregates

Estimate / Quotation
  → no stock, no ledger sale, no daily sales

Estimate → Invoice
  → create invoice linked to estimate
  → apply stock once on invoice confirm

Order (booker)
  → book order (no stock)
  → convert to invoice (stock on confirm)
  → attribute sale to salesmanId

Customer Return
  → stock ↑ + customer ledger credit/adjust

Purchase Return
  → stock ↓ + supplier ledger adjust
```

All steps in a single Mongo transaction per confirmation event.

---

## 8. Role / Permission Architecture

### 8.1 Permission naming (extend existing `resource.action`)

```
# existing keep
clients.* → migrate alias customers.* (or keep clients.* for compatibility)
products.*  inventory.view|adjust
invoices.*  (+ invoices.print later)
users.*  roles.*  business.settings  audit.view  platform.manage_businesses

# new
categories.view|create|update|delete
purchases.view|create|update|delete|confirm
suppliers.view|create|update|delete
supplier_ledger.view
customers.view|create|update|delete   # or keep clients.*
customer_ledger.view
estimates.view|create|update|delete|convert
sales_returns.view|create
purchase_returns.view|create
payments.view|create
expenses.view|create|update|delete
orders.view|create|update|convert
orders.view_own                     # booker scoped
bookers.view|manage
reports.sales|inventory|purchase|profit|expenses|performance
notifications.view
```

### 8.2 Seed roles

| Role slug | Intent |
|-----------|--------|
| `business_owner` | `*` within business (not platform) |
| `admin` | Broad ops; no platform; optional lock on roles.manage |
| `invoice_operator` | customers view, invoices/estimates create/view/print; no inventory adjust; no sensitive profit reports |
| `inventory_manager` | products, categories, inventory, purchases, stock adjust; no employee mgmt |
| `order_booker` | assigned customers, own orders, convert if allowed; no direct stock edit |
| `accountant` | ledgers + reports view; limited write |
| `viewer` | read-only selected modules |

Custom roles remain editable via Team Roles UI.

### 8.3 Server enforcement

- Middleware on every route.
- Booker scope: additional filter `customer.assignedBookerId === userId` or `order.bookerId === userId` when role lacks global view.
- Owner permission seed must be upgraded to `["*"]` or full expanded list (fixes current gaps).

---

## 9. Inventory Strategy

1. **Never** mutate `currentStock` without inserting a `stock_movements` row in the same transaction.
2. Product create with opening qty → `opening` movement.
3. Product PATCH must **reject** direct `stock` changes; use adjust / purchase / sale flows.
4. `balanceAfter` stored on each movement for audit replay.
5. Optional periodic reconciliation job (Phase 9): sum(movements) vs `currentStock`.
6. `allowNegativeStock` from business settings gates sale confirmation.
7. Low stock: `currentStock <= minStock` (when minStock set).
8. Variants: stock at variant level when `trackVariants`; movements reference `variantId`.

---

## 10. Sales Strategy

| Document | Stock | Customer ledger | Daily sales |
|----------|-------|-----------------|-------------|
| Estimate | No | No | No |
| Draft invoice | No | No | No |
| Confirmed invoice | Yes (−) | Yes if credit | Yes |
| Cancel confirmed | Yes reverse (+) | Reverse ledger | Adjust reports |
| Convert estimate→invoice | Only on invoice confirm | On confirm | On confirm |

**Double-application guard:** `stockApplied` boolean + unique movement reference `(businessId, referenceType, referenceId, productId, lineId)`.

Payment types: cash, credit, mixed (partial paidAmount).

---

## 11. Purchase Strategy

| State | Stock | Supplier ledger |
|-------|-------|-----------------|
| Draft | No | No |
| Confirmed | Yes (+) | Yes (+payable / − if paid) |
| Purchase return confirmed | Yes (−) | Adjust payable |

On confirm, write `supplier_price_history` (supplierId, productId, unitPrice, purchasedAt, purchaseId).

Derived metrics: last / avg / min price, best supplier — computed from history (report API).

---

## 12. Customer / Supplier Ledger Strategy

Append-only ledger entries:

```
type: sale | payment | return | adjustment | opening | purchase | purchase_payment | purchase_return
amount: signed (business convention documented in API)
balanceAfter
referenceType / referenceId
```

**Customer.currentBalance** and **Supplier.currentBalance** are caches updated in the same transaction.

Opening balance supported at party create.

Credit limit: warn or block invoice confirm when `balance + newCharge > creditLimit` (setting-driven).

---

## 13. Order Booker Strategy

- Employee/user with `order_booker` role (or custom).
- Customers may have `assignedBookerId`.
- Booker creates `orders` (status: booked | confirmed | converted | cancelled).
- Convert → invoice (permission `orders.convert`); stock applies on invoice confirm only.
- Performance metrics: orders today, value, converted count, sales attributed via `invoice.salesmanId` / `order.bookerId`.

---

## 14. Reporting Strategy

Server-side aggregations with `businessId` + date range filters:

| Report | Source |
|--------|--------|
| Sales | confirmed invoices − sales returns |
| Purchases | confirmed purchases − purchase returns |
| Inventory / stock movement | products + movements |
| Low stock | products where currentStock ≤ minStock |
| Customer / supplier ledger | ledger collections |
| Profit (gross) | sales − COGS (from movement unitCost / purchase price) — best-effort until costing mature |
| Expenses | expenses |
| Salesman performance | orders + invoices by booker |
| Product performance | invoice_items aggregates |
| Best purchase price | supplier_price_history |

Dashboard endpoints return summary DTOs; drill-down links to filtered list pages.

---

## 15. Audit Log Strategy

Write on sensitive mutations:

- Invoice create/edit/status/delete
- Stock adjust / damage
- Purchase confirm
- Role/permission changes
- User invite/role change
- Business settings change
- Ledger adjustments

Shape (align with frontend expectation):

```
{
  id, businessId,
  actorId, actorName,
  action,          // e.g. invoice.update
  entity, entityId,
  oldValues?, newValues?,
  meta?,
  createdAt
}
```

Permission: `audit.view`. Immutable from API (no update/delete for normal roles).

---

## 16. Business Settings

One document per business (or embedded on `businesses`):

- name, logo URL, address, phone
- currency, date format
- invoice prefix / next number
- tax enabled + default rate
- `allowNegativeStock`
- default payment methods
- credit limit enforcement mode (`off` \| `warn` \| `block`)

No business-type enum required; optional `industryHint` for UI defaults only (never gates features).

---

## 17. UI/UX Direction

- Keep existing visual system (sidebar, cream/green tokens, invoice drawer).
- Add real **Dashboard** as default post-login for owners.
- Fast invoice UX: product search, barcode-ready field, keyboard-friendly lines.
- Professional tables: search, filters, pagination, empty/loading/error, confirm dialogs.
- Extend `<Can>` to all mutating buttons (currently missing on clients/stock/invoices).
- Do not invent a second design system; optionally extract shared Modal from duplicated team modals.

---

## 18. Breaking Changes & Risks (Architecture-level)

| Risk | Mitigation |
|------|------------|
| Owner permissions incomplete → 403 on update/delete | Phase 1: expand owner to `*` + migration `$addToSet` / replace |
| Frontend PATCH vs backend PUT on products | Align methods in Phase 1/2 |
| Direct stock edits on product update | Ban field; migrate existing stock into opening movements |
| Invoice UI exists without API | Implement sales backend before changing UI flows drastically |
| Pharma field names (`tpRate`…) | Map to generic prices; keep aliases during transition |
| Monolithic `app-http.js` | Split by module per phase |
| `nextTenantId` race | Use counters collection or transactional sequence |
| Docs in `react-invoice-app/docs` outdated (Postgres sketches) | Treat this `/docs` as source of truth going forward |
| Ecommerce app confusion | Keep out of ERP phases unless requested |
| Gross profit accuracy | Phase 7: document costing assumptions; improve with unitCost on movements |

---

## 19. Reusable Assets Checklist

| Asset | Path |
|-------|------|
| Auth + JWT | `backend/.../auth.js` |
| Tenant middleware | `app-http.js` (`authenticate`, `resolveTenant`, `requirePermission`) |
| Migrations/indexes | `database.js` |
| Permissions UI catalog | `src/lib/permissions.js` |
| RTK API | `src/services/invoiceApi.js` |
| Layout / nav | `src/layouts`, `src/components/layout` |
| Invoice UI | `InvoiceForm`, `InvoiceList`, `InvoiceDetailPage` |
| Stock UI | `StockPage` |
| Team RBAC UI | `TeamUsersPage`, `TeamRolesPage` |
| Audit UI shell | `AuditLogPage` |
| Contracts (historical) | `react-invoice-app/docs/*` |

---

## 20. Success Criteria for Architecture Adoption

- Any new business type can operate without code forks.
- Two businesses on one deployment cannot read each other’s data.
- Every stock change has a movement row.
- Estimates never appear in sales totals or stock.
- Critical money/stock operations are transactional.
- Phased delivery possible without freezing the current working auth/clients/products flows.

---

**Next document:** [BUSINESS_ERP_IMPLEMENTATION_PLAN.md](./BUSINESS_ERP_IMPLEMENTATION_PLAN.md)  
**Gate:** Do not start Phase 1 until explicitly approved.
