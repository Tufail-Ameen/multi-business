# Phase 1 Implementation — Foundation + Multi-tenant RBAC

**Status:** Complete (awaiting approval before Phase 2)  
**Date:** 2026-09-07  
**Sources of truth:** [BUSINESS_ERP_ARCHITECTURE.md](./BUSINESS_ERP_ARCHITECTURE.md), [BUSINESS_ERP_IMPLEMENTATION_PLAN.md](./BUSINESS_ERP_IMPLEMENTATION_PLAN.md)

---

## What changed

Phase 1 hardens multi-business isolation and RBAC without adding purchases, sales, inventory adjust, returns, expenses, orders APIs, dashboard analytics, or reports.

### Security / tenancy

- Tenant routes continue to require JWT + membership (or platform admin for `.view` only) + matching `X-Business-Id` / active business.
- `tenantScope(req)` helper forces `businessId: req.tenant.businessId` on clients/products/inventory queries (body `businessId` ignored).
- `requirePermission` now uses shared `hasBusinessPermission()` so business `"*"` never grants `platform.manage_businesses`.
- Platform admin vs business owner remain separate.

### Owner + default roles

- Business Owner permissions are now `["*"]` (business-scoped wildcard).
- Startup migration upgrades existing `business_owner` roles and seeds system roles per business:
  - `business_owner`
  - `invoice_operator`
  - `inventory_manager`
  - `order_booker`
  - `manager`
- Register + platform business create seed the same roles and a minimal `business_settings` stub.

### Team / audit APIs (backend now matches frontend)

| Method | Path | Permission |
|--------|------|------------|
| GET/POST | `/users` | `users.view` / `users.invite` |
| PATCH/DELETE | `/users/:id` | `users.update` / `users.delete` |
| GET/POST | `/roles` | `roles.view` / `roles.manage` |
| PATCH/DELETE | `/roles/:id` | `roles.manage` |
| GET | `/audit-logs` | `audit.view` |

- Last-owner protection on demote/remove.
- System roles cannot be deleted; owner permissions cannot be patched.
- Custom roles sanitize out platform permission and `"*"`.
- Audit writer foundation (`audit.js`) logs team/role mutations.

### Other backend fixes

- Products accept **PATCH** as well as PUT (frontend compatibility).
- Inventory movements response wrapped as `{ movements }` for RTK UI.
- Platform `POST /platform/businesses` accepts `ownerEmail` / `ownerFirstName` / `ownerLastName` / `ownerPassword` (matches UI).

### Frontend

- Permission catalog aligned with backend (kept `resource.action` / `update` naming).
- Added future catalog keys: `dashboard.view`, `orders.*`, `reports.view`, `invoices.print` (no unimplemented APIs granted by routes).
- `<Can>` gates on clients, stock, invoices mutating controls.
- Business switch already reset RTK cache; invalidation tags expanded (Role/Audit/Business).

---

## Files changed

### Backend (`backend project/react-invice-app-backend/`)

| File | Change |
|------|--------|
| `permissions.js` | **New** — catalog, role templates, helpers |
| `audit.js` | **New** — `writeAuditLog` |
| `team-routes.js` | **New** — users/roles/audit-logs routes |
| `auth.js` | Owner permissions = `["*"]` |
| `database.js` | Phase 1 migration, seed roles, settings, audit indexes |
| `app-http.js` | Seed on register/platform, tenantScope, PATCH products, mount team routes |
| `test/permissions.test.js` | **New** unit tests |
| `test/auth.test.js` | Expanded RBAC/tenant tests; memory Mongo fallback |
| `package.json` | `test` / `test:unit` / `test:integration`; `mongodb-memory-server` |

### Frontend (`react-invoice-app/`)

| File | Change |
|------|--------|
| `src/lib/permissions.js` | Expanded catalog / groups |
| `src/pages/ClientsPage.jsx` | `<Can>` on form |
| `src/components/clients/ClientList.jsx` | `<Can>` on edit/delete |
| `src/pages/StockPage.jsx` | `<Can>` on product CRUD / adjust tab |
| `src/pages/InvoicesPage.jsx` | `<Can>` on create |
| `src/pages/InvoiceDetailPage.jsx` | `<Can>` on actions |
| `src/services/invoiceApi.js` | Switch-business tag invalidation |

