# Data Model

Mock tables: `src/mocks/db.js` (localStorage key `invoice.mock.db.v1`).

```
users ──< sessions
clients ──< invoices
products ──< invoice_items >── invoices
products ──< inventory_movements
```

## users

id, first_name, last_name, email (unique), password_hash, status (`active`|`suspended`), created_at, last_login_at

## sessions

token (hashed refresh in real API), user_id, created_at, expires_at

## clients

id, name, email (unique), address, city, code, country, created_at, updated_at

## products

id, sku (unique), name, price (numeric), stock (int ≥ 0), unit, status (`active`|`inactive`), created_at, updated_at

## inventory_movements (append-only)

id, product_id, type (`opening`|`adjust`|`sale`|`return`), quantity (signed int), reason, invoice_id nullable, created_by, created_at

## invoices

id, number, client_id, client_snapshot (json), bill_from (json), issue_date, due_date, description, currency, status, total, stock_deducted (bool), created_at, updated_at

## invoice_items

id, invoice_id, product_id, name, sku, quantity, unit_price, tax, line_total

---

## Sample Postgres (sketch)

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email CITEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email CITEXT UNIQUE NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  code TEXT NOT NULL,
  country TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  stock INT NOT NULL CHECK (stock >= 0),
  unit TEXT NOT NULL DEFAULT 'pcs',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE invoices (
  id TEXT PRIMARY KEY,
  number TEXT UNIQUE NOT NULL,
  client_id TEXT NOT NULL REFERENCES clients(id),
  status TEXT NOT NULL,
  total NUMERIC(12,2) NOT NULL,
  stock_deducted BOOLEAN NOT NULL DEFAULT false,
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE invoice_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL,
  tax NUMERIC(5,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL
);

CREATE TABLE inventory_movements (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  type TEXT NOT NULL,
  quantity INT NOT NULL,
  reason TEXT NOT NULL,
  invoice_id TEXT REFERENCES invoices(id),
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
