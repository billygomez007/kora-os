"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { koraData } from "@/lib/api/kora-api";

interface CustomerProfile {
  id: string;
  displayName: string;
  email: string | null;
  phoneE164: string | null;
  city: string | null;
  area: string | null;
}

interface Category {
  code: string;
  name: string;
}

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

interface BusinessPage {
  data: Business[];
  page: {
    hasMore: boolean;
    nextCursor: string | null;
  };
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "Kora could not load the marketplace. Please try again.";
}

export default function MarketplacePage() {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [favorites, setFavorites] = useState<Business[]>([]);
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");

  const favoriteIds = useMemo(
    () => new Set(favorites.map((business) => business.organizationId)),
    [favorites],
  );

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setLoading(true);
      setMessage("");

      try {
        const [customer, categoryRows, businessPage, favoriteRows] =
          await Promise.all([
            koraData<CustomerProfile>("/me/customer-profile"),
            koraData<Category[]>("/discovery/categories"),
            koraData<BusinessPage>("/discovery/businesses?limit=20"),
            koraData<Business[]>("/me/favorites"),
          ]);

        if (cancelled) return;

        setProfile(customer);
        setCategories(Array.isArray(categoryRows) ? categoryRows : []);
        setBusinesses(
          Array.isArray(businessPage)
            ? businessPage
            : Array.isArray(businessPage?.data)
              ? businessPage.data
              : [],
        );
        setFavorites(Array.isArray(favoriteRows) ? favoriteRows : []);
      } catch (error) {
        if (!cancelled) setMessage(errorMessage(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  async function loadBusinesses(text: string, category: string) {
    setSearching(true);
    setMessage("");

    const params = new URLSearchParams();
    params.set("limit", "20");

    if (text.trim()) params.set("text", text.trim());
    if (category) params.set("category", category);

    if (profile?.city) params.set("city", profile.city);

    try {
      let result = await koraData<BusinessPage>(
        `/discovery/businesses?${params.toString()}`,
      );

      if (
        result.data.length === 0 &&
        profile?.city &&
        (text.trim() || category)
      ) {
        params.delete("city");
        result = await koraData<BusinessPage>(
          `/discovery/businesses?${params.toString()}`,
        );
      }

      setBusinesses(
        Array.isArray(result)
          ? result
          : Array.isArray(result?.data)
            ? result.data
            : [],
      );
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setSearching(false);
    }
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActiveQuery(query.trim());
    await loadBusinesses(query, activeCategory);
  }

  async function chooseCategory(code: string) {
    const next = activeCategory === code ? "" : code;
    setActiveCategory(next);
    await loadBusinesses(activeQuery, next);
  }

  async function toggleFavorite(business: Business) {
    const isFavorite = favoriteIds.has(business.organizationId);

    try {
      await koraData<{ favorited: boolean }>(
        `/me/favorites/${business.organizationId}`,
        { method: isFavorite ? "DELETE" : "POST" },
      );

      setFavorites((current) =>
        isFavorite
          ? current.filter(
              (item) => item.organizationId !== business.organizationId,
            )
          : [business, ...current],
      );
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  const firstName =
    profile?.displayName?.trim().split(/\s+/)[0] || "there";

  return (
    <main className="marketplace-app">
      <header className="marketplace-header">
        <Link href="/marketplace" className="marketplace-brand">
          <Image
            src="/brand/kora-app-icon.png"
            alt="Kora"
            width={42}
            height={42}
            priority
          />
          <div>
            <strong>Kora</strong>
            <span>Marketplace</span>
          </div>
        </Link>

        <nav className="marketplace-desktop-nav" aria-label="Customer navigation">
          <Link className="is-active" href="/marketplace">Home</Link>
          <a href="#explore">Explore</a>
          <a href="#favorites">Favourites</a>
        </nav>

        <div className="marketplace-profile-chip">
          <div className="marketplace-avatar">
            {initials(profile?.displayName || "Kora Customer") || "K"}
          </div>
          <div>
            <span>Customer</span>
            <strong>{profile?.displayName || "My Kora"}</strong>
          </div>
        </div>
      </header>

      <section className="marketplace-hero">
        <div className="marketplace-hero-copy">
          <span className="marketplace-kicker">DISCOVER • BOOK • GO</span>
          <h1>
            Hello, {firstName}.
            <br />
            <em>What do you need today?</em>
          </h1>
          <p>
            Discover trusted local businesses, book services and shop products on Kora.
          </p>

          <form className="marketplace-search" onSubmit={handleSearch}>
            <div className="marketplace-search-icon" aria-hidden="true">⌕</div>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search businesses, services or products"
              aria-label="Search businesses"
            />
            <button type="submit" disabled={searching}>
              {searching ? "Searching…" : "Search"}
            </button>
          </form>

          {(profile?.area || profile?.city) && (
            <div className="marketplace-location">
              <span>⌖</span>
              Showing businesses around{" "}
              <strong>
                {[profile.area, profile.city].filter(Boolean).join(", ")}
              </strong>
            </div>
          )}
        </div>

        <div className="marketplace-hero-art" aria-hidden="true">
          <div className="marketplace-orbit marketplace-orbit-one" />
          <div className="marketplace-orbit marketplace-orbit-two" />
          <div className="marketplace-gold-disc">
            <span>K</span>
          </div>
          <div className="marketplace-float-card marketplace-float-one">
            <span>BOOK</span>
            <strong>Your time</strong>
          </div>
          <div className="marketplace-float-card marketplace-float-two">
            <span>DISCOVER</span>
            <strong>Great services</strong>
          </div>
        </div>
      </section>

      <section className="marketplace-content" id="explore">
        <div className="marketplace-section-heading">
          <div>
            <span>EXPLORE KORA</span>
            <h2>Browse by category</h2>
          </div>
          {activeCategory && (
            <button
              type="button"
              className="marketplace-text-button"
              onClick={() => void chooseCategory("")}
            >
              Clear filter
            </button>
          )}
        </div>

        <div className="marketplace-categories">
          {categories.map((category) => (
            <button
              key={category.code}
              type="button"
              className={
                activeCategory === category.code
                  ? "marketplace-category is-active"
                  : "marketplace-category"
              }
              onClick={() => void chooseCategory(category.code)}
            >
              <span>{category.name.charAt(0).toUpperCase()}</span>
              <strong>{category.name}</strong>
            </button>
          ))}
        </div>

        {message && (
          <div className="marketplace-message" role="alert">
            {message}
          </div>
        )}

        <div className="marketplace-section-heading marketplace-business-heading">
          <div>
            <span>AVAILABLE ON KORA</span>
            <h2>
              {activeQuery
                ? `Results for “${activeQuery}”`
                : activeCategory
                  ? "Businesses in this category"
                  : "Discover businesses"}
            </h2>
          </div>
          <span className="marketplace-result-count">
            {businesses.length} {businesses.length === 1 ? "business" : "businesses"}
          </span>
        </div>

        {loading ? (
          <div className="marketplace-state">
            <div className="marketplace-loader" />
            <strong>Finding great businesses…</strong>
          </div>
        ) : businesses.length === 0 ? (
          <div className="marketplace-state">
            <span className="marketplace-state-icon">⌕</span>
            <h3>No businesses found yet</h3>
            <p>
              Try another search or category. Businesses appear here once their
              Kora profile is published.
            </p>
            {(activeQuery || activeCategory) && (
              <button
                type="button"
                className="marketplace-reset"
                onClick={() => {
                  setQuery("");
                  setActiveQuery("");
                  setActiveCategory("");
                  void loadBusinesses("", "");
                }}
              >
                Show all businesses
              </button>
            )}
          </div>
        ) : (
          <div className="marketplace-business-grid">
            {businesses.map((business) => {
              const favorited = favoriteIds.has(business.organizationId);

              return (
                <article
                  key={business.organizationId}
                  className="marketplace-business-card"
                >
                  <div
                    className="marketplace-business-cover"
                    style={
                      business.coverImageUrl
                        ? {
                            backgroundImage: `linear-gradient(180deg, transparent 25%, rgba(4, 10, 18, .86)), url("${business.coverImageUrl}")`,
                          }
                        : undefined
                    }
                  >
                    <button
                      type="button"
                      className={
                        favorited
                          ? "marketplace-heart is-active"
                          : "marketplace-heart"
                      }
                      aria-label={
                        favorited
                          ? `Remove ${business.displayName} from favourites`
                          : `Add ${business.displayName} to favourites`
                      }
                      onClick={() => void toggleFavorite(business)}
                    >
                      {favorited ? "♥" : "♡"}
                    </button>

                    <div className="marketplace-business-logo">
                      {business.logoImageUrl ? (
                        <img
                          src={business.logoImageUrl}
                          alt=""
                        />
                      ) : (
                        <span>{initials(business.displayName) || "K"}</span>
                      )}
                    </div>
                  </div>

                  <div className="marketplace-business-body">
                    <div className="marketplace-business-title">
                      <h3>{business.displayName}</h3>
                      {business.verificationStatus === "VERIFIED" && (
                        <span title="Verified business">✓</span>
                      )}
                    </div>

                    <div className="marketplace-business-categories">
                      {business.categories.slice(0, 3).map((category) => (
                        <span key={category}>{category}</span>
                      ))}
                    </div>

                    <p>
                      {business.description ||
                        "Explore this business on Kora and discover available services and products."}
                    </p>

                    <Link
                      className="marketplace-view-business"
                      href={`/marketplace/${encodeURIComponent(business.slug)}`}
                    >
                      Visit storefront <span>→</span>
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {favorites.length > 0 && (
          <section className="marketplace-favorites-section" id="favorites">
            <div className="marketplace-section-heading">
              <div>
                <span>SAVED FOR YOU</span>
                <h2>Your favourites</h2>
              </div>
            </div>

            <div className="marketplace-favorite-strip">
              {favorites.map((business) => (
                <Link
                  key={business.organizationId}
                  href={`/marketplace/${encodeURIComponent(business.slug)}`}
                  className="marketplace-favorite-item"
                >
                  <div>
                    {business.logoImageUrl ? (
                      <img src={business.logoImageUrl} alt="" />
                    ) : (
                      <span>{initials(business.displayName) || "K"}</span>
                    )}
                  </div>
                  <strong>{business.displayName}</strong>
                  <small>{business.categories[0] || "Kora business"}</small>
                </Link>
              ))}
            </div>
          </section>
        )}
      </section>

      <nav className="marketplace-mobile-nav" aria-label="Mobile customer navigation">
        <Link className="is-active" href="/marketplace">
          <span>⌂</span>
          Home
        </Link>
        <a href="#explore">
          <span>⌕</span>
          Explore
        </a>
        <a href="#favorites">
          <span>♡</span>
          Saved
        </a>
        <Link href="/customer-onboarding">
          <span>○</span>
          Profile
        </Link>
      </nav>
    </main>
  );
}
