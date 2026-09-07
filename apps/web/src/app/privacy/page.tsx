import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="utility-page">
      <div className="utility-card">
        <span>PRIVACY</span>
        <h1>Kora OS Privacy</h1>
        <p>
          This web page will contain the official Kora privacy information for
          koraafric.com and the Kora platform.
        </p>
        <Link className="gold-btn" href="/">
          Return to Kora
        </Link>
      </div>
    </main>
  );
}
