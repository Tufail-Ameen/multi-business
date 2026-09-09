# RBAC + Multi-Business — API Contract (Frontend expects ye)

Frontend ab is hierarchy pe design hai:

```
Platform Super Admin
  └── Businesses
        └── Team (users + roles + permissions)
              └── Invoices / Clients / Stock
```

Har protected request pe:

- `Authorization: Bearer <accessToken>`
- `X-Business-Id: <activeBusinessId>` (platform routes optional / still useful)

Success envelope: `{ "data": … }`  
Error envelope: `{ "error": { "code", "message", "details?" } }`

Permission strings: dekhain [`src/lib/permissions.js`](../src/lib/permissions.js).

---

## 1. Auth

| Method | Path | Body / notes | Response `data` |
|--------|------|--------------|-----------------|
| POST | `/register` | `{ firstName, lastName, email, password, businessName }` — user + business + owner membership | `{ user, tokens }` |
| POST | `/login` | `{ email, password }` — role request se nahi, stored account se resolve hoga | `{ user, tokens }` |
| POST | `/auth/refresh` | `{ refreshToken }` | `{ tokens }` |
| POST | `/auth/logout` | `{ refreshToken }` | 204 |
| GET | `/auth/me` | — | `{ user }` |
| POST | `/auth/switch-business` | `{ businessId }` — new tokens scoped to business | `{ user, tokens }` |

### `user` shape (login / me / register / switch)

```json
{
  "id": "usr_…",
  "firstName": "Zain",
  "lastName": "Ahmed",
  "fullName": "Zain Ahmed",
  "email": "owner@invoice.test",
  "status": "active",
  "isPlatformAdmin": false,
  "permissions": ["invoices.view", "clients.create", "…"],
  "role": { "id": "role_…", "name": "Business Owner", "slug": "business_owner" },
  "activeBusinessId": "biz_…",
  "businesses": [
    {
      "id": "biz_…",
      "name": "Demo Traders",
      "slug": "demo-traders",
      "status": "active",
      "role": { "id": "role_…", "name": "Business Owner", "slug": "business_owner" }
    }
  ]
}
```

### `tokens`

```json
{
  "accessToken": "…",
  "refreshToken": "…"
}
```

**Note:** `permissions` **active business** ke role se aani chahiye. Business role ka `*` sirf business permissions deta hai; platform access nahi. Platform admin ke liye `isPlatformAdmin: true` ya explicit `platform.manage_businesses` zaroori hai.

Public `/register` hamesha `isPlatformAdmin: false` + `business_owner` create karega.
Platform Super Admin sirf backend seed/manual provisioning se create hoga.

---

## 2. Platform (sirf Platform Super Admin)

Permission: `platform.manage_businesses`

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/platform/businesses` | — | `{ businesses: [{ id, name, slug, status, ownerUserId, memberCount, createdAt }] }` |
| POST | `/platform/businesses` | `{ name, ownerEmail, ownerFirstName, ownerLastName, ownerPassword }` | `{ business }` 201 — owner user + membership(role=business_owner) |
| PATCH | `/platform/businesses/:id` | `{ name?, status? }` (`active` \| `suspended`) | `{ business }` |

---

## 3. Team — Users (business-scoped)

Header `X-Business-Id` required.  
Permissions: `users.view` / `users.invite` / `users.update` / `users.delete`

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/users?q=` | — | `{ users: [{ id, firstName, lastName, fullName, email, status, role }] }` |
| POST | `/users` | `{ firstName, lastName, email, password, roleId }` | `{ user }` 201 — invite / create membership |
| PATCH | `/users/:id` | `{ firstName?, lastName?, status?, roleId?, password? }` | `{ user }` |
| DELETE | `/users/:id` | — | 204 — membership remove (self-delete block) |

---

## 4. Team — Roles (business-scoped)

Permissions: `roles.view` / `roles.manage`

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/roles` | — | `{ roles: [{ id, name, slug, description, isSystem, permissions[], businessId }] }` |
| POST | `/roles` | `{ name, description?, permissions? }` | `{ role }` 201 |
| PATCH | `/roles/:id` | `{ name?, description?, permissions? }` | `{ role }` — system `*` roles lock |
| DELETE | `/roles/:id` | — | 204 — system roles / in-use = 409 |

### Suggested seed roles

| slug | permissions (summary) |
|------|------------------------|
| `platform_super_admin` | `*` + platform |
| `business_owner` | `*` (business) |
| `admin` | almost all except `roles.manage` |
| `invoice_clerk` | clients + invoices + `products.view` |
| `inventory_manager` | products + inventory |
| `accountant` | view-only clients/invoices/products |
| `viewer` | view-only |

---

## 5. Audit

Permission: `audit.view`

| Method | Path | Response |
|--------|------|----------|
| GET | `/audit-logs` | `{ logs: [{ id, businessId, actorId, actorName, action, entity, entityId, meta, createdAt }] }` |

---

## 6. Existing domain APIs (tenant filter zaroori)

Pehle se UI use karti hai — ab har row pe `business_id` + har query pe filter:

| Resource | Paths | Permission examples |
|----------|-------|---------------------|
| Clients | `GET/POST /clients`, `PUT/DELETE /clients/:id` | `clients.*` |
| Products | `GET/POST /products`, `PATCH/DELETE /products/:id` | `products.*` |
| Inventory | `GET /inventory/movements`, `POST /inventory/adjust` | `inventory.*` |
| Invoices | `GET/POST /invoices`, `PATCH …`, `PATCH …/status`, `DELETE` | `invoices.*` |

Har mutating endpoint pe:

1. JWT valid  
2. User is member of `X-Business-Id` (ya verified Platform Super Admin)
3. User has required permission  
4. `WHERE business_id = :activeBusinessId`

Yehi tenant filter reads par bhi mandatory hai. Client ka `X-Business-Id`
trusted nahi hai: backend membership/platform privilege verify karne ke baad
hi requested business scope use kare. ID-based detail/update/delete queries mein
`id` ke saath `business_id` bhi condition ka hissa ho.

---

## 7. Frontend screens ↔ APIs

| UI route | Page | APIs |
|----------|------|------|
| `/login` | Login | `POST /login` |
| `/register` | Register | `POST /register` |
| `/platform/businesses` | Platform businesses | `GET/POST/PATCH /platform/businesses` |
| `/team/users` | Team users | `GET/POST/PATCH/DELETE /users`, `GET /roles` |
| `/team/roles` | Roles | `GET/POST/PATCH/DELETE /roles` |
| `/team/audit` | Audit | `GET /audit-logs` |
| `/` `/clients` `/stock` | Existing | existing + tenant scope |

Business switcher (sidebar/navbar): `POST /auth/switch-business`

---

## 8. Backend build order (aapke liye)

1. Tables: `businesses`, `roles`, `business_memberships` + `business_id` on clients/products/invoices/movements  
2. Auth: register / login / me with `permissions` + `businesses[]`  
3. Middleware: auth + tenant + `requirePermission('…')`  
4. Platform businesses CRUD  
5. Users invite + roles CRUD  
6. Audit log writes on important actions  
7. Migrate existing invoice/stock endpoints to tenant filter  

---

## 9. Required authorization outcomes

1. Business Owner token + apna `businessId` → allowed by assigned permission.
2. Business Owner token + doosra `businessId` → `403`.
3. Business Owner token + `/platform/businesses` → `403`.
4. Platform Super Admin token + `/platform/businesses` → allowed.
5. Missing/invalid token → `401`.

Frontend har request pe `X-Business-Id` bhejta hai (`tokenStore` + `apiClient`);
authorization ka source of truth phir bhi backend hai.
