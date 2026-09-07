import Link from "next/link";

export default function MarketplacePage() {
  return (
    <main className="utility-page">
      <div className="utility-card">
        <span>KORA MARKETPLACE</span>
        <h1>Discover and book great service businesses.</h1>
        <p>
          Kora Marketplace will use the existing public business discovery and
          booking infrastructure to help customers find businesses, services,
          branches and available appointments.
        </p>
        <Link className="gold-btn" href="/#customers">
          See customer experience
        </Link>
        <Link href="/">← Back to homepage</Link>
      </div>
    </main>
  );
}
