"use client";

import Link from "next/link";
import QRCode from "qrcode";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import WorkspaceShell from "@/components/workspace/WorkspaceShell";
import {
  resolveActiveWorkspace,
  type ActiveWorkspace,
} from "@/lib/api/dashboard";
import { koraData } from "@/lib/api/kora-api";

type QrType =
  | "BUSINESS"
  | "BRANCH"
  | "TABLE"
  | "COUNTER"
  | "ROOM"
  | "CUSTOM";

interface BusinessQr {
  id: string;
  code: string;
  type: QrType;
  branchId: string | null;
  branchName: string | null;
  label: string | null;
  resourceKey: string | null;
  isActive: boolean;
  scanCount: string;
  lastScannedAt: string | null;
  createdAt: string;
  updatedAt: string;
  publicPath: string;
}

interface BusinessProfile {
  slug?: string | null;
  displayName?: string | null;
  logoImageUrl?: string | null;
  visibility?: string | null;
  publishedAt?: string | null;
}

interface Branch {
  id: string;
  name: string;
}

const CREATE_TYPES: Array<{
  value: Exclude<QrType, "BUSINESS">;
  label: string;
  example: string;
}> = [
  { value: "BRANCH", label: "Branch", example: "Osu Branch" },
  { value: "TABLE", label: "Table", example: "Table 1" },
  { value: "COUNTER", label: "Counter", example: "Pickup Counter" },
  { value: "ROOM", label: "Room", example: "Room 204" },
  { value: "CUSTOM", label: "Custom", example: "VIP Area" },
];

function messageOf(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong.";
}

