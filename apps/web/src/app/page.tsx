import Link from "next/link";
import { Logo } from "@/components/marketing/Logo";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import { getTranslations } from "next-intl/server";

async function Laptop() {
  const t = await getTranslations("Home.mockup.dashboard");
  return (
    <div className="laptop-wrap">
      <div className="laptop">
        <div className="laptop-top">
          <Logo />
          <div className="branch">{t("branch")}⌄</div>
          <div className="user-dot">A</div>
        </div>

        <div className="dashboard-layout">
          <aside>
            <div className="side-active">▣ {t("overview")}</div>
            <div>▧ {t("appointments")}</div>
            <div>♧ {t("queue")}</div>
            <div>♙ {t("customers")}</div>
            <div>♙ {t("staff")}</div>
            <div>▤ {t("payments")}</div>
            <div>▥ {t("reports")}</div>
            <div>⚙ {t("settings")}</div>
          </aside>

          <section className="dash-main">
            <h3>{t("greeting")}</h3>
            <p>{t("todaySummary")}</p>

            <div className="stats">
              <article>
                <small>{t("todayAppointments")}</small>
                <strong>18</strong>
                <span>{t("viewAll")} →</span>
              </article>
              <article>
                <small>{t("liveQueue")}</small>
                <strong>5</strong>
                <span>{t("viewQueue")} →</span>
              </article>
              <article>
                <small>{t("todayRevenue")}</small>
                <strong>₵ 2,450</strong>
                <span>{t("viewReports")} →</span>
              </article>
              <article>
                <small>{t("activeStaff")}</small>
                <strong>6</strong>
                <span>{t("viewStaff")} →</span>
              </article>
            </div>

            <div className="dash-bottom">
              <article>
                <h4>{t("upcomingAppointments")}</h4>
                <div>10:00 &nbsp; Akosua Mensah &nbsp; {t("hairTreatment")}</div>
                <div>11:30 &nbsp; Kofi Adjei &nbsp; {t("beardTrim")}</div>
                <div>13:00 &nbsp; Nana Serwaa &nbsp; {t("gelManicure")}</div>
                <div>14:30 &nbsp; Derrick Oppong &nbsp; {t("massage")}</div>
              </article>

              <article>
                <h4>{t("liveQueue")}</h4>
                <div>1 &nbsp; Ama Fritz &nbsp; {t("inService")}</div>
                <div>2 &nbsp; Kojo B. &nbsp; {t("waiting")}</div>
                <div>3 &nbsp; Esi Tetteh &nbsp; {t("waiting")}</div>
                <div>4 &nbsp; Prince A. &nbsp; {t("waiting")}</div>
              </article>
            </div>
          </section>
        </div>
      </div>
      <div className="laptop-base" />
    </div>
  );
}

async function Phone() {
  const t = await getTranslations("Home.mockup.phone");
  return (
    <div className="phone">
      <div className="phone-notch" />
      <div className="phone-inner">
        <Logo />

        <h3>
          {t("titleLineOne")}
          <br />
          {t("titleLineTwo")}
        </h3>

        <div className="phone-search">
          🔍 &nbsp; {t("search")}
        </div>

        <div className="phone-icons">
          <span>◯<small>{t("hair")}</small></span>
          <span>◯<small>{t("barber")}</small></span>
          <span>◯<small>{t("spa")}</small></span>
          <span>◯<small>{t("nails")}</small></span>
          <span>◯<small>{t("facial")}</small></span>
          <span>◯<small>{t("massage")}</small></span>
          <span>◯<small>{t("wellness")}</small></span>
          <span>•••<small>{t("more")}</small></span>
        </div>

        <div className="phone-promo">
          <div>
            <strong>{t("promoLineOne")}<br />{t("promoLineTwo")}</strong>
            <button>{t("bookNow")}</button>
          </div>
          <div className="promo-face">✦</div>
        </div>
      </div>
    </div>
  );
}

