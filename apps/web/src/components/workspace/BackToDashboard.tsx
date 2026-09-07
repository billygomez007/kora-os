"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function BackToDashboard() {
  const pathname = usePathname();

  if (pathname === "/app" || !pathname.startsWith("/app/")) {
    return null;
  }

  return (
    <Link
      href="/app"
      className="kora-back-workspace"
      aria-label="Back to Kora workspace"
    >
      <span aria-hidden="true">←</span>
      <span>Back to workspace</span>

      <style jsx>{`
        .kora-back-workspace {
          position: fixed;
          z-index: 999;
          top: 18px;
          right: 24px;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 6px 2px;
          color: #52606d;
          text-decoration: none;
          font-size: 12px;
          font-weight: 650;
          letter-spacing: -0.01em;
          line-height: 1;
          transition: color 150ms ease;
        }

        .kora-back-workspace span:first-child {
          color: #b58a2c;
          font-size: 16px;
          font-weight: 500;
          transition: transform 150ms ease;
        }

        .kora-back-workspace:hover {
          color: #16263a;
        }

        .kora-back-workspace:hover span:first-child {
          transform: translateX(-2px);
        }

        .kora-back-workspace:focus-visible {
          outline: 2px solid rgba(181, 138, 44, 0.35);
          outline-offset: 5px;
          border-radius: 3px;
        }

        @media (max-width: 720px) {
          .kora-back-workspace {
            top: 12px;
            right: 14px;
            font-size: 11px;
          }
        }
      `}</style>
    </Link>
  );
}
