import Link from "next/link";

export default function AboutPage() {
  return (
    <main className="utility-page">
      <div className="utility-card">
        <span>ABOUT KORA</span>
        <h1>A better operating system for service businesses.</h1>
        <p>
          Kora OS is a Realtegic platform created to connect business
          operations, staff, customers and service discovery in one system.
        </p>
        <h2 id="mission">Our mission</h2>
        <p>
          Help service businesses operate with more clarity while giving
          customers a simpler way to discover and book great services.
        </p>
        <Link className="gold-btn" href="/get-started">
          Get started
        </Link>
        <Link href="/">← Back to homepage</Link>
      </div>
    </main>
  );
}