### Docs

| File | Change |
|------|--------|
| `docs/PHASE_1_IMPLEMENTATION.md` | This file |
| `docs/BUSINESS_ERP_ARCHITECTURE.md` | Phase 1 status note |
| `docs/BUSINESS_ERP_IMPLEMENTATION_PLAN.md` | Phase 1 marked implemented |

---

## Database / migration changes

On startup (`runMigrations`):

1. Legacy multi-tenant migration (unchanged intent).
2. **`migratePhase1Rbac`:** for each business, seed system roles + `business_settings`; force `business_owner.permissions = ["*"]`, `isSystem: true`.
3. Indexes:
   - `business_settings.businessId` unique
   - `audit_logs.id` unique
   - `audit_logs { businessId, createdAt }`
   - `audit_logs { businessId, entity, entityId }`
   - `business_memberships { businessId, roleId }`

New / used collections: `audit_logs`, `business_settings` (plus existing auth/tenant collections).

---

## Permission model (canonical)

Keep existing naming (`clients.update`, not `clients.edit`).

Business `"*"` = all business permissions, **not** platform.

Seeded role summaries:

| Role | Access |
|------|--------|
| Owner | `*` |
| Invoice Operator | dashboard, clients view/create/update, products.view, invoices view/create/update/print |
| Inventory Manager | dashboard, products view/create/update, inventory view/adjust |
| Order Booker | dashboard, clients view/create/update, orders view/create/update *(orders APIs not built yet)* |
| Manager | dashboard + read-ish ops + `reports.view` *(reports API not built yet)* |

---

## Security decisions

1. Frontend guards are UX only; every mutating route uses `authenticate` + `resolveTenant` + `requirePermission`.
2. Spoofed `X-Business-Id` without switch → `403 BUSINESS_ACCESS_DENIED`.
3. Cross-tenant resource IDs → `404` (not found in scoped query).
4. Platform admin read bypass limited to permissions ending in `.view`.
5. Audit foundation present; not every domain mutation audited yet (deferred to later phases).

---

## Tests

| Suite | Result in this environment |
|-------|----------------------------|
| `npm run test:unit` (permissions) | **Passed** (7/7) |
| Module load (`app-http`, team, permissions, audit, database) | **Passed** |
| `npm run test:integration` / full `npm test` | **Not run** — no reachable MongoDB at `127.0.0.1:27017`; MongoDB download CDN returned 403 for memory-server binaries |
| Frontend `permissions.test.js` | Attempted; Jest/watchman blocked in sandbox — re-run locally with `CI=true npm test -- --watchAll=false --testPathPattern=permissions` |

When MongoDB (preferably replica set / Atlas) is available:

```bash
cd "backend project/react-invice-app-backend"
npm test
```

---

## Known limitations / before Phase 2

1. **Start a MongoDB** (Atlas or local). Standalone local may reject multi-document transactions used by register/refresh — prefer Atlas or initiate a replica set.
2. **Invoice / inventory.adjust / full audit coverage** still deferred — UI may call them; backend returns 404 until Phase 2/4.
3. **Order Booker / Manager** include future permission strings; no order/report routes yet (safe).
4. Product `stock` can still be set on product PUT/PATCH — Phase 2 will force stock ledger.
5. Clients/products responses remain raw arrays (not `{ data: … }`) for compatibility; team/auth use `{ data: … }`.
6. Integration RBAC tests are written but need a live Mongo to execute in CI/local.

---

## Intentionally deferred to Phase 2+

- Categories, variants, stock ledger writes / adjust API
- Purchases, suppliers, ledgers
- Estimates / invoices backend
- Returns, payments, expenses
- Orders APIs + booker scoping enforcement
- Dashboard / reports endpoints
- Full settings UI / notifications
- Broad audit of all domain mutations

---

**STOP:** Do not start Phase 2 until explicitly approved.
