import Link from "next/link";

export default function CareersPage() {
  return (
    <main className="utility-page">
      <div className="utility-card">
        <span>CAREERS</span>
        <h1>Build the future of service businesses with us.</h1>
        <p>
          Future Kora opportunities will be published here as the team grows.
        </p>
        <a
          className="gold-btn"
          href="mailto:hello@koraafric.com?subject=Kora OS careers"
        >
          Contact us about careers
        </a>
        <Link href="/">← Back to homepage</Link>
      </div>
    </main>
  );
}
