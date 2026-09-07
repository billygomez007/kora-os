import Link from "next/link";

export default function ResourcesPage() {
  return (
    <main className="utility-page">
      <div className="utility-card">
        <span>RESOURCES</span>
        <h1>Learn how to get more from Kora.</h1>
        <p>
          Guides, onboarding material, business playbooks and product resources
          will live here.
        </p>
        <Link className="gold-btn" href="/features">
          Explore Kora features
        </Link>
        <Link href="/">← Back to homepage</Link>
      </div>
    </main>
  );
}
