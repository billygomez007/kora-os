import Link from "next/link";

export default function FeaturesPage() {
  return (
    <main className="utility-page">
      <div className="utility-card">
        <span>KORA FEATURES</span>
        <h1>Everything your service business needs.</h1>
        <p>
          Appointments, walk-ins, live queues, staff, service catalogues,
          customers, transactions, commissions, reporting and business
          visibility are being brought together in Kora.
        </p>
        <Link className="gold-btn" href="/#features">
          Explore homepage features
        </Link>
        <Link href="/">← Back to homepage</Link>
      </div>
    </main>
  );
}
