"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import WorkspaceShell from "@/components/workspace/WorkspaceShell";
import {
  type ActiveWorkspace,
  resolveActiveWorkspace,
} from "@/lib/api/dashboard";
import {
  adjustStock,
  archiveProduct,
  archiveProductVariant,
  createCategory,
  createProduct,
  createProductVariant,
  createSupplier,
  listInventory,
  listInventoryMovements,
  listProductCategories,
  listProducts,
  listSuppliers,
  receiveStock,
  restoreProduct,
  restoreProductVariant,
  updateReorderLevel,
  updateProductVariant,
  type InventoryMovement,
  type InventoryRow,
  type Product,
  type ProductVariant,
  type ProductCategory,
  type Supplier,
} from "@/lib/api/products";

type Tab = "products" | "inventory" | "categories" | "suppliers";
type Dialog =
  | "product"
  | "category"
  | "supplier"
  | "receive"
  | "adjust"
  | "reorder"
  | "history"
  | "variant"
  | "editVariant"
  | null;

export default function ProductsWorkspace() {
  const [workspace, setWorkspace] = useState<ActiveWorkspace | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [tab, setTab] = useState<Tab>("products");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [selectedInventory, setSelectedInventory] =
    useState<InventoryRow | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariant, setSelectedVariant] =
    useState<ProductVariant | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const active = await resolveActiveWorkspace();
      setWorkspace(active);

      const [nextProducts, nextCategories, nextSuppliers, nextInventory] =
        await Promise.all([
          listProducts(active.organizationId),
          listProductCategories(active.organizationId),
          listSuppliers(active.organizationId),
          listInventory(active.organizationId, active.branchId),
        ]);

      setProducts(nextProducts);
      setCategories(nextCategories);
      setSuppliers(nextSuppliers);
      setInventory(nextInventory);
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [load]);

  const activeProducts = products.filter((item) => !item.archivedAt);
  const archivedProducts = products.filter((item) => item.archivedAt);
  const lowStock = inventory.filter((item) => item.lowStock);
  const stockUnits = inventory.reduce(
    (total, item) => total + item.quantityOnHand,
    0,
  );

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return products;

    return products.filter((product) => {
      if (product.name.toLowerCase().includes(query)) return true;

      return product.variants.some(
        (variant) =>
          variant.name.toLowerCase().includes(query) ||
          variant.sku?.toLowerCase().includes(query) ||
          variant.barcode?.toLowerCase().includes(query),
      );
    });
  }, [products, search]);

  async function refreshData() {
    if (!workspace) return;

    const [nextProducts, nextCategories, nextSuppliers, nextInventory] =
      await Promise.all([
        listProducts(workspace.organizationId),
        listProductCategories(workspace.organizationId),
        listSuppliers(workspace.organizationId),
        listInventory(workspace.organizationId, workspace.branchId),
      ]);

    setProducts(nextProducts);
    setCategories(nextCategories);
    setSuppliers(nextSuppliers);
    setInventory(nextInventory);
  }

  async function perform(action: () => Promise<unknown>) {
    setWorking(true);
    setError(null);

    try {
      await action();
      await refreshData();
      setDialog(null);
      setSelectedInventory(null);
      setSelectedProduct(null);
      setSelectedVariant(null);
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setWorking(false);
    }
  }

  async function showHistory(row: InventoryRow) {
    if (!workspace) return;

    setSelectedInventory(row);
    setWorking(true);
    setError(null);

    try {
      const result = await listInventoryMovements(
        workspace.organizationId,
        workspace.branchId,
        row.productVariantId,
      );
      setMovements(result);
      setDialog("history");
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setWorking(false);
    }
  }

  return (
    <WorkspaceShell
      title="Products & Inventory"
      actions={
        <button
          type="button"
          className="workspace-primary-button"
          onClick={() => setDialog("product")}
        >
          + Add Product
        </button>
      }
    >
      <section className="workspace-feature-heading">
        <div>
          <span>PRODUCTS & INVENTORY</span>
          <h1>Retail operations.</h1>
          <p>
            Manage retail products, suppliers and branch stock without
            mixing products with your service catalog.
          </p>
        </div>
      </section>

      {loading ? (
        <div className="workspace-feature-card">
          <div className="workspace-feature-empty">
            Loading Products & Inventory…
          </div>
        </div>
      ) : (
        <>
          {error ? (
          <div className="mb-6 flex items-start justify-between gap-5 rounded-2xl border border-[rgba(255,128,128,0.25)] bg-[var(--ws-error-soft)] px-5 py-4 text-sm text-[var(--ws-error)]">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="font-black"
            >
              ×
            </button>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Active products"
            value={String(activeProducts.length)}
            detail={
              archivedProducts.length
                ? `${archivedProducts.length} archived`
                : "Catalog ready"
            }
          />
          <StatCard
            label="Units in stock"
            value={String(stockUnits)}
            detail={`${inventory.length} stocked variants`}
          />
          <StatCard
            label="Low stock"
            value={String(lowStock.length)}
            detail={
              lowStock.length
                ? "Needs attention"
                : "Stock levels healthy"
            }
            warning={lowStock.length > 0}
          />
          <StatCard
            label="Suppliers"
            value={String(suppliers.filter((item) => !item.archivedAt).length)}
            detail={`${categories.filter((item) => !item.archivedAt).length} categories`}
          />
        </div>

        <div className="mt-7 overflow-hidden rounded-[24px] border border-[var(--ws-border)] bg-[var(--ws-surface)] shadow-[0_16px_45px_rgba(16,33,43,.06)]">
          <div className="border-b border-[var(--ws-border)] px-5 pt-5 sm:px-7">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex gap-1 overflow-x-auto">
                {(
                  [
                    ["products", "Products"],
                    ["inventory", "Inventory"],
                    ["categories", "Categories"],
                    ["suppliers", "Suppliers"],
                  ] as Array<[Tab, string]>
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    className={`border-b-2 px-4 py-4 text-sm font-extrabold transition ${
                      tab === key
                        ? "border-[#f4a900] text-[var(--ws-text)]"
                        : "border-transparent text-[var(--ws-text-secondary)] hover:text-[var(--ws-text)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === "products" ? (
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search name, SKU or barcode"
                  className="mb-3 h-10 w-full rounded-xl border border-[var(--ws-border)] bg-[var(--ws-surface)] px-4 text-sm outline-none transition focus:border-[#e5a300] sm:w-72"
                />
              ) : null}
            </div>
          </div>

          <div className="p-5 sm:p-7">
            {tab === "products" ? (
              <ProductsTable
                products={visibleProducts}
                working={working}
                onAddVariant={(product) => {
                  setSelectedProduct(product);
                  setSelectedVariant(null);
                  setDialog("variant");
                }}
                onEditVariant={(product, variant) => {
                  setSelectedProduct(product);
                  setSelectedVariant(variant);
                  setDialog("editVariant");
                }}
                onArchiveVariant={(product, variant) => {
                  if (!workspace) return;
                  void perform(() =>
                    variant.archivedAt
                      ? restoreProductVariant(
                          workspace.organizationId,
                          product.id,
                          variant.id,
                        )
                      : archiveProductVariant(
                          workspace.organizationId,
                          product.id,
                          variant.id,
                        ),
                  );
                }}
                onArchive={(product) => {
                  if (!workspace) return;
                  void perform(() =>
                    product.archivedAt
                      ? restoreProduct(workspace.organizationId, product.id)
                      : archiveProduct(workspace.organizationId, product.id),
                  );
                }}
                onAdd={() => setDialog("product")}
              />
            ) : null}

            {tab === "inventory" ? (
              <InventoryTable
                rows={inventory}
                onReceive={(row) => {
                  setSelectedInventory(row);
                  setDialog("receive");
                }}
                onAdjust={(row) => {
                  setSelectedInventory(row);
                  setDialog("adjust");
                }}
                onReorder={(row) => {
                  setSelectedInventory(row);
                  setDialog("reorder");
                }}
                onHistory={(row) => void showHistory(row)}
              />
            ) : null}

            {tab === "categories" ? (
              <SimpleDirectory
                title="Product categories"
                description="Organize your retail catalog into clear groups."
                buttonLabel="+ Add Category"
                items={categories.map((item) => ({
                  id: item.id,
                  title: item.name,
                  detail: item.description || "No description",
                  archived: Boolean(item.archivedAt),
                }))}
                onAdd={() => setDialog("category")}
              />
            ) : null}

            {tab === "suppliers" ? (
              <SimpleDirectory
                title="Suppliers"
                description="Keep the businesses that supply your retail stock in one place."
                buttonLabel="+ Add Supplier"
                items={suppliers.map((item) => ({
                  id: item.id,
                  title: item.name,
                  detail:
                    [item.contactName, item.phone, item.email]
                      .filter(Boolean)
                      .join(" · ") || "No contact details",
                  archived: Boolean(item.archivedAt),
                }))}
                onAdd={() => setDialog("supplier")}
              />
            ) : null}
          </div>
        </div>

      {dialog === "product" && workspace ? (
        <ProductDialog
          workspace={workspace}
          categories={categories.filter((item) => !item.archivedAt)}
          suppliers={suppliers.filter((item) => !item.archivedAt)}
          working={working}
          onClose={() => setDialog(null)}
          onSubmit={(input) =>
            perform(() => createProduct(workspace.organizationId, input))
          }
        />
      ) : null}

      {dialog === "variant" && workspace && selectedProduct ? (
        <VariantDialog
          workspace={workspace}
          product={selectedProduct}
          working={working}
          onClose={() => {
            setDialog(null);
            setSelectedProduct(null);
          }}
          onSubmit={(input) =>
            perform(() =>
              createProductVariant(
                workspace.organizationId,
                selectedProduct.id,
                input,
              ),
            )
          }
        />
      ) : null}

      {dialog === "editVariant" &&
      workspace &&
      selectedProduct &&
      selectedVariant ? (
        <EditVariantDialog
          workspace={workspace}
          product={selectedProduct}
          variant={selectedVariant}
          working={working}
          onClose={() => {
            setDialog(null);
            setSelectedProduct(null);
            setSelectedVariant(null);
          }}
          onSubmit={(input) =>
            perform(() =>
              updateProductVariant(
                workspace.organizationId,
                selectedProduct.id,
                selectedVariant.id,
                input,
              ),
            )
          }
        />
      ) : null}

      {dialog === "category" && workspace ? (
        <CategoryDialog
          working={working}
          onClose={() => setDialog(null)}
          onSubmit={(input) =>
            perform(() => createCategory(workspace.organizationId, input))
          }
        />
      ) : null}

      {dialog === "supplier" && workspace ? (
        <SupplierDialog
          working={working}
          onClose={() => setDialog(null)}
          onSubmit={(input) =>
            perform(() => createSupplier(workspace.organizationId, input))
          }
        />
      ) : null}

      {dialog === "receive" && workspace && selectedInventory ? (
        <StockDialog
          mode="receive"
          row={selectedInventory}
          working={working}
          onClose={() => {
            setDialog(null);
            setSelectedInventory(null);
          }}
          onSubmit={(value, reference, note) =>
            perform(() =>
              receiveStock(
                workspace.organizationId,
                workspace.branchId,
                selectedInventory.productVariantId,
                {
                  quantity: value,
                  reference: reference || undefined,
                  note: note || undefined,
                },
              ),
            )
          }
        />
      ) : null}

      {dialog === "adjust" && workspace && selectedInventory ? (
        <StockDialog
          mode="adjust"
          row={selectedInventory}
          working={working}
          onClose={() => {
            setDialog(null);
            setSelectedInventory(null);
          }}
          onSubmit={(value, reference, note) =>
            perform(() =>
              adjustStock(
                workspace.organizationId,
                workspace.branchId,
                selectedInventory.productVariantId,
                {
                  quantityDelta: value,
                  reference: reference || undefined,
                  note: note || undefined,
                },
              ),
            )
          }
        />
      ) : null}

      {dialog === "reorder" && workspace && selectedInventory ? (
        <ReorderDialog
          row={selectedInventory}
          working={working}
          onClose={() => {
            setDialog(null);
            setSelectedInventory(null);
          }}
          onSubmit={(level) =>
            perform(() =>
              updateReorderLevel(
                workspace.organizationId,
                workspace.branchId,
                selectedInventory.productVariantId,
                level,
              ),
            )
          }
        />
      ) : null}

      {dialog === "history" && selectedInventory ? (
        <HistoryDialog
          row={selectedInventory}
          movements={movements}
          onClose={() => {
            setDialog(null);
            setSelectedInventory(null);
          }}
        />
      ) : null}
        </>
      )}
    </WorkspaceShell>
  );
}

function StatCard({
  label,
  value,
  detail,
  warning = false,
}: {
  label: string;
  value: string;
  detail: string;
  warning?: boolean;
}) {
  return (
    <article className="rounded-2xl border border-[var(--ws-border)] bg-[var(--ws-surface)] p-5 shadow-[0_8px_30px_rgba(16,33,43,.04)]">
      <div className="flex items-center justify-between">
        <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[var(--ws-text-secondary)]">
          {label}
        </p>
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            warning ? "bg-[#f4a900]" : "bg-[var(--ws-border)]"
          }`}
        />
      </div>
      <p className="mt-4 text-4xl font-black tracking-[-0.05em] text-[var(--ws-text)]">
        {value}
      </p>
      <p className="mt-2 text-xs font-medium text-[var(--ws-text-secondary)]">{detail}</p>
    </article>
  );
}

function ProductsTable({
  products,
  working,
  onArchive,
  onAddVariant,
  onEditVariant,
  onArchiveVariant,
  onAdd,
}: {
  products: Product[];
  working: boolean;
  onArchive: (product: Product) => void;
  onAddVariant: (product: Product) => void;
  onEditVariant: (product: Product, variant: ProductVariant) => void;
  onArchiveVariant: (product: Product, variant: ProductVariant) => void;
  onAdd: () => void;
}) {
  if (!products.length) {
    return (
      <EmptyState
        title="Your product shelf is ready"
        description="Add the first retail product your business sells. Kora will create its first sellable variant automatically."
        action="+ Add your first product"
        onAction={onAdd}
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse text-left">
        <thead>
          <tr className="border-b border-[var(--ws-border)] text-[11px] font-black uppercase tracking-[0.12em] text-[var(--ws-text-secondary)]">
            <th className="pb-4">Product</th>
            <th className="pb-4">Category</th>
            <th className="pb-4">SKU / Barcode</th>
            <th className="pb-4">Price</th>
            <th className="pb-4">Inventory</th>
            <th className="pb-4">Status</th>
            <th className="pb-4 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => {
            const activeVariants = product.variants.filter(
              (variant) => !variant.archivedAt,
            );
            const archivedVariants = product.variants.filter(
              (variant) => Boolean(variant.archivedAt),
            );
            const displayVariants = [...activeVariants, ...archivedVariants];

            return (
              <tr
                key={product.id}
                className="border-b border-[var(--ws-border)] last:border-0"
              >
                <td className="py-5 pr-5 align-top">
                  <p className="font-extrabold text-[var(--ws-text)]">
                    {product.name}
                  </p>
                  <p className="mt-1 text-xs text-[var(--ws-text-secondary)]">
                    {activeVariants.length}{" "}
                    {activeVariants.length === 1 ? "variant" : "variants"}
                  </p>
                </td>
                <td className="py-5 pr-5 align-top text-sm text-[var(--ws-text)]">
                  {product.productCategory?.name || "Uncategorized"}
                </td>
                <td className="py-5 pr-5 align-top" colSpan={2}>
                  <div className="space-y-2">
                    {displayVariants.map((variant) => (
                      <div
                        key={variant.id}
                        className={`min-w-[360px] rounded-xl border px-3 py-3 ${
                          variant.archivedAt
                            ? "border-[var(--ws-border)] bg-[var(--ws-surface)] opacity-70"
                            : "border-[var(--ws-border)] bg-[var(--ws-surface)]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-black text-[var(--ws-text)]">
                                {variant.name}
                              </p>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] ${
                                  variant.archivedAt
                                    ? "bg-[var(--ws-surface)] text-[var(--ws-text-secondary)]"
                                    : "bg-[var(--ws-surface)] text-[var(--ws-success)]"
                                }`}
                              >
                                {variant.archivedAt ? "Archived" : "Active"}
                              </span>
                            </div>
                            <p className="mt-1 truncate text-[11px] text-[var(--ws-text-secondary)]">
                              SKU {variant.sku || "—"} ·{" "}
                              {variant.barcode || "No barcode"}
                            </p>
                          </div>

                          <div className="text-right">
                            <p className="whitespace-nowrap text-sm font-black text-[var(--ws-text)]">
                              {money(
                                variant.sellingPriceMinor,
                                product.currency,
                              )}
                            </p>
                            <div className="mt-2 flex justify-end gap-2">
                              <button
                                type="button"
                                disabled={working || Boolean(product.archivedAt)}
                                onClick={() => onEditVariant(product, variant)}
                                className="text-[10px] font-black text-[var(--ws-text)] hover:text-[var(--ws-gold)] disabled:opacity-40"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                disabled={working || Boolean(product.archivedAt)}
                                onClick={() => onArchiveVariant(product, variant)}
                                className="text-[10px] font-black text-[var(--ws-gold)] hover:text-[var(--ws-gold)] disabled:opacity-40"
                              >
                                {variant.archivedAt ? "Restore" : "Archive"}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      disabled={working || Boolean(product.archivedAt)}
                      onClick={() => onAddVariant(product)}
                      className="text-xs font-black text-[var(--ws-gold)] transition hover:text-[var(--ws-gold)] disabled:opacity-40"
                    >
                      + Add Variant
                    </button>
                  </div>
                </td>
                <td className="py-5 pr-5 align-top text-sm text-[var(--ws-text)]">
                  {product.trackInventory ? "Tracked" : "Not tracked"}
                </td>
                <td className="py-5 pr-5 align-top">
                  <StatusPill archived={Boolean(product.archivedAt)} />
                </td>
                <td className="py-5 text-right align-top">
                  <button
                    type="button"
                    disabled={working}
                    onClick={() => onArchive(product)}
                    className="rounded-lg border border-[var(--ws-border)] px-3 py-2 text-xs font-extrabold text-[var(--ws-text)] transition hover:border-[#f4a900] disabled:opacity-50"
                  >
                    {product.archivedAt ? "Restore" : "Archive"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function InventoryTable({
  rows,
  onReceive,
  onAdjust,
  onReorder,
  onHistory,
}: {
  rows: InventoryRow[];
  onReceive: (row: InventoryRow) => void;
  onAdjust: (row: InventoryRow) => void;
  onReorder: (row: InventoryRow) => void;
  onHistory: (row: InventoryRow) => void;
}) {
  if (!rows.length) {
    return (
      <EmptyState
        title="No branch stock yet"
        description="Tracked products will appear here with their current branch stock."
      />
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <article
          key={row.id}
          className="flex flex-col gap-5 rounded-2xl border border-[var(--ws-border)] bg-[var(--ws-surface)] p-5 lg:flex-row lg:items-center"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-black text-[var(--ws-text)]">
                {row.product.name}
              </h3>
              {row.productVariant.name !== "Default" ? (
                <span className="rounded-full bg-[var(--ws-surface)] px-2.5 py-1 text-[10px] font-extrabold text-[var(--ws-text-secondary)]">
                  {row.productVariant.name}
                </span>
              ) : null}
              {row.lowStock ? (
                <span className="rounded-full bg-[var(--ws-surface)] px-2.5 py-1 text-[10px] font-black text-[var(--ws-gold)]">
                  LOW STOCK
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-[var(--ws-text-secondary)]">
              SKU {row.productVariant.sku || "—"} · Reorder at{" "}
              {row.reorderLevel}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--ws-text-secondary)]">
                On hand
              </p>
              <p className="mt-1 text-2xl font-black text-[var(--ws-text)]">
                {row.quantityOnHand}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--ws-text-secondary)]">
                Selling price
              </p>
              <p className="mt-1 text-sm font-black text-[var(--ws-text)]">
                {money(
                  row.productVariant.sellingPriceMinor,
                  row.product.currency,
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            <ActionButton label="Receive" onClick={() => onReceive(row)} />
            <ActionButton label="Adjust" onClick={() => onAdjust(row)} />
            <ActionButton label="Reorder" onClick={() => onReorder(row)} />
            <ActionButton label="History" onClick={() => onHistory(row)} />
          </div>
        </article>
      ))}
    </div>
  );
}

function SimpleDirectory({
  title,
  description,
  buttonLabel,
  items,
  onAdd,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  items: Array<{
    id: string;
    title: string;
    detail: string;
    archived: boolean;
  }>;
  onAdd: () => void;
}) {
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black tracking-[-0.025em]">{title}</h2>
          <p className="mt-1 text-sm text-[var(--ws-text-secondary)]">{description}</p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-xl bg-gradient-to-b from-[#ffc02a] to-[#eda000] px-4 py-2.5 text-xs font-black text-[#101820]"
        >
          {buttonLabel}
        </button>
      </div>

      {!items.length ? (
        <EmptyState
          title={`No ${title.toLowerCase()} yet`}
          description="Create the first one when you are ready."
          action={buttonLabel}
          onAction={onAdd}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl border border-[var(--ws-border)] bg-[var(--ws-surface)] p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-black text-[var(--ws-text)]">{item.title}</h3>
                  <p className="mt-2 text-xs leading-5 text-[var(--ws-text-secondary)]">
                    {item.detail}
                  </p>
                </div>
                <StatusPill archived={item.archived} />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}


function EditVariantDialog({
  workspace,
  product,
  variant,
  working,
  onClose,
  onSubmit,
}: {
  workspace: ActiveWorkspace;
  product: Product;
  variant: ProductVariant;
  working: boolean;
  onClose: () => void;
  onSubmit: (input: {
    name?: string;
    sku?: string;
    barcode?: string;
    costPriceMinor?: number;
    sellingPriceMinor?: number;
  }) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const costPrice = String(data.get("costPrice") || "").trim();
    const sellingPrice = String(data.get("sellingPrice") || "").trim();

    onSubmit({
      name: String(data.get("name") || "").trim(),
      sku: String(data.get("sku") || "").trim(),
      barcode: String(data.get("barcode") || "").trim(),
      costPriceMinor: costPrice
        ? Math.round(Number(costPrice) * 100)
        : undefined,
      sellingPriceMinor: sellingPrice
        ? Math.round(Number(sellingPrice) * 100)
        : undefined,
    });
  }

  return (
    <Modal title={`Edit Variant · ${product.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <Field label="Variant name">
          <input
            name="name"
            required
            defaultValue={variant.name}
            className={inputClass}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="SKU">
            <input
              name="sku"
              defaultValue={variant.sku || ""}
              className={inputClass}
            />
          </Field>
          <Field label="Barcode">
            <input
              name="barcode"
              defaultValue={variant.barcode || ""}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Cost price (${workspace.currency})`}>
            <input
              name="costPrice"
              type="number"
              min="0"
              step="0.01"
              defaultValue={
                variant.costPriceMinor === null
                  ? ""
                  : (variant.costPriceMinor / 100).toFixed(2)
              }
              className={inputClass}
            />
          </Field>

          <Field label={`Selling price (${workspace.currency})`}>
            <input
              name="sellingPrice"
              type="number"
              min="0"
              step="0.01"
              required
              defaultValue={(variant.sellingPriceMinor / 100).toFixed(2)}
              className={inputClass}
            />
          </Field>
        </div>

        <DialogActions
          working={working}
          submitLabel="Save Changes"
          onClose={onClose}
        />
      </form>
    </Modal>
  );
}

function VariantDialog({
  workspace,
  product,
  working,
  onClose,
  onSubmit,
}: {
  workspace: ActiveWorkspace;
  product: Product;
  working: boolean;
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    sku?: string;
    barcode?: string;
    costPriceMinor?: number;
    sellingPriceMinor: number;
  }) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const data = new FormData(event.currentTarget);
    const costPrice = String(data.get("costPrice") || "").trim();
    const sellingPrice = Number(data.get("sellingPrice"));

    onSubmit({
      name: String(data.get("name") || "").trim(),
      sku: optional(data.get("sku")),
      barcode: optional(data.get("barcode")),
      costPriceMinor: costPrice
        ? Math.round(Number(costPrice) * 100)
        : undefined,
      sellingPriceMinor: Math.round(sellingPrice * 100),
    });
  }

  return (
    <Modal title={`Add Variant · ${product.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <div className="rounded-xl border border-[var(--ws-border)] bg-[var(--ws-surface)] px-4 py-3">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--ws-gold)]">
            New sellable variant
          </p>
          <p className="mt-1 text-sm font-bold text-[var(--ws-text)]">
            Each variant can have its own SKU, barcode and price.
          </p>
        </div>

        <Field label="Variant name">
          <input
            name="name"
            required
            placeholder="e.g. 100ml"
            className={inputClass}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="SKU">
            <input
              name="sku"
              placeholder="KORA-BO-100"
              className={inputClass}
            />
          </Field>
          <Field label="Barcode">
            <input
              name="barcode"
              placeholder="Optional barcode"
              className={inputClass}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Cost price (${workspace.currency})`}>
            <input
              name="costPrice"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              className={inputClass}
            />
          </Field>
          <Field label={`Selling price (${workspace.currency})`}>
            <input
              name="sellingPrice"
              type="number"
              min="0"
              step="0.01"
              required
              placeholder="0.00"
              className={inputClass}
            />
          </Field>
        </div>

        <DialogActions
          working={working}
          submitLabel="Add Variant"
          onClose={onClose}
        />
      </form>
    </Modal>
  );
}

function ProductDialog({
  workspace,
  categories,
  suppliers,
  working,
  onClose,
  onSubmit,
}: {
  workspace: ActiveWorkspace;
  categories: ProductCategory[];
  suppliers: Supplier[];
  working: boolean;
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    description?: string;
    productCategoryId?: string;
    supplierId?: string;
    currency: string;
    trackInventory: boolean;
    variantName?: string;
    sku?: string;
    barcode?: string;
    costPriceMinor?: number;
    sellingPriceMinor: number;
  }) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const data = new FormData(event.currentTarget);
    const sellingPrice = Number(data.get("sellingPrice"));
    const costPrice = String(data.get("costPrice") || "").trim();

    onSubmit({
      name: String(data.get("name") || "").trim(),
      description: optional(data.get("description")),
      productCategoryId: optional(data.get("category")),
      supplierId: optional(data.get("supplier")),
      currency: workspace.currency,
      trackInventory: data.get("trackInventory") === "on",
      variantName: optional(data.get("variantName")),
      sku: optional(data.get("sku")),
      barcode: optional(data.get("barcode")),
      costPriceMinor: costPrice
        ? Math.round(Number(costPrice) * 100)
        : undefined,
      sellingPriceMinor: Math.round(sellingPrice * 100),
    });
  }

  return (
    <Modal title="Add Product" onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Product name">
            <input
              name="name"
              required
              placeholder="e.g. Beard Oil"
              className={inputClass}
            />
          </Field>
          <Field label="Variant">
            <input
              name="variantName"
              placeholder="Default"
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Description">
          <textarea
            name="description"
            rows={3}
            placeholder="Short product description"
            className={inputClass}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category">
            <select name="category" className={inputClass}>
              <option value="">Uncategorized</option>
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Supplier">
            <select name="supplier" className={inputClass}>
              <option value="">No supplier</option>
              {suppliers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="SKU">
            <input
              name="sku"
              placeholder="BO-001"
              className={inputClass}
            />
          </Field>
          <Field label="Barcode">
            <input
              name="barcode"
              placeholder="Optional barcode"
              className={inputClass}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Cost price (${workspace.currency})`}>
            <input
              name="costPrice"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              className={inputClass}
            />
          </Field>
          <Field label={`Selling price (${workspace.currency})`}>
            <input
              name="sellingPrice"
              type="number"
              min="0"
              step="0.01"
              required
              placeholder="0.00"
              className={inputClass}
            />
          </Field>
        </div>

        <label className="flex items-center gap-3 rounded-xl bg-[var(--ws-surface)] p-4 text-sm font-bold text-[var(--ws-text)]">
          <input
            type="checkbox"
            name="trackInventory"
            defaultChecked
            className="h-4 w-4 accent-[#e8a000]"
          />
          Track inventory for this product
        </label>

        <DialogActions
          working={working}
          submitLabel="Create Product"
          onClose={onClose}
        />
      </form>
    </Modal>
  );
}

function CategoryDialog({
  working,
  onClose,
  onSubmit,
}: {
  working: boolean;
  onClose: () => void;
  onSubmit: (input: { name: string; description?: string }) => void;
}) {
  return (
    <Modal title="Add Category" onClose={onClose}>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          onSubmit({
            name: String(data.get("name") || "").trim(),
            description: optional(data.get("description")),
          });
        }}
      >
        <Field label="Category name">
          <input
            name="name"
            required
            placeholder="e.g. Hair Care"
            className={inputClass}
          />
        </Field>
        <Field label="Description">
          <textarea
            name="description"
            rows={3}
            className={inputClass}
            placeholder="Optional description"
          />
        </Field>
        <DialogActions
          working={working}
          submitLabel="Create Category"
          onClose={onClose}
        />
      </form>
    </Modal>
  );
}

function SupplierDialog({
  working,
  onClose,
  onSubmit,
}: {
  working: boolean;
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    contactName?: string;
    email?: string;
    phone?: string;
    notes?: string;
  }) => void;
}) {
  return (
    <Modal title="Add Supplier" onClose={onClose}>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);

          onSubmit({
            name: String(data.get("name") || "").trim(),
            contactName: optional(data.get("contactName")),
            email: optional(data.get("email")),
            phone: optional(data.get("phone")),
            notes: optional(data.get("notes")),
          });
        }}
      >
        <Field label="Supplier name">
          <input
            name="name"
            required
            placeholder="e.g. Accra Beauty Supply"
            className={inputClass}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact person">
            <input name="contactName" className={inputClass} />
          </Field>
          <Field label="Phone">
            <input name="phone" className={inputClass} />
          </Field>
        </div>

        <Field label="Email">
          <input name="email" type="email" className={inputClass} />
        </Field>

        <Field label="Notes">
          <textarea name="notes" rows={3} className={inputClass} />
        </Field>

        <DialogActions
          working={working}
          submitLabel="Create Supplier"
          onClose={onClose}
        />
      </form>
    </Modal>
  );
}

function StockDialog({
  mode,
  row,
  working,
  onClose,
  onSubmit,
}: {
  mode: "receive" | "adjust";
  row: InventoryRow;
  working: boolean;
  onClose: () => void;
  onSubmit: (value: number, reference: string, note: string) => void;
}) {
  const receive = mode === "receive";

  return (
    <Modal
      title={receive ? "Receive Stock" : "Adjust Stock"}
      onClose={onClose}
    >
      <div className="mb-5 rounded-xl bg-[var(--ws-surface)] p-4">
        <p className="font-black">{row.product.name}</p>
        <p className="mt-1 text-xs text-[var(--ws-text-secondary)]">
          {row.productVariant.name} · Current stock {row.quantityOnHand}
        </p>
      </div>

      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          onSubmit(
            Number(data.get("quantity")),
            String(data.get("reference") || "").trim(),
            String(data.get("note") || "").trim(),
          );
        }}
      >
        <Field
          label={receive ? "Quantity received" : "Quantity adjustment"}
          hint={
            receive
              ? "Enter the number of units received."
              : "Use a positive number to add stock or a negative number to remove stock."
          }
        >
          <input
            name="quantity"
            type="number"
            min={receive ? "1" : undefined}
            required
            className={inputClass}
            placeholder={receive ? "10" : "-2 or 5"}
          />
        </Field>

        <Field label="Reference">
          <input
            name="reference"
            className={inputClass}
            placeholder="Invoice, delivery or stocktake reference"
          />
        </Field>

        <Field label="Note">
          <textarea name="note" rows={3} className={inputClass} />
        </Field>

        <DialogActions
          working={working}
          submitLabel={receive ? "Receive Stock" : "Apply Adjustment"}
          onClose={onClose}
        />
      </form>
    </Modal>
  );
}

function ReorderDialog({
  row,
  working,
  onClose,
  onSubmit,
}: {
  row: InventoryRow;
  working: boolean;
  onClose: () => void;
  onSubmit: (level: number) => void;
}) {
  return (
    <Modal title="Set Reorder Level" onClose={onClose}>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          onSubmit(Number(data.get("level")));
        }}
      >
        <div className="rounded-xl bg-[var(--ws-surface)] p-4">
          <p className="font-black">{row.product.name}</p>
          <p className="mt-1 text-xs text-[var(--ws-text-secondary)]">
            Kora flags this item when stock reaches or falls below the reorder
            level.
          </p>
        </div>

        <Field label="Reorder level">
          <input
            name="level"
            type="number"
            min="0"
            defaultValue={row.reorderLevel}
            required
            className={inputClass}
          />
        </Field>

        <DialogActions
          working={working}
          submitLabel="Save Reorder Level"
          onClose={onClose}
        />
      </form>
    </Modal>
  );
}

function HistoryDialog({
  row,
  movements,
  onClose,
}: {
  row: InventoryRow;
  movements: InventoryMovement[];
  onClose: () => void;
}) {
  return (
    <Modal title="Stock Movement History" onClose={onClose} wide>
      <div className="mb-5">
        <p className="font-black text-[var(--ws-text)]">{row.product.name}</p>
        <p className="mt-1 text-xs text-[var(--ws-text-secondary)]">
          {row.productVariant.name} · SKU {row.productVariant.sku || "—"}
        </p>
      </div>

      {!movements.length ? (
        <div className="rounded-xl bg-[var(--ws-surface)] p-8 text-center text-sm text-[var(--ws-text-secondary)]">
          No stock movements have been recorded yet.
        </div>
      ) : (
        <div className="space-y-3">
          {movements.map((movement) => (
            <article
              key={movement.id}
              className="grid gap-3 rounded-xl border border-[var(--ws-border)] p-4 sm:grid-cols-[1fr_auto_auto]"
            >
              <div>
                <p className="text-sm font-black">
                  {movement.type.replaceAll("_", " ")}
                </p>
                <p className="mt-1 text-xs text-[var(--ws-text-secondary)]">
                  {new Date(movement.occurredAt).toLocaleString()}
                  {movement.reference ? ` · ${movement.reference}` : ""}
                </p>
              </div>
              <div className="text-sm font-black">
                {movement.quantityDelta > 0 ? "+" : ""}
                {movement.quantityDelta}
              </div>
              <div className="text-xs font-bold text-[var(--ws-text-secondary)]">
                {movement.quantityBefore} → {movement.quantityAfter}
              </div>
            </article>
          ))}
        </div>
      )}
    </Modal>
  );
}

function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const titleId = useId();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#031019]/70 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`max-h-[92vh] w-full overflow-y-auto rounded-[24px] bg-[var(--ws-surface)] shadow-2xl ${
          wide ? "max-w-3xl" : "max-w-xl"
        }`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--ws-border)] bg-[var(--ws-surface)] px-6 py-5">
          <h2
            id={titleId}
            className="text-xl font-black tracking-[-0.025em] text-[var(--ws-text)]"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="grid h-9 w-9 place-items-center rounded-full bg-[var(--ws-surface)] text-lg font-bold text-[var(--ws-text-secondary)]"
          >
            ×
          </button>
        </div>
        <div className="p-6 text-[var(--ws-text)]">{children}</div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase tracking-[0.08em] text-[var(--ws-text-secondary)]">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-2 block text-xs leading-5 text-[var(--ws-text-secondary)]">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function DialogActions({
  working,
  submitLabel,
  onClose,
}: {
  working: boolean;
  submitLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="flex justify-end gap-3 border-t border-[var(--ws-border)] pt-5">
      <button
        type="button"
        onClick={onClose}
        disabled={working}
        className="rounded-xl border border-[var(--ws-border)] px-4 py-2.5 text-sm font-extrabold text-[var(--ws-text)]"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={working}
        className="rounded-xl bg-gradient-to-b from-[#ffc02a] to-[#eda000] px-5 py-2.5 text-sm font-black text-[#101820] disabled:opacity-50"
      >
        {working ? "Saving..." : submitLabel}
      </button>
    </div>
  );
}

function EmptyState({
  title,
  description,
  action,
  onAction,
}: {
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-[22px] border border-dashed border-[var(--ws-border)] bg-[var(--ws-surface)] px-6 py-14 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[var(--ws-surface)] text-2xl">
        ◫
      </div>
      <h3 className="mt-5 text-xl font-black tracking-[-0.025em]">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--ws-text-secondary)]">
        {description}
      </p>
      {action && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-6 rounded-xl bg-gradient-to-b from-[#ffc02a] to-[#eda000] px-5 py-3 text-sm font-black text-[#101820]"
        >
          {action}
        </button>
      ) : null}
    </div>
  );
}

function StatusPill({ archived }: { archived: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${
        archived
          ? "bg-[var(--ws-surface)] text-[var(--ws-text-secondary)]"
          : "bg-[var(--ws-surface)] text-[var(--ws-success)]"
      }`}
    >
      {archived ? "Archived" : "Active"}
    </span>
  );
}

function ActionButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-[var(--ws-border)] bg-[var(--ws-surface)] px-3 py-2 text-xs font-extrabold text-[var(--ws-text)] transition hover:border-[#e6a300] hover:text-[var(--ws-gold)]"
    >
      {label}
    </button>
  );
}

const inputClass =
  "w-full rounded-xl border border-[var(--ws-border)] bg-[var(--ws-surface)] px-4 py-3 text-sm text-[var(--ws-text)] outline-none transition placeholder:text-[var(--ws-text-muted)] focus:border-[#e5a300] focus:ring-2 focus:ring-[#f4a900]/10";

function money(minor: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}

function optional(value: FormDataEntryValue | null) {
  const result = String(value || "").trim();
  return result || undefined;
}

function messageFrom(cause: unknown) {
  return cause instanceof Error
    ? cause.message
    : "Something went wrong. Please try again.";
}