function formatDate(value: string | null) {
  if (!value) return "No scans yet";

  try {
    return new Intl.DateTimeFormat("en-GH", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function safeFilename(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "kora"
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function QrStorefrontPage() {
  const [workspace, setWorkspace] =
    useState<ActiveWorkspace | null>(null);

  const [profile, setProfile] =
    useState<BusinessProfile | null>(null);

  const [branches, setBranches] =
    useState<Branch[]>([]);

  const [qrs, setQrs] =
    useState<BusinessQr[]>([]);

  const [selectedQrId, setSelectedQrId] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [createOpen, setCreateOpen] =
    useState(false);

  const [error, setError] =
    useState("");

  const [notice, setNotice] =
    useState("");

  const [form, setForm] = useState({
    type: "TABLE" as Exclude<QrType, "BUSINESS">,
    branchId: "",
    label: "",
    resourceKey: "",
  });

  const canvasRef =
    useRef<HTMLCanvasElement | null>(null);

  const selectedQr =
    qrs.find((qr) => qr.id === selectedQrId) ??
    qrs.find((qr) => qr.type === "BUSINESS") ??
    qrs[0] ??
    null;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const active =
        await resolveActiveWorkspace();

      setWorkspace(active);

      const [qrRows, profileResult, branchRows] =
        await Promise.all([
          koraData<BusinessQr[]>(
            `/organizations/${active.organizationId}/qr-codes`,
          ),

          koraData<BusinessProfile | null>(
            `/organizations/${active.organizationId}/business-profile`,
          ),

          koraData<Branch[]>(
            `/organizations/${active.organizationId}/branches`,
          ),
        ]);

      setQrs(qrRows);
      setProfile(profileResult);
      setBranches(branchRows);

      setSelectedQrId((current) => {
        if (
          current &&
          qrRows.some((qr) => qr.id === current)
        ) {
          return current;
        }

        return (
          qrRows.find(
            (qr) => qr.type === "BUSINESS",
          )?.id ??
          qrRows[0]?.id ??
          ""
        );
      });
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);

    return () =>
      window.clearTimeout(timer);
  }, [load]);

  const publicUrl = useMemo(() => {
    if (!selectedQr) return "";

    if (typeof window === "undefined") {
      return `https://koraafric.com${selectedQr.publicPath}`;
    }

    return `${window.location.origin}${selectedQr.publicPath}`;
  }, [selectedQr]);

  useEffect(() => {
    if (!canvasRef.current || !publicUrl) {
      return;
    }

    void QRCode.toCanvas(
      canvasRef.current,
      publicUrl,
      {
        width: 360,
        margin: 3,
        errorCorrectionLevel: "H",
        color: {
          dark: "#0b1018",
          light: "#ffffff",
        },
      },
    );
  }, [publicUrl]);

  const storefrontHref =
    profile?.slug && profile?.publishedAt
      ? `/marketplace/${profile.slug}`
      : null;

  function openCreateQr() {
    setError("");
    setNotice("");

    setForm({
      type: "TABLE",
      branchId:
        workspace?.branchId ??
        branches[0]?.id ??
        "",
      label: "",
      resourceKey: "",
    });

    setCreateOpen(true);
  }

  async function createQr() {
    if (!workspace) {
      setError(
        "Your Kora workspace is still loading.",
      );
      return;
    }

    const label = form.label.trim();

    if (!label) {
      setError(
        "Enter a name for this QR code.",
      );
      return;
    }

    const requiresBranch =
      form.type === "BRANCH" ||
      form.type === "TABLE" ||
      form.type === "COUNTER" ||
      form.type === "ROOM";

    const branchId =
      form.branchId ||
      workspace.branchId ||
      "";

    if (requiresBranch && !branchId) {
      setError(
        "Select a branch for this QR code.",
      );
      return;
    }

    try {
      setSaving(true);
      setError("");
      setNotice("");

      const created =
        await koraData<BusinessQr>(
          `/organizations/${workspace.organizationId}/qr-codes`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              type: form.type,
              label,
              ...(branchId
                ? { branchId }
                : {}),
              ...(form.resourceKey.trim()
                ? {
                    resourceKey:
                      form.resourceKey.trim(),
                  }
                : {}),
            }),
          },
        );

      setQrs((current) => [
        ...current,
        created,
      ]);

      setSelectedQrId(created.id);
      setCreateOpen(false);

      setNotice(
        `${created.label || created.type} QR created successfully.`,
      );

      setForm({
        type: "TABLE",
        branchId: workspace.branchId,
        label: "",
        resourceKey: "",
      });
    } catch (reason) {
      console.error(
        "Kora QR creation failed:",
        reason,
      );
      setError(messageOf(reason));
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(
    qr: BusinessQr,
  ) {
    if (
      !workspace ||
      qr.type === "BUSINESS"
    ) {
      return;
    }

    try {
      setError("");

      const updated =
        await koraData<BusinessQr>(
          `/organizations/${workspace.organizationId}/qr-codes/${qr.id}/status`,
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              isActive: !qr.isActive,
            }),
          },
        );

      setQrs((current) =>
        current.map((item) =>
          item.id === updated.id
            ? updated
            : item,
        ),
      );
    } catch (reason) {
      setError(messageOf(reason));
    }
  }

  async function copyLink() {
    if (!publicUrl) return;

    try {
      await navigator.clipboard.writeText(
        publicUrl,
      );

      setNotice("QR link copied.");
    } catch {
      setError(
        "Kora could not copy the link.",
      );
    }
  }

  async function downloadPng() {
    if (!selectedQr || !publicUrl) {
      return;
    }

    const dataUrl =
      await QRCode.toDataURL(publicUrl, {
        width: 1400,
        margin: 4,
        errorCorrectionLevel: "H",
      });

    const response =
      await fetch(dataUrl);

    downloadBlob(
      await response.blob(),
      `${safeFilename(
        selectedQr.label ??
          selectedQr.type,
      )}-kora-qr.png`,
    );
  }

  async function downloadSvg() {
    if (!selectedQr || !publicUrl) {
      return;
    }

    const svg =
      await QRCode.toString(publicUrl, {
        type: "svg",
        margin: 4,
        errorCorrectionLevel: "H",
      });

    downloadBlob(
      new Blob([svg], {
        type: "image/svg+xml;charset=utf-8",
      }),
      `${safeFilename(
        selectedQr.label ??
          selectedQr.type,
      )}-kora-qr.svg`,
    );
  }

  async function printQr() {
    if (
      !selectedQr ||
      !publicUrl ||
      !workspace
    ) {
      return;
    }

    const image =
      await QRCode.toDataURL(publicUrl, {
        width: 900,
        margin: 4,
        errorCorrectionLevel: "H",
      });

    const popup = window.open(
      "",
      "_blank",
      "width=700,height=900",
    );

    if (!popup) {
      setError(
        "Please allow pop-ups to print the QR.",
      );
      return;
    }

    const businessName =
      profile?.displayName ||
      workspace.organizationName;

    popup.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${businessName} — Kora QR</title>
          <style>
            body {
              margin: 0;
              padding: 48px;
              background: #f5f0e5;
              font-family: Arial, sans-serif;
              color: #0b1018;
            }

            .stand {
              width: 440px;
              max-width: calc(100vw - 80px);
              margin: 0 auto;
              padding: 42px;
              background: #ffffff;
              border-radius: 30px;
              text-align: center;
              border: 1px solid #ddd4c0;
              box-shadow: 0 30px 80px rgba(0,0,0,.12);
            }

            .kora {
              color: #a77b20;
              font-weight: 800;
              letter-spacing: 3px;
              font-size: 12px;
            }

            h1 {
              margin: 12px 0 4px;
              font-size: 31px;
            }

            .label {
              margin-bottom: 24px;
              color: #777;
              font-weight: 600;
            }

            img {
              width: 330px;
              max-width: 100%;
            }

            .scan {
              margin-top: 24px;
              font-weight: 800;
              font-size: 21px;
            }

            .sub {
              margin-top: 8px;
              color: #666;
              line-height: 1.5;
            }

            .powered {
              margin-top: 26px;
              font-size: 12px;
              font-weight: 700;
            }
          </style>
        </head>

        <body>
          <div class="stand">
            <div class="kora">
              KORA SMART STOREFRONT
            </div>

            <h1>${businessName}</h1>

            <div class="label">
              ${
                selectedQr.label ||
                selectedQr.type
              }
            </div>

            <img
              src="${image}"
              alt="Kora QR"
            />

            <div class="scan">
              Scan to order, book or explore
            </div>

            <div class="sub">
              ${
                selectedQr.type === "TABLE"
                  ? "Order directly from your table."
                  : selectedQr.type ===
                      "COUNTER"
                    ? "Scan to order or collect."
                    : selectedQr.type ===
                        "ROOM"
                      ? "Scan for this room."
                      : "Open our Kora storefront."
              }
            </div>

            <div class="powered">
              Powered by Kora OS
            </div>
          </div>

          <script>
            window.onload = () => {
              setTimeout(
                () => window.print(),
                300
              );
            };
          </script>
        </body>
      </html>
    `);

    popup.document.close();
  }

  return (
    <WorkspaceShell
      title="QR & Storefront"
      actions={
        <>
          <button
            type="button"
            className="workspace-secondary-button"
            onClick={openCreateQr}
          >
            + Create QR
          </button>

          <button
            type="button"
            className="workspace-refresh-button"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading
              ? "Loading..."
              : "Refresh"}
          </button>
        </>
      }
    >
      <div className="qr-workspace">
        <section className="qr-hero">
          <div>
            <span className="qr-eyebrow">
              KORA SMART STOREFRONT
            </span>

            <h1>
              Your business. Everywhere
              customers are.
            </h1>

            <p>
              Create permanent QR
              touchpoints for your
              storefront, branches, tables,
              counters, rooms and other
              customer locations.
            </p>
          </div>

          <div className="qr-hero-badge">
            <span>SCAN</span>
            <strong>QR</strong>
            <small>KORA OS</small>
          </div>
        </section>

        {error ? (
          <div className="workspace-error">
            {error}
          </div>
        ) : null}

        {notice ? (
          <div className="workspace-notice">
            {notice}
          </div>
        ) : null}

        {loading && qrs.length === 0 ? (
          <section className="qr-loading-card">
            <strong>
              Loading your QR codes...
            </strong>
            <span>
              Kora is connecting to your
              workspace.
            </span>
          </section>
        ) : null}

        {!loading &&
        selectedQr &&
        workspace ? (
          <>
            <section className="qr-dashboard-grid">
              <article className="qr-primary-card">
                <div className="qr-card-head">
                  <div>
                    <span>
                      {selectedQr.type} QR
                    </span>

                    <h2>
                      {selectedQr.label ||
                        profile?.displayName ||
                        workspace.organizationName}
                    </h2>
                  </div>

                  <div
                    className={
                      selectedQr.isActive
                        ? "qr-live"
                        : "qr-inactive"
                    }
                  >
                    <i />
                    {selectedQr.isActive
                      ? "Live"
                      : "Inactive"}
                  </div>
                </div>

                <div className="qr-real-code">
                  <canvas ref={canvasRef} />

                  <strong>
                    {profile?.displayName ||
                      workspace.organizationName}
                  </strong>

                  <span>
                    {selectedQr.label ||
                      selectedQr.type}
                  </span>

                  <small>
                    Scan with any phone
                    camera
                  </small>
                </div>

                <div className="qr-actions">
                  <button
                    type="button"
                    onClick={() =>
                      void copyLink()
                    }
                  >
                    Copy link
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void downloadPng()
                    }
                  >
                    Download PNG
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void downloadSvg()
                    }
                  >
                    Download SVG
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void printQr()
                    }
                  >
                    Print QR
                  </button>

                  {storefrontHref ? (
                    <Link
                      href={storefrontHref}
                    >
                      Open storefront
                    </Link>
                  ) : (
                    <Link href="/app/settings">
                      Publish storefront
                    </Link>
                  )}
                </div>
              </article>

              <div className="qr-side-column">
                <article className="qr-stat-card">
                  <span>TOTAL SCANS</span>
                  <strong>
                    {selectedQr.scanCount}
                  </strong>
                  <p>
                    Successful Kora QR
                    scans.
                  </p>
                </article>

                <article className="qr-info-card">
                  <span>LAST SCANNED</span>
                  <strong>
                    {formatDate(
                      selectedQr.lastScannedAt,
                    )}
                  </strong>
                </article>

                <article className="qr-info-card">
                  <span>PERMANENT LINK</span>
                  <strong>
                    {publicUrl}
                  </strong>
                </article>
              </div>
            </section>

            <section className="qr-tools-section">
              <div className="qr-section-heading">
                <div>
                  <span>
                    YOUR QR COLLECTION
                  </span>

                  <h2>
                    Business, branches,
                    tables, counters and
                    rooms.
                  </h2>
                </div>
              </div>

              <div className="qr-collection-grid">
                {qrs.map((item) => (
                  <article
                    key={item.id}
                    className={
                      selectedQr.id ===
                      item.id
                        ? "qr-collection-card active"
                        : "qr-collection-card"
                    }
                  >
                    <button
                      type="button"
                      className="qr-card-select"
                      onClick={() =>
                        setSelectedQrId(
                          item.id,
                        )
                      }
                    >
                      <span>
                        {item.type}
                      </span>

                      <strong>
                        {item.label ||
                          item.type}
                      </strong>

                      <small>
                        {item.branchName ||
                          "Whole business"}
                        {" · "}
                        {item.scanCount} scans
                      </small>
                    </button>

                    {item.type ===
                    "BUSINESS" ? (
                      <span className="qr-permanent-chip">
                        Permanent
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="qr-status-toggle"
                        onClick={() =>
                          void toggleStatus(
                            item,
                          )
                        }
                      >
                        {item.isActive
                          ? "Deactivate"
                          : "Activate"}
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </section>
          </>
        ) : null}

        {createOpen ? (
          <div
            className="qr-create-overlay"
            onClick={() =>
              setCreateOpen(false)
            }
          >
            <section
              className="qr-create-panel"
              onClick={(event) =>
                event.stopPropagation()
              }
            >
              <div className="qr-create-head">
                <div>
                  <span>
                    NEW CUSTOMER TOUCHPOINT
                  </span>
                  <h2>Create QR</h2>
                </div>

                <button
                  type="button"
                  aria-label="Close"
                  onClick={() =>
                    setCreateOpen(false)
                  }
                >
                  ×
                </button>
              </div>

              <label>
                QR type
                <select
                  value={form.type}
                  onChange={(event) => {
                    const type =
                      event.target
                        .value as Exclude<
                        QrType,
                        "BUSINESS"
                      >;

                    const example =
                      CREATE_TYPES.find(
                        (item) =>
                          item.value ===
                          type,
                      )?.example ?? "";

                    setForm((current) => ({
                      ...current,
                      type,
                      label:
                        current.label ||
                        example,
                    }));
                  }}
                >
                  {CREATE_TYPES.map(
                    (item) => (
                      <option
                        key={item.value}
                        value={item.value}
                      >
                        {item.label}
                      </option>
                    ),
                  )}
                </select>
              </label>

              <label>
                Name
                <input
                  value={form.label}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      label:
                        event.target.value,
                    }))
                  }
                  placeholder={
                    CREATE_TYPES.find(
                      (item) =>
                        item.value ===
                        form.type,
                    )?.example
                  }
                />
              </label>

              <label>
                Branch
                <select
                  value={form.branchId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      branchId:
                        event.target.value,
                    }))
                  }
                >
                  {form.type ===
                  "CUSTOM" ? (
                    <option value="">
                      Whole business
                    </option>
                  ) : null}

                  {branches.map(
                    (branch) => (
                      <option
                        key={branch.id}
                        value={branch.id}
                      >
                        {branch.name}
                      </option>
                    ),
                  )}
                </select>
              </label>

              <label>
                Reference / resource key
                <input
                  value={form.resourceKey}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      resourceKey:
                        event.target.value,
                    }))
                  }
                  placeholder={
                    form.type === "TABLE"
                      ? "table-1"
                      : form.type ===
                          "COUNTER"
                        ? "counter-a"
                        : form.type ===
                            "ROOM"
                          ? "room-204"
                          : form.type ===
                              "BRANCH"
                            ? "osu"
                            : "vip-area"
                  }
                />

                <small>
                  This tells Kora which
                  table, room, counter or
                  location the customer
                  scanned from.
                </small>
              </label>

              <div className="qr-create-actions">
                <button
                  type="button"
                  className="qr-create-cancel"
                  onClick={() =>
                    setCreateOpen(false)
                  }
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="qr-create-submit"
                  disabled={saving}
                  onClick={() =>
                    void createQr()
                  }
                >
                  {saving
                    ? "Creating..."
                    : "Create QR"}
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </WorkspaceShell>
  );
}
