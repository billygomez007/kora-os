"use client";

import { useState } from "react";
import { Logo } from "./Logo";

const NAV_LINKS: Array<[string, string]> = [
  ["#features", "Features"],
  ["#businesses", "For Businesses"],
  ["#customers", "For Customers"],
  ["#pricing", "Pricing"],
  ["#resources", "Resources"],
];

export default function MarketingHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="nav shell">
      <Logo />

      <nav>
        {NAV_LINKS.map(([href, label]) => (
          <a key={href} href={href}>
            {label}
          </a>
        ))}
      </nav>

      <div className="nav-actions">
        <a href="/login">Sign in</a>
        <a className="gold-btn small-btn" href="/get-started">
          Get started
        </a>
      </div>

      <button
        type="button"
        className="nav-menu-toggle"
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        onClick={() => setOpen((current) => !current)}
      >
        <span />
        <span />
        <span />
      </button>

      {open ? (
        <div
          id="mobile-nav-panel"
          className="mobile-nav-panel"
          role="dialog"
          aria-label="Site navigation"
        >
          <nav>
            {NAV_LINKS.map(([href, label]) => (
              <a key={href} href={href} onClick={() => setOpen(false)}>
                {label}
              </a>
            ))}
          </nav>

          <div className="mobile-nav-actions">
            <a href="/login" onClick={() => setOpen(false)}>
              Sign in
            </a>
            <a
              className="gold-btn"
              href="/get-started"
              onClick={() => setOpen(false)}
            >
              Get started
            </a>
          </div>
        </div>
      ) : null}
    </header>
  );
}
