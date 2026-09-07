import Link from "next/link";

export default function ContactPage() {
  return (
    <main className="utility-page">
      <div className="utility-card">
        <span>CONTACT KORA</span>
        <h1>Talk to the Kora team.</h1>
        <p>
          Contact us about onboarding, partnerships, support, marketplace
          participation or using Kora for your service business.
        </p>
        <a className="gold-btn" href="mailto:hello@koraafric.com">
          Email Kora
        </a>
        <Link href="/">← Back to homepage</Link>
      </div>
    </main>
  );
}
