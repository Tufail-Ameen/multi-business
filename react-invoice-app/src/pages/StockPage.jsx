import { faPen, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ErrorMessage, Field, Form, Formik } from "formik";
import { useMemo, useState } from "react";
import { toast } from "react-toastify";
import * as Yup from "yup";
import { Can } from "../auth/guards";
import { useAuth } from "../auth/AuthContext";
import CategoryFormModal from "../components/products/CategoryFormModal";
import ProductFormModal, { toProductPayload } from "../components/products/ProductFormModal";
import ProductList from "../components/products/ProductList";
import EmptyState from "../components/ui/EmptyState";
import { useProducts } from "../hooks/useProducts";
import { PERMISSIONS } from "../lib/permissions";
import { getErrorMessage } from "../lib/rtkBaseQuery";
import {
  useAdjustInventoryMutation,
  useCreateCategoryMutation,
  useCreateProductMutation,
  useDeleteCategoryMutation,
  useDeleteProductMutation,
  useGetCategoriesQuery,
  useGetMovementsQuery,
  useUpdateCategoryMutation,
  useUpdateProductMutation,
} from "../services/invoiceApi";

const adjustSchema = Yup.object({
  productId: Yup.string().required("Product required"),
  quantity: Yup.number()
    .integer()
    .required("Qty required")
    .test("nonzero", "Cannot be zero", (v) => v !== 0 && v != null),
  reason: Yup.string().trim(),
});

function formatCell(value) {
  if (value === null || value === undefined || value === "") return "—";
  return value;
}

