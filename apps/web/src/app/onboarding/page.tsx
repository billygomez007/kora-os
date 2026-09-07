"use client";

import {
  FormEvent,
  useMemo,
  useState,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getKoraSession } from "@/lib/auth/session";

interface OrganizationCreateResponse {
  data?: {
    organization?: {
      id?: string;
      name?: string;
    };
    branch?: {
      id?: string;
      name?: string;
    };
    primaryBranch?: {
      id?: string;
      name?: string;
    };
    organizationId?: string;
    branchId?: string;
  };
}

const BUSINESS_TYPES = [
  ["barbershop", "Barbershop"],
  ["salon", "Hair & beauty salon"],
  ["spa", "Spa & wellness"],
  ["nails", "Nail studio"],
  ["beauty", "Beauty business"],
  ["fitness", "Fitness & personal training"],
  ["laundry", "Laundry & cleaning"],
  ["repair", "Repair services"],
  ["professional_services", "Professional services"],
  ["service_business", "Other service business"],
];

function makeSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

function makeBranchCode(value: string): string {
  const cleaned = value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);

  return cleaned || "MAIN";
}

export default function OnboardingPage() {
  const router = useRouter();

  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("barbershop");
  const [branchName, setBranchName] = useState("Main Branch");
  const [branchCode, setBranchCode] = useState("MAIN");

  const [countryCode, setCountryCode] = useState("GH");
  const [currency, setCurrency] = useState("GHS");
  const [timeZone, setTimeZone] = useState("Africa/Accra");

  const [customSlug, setCustomSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  const [status, setStatus] =
    useState<"idle" | "loading" | "error">("idle");

  const [message, setMessage] = useState("");

  const generatedSlug = useMemo(
    () => makeSlug(businessName),
    [businessName],
  );

  const slug = slugTouched ? customSlug : generatedSlug;

  function updateCountry(value: string) {
    setCountryCode(value);

    if (value === "GH") {
      setCurrency("GHS");
      setTimeZone("Africa/Accra");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const session = getKoraSession();

    if (!session?.accessToken) {
      setStatus("error");
      setMessage(
        "Your Kora sign-in session is missing. Please sign in again.",
      );
      return;
    }

    const normalizedSlug = makeSlug(slug);

    if (!businessName.trim()) {
      setStatus("error");
      setMessage("Enter your business name.");
      return;
    }

    if (!normalizedSlug) {
      setStatus("error");
      setMessage("Enter a valid business address.");
      return;
    }

    if (!branchName.trim()) {
      setStatus("error");
      setMessage("Enter the name of your first branch.");
      return;
    }

    const apiBase = process.env.NEXT_PUBLIC_KORA_API_URL;

    if (!apiBase) {
      setStatus("error");
      setMessage("Kora is not connected to the API.");
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      const idempotencyKey = crypto.randomUUID();

      const response = await fetch(
        `${apiBase}/v1/organizations`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.accessToken}`,
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({
            name: businessName.trim(),
            slug: normalizedSlug,
            businessType,
            defaultCurrency: currency.toUpperCase(),
            timeZone,
            countryCode: countryCode.toUpperCase(),
            primaryBranch: {
              name: branchName.trim(),
              code: makeBranchCode(branchCode),
            },
          }),
        },
      );

      const payload =
        (await response.json().catch(() => null)) as
          | OrganizationCreateResponse
          | {
              message?: string;
              error?: {
                message?: string;
              };
            }
          | null;

      if (!response.ok) {
        const serverMessage =
          payload &&
          "message" in payload &&
          typeof payload.message === "string"
            ? payload.message
            : payload &&
                "error" in payload &&
                payload.error &&
                typeof payload.error.message === "string"
              ? payload.error.message
              : null;

        throw new Error(
          serverMessage ||
            "Kora could not create your business.",
        );
      }

      const data =
        payload && "data" in payload
          ? payload.data
          : undefined;

      const organizationId =
        data?.organization?.id ||
        data?.organizationId;

      const branchId =
        data?.primaryBranch?.id ||
        data?.branch?.id ||
        data?.branchId;

      if (organizationId) {
        localStorage.setItem(
          "kora.active.organizationId",
          organizationId,
        );
      }

      if (branchId) {
        localStorage.setItem(
          "kora.active.branchId",
          branchId,
        );
      }

      localStorage.setItem(
        "kora.onboarding.businessName",
        businessName.trim(),
      );

      router.replace("/app");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Kora could not create your business. Please try again.",
      );
    }
  }

  return (
    <main className="kora-onboarding-page">
      <div className="onboarding-shell">
        <header className="onboarding-topbar">
          <Link href="/" className="auth-logo">
            <Image
              src="/brand/kora-app-icon.png"
              alt="Kora OS"
              width={42}
              height={42}
              priority
            />
            <strong>Kora OS</strong>
          </Link>

          <div className="onboarding-step-label">
            Business setup
          </div>
        </header>

        <section className="onboarding-layout">
          <aside className="onboarding-intro">
            <div className="onboarding-kicker">
              WELCOME TO KORA
            </div>

            <h1>Set up your business.</h1>

            <p>
              Tell Kora a little about your business so we can
              prepare your workspace, first branch and operating
              defaults.
            </p>

            <div className="onboarding-benefits">
              <div>
                <span>01</span>
                <strong>Your business workspace</strong>
                <p>
                  One place for bookings, staff, customers,
                  payments and performance.
                </p>
              </div>

              <div>
                <span>02</span>
                <strong>Your first location</strong>
                <p>
                  Start with one branch and add more locations
                  whenever your business grows.
                </p>
              </div>

              <div>
                <span>03</span>
                <strong>Ready for your team</strong>
                <p>
                  After setup, you can add services, staff,
                  schedules and business rules.
                </p>
              </div>
            </div>
          </aside>

          <section className="onboarding-form-card">
            <div className="onboarding-form-heading">
              <span>STEP 1</span>
              <h2>Business basics</h2>
              <p>
                You can change most of these details later in
                Kora settings.
              </p>
            </div>

            <form
              className="onboarding-form"
              onSubmit={submit}
            >
              <div className="onboarding-field full">
                <label htmlFor="businessName">
                  Business name
                </label>

                <input
                  id="businessName"
                  value={businessName}
                  onChange={(event) =>
                    setBusinessName(event.target.value)
                  }
                  placeholder="e.g. Billy's Barber Studio"
                  maxLength={160}
                  required
                />
              </div>

              <div className="onboarding-field full">
                <label htmlFor="businessType">
                  What kind of business is this?
                </label>

                <select
                  id="businessType"
                  value={businessType}
                  onChange={(event) =>
                    setBusinessType(event.target.value)
                  }
                >
                  {BUSINESS_TYPES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="onboarding-field full">
                <label htmlFor="slug">
                  Kora business address
                </label>

                <div className="slug-input">
                  <span>koraafric.com/</span>

                  <input
                    id="slug"
                    value={slug}
                    onChange={(event) => {
                      setSlugTouched(true);
                      setCustomSlug(
                        makeSlug(event.target.value),
                      );
                    }}
                    placeholder="your-business"
                    maxLength={80}
                    required
                  />
                </div>

                <small>
                  This becomes your unique Kora business address.
                </small>
              </div>

              <div className="onboarding-divider">
                First location
              </div>

              <div className="onboarding-field">
                <label htmlFor="branchName">
                  Location name
                </label>

                <input
                  id="branchName"
                  value={branchName}
                  onChange={(event) =>
                    setBranchName(event.target.value)
                  }
                  placeholder="Main Branch"
                  maxLength={120}
                  required
                />
              </div>

              <div className="onboarding-field">
                <label htmlFor="branchCode">
                  Location code
                </label>

                <input
                  id="branchCode"
                  value={branchCode}
                  onChange={(event) =>
                    setBranchCode(
                      makeBranchCode(event.target.value),
                    )
                  }
                  placeholder="MAIN"
                  maxLength={20}
                  required
                />
              </div>

              <div className="onboarding-divider">
                Region & currency
              </div>

              <div className="onboarding-field">
                <label htmlFor="country">
                  Country
                </label>

                <select
                  id="country"
                  value={countryCode}
                  onChange={(event) =>
                    updateCountry(event.target.value)
                  }
                >
                  <option value="GH">Ghana</option>
                  <option value="NG">Nigeria</option>
                  <option value="KE">Kenya</option>
                  <option value="ZA">South Africa</option>
                  <option value="CM">Cameroon</option>
                  <option value="ZM">Zambia</option>
                  <option value="UG">Uganda</option>
                  <option value="TZ">Tanzania</option>
                  <option value="RW">Rwanda</option>
                  <option value="GB">United Kingdom</option>
                  <option value="US">United States</option>
                </select>
              </div>

              <div className="onboarding-field">
                <label htmlFor="currency">
                  Currency
                </label>

                <input
                  id="currency"
                  value={currency}
                  onChange={(event) =>
                    setCurrency(
                      event.target.value
                        .toUpperCase()
                        .slice(0, 3),
                    )
                  }
                  maxLength={3}
                  required
                />
              </div>

              <div className="onboarding-field full">
                <label htmlFor="timezone">
                  Time zone
                </label>

                <input
                  id="timezone"
                  value={timeZone}
                  onChange={(event) =>
                    setTimeZone(event.target.value)
                  }
                  placeholder="Africa/Accra"
                  maxLength={80}
                  required
                />
              </div>

              {status === "error" && (
                <div className="auth-error onboarding-error">
                  {message}
                </div>
              )}

              <button
                type="submit"
                className="onboarding-submit"
                disabled={status === "loading"}
              >
                {status === "loading"
                  ? "Creating your Kora workspace..."
                  : "Create my Kora workspace"}
              </button>

              <p className="onboarding-submit-note">
                Your business workspace and first location will
                be created securely in Kora.
              </p>
            </form>
          </section>
        </section>
      </div>
    </main>
  );
}
