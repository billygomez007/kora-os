import Link from "next/link";

export default function PricingPage() {
  return (
    <main className="utility-page">
      <div className="utility-card">
        <span>KORA PRICING</span>
        <h1>Pricing designed to grow with your business.</h1>
        <p>
          Starter, Growth and Pro plans will support businesses from small
          teams through multi-location operators.
        </p>
        <a
          className="gold-btn"
          href="mailto:hello@koraafric.com?subject=Kora OS pricing"
        >
          Ask about Kora pricing
        </a>
        <Link href="/#pricing">← Back to pricing overview</Link>
      </div>
    </main>
  );
}
