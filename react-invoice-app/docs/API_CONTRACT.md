# Invoice App — API Contract

Base URL: `http://localhost:5000/api/v1` (see `REACT_APP_API_BASE_URL`)

Envelope:

- Success: `{ "data": … }`
- Error: `{ "error": { "code", "message", "details?" } }`

Auth: `Authorization: Bearer <accessToken>` on protected routes.

---

## Auth

| Method | Path | Body | Notes |
|--------|------|------|--------|
| POST | `/auth/login` | `{ email, password }` | Returns `{ user, tokens }` |
| POST | `/auth/refresh` | `{ refreshToken }` | Rotates refresh token |
| POST | `/auth/logout` | `{ refreshToken }` | 204 |
| GET | `/auth/me` | — | `{ user }` |

Demo: `owner@invoice.test` / `Password123!`

---

## Clients

| Method | Path | Notes |
|--------|------|--------|
| GET | `/clients?q=&page=&per_page=` | `{ clients, meta }` |
| GET | `/clients/:id` | `{ client }` |
| POST | `/clients` | `{ name, email, address, city, code, country }` → 201 |
| PATCH | `/clients/:id` | partial update |
| DELETE | `/clients/:id` | 409 if invoices exist |

---

## Products

| Method | Path | Notes |
|--------|------|--------|
| GET | `/products?q=&status=` | `{ products, meta }` |
| GET | `/products/:id` | |
| POST | `/products` | `{ sku, name, price, stock?, unit? }` — opening stock writes movement |
| PATCH | `/products/:id` | **Do not** change stock here — use inventory adjust |
| DELETE | `/products/:id` | 409 if used on invoices |

---

## Inventory

| Method | Path | Notes |
|--------|------|--------|
| GET | `/inventory/movements?product_id=` | append-only ledger |
| POST | `/inventory/adjust` | `{ productId, quantity, reason }` — quantity non-zero int; no negative stock |

---

## Invoices

Statuses: `draft` | `pending` | `paid` | `cancelled`

Transitions: draft→pending|paid|cancelled; pending→paid|cancelled; paid/cancelled terminal.

| Method | Path | Notes |
|--------|------|--------|
| GET | `/invoices?status=&q=` | |
| GET | `/invoices/:id` | |
| POST | `/invoices` | `{ clientId, items:[{productId,quantity,tax?}], status?, … }` — **server sets unitPrice from product**; pending/paid deducts stock in one “transaction” |
| PATCH | `/invoices/:id` | draft only |
| PATCH | `/invoices/:id/status` | `{ status }` — deduct / restock as needed |
| DELETE | `/invoices/:id` | restocks if deducted; paid cannot delete |

### Learning notes

- Never trust client `price` / `total` — server recomputes.
- Create/status that sells stock should lock rows (`SELECT … FOR UPDATE`) in real DB.
- Cancel after sale → return movement + restock.