const featureCards = [
  ["▣", "smartBookings"],
  ["♙", "liveQueue"],
  ["♙", "staffCommissions"],
  ["▥", "paymentsReports"],
];

const industries = [
  "barbershops",
  "hairSalons",
  "beautyStudios",
  "spas",
  "nailStudios",
  "wellness",
  "massageStudios",
  "grooming",
];

const fullFeatures = [
  ["01", "appointments"],
  ["02", "walkIns"],
  ["03", "staffManagement"],
  ["04", "serviceCatalogue"],
  ["05", "customerManagement"],
  ["06", "transactions"],
  ["07", "commissions"],
  ["08", "reports"],
];

export default async function Home() {
  const t = await getTranslations("Home");
  return (
    <main>
      <section className="hero">
        <MarketingHeader />

        <div className="hero-inner shell">
          <div className="hero-copy">
            <span className="overline">
              {t("kicker")}
            </span>

            <h1>
              {t("title")}
              <span>{t("titleAccent")}</span>
            </h1>

            <div className="hero-value-line">
              {t("value")}
            </div>

            <p>
              {t("body")}
            </p>

            <div className="hero-actions">
              <a href="/get-started" className="gold-btn">
                {t("primaryCta")}
              </a>
              <a href="#features" className="outline-btn">
                {t("secondaryCta")}
              </a>
            </div>

            <div className="business-types">
              {t("businessTypes.salons")} <i /> {t("businessTypes.barbershops")} <i /> {t("businessTypes.spas")} <i /> {t("businessTypes.beautyStudios")} <i />
              {t("businessTypes.wellness")} <i /> {t("businessTypes.more")}
            </div>
          </div>

          <div className="hero-devices">
            <div className="gold-glow" />
            <Laptop />
            <Phone />
          </div>
        </div>
      </section>

      <section className="feature-strip">
        <div className="shell">
          <h2>{t("featureTitle")}</h2>

          <div className="feature-row">
            {featureCards.map(([icon, key]) => (
              <article key={key}>
                <div className="feature-icon">{icon}</div>
                <div>
                  <h3>{t(`featureCards.${key}.title`)}</h3>
                  <p>
                    {t(`featureCards.${key}.body`).split("\n").map((line) => (
                      <span key={line}>
                        {line}
                        <br />
                      </span>
                    ))}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="full-features" id="features">
        <div className="shell">
          <div className="section-heading light-heading">
            <span>{t("fullFeatures.kicker")}</span>
            <h2>{t("fullFeatures.title")}</h2>
            <p>{t("fullFeatures.body")}</p>
          </div>

          <div className="full-feature-grid">
            {fullFeatures.map(([number, key]) => (
              <article key={number}>
                <div className="feature-badge">{number}</div>
                <h3>{t(`fullFeatures.items.${key}.title`)}</h3>
                <p>{t(`fullFeatures.items.${key}.body`)}</p>
                <a href="/features">{t("fullFeatures.explore")} →</a>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="business-market" id="businesses">
        <div className="people-panel">
          <div className="people-message">
            {t("businessMarket.people.beauty")}
            <br />
            {t("businessMarket.people.wellness")}
            <br />
            {t("businessMarket.people.people")}
            <br />
            {t("businessMarket.people.thrive")}
            <i />
          </div>

          <div className="owner-card">
            <div className="owner-avatar">K</div>
            <strong>Kora OS</strong>
          </div>
        </div>

        <div className="business-copy">
          <h2>
            {t("businessMarket.business.titleLineOne")}
            <br />
            {t("businessMarket.business.titleLineTwo")}
          </h2>

          <ul>
            <li>
              <span>✓</span> {t("businessMarket.business.manageBranches")}
            </li>
            <li>
              <span>✓</span> {t("businessMarket.business.realTime")}
            </li>
            <li>
              <span>✓</span> {t("businessMarket.business.customerExperience")}
            </li>
          </ul>
        </div>

        <div className="marketplace" id="customers">
          <h2>{t("businessMarket.marketplace.title")}</h2>
          <p>{t("businessMarket.marketplace.body")}</p>

          <div className="market-search">
            🔍 &nbsp; {t("mockup.phone.search")}
          </div>

          <div className="chips">
            <span className="active">{t("businessMarket.marketplace.all")}</span>
            <span>{t("mockup.phone.hair")}</span>
            <span>{t("mockup.phone.barber")}</span>
            <span>{t("mockup.phone.spa")}</span>
            <span>{t("mockup.phone.nails")}</span>
            <span>{t("mockup.phone.massage")}</span>
            <span>{t("mockup.phone.wellness")}</span>
          </div>

          <div className="business-cards">
            <article>
              <div className="business-photo one" />
              <strong>The Hair Lounge</strong>
              <small>{t("businessMarket.marketplace.salonAccra")}</small>
              <Link className="availability-link" href="/marketplace">{t("businessMarket.marketplace.viewAvailability")}</Link>
            </article>

            <article>
              <div className="business-photo two" />
              <strong>Kings & Co. Barbers</strong>
              <small>{t("businessMarket.marketplace.barbershopAccra")}</small>
              <Link className="availability-link" href="/marketplace">{t("businessMarket.marketplace.viewAvailability")}</Link>
            </article>

            <article>
              <div className="business-photo three" />
              <strong>Serene Spa</strong>
              <small>{t("businessMarket.marketplace.spaAccra")}</small>
              <Link className="availability-link" href="/marketplace">{t("businessMarket.marketplace.viewAvailability")}</Link>
            </article>
          </div>
        </div>
      </section>

      <section className="industry-section">
        <div className="shell">
          <div className="section-heading dark-heading">
            <span>{t("industries.kicker")}</span>
            <h2>{t("industries.title")}</h2>
            <p>{t("industries.body")}</p>
          </div>

          <div className="industry-grid">
            {industries.map((industryKey) => (
              <article key={industryKey}>
                <div className="industry-symbol">✦</div>
                <h3>{t(`industries.items.${industryKey}`)}</h3>
                <p>{t("industries.itemBody")}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="operations-section">
        <div className="shell operations-grid">
          <div>
            <span className="section-label">{t("operations.kicker")}</span>
            <h2>{t("operations.title")}</h2>
            <p>{t("operations.body")}</p>

            <div className="check-grid">
              <span>✓ {t("operations.liveBranch")}</span>
              <span>✓ {t("operations.staffAvailability")}</span>
              <span>✓ {t("operations.appointmentStatus")}</span>
              <span>✓ {t("operations.queueVisibility")}</span>
              <span>✓ {t("operations.serviceCompletion")}</span>
              <span>✓ {t("operations.businessPerformance")}</span>
            </div>
          </div>

          <div className="operations-card">
            <Laptop />
          </div>
        </div>
      </section>

      <section className="customer-journey">
        <div className="shell customer-journey-grid">
          <div className="phone-stage">
            <Phone />
          </div>

          <div>
            <span className="section-label">{t("customerJourney.kicker")}</span>
            <h2>{t("customerJourney.title")}</h2>
            <p>{t("customerJourney.body")}</p>

            <div className="journey-list">
              <article>
                <strong>01</strong>
                <div>
                  <h3>{t("customerJourney.discoverTitle")}</h3>
                  <p>{t("customerJourney.discoverBody")}</p>
                </div>
              </article>
              <article>
                <strong>02</strong>
                <div>
                  <h3>{t("customerJourney.chooseTitle")}</h3>
                  <p>{t("customerJourney.chooseBody")}</p>
                </div>
              </article>
              <article>
                <strong>03</strong>
                <div>
                  <h3>{t("customerJourney.bookTitle")}</h3>
                  <p>{t("customerJourney.bookBody")}</p>
                </div>
              </article>
            </div>

            <Link href="/marketplace" className="gold-text-link">
              {t("customerJourney.explore")} →
            </Link>
          </div>
        </div>
      </section>

      <section className="insights-section">
        <div className="shell insights-grid">
          <div>
            <span className="section-label">{t("insights.kicker")}</span>
            <h2>{t("insights.title")}</h2>
            <p>{t("insights.body")}</p>
          </div>

          <div className="insights-card">
            <div className="insight-top">
              <div>
                <small>{t("insights.revenuePerformance")}</small>
                <strong>GH₵ 28,740</strong>
              </div>
              <span>{t("insights.lastSevenDays")}</span>
            </div>

            <div className="bars">
              <i style={{ height: "38%" }} />
              <i style={{ height: "52%" }} />
              <i style={{ height: "47%" }} />
              <i style={{ height: "67%" }} />
              <i style={{ height: "61%" }} />
              <i style={{ height: "83%" }} />
              <i className="active" style={{ height: "96%" }} />
            </div>

            <div className="bar-labels">
              <span>{t("insights.days.mon")}</span>
              <span>{t("insights.days.tue")}</span>
              <span>{t("insights.days.wed")}</span>
              <span>{t("insights.days.thu")}</span>
              <span>{t("insights.days.fri")}</span>
              <span>{t("insights.days.sat")}</span>
              <span>{t("insights.days.sun")}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="pricing-preview" id="pricing">
        <div className="shell">
          <div className="section-heading light-heading">
            <span>{t("pricing.kicker")}</span>
            <h2>{t("pricing.title")}</h2>
            <p>{t("pricing.body")}</p>
          </div>

          <div className="pricing-grid">
            <article>
              <span>{t("pricing.starter.name")}</span>
              <h3>{t("pricing.starter.title")}</h3>
              <p>{t("pricing.starter.body")}</p>
              <a href="/pricing" className="outline-dark-btn">{t("pricing.starter.cta")}</a>
            </article>

            <article className="featured-plan">
              <span>{t("pricing.growth.name")}</span>
              <h3>{t("pricing.growth.title")}</h3>
              <p>{t("pricing.growth.body")}</p>
              <a href="/pricing" className="gold-btn">{t("pricing.growth.cta")}</a>
            </article>

            <article>
              <span>{t("pricing.pro.name")}</span>
              <h3>{t("pricing.pro.title")}</h3>
              <p>{t("pricing.pro.body")}</p>
              <a href="/pricing" className="outline-dark-btn">{t("pricing.pro.cta")}</a>
            </article>
          </div>
        </div>
      </section>

      <section className="security-section">
        <div className="shell security-grid">
          <div>
            <span className="section-label">{t("security.kicker")}</span>
            <h2>{t("security.title")}</h2>
            <p>{t("security.body")}</p>
          </div>

          <div className="security-cards">
            <article>
              <strong>{t("security.passwordlessTitle")}</strong>
              <p>{t("security.passwordlessBody")}</p>
            </article>
            <article>
              <strong>{t("security.isolationTitle")}</strong>
              <p>{t("security.isolationBody")}</p>
            </article>
            <article>
              <strong>{t("security.rolesTitle")}</strong>
              <p>{t("security.rolesBody")}</p>
            </article>
            <article>
              <strong>{t("security.historyTitle")}</strong>
              <p>{t("security.historyBody")}</p>
            </article>
          </div>
        </div>
      </section>

      <section className="cta-large">
        <div className="shell">
          <Logo />
          <span className="section-label">{t("finalKicker")}</span>
          <h2>{t("finalTitle")}</h2>
          <p>{t("finalBody")}</p>
          <div className="cta-large-actions">
            <a href="/get-started" className="gold-btn">{t("primaryCta")}</a>
            <a href="/contact" className="outline-btn">{t("talk")}</a>
          </div>
        </div>
      </section>

      <section className="cta">
        <div>
          <h2>{t("cta.title")}</h2>
          <a href="/get-started" className="gold-btn small-btn">
            {t("cta.button")}
          </a>
        </div>

        <div className="cta-note">
          <i />
          {t("cta.noteLineOne")}
          <br />
          {t("cta.noteLineTwo")}
          <span />
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}
