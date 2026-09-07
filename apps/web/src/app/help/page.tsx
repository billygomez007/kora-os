import Link from "next/link";

export default function HelpPage() {
  return (
    <main className="utility-page">
      <div className="utility-card">
        <span>KORA HELP</span>
        <h1>How can we help?</h1>
        <p>
          Help content will cover account access, business onboarding,
          bookings, staff, queues, customers, subscriptions and marketplace
          usage.
        </p>
        <a
          className="gold-btn"
          href="mailto:support@koraafric.com?subject=Kora OS support"
        >
          Contact support
        </a>
        <Link href="/">← Back to homepage</Link>
      </div>
    </main>
  );
}