function formatMovementType(type) {
  if (!type) return "—";
  return String(type)
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function StockPage() {
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [tab, setTab] = useState("products");
  const [search, setSearch] = useState("");
  const [categorySearch, setCategorySearch] = useState("");

  const { can } = useAuth();
  const canOpenForm = editing
    ? can(PERMISSIONS.PRODUCTS_UPDATE)
    : can(PERMISSIONS.PRODUCTS_CREATE);

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const productQueryParams = useMemo(() => {
    const params = {};
    if (search.trim()) params.q = search.trim();
    return params;
  }, [search]);

  const { products, isLoading } = useProducts(productQueryParams);
  const { data: categoriesData } = useGetCategoriesQuery();
  const categories = categoriesData?.categories || [];
  const visibleCategories = useMemo(() => {
    const needle = categorySearch.trim().toLowerCase();
    if (!needle) return categories;
    return categories.filter((category) =>
      [category.name, category.status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [categories, categorySearch]);

  const { data: movementsData } = useGetMovementsQuery(
    selectedProductId ? { productId: selectedProductId } : {},
    { skip: tab !== "movements" && !selectedProductId }
  );
  const movements = movementsData?.movements || [];

  const [createProduct, createState] = useCreateProductMutation();
  const [updateProduct, updateState] = useUpdateProductMutation();
  const [deleteProduct] = useDeleteProductMutation();
  const isSaving = createState.isLoading || updateState.isLoading;
  const [adjustInventory] = useAdjustInventoryMutation();
  const [createCategory, createCategoryState] = useCreateCategoryMutation();
  const [updateCategory, updateCategoryState] = useUpdateCategoryMutation();
  const [deleteCategory] = useDeleteCategoryMutation();
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const isSavingCategory = createCategoryState.isLoading || updateCategoryState.isLoading;

  const canOpenCategoryForm = editingCategory
    ? can(PERMISSIONS.CATEGORIES_UPDATE)
    : can(PERMISSIONS.CATEGORIES_CREATE);

  const closeCategoryForm = () => {
    setCategoryFormOpen(false);
    setEditingCategory(null);
  };

  const selectedProduct = useMemo(
    () => products.find((p) => String(p.id) === String(selectedProductId)),
    [products, selectedProductId]
  );

  const saveProduct = async (values, { resetForm }) => {
    const payload = toProductPayload(values);
    try {
      if (editing) {
        await updateProduct({ id: editing.id, ...payload }).unwrap();
        toast.success("Product updated");
      } else {
        await createProduct({
          ...payload,
          openingStock: Number(values.openingStock) || 0,
          sku: payload.sku || `PRD-${Date.now().toString(36).toUpperCase()}`,
        }).unwrap();
        toast.success("Product added");
      }
      resetForm();
      closeForm();
    } catch (err) {
      toast.error(getErrorMessage(err, "Save failed"));
    }
  };

  const removeProduct = async (product) => {
    if (!window.confirm(`Archive ${product.name}?`)) return;
    try {
      await deleteProduct(product.id).unwrap();
      toast.success("Product archived");
      if (String(selectedProductId) === String(product.id)) setSelectedProductId("");
    } catch (err) {
      toast.error(getErrorMessage(err, "Delete failed"));
    }
  };

  const adjustStock = async (values, { resetForm }) => {
    try {
      await adjustInventory({
        productId: Number(values.productId),
        quantity: Number(values.quantity),
        reason: values.reason?.trim() || null,
      }).unwrap();
      toast.success("Stock adjusted");
      resetForm();
      setSelectedProductId(String(values.productId));
      setTab("movements");
    } catch (err) {
      toast.error(getErrorMessage(err, "Adjust failed"));
    }
  };

  const saveCategory = async (values, { resetForm }) => {
    try {
      if (editingCategory) {
        await updateCategory({
          id: editingCategory.id,
          name: values.name.trim(),
          description: values.description?.trim() || null,
          status: values.status,
        }).unwrap();
        toast.success("Category updated");
      } else {
        await createCategory({
          name: values.name.trim(),
          description: values.description?.trim() || null,
          status: values.status || "active",
        }).unwrap();
        toast.success("Category created");
      }
      resetForm();
      closeCategoryForm();
    } catch (err) {
      toast.error(getErrorMessage(err, "Category save failed"));
    }
  };

  const removeCategory = async (category) => {
    if (!window.confirm(`Remove category ${category.name}?`)) return;
    try {
      const result = await deleteCategory(category.id).unwrap();
      toast.success(result?.archived ? "Category archived" : "Category deleted");
    } catch (err) {
      toast.error(getErrorMessage(err, "Category delete failed"));
    }
  };

  const tabs = [
    { key: "products", label: "Products" },
    {
      key: "categories",
      label: "Categories",
      permission: PERMISSIONS.CATEGORIES_VIEW,
    },
    {
      key: "adjust",
      label: "Adjust stock",
      permission: PERMISSIONS.INVENTORY_ADJUST,
    },
    {
      key: "movements",
      label: "Stock history",
      permission: PERMISSIONS.INVENTORY_VIEW,
    },
  ];

  return (
    <div className={`stock-page mx-auto w-full max-w-6xl${tab === "products" || tab === "categories" || tab === "movements" ? " is-list-tab" : ""}`}>
      <nav className="stock-tab-nav mb-4 shrink-0" aria-label="Stock sections">
        {tabs.map(({ key, label, permission }) =>
          permission ? (
            <Can key={key} permission={permission}>
              <button
                type="button"
                className={`stock-tab-btn ${tab === key ? "active" : ""}`}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            </Can>
          ) : (
            <button
              key={key}
              type="button"
              className={`stock-tab-btn ${tab === key ? "active" : ""}`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          )
        )}
      </nav>

      {tab === "products" && (
        <section className="stock-page-section">
          <div className="mb-4 flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="product-list-heading mb-1 !text-[1.35rem] !font-extrabold">
                Products
              </h1>
              <p className="textcklr small mb-0">
                Add and manage catalog products for invoices and stock.
              </p>
            </div>
            <Can permission={PERMISSIONS.PRODUCTS_CREATE}>
              <button
                type="button"
                className="btn save-changes w-full py-2 px-3 sm:w-auto"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                New product
              </button>
            </Can>
          </div>

          <ProductList
            products={products}
            isLoading={isLoading}
            search={search}
            onSearchChange={setSearch}
            onEdit={(product) => {
              if (!can(PERMISSIONS.PRODUCTS_UPDATE)) return;
              setEditing(product);
              setFormOpen(true);
            }}
            onDelete={removeProduct}
            onSelectProduct={(product) => {
              setSelectedProductId(String(product.id));
              setTab("movements");
            }}
          />
        </section>
      )}

      {tab === "categories" && (
        <section className="stock-page-section">
          <div className="mb-4 flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="product-list-heading mb-1 !text-[1.35rem] !font-extrabold">
                Categories
              </h1>
              <p className="textcklr small mb-0">
                Organize products with categories for invoices and stock.
              </p>
            </div>
            <Can permission={PERMISSIONS.CATEGORIES_CREATE}>
              <button
                type="button"
                className="btn save-changes w-full py-2 px-3 sm:w-auto"
                onClick={() => {
                  setEditingCategory(null);
                  setCategoryFormOpen(true);
                }}
              >
                New category
              </button>
            </Can>
          </div>

          <div className="form-card product-list-card client-list-card">
            <div className="client-list-toolbar flex items-center border-b border-[var(--color-border)] px-3 py-3">
              <input
                type="search"
                className="form-control input-settings h-10 w-full rounded-[10px] md:max-w-[420px]"
                placeholder="Search name or status…"
                value={categorySearch}
                onChange={(event) => setCategorySearch(event.target.value)}
                aria-label="Search categories"
              />
            </div>
            <div className="product-table-scroll client-table-scroll">
              {!categories.length ? (
                <EmptyState
                  className="!border-0 !bg-transparent !shadow-none"
                  title="No categories"
                  message="Create categories to organize products."
                />
              ) : !visibleCategories.length ? (
                <EmptyState
                  className="!border-0 !bg-transparent !shadow-none"
                  title="No matching categories"
                  message="Try a different name or status."
                />
              ) : (
                <table className="product-table w-full min-w-[48rem] md:min-w-full">
                  <thead>
                    <tr>
                      <th className="col-index text-left">#</th>
                      <th className="text-left">Name</th>
                      <th className="text-left">Status</th>
                      <th className="w-[1%] whitespace-nowrap text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCategories.map((c, index) => (
                      <tr key={c.id}>
                        <td className="col-index text-left">{index + 1}</td>
                        <td className="table-text-size text-left">{c.name}</td>
                        <td className="text-left">
                          <span className={`status-badge ${c.status === "active" ? "active" : "inactive"}`}>
                            {c.status}
                          </span>
                        </td>
                        <td className="w-[1%] whitespace-nowrap pl-2 text-right">
                          <div className="table-actions inline-flex justify-end">
                            <Can permission={PERMISSIONS.CATEGORIES_UPDATE}>
                              <button
                                type="button"
                                className="btn btn-table-edit"
                                onClick={() => {
                                  if (!can(PERMISSIONS.CATEGORIES_UPDATE)) return;
                                  setEditingCategory(c);
                                  setCategoryFormOpen(true);
                                }}
                              >
                                <FontAwesomeIcon icon={faPen} />
                                Edit
                              </button>
                            </Can>
                            <Can permission={PERMISSIONS.CATEGORIES_DELETE}>
                              <button
                                type="button"
                                className="btn btn-table-remove"
                                onClick={() => removeCategory(c)}
                              >
                                <FontAwesomeIcon icon={faTrash} />
                                Remove
                              </button>
                            </Can>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>
      )}

      {tab === "adjust" && (
        <Formik
          initialValues={{ productId: selectedProductId || "", quantity: "", reason: "" }}
          enableReinitialize
          validationSchema={adjustSchema}
          onSubmit={adjustStock}
        >
          <Form className="form-card">
            <h2 className="bill-form mb-3">Adjust stock</h2>
            <p className="textcklr small">
              Positive qty increases stock, negative decreases. Reason is optional.
              Changes are written to the stock ledger (not via product edit).
            </p>
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 md:col-span-4">
                <label className="input-clr mb-1">Product</label>
                <Field as="select" name="productId" className="form-select input-settings">
                  <option value="">Select…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (stock {p.currentStock})
                    </option>
                  ))}
                </Field>
                <ErrorMessage name="productId" component="div" className="text-red-600" />
              </div>
              <div className="col-span-6 md:col-span-3">
                <label className="input-clr mb-1">Quantity (+/−)</label>
                <Field name="quantity" type="number" className="form-control input-settings" />
                <ErrorMessage name="quantity" component="div" className="text-red-600" />
              </div>
              <div className="col-span-6 md:col-span-5">
                <label className="input-clr mb-1">Reason</label>
                <Field
                  name="reason"
                  className="form-control input-settings"
                  placeholder="Optional"
                />
              </div>
              <div className="col-span-12">
                <button type="submit" className="btn save-changes py-2 px-4">
                  Apply adjustment
                </button>
              </div>
            </div>
          </Form>
        </Formik>
      )}

      {tab === "movements" && (
        <section className="stock-page-section">
          <div className="form-card form-card-compact mb-3 shrink-0">
            <div className="grid grid-cols-12 items-end gap-2">
              <div className="md:col-span-6">
                <label className="form-label input-clr mb-1">Product</label>
                <select
                  className="form-select input-settings input-compact"
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                >
                  <option value="">All recent movements</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              {selectedProduct && (
                <div className="md:col-span-6">
                  <div className="small textcklr">
                    Current stock: <strong>{selectedProduct.currentStock}</strong>
                    {" · "}
                    Min: {selectedProduct.minimumStockLevel}
                    {" · "}
                    {selectedProduct.stockStatus === "LOW_STOCK" ? "Low stock" : "OK"}
                  </div>
                </div>
              )}
            </div>
          </div>

          <h2 className="bill-form mb-3 shrink-0">Stock history</h2>
          <div className="form-card product-list-card client-list-card">
            <div className="product-table-scroll client-table-scroll">
              {!movements.length ? (
                <EmptyState
                  className="!border-0 !bg-transparent !shadow-none"
                  title="No movements"
                  message="Opening stock and adjustments appear here."
                />
              ) : (
                <table className="product-table w-full min-w-[48rem] md:min-w-full">
                  <thead>
                    <tr>
                      <th className="col-index">#</th>
                      <th>Date</th>
                      <th>Product</th>
                      <th>Type</th>
                      <th>Qty</th>
                      <th>Reference / reason</th>
                      <th>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m, index) => (
                      <tr key={`${m.id}-${m.createdAt}`}>
                        <td className="col-index">{index + 1}</td>
                        <td className="cell-muted">
                          {m.createdAt ? String(m.createdAt).slice(0, 10) : "—"}
                        </td>
                        <td className="table-text-size">{m.productName || m.productId}</td>
                        <td>{formatMovementType(m.movementType || m.type)}</td>
                        <td className="price">
                          {m.quantity > 0 ? "+" : ""}
                          {m.quantity}
                        </td>
                        <td className="cell-muted">
                          {m.reason ||
                            (m.referenceType
                              ? `${m.referenceType}${m.referenceId ? ` #${m.referenceId}` : ""}`
                              : "—")}
                        </td>
                        <td>
                          <strong>
                            {m.balanceAfter ?? m.resultingQuantity ?? "—"}
                          </strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>
      )}

      {formOpen && canOpenForm && (
        <ProductFormModal
          product={editing}
          categories={categories}
          isSaving={isSaving}
          onClose={closeForm}
          onSubmit={saveProduct}
        />
      )}

      {categoryFormOpen && canOpenCategoryForm && (
        <CategoryFormModal
          category={editingCategory}
          isSaving={isSavingCategory}
          onClose={closeCategoryForm}
          onSubmit={saveCategory}
        />
      )}
    </div>
  );
}
