"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { koraData } from "@/lib/api/kora-api";

interface Business {
  organizationId: string;
  slug: string;
  displayName: string;
  description: string | null;
  logoImageUrl: string | null;
  coverImageUrl: string | null;
  verificationStatus: string;
  categories: string[];
}

interface Branch {
  branchId: string;
  name: string;
  city: string | null;
  region: string | null;
  countryCode: string;
  latitude: number | null;
  longitude: number | null;
  publicPhone: string | null;
  publicEmail: string | null;
  openingHoursNote: string | null;
}

interface Service {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceMinor: number;
  currency: string;
  pricingType: string;
  serviceCategoryId: string | null;
}

interface BookingProvider {
  staffProfileId: string;
  displayName: string;
}

interface BookingSlot {
  startAt: string;
  endAt: string;
  staffProfileId: string;
}

interface BookingAvailability {
  branchTimeZone: string;
  currency: string;
  totalPriceMinor: number;
  items: Array<{
    serviceId: string;
    name: string;
    durationMinutes: number;
    priceMinor: number;
    currency: string;
    isBookableByCustomer: boolean;
  }>;
  eligibleProviderIds: string[];
  days: Array<{
    date: string;
    slots: BookingSlot[];
  }>;
}

interface BookingConfirmation {
  id: string;
  reference: string;
  status: string;
  businessName: string;
  businessSlug: string | null;
  branchId: string;
  assignedStaffProfileId: string;
  providerDisplayName: string | null;
  startAt: string;
  endAt: string;
  branchTimeZone: string;
  currency: string;
  totalPriceMinor: number;
  items: Array<{
    serviceId: string;
    serviceName: string;
    durationMinutes: number;
    priceMinor: number;
    currency: string;
    displayOrder: number;
  }>;
}

interface ProductVariant {
  variantId: string;
  name: string;
  sellingPriceMinor: number;
}

interface Product {
  productId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  currency: string;
  trackInventory: boolean;
  category: {
    id: string;
    name: string;
  } | null;
  variants: ProductVariant[];
  branchAvailability: Array<{
    branchId: string;
    branchName: string;
    variants: Array<{
      variantId: string;
      available: boolean;
    }>;
  }>;
}

interface CartItem {
  productId: string;
  productName: string;
  productImageUrl: string | null;
  productVariantId: string;
  variantName: string;
  unitPriceMinor: number;
  currency: string;
  quantity: number;
}

interface MarketplaceOrderConfirmation {
  id: string;
  reference: string;
  status: string;
  fulfillmentMethod: string;
  currency: string;
  subtotalMinor: number;
  totalMinor: number;
  businessNameSnapshot: string;
  branchId: string;
  createdAt: string;
  items: Array<{
    id: string;
    productId: string;
    productVariantId: string;
    productNameSnapshot: string;
    variantNameSnapshot: string;
    quantity: number;
    unitPriceMinorSnapshot: number;
    priceMinorSnapshot: number;
    currencySnapshot: string;
  }>;
}

type Tab = "overview" | "services" | "products";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function money(minor: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}

function errorText(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "Kora could not load this storefront.";
}

function localDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function bookingIdempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `booking-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function orderIdempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `order-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function MarketplaceStorefrontPage() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const slug = decodeURIComponent(params.slug);

  const sourceQrCode = searchParams.get("sourceQr")?.trim() || "";
  const qrBranchId = searchParams.get("branch")?.trim() || "";
  const qrType = searchParams.get("qrType")?.trim() || "";
  const qrResource = searchParams.get("resource")?.trim() || "";
  const hasBranchQrContext = Boolean(sourceQrCode && qrBranchId);

  const [business, setBusiness] = useState<Business | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [bookingService, setBookingService] = useState<Service | null>(null);
  const [bookingProviders, setBookingProviders] = useState<BookingProvider[]>([]);
  const [bookingProviderId, setBookingProviderId] = useState("");
  const [bookingDate, setBookingDate] = useState(() => localDateValue(new Date()));
  const [bookingAvailability, setBookingAvailability] =
    useState<BookingAvailability | null>(null);
  const [bookingSlot, setBookingSlot] = useState<BookingSlot | null>(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingMessage, setBookingMessage] = useState("");
  const [bookingConfirmation, setBookingConfirmation] =
    useState<BookingConfirmation | null>(null);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutNote, setCheckoutNote] = useState("");
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderMessage, setOrderMessage] = useState("");
  const [orderAttemptKey, setOrderAttemptKey] = useState("");
  const [orderConfirmation, setOrderConfirmation] =
    useState<MarketplaceOrderConfirmation | null>(null);


  useEffect(() => {
    let cancelled = false;

    async function loadStorefront() {
      setLoading(true);
      setMessage("");

      try {
        const [businessRow, branchRows, productRows] = await Promise.all([
          koraData<Business>(
            `/discovery/businesses/${encodeURIComponent(slug)}`,
          ),
          koraData<Branch[]>(
            `/discovery/businesses/${encodeURIComponent(slug)}/branches`,
          ),
          koraData<Product[]>(
            `/discovery/businesses/${encodeURIComponent(slug)}/products`,
          ),
        ]);

        if (cancelled) return;

        setBusiness(businessRow);
        setBranches(Array.isArray(branchRows) ? branchRows : []);
        setProducts(Array.isArray(productRows) ? productRows : []);

        if (Array.isArray(branchRows) && branchRows.length > 0) {
          const qrBranch = qrBranchId
            ? branchRows.find((branch) => branch.branchId === qrBranchId)
            : null;

          setSelectedBranchId(
            qrBranch?.branchId ?? branchRows[0].branchId,
          );
        }
      } catch (error) {
        if (!cancelled) setMessage(errorText(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadStorefront();

    return () => {
      cancelled = true;
    };
  }, [slug, qrBranchId]);

  useEffect(() => {
    let cancelled = false;

    async function loadServices() {
      if (!selectedBranchId) {
        setServices([]);
        return;
      }

      setServicesLoading(true);

      try {
        const rows = await koraData<Service[]>(
          `/discovery/businesses/${encodeURIComponent(slug)}/branches/${encodeURIComponent(selectedBranchId)}/services`,
        );

        if (!cancelled) {
          setServices(Array.isArray(rows) ? rows : []);
        }
      } catch (error) {
        if (!cancelled) {
          setServices([]);
          setMessage(errorText(error));
        }
      } finally {
        if (!cancelled) setServicesLoading(false);
      }
    }

    void loadServices();

    return () => {
      cancelled = true;
    };
  }, [selectedBranchId, slug]);

  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.branchId === selectedBranchId) ?? null,
    [branches, selectedBranchId],
  );

  const availableProducts = useMemo(() => {
    if (!selectedBranchId) return products;

    return products.filter((product) => {
      const branch = product.branchAvailability.find(
        (row) => row.branchId === selectedBranchId,
      );

      return branch?.variants.some((variant) => variant.available) ?? false;
    });
  }, [products, selectedBranchId]);

  const cartQuantity = useMemo(
    () => cart.reduce((total, item) => total + item.quantity, 0),
    [cart],
  );

  const cartSubtotal = useMemo(
    () =>
      cart.reduce(
        (total, item) => total + item.unitPriceMinor * item.quantity,
        0,
      ),
    [cart],
  );

  const cartCurrency = cart[0]?.currency ?? "GHS";

  function availableVariantsForProduct(product: Product) {
    if (!selectedBranchId) return product.variants;

    const branch = product.branchAvailability.find(
      (row) => row.branchId === selectedBranchId,
    );

    if (!branch) return [];

    const availableIds = new Set(
      branch.variants
        .filter((variant) => variant.available)
        .map((variant) => variant.variantId),
    );

    return product.variants.filter((variant) =>
      availableIds.has(variant.variantId),
    );
  }

  function selectedVariantForProduct(product: Product) {
    const available = availableVariantsForProduct(product);
    const selectedId = selectedVariants[product.productId];

    return (
      available.find((variant) => variant.variantId === selectedId) ??
      available[0] ??
      null
    );
  }

  function addProductToCart(product: Product) {
    const variant = selectedVariantForProduct(product);
    if (!variant || !selectedBranchId) return;

    setOrderConfirmation(null);
    setOrderMessage("");

    setCart((current) => {
      const existing = current.find(
        (item) => item.productVariantId === variant.variantId,
      );

      if (existing) {
        return current.map((item) =>
          item.productVariantId === variant.variantId
            ? { ...item, quantity: Math.min(item.quantity + 1, 50) }
            : item,
        );
      }

      return [
        ...current,
        {
          productId: product.productId,
          productName: product.name,
          productImageUrl: product.imageUrl,
          productVariantId: variant.variantId,
          variantName: variant.name,
          unitPriceMinor: variant.sellingPriceMinor,
          currency: product.currency,
          quantity: 1,
        },
      ];
    });

    setCartOpen(true);
  }

  function changeCartQuantity(productVariantId: string, nextQuantity: number) {
    if (nextQuantity <= 0) {
      setCart((current) =>
        current.filter(
          (item) => item.productVariantId !== productVariantId,
        ),
      );
      return;
    }

    setCart((current) =>
      current.map((item) =>
        item.productVariantId === productVariantId
          ? { ...item, quantity: Math.min(nextQuantity, 50) }
          : item,
      ),
    );
  }

  function removeCartItem(productVariantId: string) {
    setCart((current) =>
      current.filter((item) => item.productVariantId !== productVariantId),
    );
  }

  async function placeMarketplaceOrder() {
    if (!selectedBranchId || cart.length === 0 || orderSubmitting) return;

    const attemptKey = orderAttemptKey || orderIdempotencyKey();

    if (!orderAttemptKey) {
      setOrderAttemptKey(attemptKey);
    }

    setOrderSubmitting(true);
    setOrderMessage("");

    try {
      const confirmation = await koraData<MarketplaceOrderConfirmation>(
        "/me/marketplace/orders",
        {
          method: "POST",
          body: JSON.stringify({
            businessSlug: slug,
            branchId: selectedBranchId,
            idempotencyKey: attemptKey,
            ...(sourceQrCode ? { sourceQrCode } : {}),
            fulfillmentMethod: "PICKUP",
            items: cart.map((item) => ({
              productVariantId: item.productVariantId,
              quantity: item.quantity,
            })),
            ...(checkoutNote.trim()
              ? { customerNote: checkoutNote.trim() }
              : {}),
          }),
        },
      );

      setOrderConfirmation(confirmation);
      setCart([]);
      setCheckoutNote("");
      setOrderAttemptKey("");
    } catch (error) {
      console.error("KORA_MARKETPLACE_ORDER_FAILURE", error);

      if (
        error &&
        typeof error === "object" &&
        "status" in error &&
        "body" in error
      ) {
        const apiError = error as {
          status?: unknown;
          body?: unknown;
          message?: unknown;
        };

        const bodyText =
          typeof apiError.body === "string"
            ? apiError.body
            : JSON.stringify(apiError.body);

        setOrderMessage(
          `Order failed (${String(apiError.status)}): ${
            typeof apiError.message === "string"
              ? apiError.message
              : "Kora could not place this order."
          }${bodyText ? ` · ${bodyText}` : ""}`,
        );
      } else {
        setOrderMessage(
          error instanceof Error && error.message
            ? error.message
            : "Kora could not place this order.",
        );
      }
    } finally {
      setOrderSubmitting(false);
    }
  }

  async function openBooking(service: Service) {
    if (!selectedBranchId) return;

    setBookingService(service);
    setBookingProviders([]);
    setBookingProviderId("");
    setBookingAvailability(null);
    setBookingSlot(null);
    setBookingConfirmation(null);
    setBookingMessage("");
    setBookingLoading(true);

    try {
      const providers = await koraData<BookingProvider[]>(
        `/discovery/businesses/${encodeURIComponent(slug)}/branches/${encodeURIComponent(selectedBranchId)}/services/${encodeURIComponent(service.id)}/providers`,
      );
      setBookingProviders(Array.isArray(providers) ? providers : []);
    } catch (error) {
      setBookingMessage(errorText(error));
    } finally {
      setBookingLoading(false);
    }
  }

  function closeBooking() {
    if (bookingSubmitting) return;
    setBookingService(null);
    setBookingProviders([]);
    setBookingProviderId("");
    setBookingAvailability(null);
    setBookingSlot(null);
    setBookingMessage("");
    setBookingConfirmation(null);
  }

  async function loadBookingAvailability() {
    if (!bookingService || !selectedBranchId || !bookingDate) return;

    setBookingLoading(true);
    setBookingMessage("");
    setBookingSlot(null);

    try {
      const query = new URLSearchParams({
        serviceIds: bookingService.id,
        date: bookingDate,
      });

      if (bookingProviderId) {
        query.set("staffProfileId", bookingProviderId);
      }

      const availability = await koraData<BookingAvailability>(
        `/discovery/businesses/${encodeURIComponent(slug)}/branches/${encodeURIComponent(selectedBranchId)}/availability?${query.toString()}`,
      );

      setBookingAvailability(availability);
    } catch (error) {
      setBookingAvailability(null);
      setBookingMessage(errorText(error));
    } finally {
      setBookingLoading(false);
    }
  }

  async function confirmBooking() {
    if (!bookingService || !selectedBranchId || !bookingSlot) return;

    setBookingSubmitting(true);
    setBookingMessage("");

    try {
      const confirmation = await koraData<BookingConfirmation>(
        "/me/appointments",
        {
          method: "POST",
          body: JSON.stringify({
            businessSlug: slug,
            branchId: selectedBranchId,
            serviceIds: [bookingService.id],
            ...(bookingProviderId
              ? { staffProfileId: bookingProviderId }
              : {}),
            startAt: bookingSlot.startAt,
            idempotencyKey: bookingIdempotencyKey(),
          }),
        },
      );

      setBookingConfirmation(confirmation);
      setBookingAvailability(null);
      setBookingSlot(null);
    } catch (error) {
      setBookingMessage(errorText(error));
    } finally {
      setBookingSubmitting(false);
    }
  }

  const bookingSlots =
    bookingAvailability?.days.find((day) => day.date === bookingDate)?.slots ?? [];

  if (loading) {
    return (
      <main className="storefront-app">
        <div className="storefront-loading">
          <div className="marketplace-loader" />
          <strong>Opening storefront…</strong>
        </div>
      </main>
    );
  }

  if (!business) {
    return (
      <main className="storefront-app">
        <div className="storefront-not-found">
          <span>K</span>
          <h1>Storefront unavailable</h1>
          <p>{message || "This business is not currently available on Kora."}</p>
          <Link href="/marketplace">Back to Marketplace</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="storefront-app">
      <header className="storefront-topbar">
        <Link href="/marketplace" className="marketplace-brand">
          <Image
            src="/brand/kora-app-icon.png"
            alt="Kora"
            width={40}
            height={40}
            priority
          />
          <div>
            <strong>Kora</strong>
            <span>Marketplace</span>
          </div>
        </Link>

        <div className="storefront-topbar-actions">
          <button
            type="button"
            className="storefront-cart-trigger"
            onClick={() => setCartOpen(true)}
          >
            <span>Cart</span>
            <strong>{cartQuantity}</strong>
          </button>

          <Link href="/marketplace" className="storefront-back">
            ← Explore Marketplace
          </Link>
        </div>
      </header>

      <section
        className="storefront-cover"
        style={
          business.coverImageUrl
            ? {
                backgroundImage: `linear-gradient(90deg, rgba(4,10,18,.96), rgba(4,10,18,.68) 55%, rgba(4,10,18,.25)), url("${business.coverImageUrl}")`,
              }
            : undefined
        }
      >
        <div className="storefront-cover-glow" />

        <div className="storefront-identity">
          <div className="storefront-logo">
            {business.logoImageUrl ? (
              <img src={business.logoImageUrl} alt="" />
            ) : (
              <span>{initials(business.displayName) || "K"}</span>
            )}
          </div>

          <div className="storefront-identity-copy">
            <div className="storefront-eyebrow">
              <span>KORA BUSINESS</span>
              {business.verificationStatus === "VERIFIED" && (
                <strong>✓ Verified</strong>
              )}
            </div>

            <h1>{business.displayName}</h1>

            <div className="storefront-categories">
              {business.categories.map((category) => (
                <span key={category}>{category}</span>
              ))}
            </div>

            {business.description && <p>{business.description}</p>}
          </div>
        </div>
      </section>

      <section className="storefront-controlbar">
        <div className="storefront-tabs">
          <button
            className={tab === "overview" ? "is-active" : ""}
            onClick={() => setTab("overview")}
            type="button"
          >
            Overview
          </button>

          <button
            className={tab === "services" ? "is-active" : ""}
            onClick={() => setTab("services")}
            type="button"
          >
            Services
            {services.length > 0 && <span>{services.length}</span>}
          </button>

          <button
            className={tab === "products" ? "is-active" : ""}
            onClick={() => setTab("products")}
            type="button"
          >
            Products
            {products.length > 0 && <span>{products.length}</span>}
          </button>
        </div>

        {branches.length > 0 && (
          <label className="storefront-branch-select">
            <span>Location</span>
            <select
              value={selectedBranchId}
              onChange={(event) => {
                setSelectedBranchId(event.target.value);
                setOrderAttemptKey("");
              }}
              disabled={hasBranchQrContext}
            >
              {branches.map((branch) => (
                <option key={branch.branchId} value={branch.branchId}>
                  {branch.name}
                  {branch.city ? ` · ${branch.city}` : ""}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      {message && (
        <div className="storefront-message" role="alert">
          {message}
        </div>
      )}

      <section className="storefront-main">
        {tab === "overview" && (
          <>
            <div className="storefront-overview-grid">
              <article className="storefront-overview-card storefront-overview-primary">
                <span className="storefront-label">WELCOME</span>
                <h2>Everything from {business.displayName}, in one place.</h2>
                <p>
                  Explore services, discover products and choose the Kora
                  experience that works for you.
                </p>

                <div className="storefront-overview-actions">
                  {services.length > 0 && (
                    <button type="button" onClick={() => setTab("services")}>
                      Explore services
                    </button>
                  )}

                  {products.length > 0 && (
                    <button
                      type="button"
                      className="is-secondary"
                      onClick={() => setTab("products")}
                    >
                      Shop products
                    </button>
                  )}
                </div>
              </article>

              <article className="storefront-overview-card">
                <span className="storefront-label">LOCATION</span>
                <h3>{selectedBranch?.name || "Kora location"}</h3>

                <p>
                  {[
                    selectedBranch?.city,
                    selectedBranch?.region,
                    selectedBranch?.countryCode,
                  ]
                    .filter(Boolean)
                    .join(", ") || "Location details available from the business."}
                </p>

                {selectedBranch?.openingHoursNote && (
                  <div className="storefront-info-row">
                    <span>Hours</span>
                    <strong>{selectedBranch.openingHoursNote}</strong>
                  </div>
                )}

                {selectedBranch?.publicPhone && (
                  <a
                    className="storefront-contact"
                    href={`tel:${selectedBranch.publicPhone}`}
                  >
                    Call {selectedBranch.publicPhone}
                  </a>
                )}

                {selectedBranch?.publicEmail && (
                  <a
                    className="storefront-contact"
                    href={`mailto:${selectedBranch.publicEmail}`}
                  >
                    Email business
                  </a>
                )}
              </article>
            </div>

            {(services.length > 0 || products.length > 0) && (
              <div className="storefront-preview">
                <div className="storefront-section-title">
                  <div>
                    <span>DISCOVER</span>
                    <h2>Available from this business</h2>
                  </div>
                </div>

                <div className="storefront-preview-grid">
                  {services.slice(0, 3).map((service) => (
                    <button
                      key={`service-${service.id}`}
                      type="button"
                      className="storefront-preview-card"
                      onClick={() => setTab("services")}
                    >
                      <small>SERVICE</small>
                      <strong>{service.name}</strong>
                      <span>
                        {money(service.priceMinor, service.currency)} ·{" "}
                        {service.durationMinutes} min
                      </span>
                    </button>
                  ))}

                  {availableProducts.slice(0, 3).map((product) => (
                    <button
                      key={`product-${product.productId}`}
                      type="button"
                      className="storefront-preview-card"
                      onClick={() => setTab("products")}
                    >
                      <small>PRODUCT</small>
                      <strong>{product.name}</strong>
                      <span>
                        {product.variants[0]
                          ? `From ${money(
                              Math.min(
                                ...product.variants.map(
                                  (variant) => variant.sellingPriceMinor,
                                ),
                              ),
                              product.currency,
                            )}`
                          : "View product"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {tab === "services" && (
          <section>
            <div className="storefront-section-title">
              <div>
                <span>SERVICES</span>
                <h2>Choose what you need</h2>
              </div>
              <p>
                {selectedBranch
                  ? `Available at ${selectedBranch.name}`
                  : "Customer-bookable services"}
              </p>
            </div>

            {servicesLoading ? (
              <div className="storefront-empty">
                <div className="marketplace-loader" />
                <strong>Loading services…</strong>
              </div>
            ) : services.length === 0 ? (
              <div className="storefront-empty">
                <span>◇</span>
                <h3>No customer-bookable services here yet</h3>
                <p>Try another location or check back later.</p>
              </div>
            ) : (
              <div className="storefront-service-grid">
                {services.map((service) => (
                  <article key={service.id} className="storefront-service-card">
                    <div className="storefront-service-icon">
                      {service.name.charAt(0).toUpperCase()}
                    </div>

                    <div className="storefront-service-copy">
                      <span>SERVICE</span>
                      <h3>{service.name}</h3>
                      <p>
                        {service.description ||
                          "Professional service available through Kora."}
                      </p>

                      <div className="storefront-service-meta">
                        <strong>
                          {money(service.priceMinor, service.currency)}
                        </strong>
                        <span>{service.durationMinutes} min</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="storefront-primary-action"
                      onClick={() => void openBooking(service)}
                    >
                      Book
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === "products" && (
          <section>
            <div className="storefront-section-title">
              <div>
                <span>PRODUCTS</span>
                <h2>Shop this business</h2>
              </div>
              <p>
                {selectedBranch
                  ? `Availability at ${selectedBranch.name}`
                  : "Products available on Kora"}
              </p>
            </div>

            {products.length === 0 ? (
              <div className="storefront-empty">
                <span>□</span>
                <h3>No products published yet</h3>
                <p>This business has not published products to Marketplace.</p>
              </div>
            ) : availableProducts.length === 0 ? (
              <div className="storefront-empty">
                <span>□</span>
                <h3>No products available at this location</h3>
                <p>Try another branch to see its current catalogue.</p>
              </div>
            ) : (
              <div className="storefront-product-grid">
                {availableProducts.map((product) => {
                  const lowestPrice = Math.min(
                    ...product.variants.map(
                      (variant) => variant.sellingPriceMinor,
                    ),
                  );

                  return (
                    <article
                      key={product.productId}
                      className="storefront-product-card"
                    >
                      <div className="storefront-product-image">
                        {product.imageUrl ? (
                          <img src={product.imageUrl} alt={product.name} />
                        ) : (
                          <div>
                            <span>{product.name.charAt(0).toUpperCase()}</span>
                            <small>KORA PRODUCT</small>
                          </div>
                        )}

                        {product.category && (
                          <span className="storefront-product-category">
                            {product.category.name}
                          </span>
                        )}
                      </div>

                      <div className="storefront-product-copy">
                        <h3>{product.name}</h3>
                        <p>
                          {product.description ||
                            "Available from this Kora business."}
                        </p>

                        <div className="storefront-product-price">
                          <span>
                            {product.variants.length > 1 ? "From" : "Price"}
                          </span>
                          <strong>{money(lowestPrice, product.currency)}</strong>
                        </div>

                        {availableVariantsForProduct(product).length > 1 && (
                          <label className="storefront-product-variant-select">
                            <span>Choose option</span>
                            <select
                              value={
                                selectedVariantForProduct(product)?.variantId ?? ""
                              }
                              onChange={(event) =>
                                setSelectedVariants((current) => ({
                                  ...current,
                                  [product.productId]: event.target.value,
                                }))
                              }
                            >
                              {availableVariantsForProduct(product).map(
                                (variant) => (
                                  <option
                                    key={variant.variantId}
                                    value={variant.variantId}
                                  >
                                    {variant.name} ·{" "}
                                    {money(
                                      variant.sellingPriceMinor,
                                      product.currency,
                                    )}
                                  </option>
                                ),
                              )}
                            </select>
                          </label>
                        )}

                        {availableVariantsForProduct(product).length === 1 && (
                          <div className="storefront-variants">
                            <span>
                              {availableVariantsForProduct(product)[0].name}
                            </span>
                          </div>
                        )}

                        <button
                          type="button"
                          className="storefront-primary-action"
                          disabled={!selectedVariantForProduct(product)}
                          onClick={() => addProductToCart(product)}
                        >
                          Add to cart
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </section>

      {cartOpen && (
        <div
          className="kora-cart-overlay"
          role="presentation"
          onMouseDown={() => {
            if (!orderSubmitting) setCartOpen(false);
          }}
        >
          <aside
            className="kora-cart-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Kora shopping cart"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="kora-cart-head">
              <div>
                <span>KORA MARKETPLACE</span>
                <h2>{orderConfirmation ? "Order placed" : "Your cart"}</h2>
                {!orderConfirmation && (
                  <p>
                    {selectedBranch
                      ? `Pickup from ${selectedBranch.name}`
                      : business.displayName}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!orderSubmitting) setCartOpen(false);
                }}
                aria-label="Close cart"
              >
                ×
              </button>
            </div>

            {orderConfirmation ? (
              <div className="kora-order-success">
                <div className="kora-order-success-mark">✓</div>
                <span>Order received</span>
                <h3>{orderConfirmation.reference}</h3>
                <p>
                  Your order has been sent to {business.displayName}. Payment
                  will be handled by the business when your order is processed.
                </p>

                <div className="kora-order-success-grid">
                  <div>
                    <small>Status</small>
                    <strong>{orderConfirmation.status}</strong>
                  </div>
                  <div>
                    <small>Fulfilment</small>
                    <strong>Pickup</strong>
                  </div>
                  <div>
                    <small>Total</small>
                    <strong>
                      {money(
                        orderConfirmation.totalMinor,
                        orderConfirmation.currency,
                      )}
                    </strong>
                  </div>
                </div>

                <button
                  type="button"
                  className="kora-cart-primary"
                  onClick={() => {
                    setOrderConfirmation(null);
                    setCartOpen(false);
                  }}
                >
                  Continue shopping
                </button>
              </div>
            ) : cart.length === 0 ? (
              <div className="kora-cart-empty">
                <span>□</span>
                <h3>Your cart is empty</h3>
                <p>Add products from this business to start an order.</p>
                <button
                  type="button"
                  onClick={() => {
                    setCartOpen(false);
                    setTab("products");
                  }}
                >
                  Browse products
                </button>
              </div>
            ) : (
              <>
                <div className="kora-cart-items">
                  {cart.map((item) => (
                    <article
                      key={item.productVariantId}
                      className="kora-cart-item"
                    >
                      <div className="kora-cart-item-image">
                        {item.productImageUrl ? (
                          <img src={item.productImageUrl} alt="" />
                        ) : (
                          <span>{item.productName.charAt(0).toUpperCase()}</span>
                        )}
                      </div>

                      <div className="kora-cart-item-copy">
                        <strong>{item.productName}</strong>
                        <span>{item.variantName}</span>
                        <small>
                          {money(item.unitPriceMinor, item.currency)} each
                        </small>

                        <div className="kora-cart-quantity">
                          <button
                            type="button"
                            onClick={() =>
                              changeCartQuantity(
                                item.productVariantId,
                                item.quantity - 1,
                              )
                            }
                            aria-label={`Decrease ${item.productName} quantity`}
                          >
                            −
                          </button>
                          <strong>{item.quantity}</strong>
                          <button
                            type="button"
                            onClick={() =>
                              changeCartQuantity(
                                item.productVariantId,
                                item.quantity + 1,
                              )
                            }
                            aria-label={`Increase ${item.productName} quantity`}
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <div className="kora-cart-item-side">
                        <strong>
                          {money(
                            item.unitPriceMinor * item.quantity,
                            item.currency,
                          )}
                        </strong>
                        <button
                          type="button"
                          onClick={() =>
                            removeCartItem(item.productVariantId)
                          }
                        >
                          Remove
                        </button>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="kora-cart-checkout">
                  <div className="kora-cart-fulfilment">
                    <span>FULFILMENT</span>
                    <strong>Pickup at business</strong>
                    <p>
                      {selectedBranch?.name ??
                        "Selected Kora business location"}
                    </p>
                  </div>

                  <label className="kora-cart-note">
                    <span>Order note <small>Optional</small></span>
                    <textarea
                      value={checkoutNote}
                      maxLength={500}
                      onChange={(event) => setCheckoutNote(event.target.value)}
                      placeholder="Anything the business should know about this order?"
                    />
                  </label>

                  <div className="kora-cart-total">
                    <span>Subtotal</span>
                    <strong>{money(cartSubtotal, cartCurrency)}</strong>
                  </div>

                  <div className="kora-cart-payment-note">
                    <strong>Pay at business</strong>
                    <span>
                      No payment is collected online when you place this order.
                    </span>
                  </div>

                  {orderMessage && (
                    <p className="kora-cart-error">{orderMessage}</p>
                  )}

                  <button
                    type="button"
                    className="kora-cart-primary"
                    disabled={orderSubmitting}
                    onClick={() => void placeMarketplaceOrder()}
                  >
                    {orderSubmitting ? "Placing order…" : "Place order"}
                  </button>
                </div>
              </>
            )}
          </aside>
        </div>
      )}

      {bookingService && (
        <div
          className="booking-overlay"
          role="presentation"
          onMouseDown={closeBooking}
        >
          <section
            className="booking-panel"
            role="dialog"
            aria-modal="true"
            aria-label={`Book ${bookingService.name}`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="booking-panel-head">
              <div>
                <span className="booking-eyebrow">Kora Booking</span>
                <h2>
                  {bookingConfirmation
                    ? "Booking confirmed"
                    : bookingService.name}
                </h2>
                {!bookingConfirmation && selectedBranch && (
                  <p>
                    {business.displayName} · {selectedBranch.name}
                  </p>
                )}
              </div>

              <button
                type="button"
                className="booking-close"
                onClick={closeBooking}
                aria-label="Close booking"
              >
                ×
              </button>
            </div>

            {bookingConfirmation ? (
              <div className="booking-success">
                <div className="booking-success-mark">✓</div>
                <span>Appointment confirmed</span>
                <h3>{bookingConfirmation.reference}</h3>

                <p>
                  {bookingConfirmation.items
                    .map((item) => item.serviceName)
                    .join(", ")}
                </p>

                <div className="booking-confirmation-grid">
                  <div>
                    <small>Date & time</small>
                    <strong>
                      {new Intl.DateTimeFormat(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: bookingConfirmation.branchTimeZone,
                      }).format(new Date(bookingConfirmation.startAt))}
                    </strong>
                  </div>

                  <div>
                    <small>Professional</small>
                    <strong>
                      {bookingConfirmation.providerDisplayName ||
                        "Kora professional"}
                    </strong>
                  </div>

                  <div>
                    <small>Total</small>
                    <strong>
                      {money(
                        bookingConfirmation.totalPriceMinor,
                        bookingConfirmation.currency,
                      )}
                    </strong>
                  </div>
                </div>

                <div className="booking-success-actions">
                  <Link href="/marketplace">Continue exploring</Link>
                  <button type="button" onClick={closeBooking}>
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="booking-summary">
                  <div>
                    <span>Service</span>
                    <strong>{bookingService.name}</strong>
                  </div>
                  <div>
                    <span>Duration</span>
                    <strong>{bookingService.durationMinutes} min</strong>
                  </div>
                  <div>
                    <span>Price</span>
                    <strong>
                      {money(
                        bookingService.priceMinor,
                        bookingService.currency,
                      )}
                    </strong>
                  </div>
                </div>

                <div className="booking-field">
                  <label htmlFor="booking-provider">Professional</label>
                  <select
                    id="booking-provider"
                    value={bookingProviderId}
                    onChange={(event) => {
                      setBookingProviderId(event.target.value);
                      setBookingAvailability(null);
                      setBookingSlot(null);
                    }}
                    disabled={bookingLoading}
                  >
                    <option value="">Any available professional</option>
                    {bookingProviders.map((provider) => (
                      <option
                        key={provider.staffProfileId}
                        value={provider.staffProfileId}
                      >
                        {provider.displayName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="booking-field">
                  <label htmlFor="booking-date">Date</label>
                  <input
                    id="booking-date"
                    type="date"
                    min={localDateValue(new Date())}
                    value={bookingDate}
                    onChange={(event) => {
                      setBookingDate(event.target.value);
                      setBookingAvailability(null);
                      setBookingSlot(null);
                    }}
                  />
                </div>

                <button
                  type="button"
                  className="booking-check-button"
                  onClick={() => void loadBookingAvailability()}
                  disabled={bookingLoading || !bookingDate}
                >
                  {bookingLoading
                    ? "Checking availability…"
                    : "Show available times"}
                </button>

                {bookingAvailability && (
                  <div className="booking-times">
                    <div className="booking-times-head">
                      <strong>Available times</strong>
                      <span>{bookingAvailability.branchTimeZone}</span>
                    </div>

                    {bookingSlots.length > 0 ? (
                      <div className="booking-slot-grid">
                        {bookingSlots.map((slot) => {
                          const active =
                            bookingSlot?.startAt === slot.startAt &&
                            bookingSlot?.staffProfileId ===
                              slot.staffProfileId;

                          return (
                            <button
                              type="button"
                              key={`${slot.startAt}-${slot.staffProfileId}`}
                              className={active ? "is-selected" : ""}
                              onClick={() => setBookingSlot(slot)}
                            >
                              {new Intl.DateTimeFormat(undefined, {
                                hour: "numeric",
                                minute: "2-digit",
                                timeZone:
                                  bookingAvailability.branchTimeZone,
                              }).format(new Date(slot.startAt))}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="booking-empty">
                        No available times for this date. Choose another date.
                      </p>
                    )}
                  </div>
                )}

                {bookingSlot && bookingAvailability && (
                  <div className="booking-review">
                    <span>Selected appointment</span>
                    <strong>
                      {new Intl.DateTimeFormat(undefined, {
                        dateStyle: "full",
                        timeStyle: "short",
                        timeZone: bookingAvailability.branchTimeZone,
                      }).format(new Date(bookingSlot.startAt))}
                    </strong>
                    <p>
                      Total:{" "}
                      {money(
                        bookingAvailability.totalPriceMinor,
                        bookingAvailability.currency,
                      )}
                    </p>
                  </div>
                )}

                {bookingMessage && (
                  <p className="booking-error">{bookingMessage}</p>
                )}

                <button
                  type="button"
                  className="booking-confirm-button"
                  disabled={!bookingSlot || bookingSubmitting}
                  onClick={() => void confirmBooking()}
                >
                  {bookingSubmitting
                    ? "Confirming…"
                    : "Confirm appointment"}
                </button>
              </>
            )}
          </section>
        </div>
      )}

      <nav
        className="marketplace-mobile-nav storefront-mobile-nav"
        aria-label="Storefront navigation"
      >
        <button
          type="button"
          className={tab === "overview" ? "is-active" : ""}
          onClick={() => setTab("overview")}
        >
          <span>⌂</span>
          Overview
        </button>
        <button
          type="button"
          className={tab === "services" ? "is-active" : ""}
          onClick={() => setTab("services")}
        >
          <span>◇</span>
          Services
        </button>
        <button
          type="button"
          className={tab === "products" ? "is-active" : ""}
          onClick={() => setTab("products")}
        >
          <span>□</span>
          Products
        </button>
        <Link href="/marketplace">
          <span>⌕</span>
          Explore
        </Link>
      </nav>
    </main>
  );
}
