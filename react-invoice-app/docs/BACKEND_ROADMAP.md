# Backend Roadmap

Is frontend ko **bina UI rewrite** ke real API se jodna.

1. Mock chalta rahe: `REACT_APP_ENABLE_MOCK_API=true`
2. Har step contract se match karo → [API_CONTRACT.md](./API_CONTRACT.md)
3. Ready ho to `.env` mein mock `false` + `REACT_APP_API_BASE_URL` apne server pe

Suggested stack: **Node + Express + PostgreSQL** (koi bhi chalega).

---

## 1. Scaffold + health

- API on `:5000`, routes under `/api/v1`
- CORS for `http://localhost:3000`
- `GET /api/v1/health` → `{ data: { ok: true } }`

## 2. DB + seed

- Migrate tables from [DATA_MODEL.md](./DATA_MODEL.md)
- Seed `owner@invoice.test` with **hashed** `Password123!`
- Seed 2 clients + 3 products

## 3. Auth

Login / refresh (rotate) / logout / me — JWT access ~15m, refresh ~7d. Hash passwords (bcrypt/argon2).

## 4. Clients CRUD

Pagination + search. Unique email. Delete blocked if invoices exist.

## 5. Products CRUD

Unique SKU. Create with stock > 0 → opening movement in **same transaction**. PATCH does not change stock.

## 6. Inventory adjust

`POST /inventory/adjust` — non-zero int, reason required, no negative stock, append-only movements.

## 7. Invoices + stock transaction

`POST /invoices` and status changes:

1. `SELECT … FOR UPDATE` on products
2. Validate stock
3. Server-side prices/totals
4. Insert invoice + items
5. Decrement stock + `sale` movements
6. Commit

Cancel after deduct → restock + `return` movement.

## 8. Cutover

```env
REACT_APP_API_BASE_URL=http://localhost:5000/api/v1
REACT_APP_ENABLE_MOCK_API=false
```

Smoke: login → add product → adjust stock → create invoice (pending) → stock down → mark paid → cancel restocks if from pending.

---

## Concepts you practice

| Concept | Where |
|---------|--------|
| JWT + refresh rotation | Auth |
| Validation + unique constraints | Clients / products |
| Append-only ledger | Inventory movements |
| Transactions + locking | Invoice create / status |
| Never trust client money fields | Invoice items |
| State machines | Invoice status transitions |
