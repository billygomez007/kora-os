import { koraData } from "./kora-api";

export interface ProductCategory {
  id: string;
  organizationId: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  archivedAt: string | null;
}

export interface Supplier {
  id: string;
  organizationId: string;
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  archivedAt: string | null;
}

export interface ProductVariant {
  id: string;
  organizationId: string;
  productId: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  costPriceMinor: number | null;
  sellingPriceMinor: number;
  sortOrder: number;
  archivedAt: string | null;
}

export interface Product {
  id: string;
  organizationId: string;
  productCategoryId: string | null;
  supplierId: string | null;
  name: string;
  description: string | null;
  currency: string;
  trackInventory: boolean;
  sortOrder: number;
  archivedAt: string | null;
  variants: ProductVariant[];
  productCategory?: ProductCategory | null;
  supplier?: Supplier | null;
}

export interface InventoryRow {
  id: string;
  organizationId: string;
  branchId: string;
  productId: string;
  productVariantId: string;
  quantityOnHand: number;
  reorderLevel: number;
  lowStock: boolean;
  product: {
    id: string;
    name: string;
    currency: string;
    trackInventory: boolean;
    archivedAt?: string | null;
  };
  productVariant: {
    id: string;
    name: string;
    sku: string | null;
    barcode: string | null;
    costPriceMinor?: number | null;
    sellingPriceMinor: number;
    archivedAt?: string | null;
  };
}

export interface InventoryMovement {
  id: string;
  organizationId: string;
  branchId: string;
  productId: string;
  productVariantId: string;
  type: string;
  quantityDelta: number;
  quantityBefore: number;
  quantityAfter: number;
  unitCostMinor: number | null;
  reference: string | null;
  note: string | null;
  occurredAt: string;
  product: {
    id: string;
    name: string;
    currency: string;
  };
  productVariant: {
    id: string;
    name: string;
    sku: string | null;
    barcode: string | null;
  };
}

export function listProducts(
  organizationId: string,
  includeArchived = true,
) {
  return koraData<Product[]>(
    `/organizations/${organizationId}/products?includeArchived=${includeArchived}`,
  );
}

export function createProductVariant(
  organizationId: string,
  productId: string,
  input: {
    name: string;
    sku?: string;
    barcode?: string;
    costPriceMinor?: number;
    sellingPriceMinor: number;
    sortOrder?: number;
  },
) {
  return koraData<ProductVariant>(
    `/organizations/${organizationId}/products/${productId}/variants`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function updateProductVariant(
  organizationId: string,
  productId: string,
  variantId: string,
  input: {
    name?: string;
    sku?: string;
    barcode?: string;
    costPriceMinor?: number;
    sellingPriceMinor?: number;
    sortOrder?: number;
  },
) {
  return koraData<ProductVariant>(
    `/organizations/${organizationId}/products/${productId}/variants/${variantId}`,
    {
      method: "PUT",
      body: JSON.stringify(input),
    },
  );
}

export function archiveProductVariant(
  organizationId: string,
  productId: string,
  variantId: string,
) {
  return koraData<ProductVariant>(
    `/organizations/${organizationId}/products/${productId}/variants/${variantId}/archive`,
    { method: "POST" },
  );
}

export function restoreProductVariant(
  organizationId: string,
  productId: string,
  variantId: string,
) {
  return koraData<ProductVariant>(
    `/organizations/${organizationId}/products/${productId}/variants/${variantId}/restore`,
    { method: "POST" },
  );
}

export function listProductCategories(
  organizationId: string,
  includeArchived = true,
) {
  return koraData<ProductCategory[]>(
    `/organizations/${organizationId}/product-categories?includeArchived=${includeArchived}`,
  );
}

export function listSuppliers(
  organizationId: string,
  includeArchived = true,
) {
  return koraData<Supplier[]>(
    `/organizations/${organizationId}/suppliers?includeArchived=${includeArchived}`,
  );
}

export function listInventory(
  organizationId: string,
  branchId: string,
) {
  return koraData<InventoryRow[]>(
    `/organizations/${organizationId}/branches/${branchId}/inventory`,
  );
}

export function createProduct(
  organizationId: string,
  input: {
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
  },
) {
  return koraData<Product>(
    `/organizations/${organizationId}/products`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function createCategory(
  organizationId: string,
  input: { name: string; description?: string },
) {
  return koraData<ProductCategory>(
    `/organizations/${organizationId}/product-categories`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function createSupplier(
  organizationId: string,
  input: {
    name: string;
    contactName?: string;
    email?: string;
    phone?: string;
    notes?: string;
  },
) {
  return koraData<Supplier>(
    `/organizations/${organizationId}/suppliers`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function receiveStock(
  organizationId: string,
  branchId: string,
  variantId: string,
  input: {
    quantity: number;
    unitCostMinor?: number;
    reference?: string;
    note?: string;
  },
) {
  return koraData(
    `/organizations/${organizationId}/branches/${branchId}/inventory/variants/${variantId}/receive`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function adjustStock(
  organizationId: string,
  branchId: string,
  variantId: string,
  input: {
    quantityDelta: number;
    reference?: string;
    note?: string;
  },
) {
  return koraData(
    `/organizations/${organizationId}/branches/${branchId}/inventory/variants/${variantId}/adjust`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function updateReorderLevel(
  organizationId: string,
  branchId: string,
  variantId: string,
  reorderLevel: number,
) {
  return koraData(
    `/organizations/${organizationId}/branches/${branchId}/inventory/variants/${variantId}/reorder-level`,
    {
      method: "PUT",
      body: JSON.stringify({ reorderLevel }),
    },
  );
}

export function listInventoryMovements(
  organizationId: string,
  branchId: string,
  variantId: string,
) {
  return koraData<InventoryMovement[]>(
    `/organizations/${organizationId}/branches/${branchId}/inventory/variants/${variantId}/movements`,
  );
}

export function archiveProduct(
  organizationId: string,
  productId: string,
) {
  return koraData<Product>(
    `/organizations/${organizationId}/products/${productId}/archive`,
    { method: "POST" },
  );
}

export function restoreProduct(
  organizationId: string,
  productId: string,
) {
  return koraData<Product>(
    `/organizations/${organizationId}/products/${productId}/restore`,
    { method: "POST" },
  );
}
