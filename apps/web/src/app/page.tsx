import Link from "next/link";
import { Logo } from "@/components/marketing/Logo";
import MarketingHeader from "@/components/marketing/MarketingHeader";

function Laptop() {
  return (
    <div className="laptop-wrap">
      <div className="laptop">
        <div className="laptop-top">
          <Logo />
          <div className="branch">Accra Main Branch⌄</div>
          <div className="user-dot">A</div>
        </div>

        <div className="dashboard-layout">
          <aside>
            <div className="side-active">▣ Overview</div>
            <div>▧ Appointments</div>
            <div>♧ Queue</div>
            <div>♙ Customers</div>
            <div>♙ Staff</div>
            <div>▤ Payments</div>
            <div>▥ Reports</div>
            <div>⚙ Settings</div>
          </aside>

          <section className="dash-main">
            <h3>Good morning, Ama</h3>
            <p>Here&apos;s what&apos;s happening today.</p>

            <div className="stats">
              <article>
                <small>Today&apos;s appointments</small>
                <strong>18</strong>
                <span>View all →</span>
              </article>
              <article>
                <small>Live queue</small>
                <strong>5</strong>
                <span>View queue →</span>
              </article>
              <article>
                <small>Today&apos;s revenue</small>
                <strong>₵ 2,450</strong>
                <span>View reports →</span>
              </article>
              <article>
                <small>Active staff</small>
                <strong>6</strong>
                <span>View staff →</span>
              </article>
            </div>

            <div className="dash-bottom">
              <article>
                <h4>Upcoming appointments</h4>
                <div>10:00 &nbsp; Akosua Mensah &nbsp; Hair Treatment</div>
                <div>11:30 &nbsp; Kofi Adjei &nbsp; Beard Trim</div>
                <div>13:00 &nbsp; Nana Serwaa &nbsp; Gel Manicure</div>
                <div>14:30 &nbsp; Derrick Oppong &nbsp; Massage</div>
              </article>

              <article>
                <h4>Live queue</h4>
                <div>1 &nbsp; Ama Fritz &nbsp; In service</div>
                <div>2 &nbsp; Kojo B. &nbsp; Waiting</div>
                <div>3 &nbsp; Esi Tetteh &nbsp; Waiting</div>
                <div>4 &nbsp; Prince A. &nbsp; Waiting</div>
              </article>
            </div>
          </section>
        </div>
      </div>
      <div className="laptop-base" />
    </div>
  );
}

function Phone() {
  return (
    <div className="phone">
      <div className="phone-notch" />
      <div className="phone-inner">
        <Logo />

        <h3>
          Find and book
          <br />
          top service businesses
        </h3>

        <div className="phone-search">
          🔍 &nbsp; Search for salons, spas and more...
        </div>

        <div className="phone-icons">
          <span>◯<small>Hair</small></span>
          <span>◯<small>Barber</small></span>
          <span>◯<small>Spa</small></span>
          <span>◯<small>Nails</small></span>
          <span>◯<small>Facial</small></span>
          <span>◯<small>Massage</small></span>
          <span>◯<small>Wellness</small></span>
          <span>•••<small>More</small></span>
        </div>

        <div className="phone-promo">
          <div>
            <strong>Look good.<br />Feel amazing.</strong>
            <button>Book now</button>
          </div>
          <div className="promo-face">✦</div>
        </div>
      </div>
    </div>
  );
}

const featureCards = [
  ["▣", "Smart bookings", "Online and in-person bookings,\nall in one place."],
  ["♙", "Live queue", "Keep things moving and\ncustomers happy."],
  ["♙", "Staff & commissions", "Manage your team and\ntrack performance."],
  ["▥", "Payments & reports", "Secure payments and\nclear insights."],
];

const industries = [
  "Barbershops",
  "Hair Salons",
  "Beauty Studios",
  "Spas",
  "Nail Studios",
  "Wellness",
  "Massage Studios",
  "Grooming",
];

const fullFeatures = [
  ["01", "Appointments", "Let customers book services online and give your team a clear schedule."],
  ["02", "Walk-ins & Queue", "Manage walk-ins, waiting customers and active service sessions in real time."],
  ["03", "Staff Management", "Organise staff, availability, branches, schedules and performance."],
  ["04", "Service Catalogue", "Control services, durations, pricing, staff availability and branch offerings."],
  ["05", "Customer Management", "Keep customer profiles, service history and engagement in one place."],
  ["06", "Transactions", "Bring checkout, receipts, payments and daily business activity together."],
  ["07", "Commissions", "Track staff earnings and business commissions with clear records."],
  ["08", "Reports & Insights", "Understand revenue, demand, customer flow and business performance."],
];

export default function Home() {
  return (
    <main>
      <section className="hero">
        <MarketingHeader />

        <div className="hero-inner shell">
          <div className="hero-copy">
            <span className="overline">
              THE OPERATING SYSTEM FOR SERVICE BUSINESSES
            </span>

            <h1>
              Run your entire service
              <span>business from one place.</span>
            </h1>

            <div className="hero-value-line">
              Bookings. Staff. Customers. Payments. Growth.
            </div>

            <p>
              Kora gives you one system to manage appointments, walk-ins,
              staff, customers, payments and business performance — so you
              always know what is happening, even when you are not there.
            </p>

            <div className="hero-actions">
              <a href="/get-started" className="gold-btn">
                Start with Kora
              </a>
              <a href="#features" className="outline-btn">
                See how Kora works
              </a>
            </div>

            <div className="business-types">
              SALONS <i /> BARBERSHOPS <i /> SPAS <i /> BEAUTY STUDIOS <i />
              WELLNESS BUSINESSES <i /> AND MORE
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
          <h2>Everything your service business needs.</h2>

          <div className="feature-row">
            {featureCards.map(([icon, title, body]) => (
              <article key={title}>
                <div className="feature-icon">{icon}</div>
                <div>
                  <h3>{title}</h3>
                  <p>
                    {body.split("\n").map((line) => (
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
            <span>ONE PLATFORM. EVERYDAY CONTROL.</span>
            <h2>Everything connected. Nothing in the way.</h2>
            <p>
              Kora gives service businesses one place to manage the work,
              people, customers and money that keep the business moving.
            </p>
          </div>

          <div className="full-feature-grid">
            {fullFeatures.map(([number, title, body]) => (
              <article key={number}>
                <div className="feature-badge">{number}</div>
                <h3>{title}</h3>
                <p>{body}</p>
                <a href="/features">Explore feature →</a>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="business-market" id="businesses">
        <div className="people-panel">
          <div className="people-message">
            BEAUTY
            <br />
            WELLNESS
            <br />
            PEOPLE
            <br />
            THRIVE HERE
            <i />
          </div>

          <div className="owner-card">
            <div className="owner-avatar">K</div>
            <strong>Kora OS</strong>
          </div>
        </div>

        <div className="business-copy">
          <h2>
            Built for businesses
            <br />
            that never stand still.
          </h2>

          <ul>
            <li>
              <span>✓</span> Manage every branch
            </li>
            <li>
              <span>✓</span> Know what is happening in real time
            </li>
            <li>
              <span>✓</span> Give customers an effortless experience
            </li>
          </ul>
        </div>

        <div className="marketplace" id="customers">
          <h2>Discover. Book. Done.</h2>
          <p>Find and book amazing service businesses near you.</p>

          <div className="market-search">
            🔍 &nbsp; Search for salons, spas and more...
          </div>

          <div className="chips">
            <span className="active">All</span>
            <span>Hair</span>
            <span>Barber</span>
            <span>Spa</span>
            <span>Nails</span>
            <span>Massage</span>
            <span>Wellness</span>
          </div>

          <div className="business-cards">
            <article>
              <div className="business-photo one" />
              <strong>The Hair Lounge</strong>
              <small>Salon • Accra</small>
              <Link className="availability-link" href="/marketplace">View availability</Link>
            </article>

            <article>
              <div className="business-photo two" />
              <strong>Kings & Co. Barbers</strong>
              <small>Barbershop • Accra</small>
              <Link className="availability-link" href="/marketplace">View availability</Link>
            </article>

            <article>
              <div className="business-photo three" />
              <strong>Serene Spa</strong>
              <small>Spa • Accra</small>
              <Link className="availability-link" href="/marketplace">View availability</Link>
            </article>
          </div>
        </div>
      </section>

      <section className="industry-section">
        <div className="shell">
          <div className="section-heading dark-heading">
            <span>BUILT FOR SERVICE BUSINESSES</span>
            <h2>One operating system. Many industries.</h2>
            <p>
              Kora is designed around businesses that serve people every day,
              whether they operate from one location or many.
            </p>
          </div>

          <div className="industry-grid">
            {industries.map((industry) => (
              <article key={industry}>
                <div className="industry-symbol">✦</div>
                <h3>{industry}</h3>
                <p>
                  Manage bookings, customers, staff, services and day-to-day
                  operations with Kora.
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="operations-section">
        <div className="shell operations-grid">
          <div>
            <span className="section-label">REAL-TIME OPERATIONS</span>
            <h2>Know what is happening across your business.</h2>
            <p>
              Whether you are at the front desk, at home or managing multiple
              locations, Kora gives you clear visibility into appointments,
              queues, staff activity and business performance.
            </p>

            <div className="check-grid">
              <span>✓ Live branch activity</span>
              <span>✓ Staff availability</span>
              <span>✓ Appointment status</span>
              <span>✓ Queue visibility</span>
              <span>✓ Service completion</span>
              <span>✓ Business performance</span>
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
            <span className="section-label">FOR CUSTOMERS</span>
            <h2>Great services should be easy to discover.</h2>
            <p>
              Kora helps customers find trusted businesses, understand what
              they offer and book the right service without unnecessary
              friction.
            </p>

            <div className="journey-list">
              <article>
                <strong>01</strong>
                <div>
                  <h3>Discover nearby businesses</h3>
                  <p>Search by service, category, location and availability.</p>
                </div>
              </article>
              <article>
                <strong>02</strong>
                <div>
                  <h3>Choose with confidence</h3>
                  <p>View services, business information and available times.</p>
                </div>
              </article>
              <article>
                <strong>03</strong>
                <div>
                  <h3>Book in moments</h3>
                  <p>Select a convenient service and time directly through Kora.</p>
                </div>
              </article>
            </div>

            <Link href="/marketplace" className="gold-text-link">
              Explore the Kora marketplace →
            </Link>
          </div>
        </div>
      </section>

      <section className="insights-section">
        <div className="shell insights-grid">
          <div>
            <span className="section-label">BUSINESS INTELLIGENCE</span>
            <h2>Turn everyday activity into better decisions.</h2>
            <p>
              Kora transforms daily operations into useful business visibility,
              helping owners understand revenue, staff activity, demand and
              customer behaviour.
            </p>
          </div>

          <div className="insights-card">
            <div className="insight-top">
              <div>
                <small>Revenue performance</small>
                <strong>GH₵ 28,740</strong>
              </div>
              <span>Last 7 days</span>
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
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span>Sat</span>
              <span>Sun</span>
            </div>
          </div>
        </div>
      </section>

      <section className="pricing-preview" id="pricing">
        <div className="shell">
          <div className="section-heading light-heading">
            <span>PRICING THAT GROWS WITH YOU</span>
            <h2>Start simple. Scale when you are ready.</h2>
            <p>
              Kora plans are designed for growing service businesses, from
              independent teams to multi-location operators.
            </p>
          </div>

          <div className="pricing-grid">
            <article>
              <span>STARTER</span>
              <h3>For small teams</h3>
              <p>Core tools for bookings, staff and customer operations.</p>
              <a href="/pricing" className="outline-dark-btn">View Starter</a>
            </article>

            <article className="featured-plan">
              <span>GROWTH</span>
              <h3>For growing businesses</h3>
              <p>More automation, visibility and control across your team.</p>
              <a href="/pricing" className="gold-btn">Choose Growth</a>
            </article>

            <article>
              <span>PRO</span>
              <h3>For multi-location operators</h3>
              <p>Advanced management, reporting and business controls.</p>
              <a href="/pricing" className="outline-dark-btn">View Pro</a>
            </article>
          </div>
        </div>
      </section>

      <section className="security-section">
        <div className="shell security-grid">
          <div>
            <span className="section-label">BUILT FOR TRUST</span>
            <h2>Business-grade foundations from day one.</h2>
            <p>
              Kora is being built with secure authentication, organisation
              isolation, controlled permissions and reliable operational
              records at its core.
            </p>
          </div>

          <div className="security-cards">
            <article>
              <strong>Passwordless access</strong>
              <p>Secure email OTP authentication without reusable passwords.</p>
            </article>
            <article>
              <strong>Organisation isolation</strong>
              <p>Business data remains scoped to the correct organisation.</p>
            </article>
            <article>
              <strong>Role-based controls</strong>
              <p>Permissions control what each team member can access.</p>
            </article>
            <article>
              <strong>Operational history</strong>
              <p>Important business actions are designed around clear records.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="cta-large">
        <div className="shell">
          <Logo />
          <span className="section-label">YOUR BUSINESS. BEAUTIFULLY RUN.</span>
          <h2>Build a better service business with Kora.</h2>
          <p>
            One operating system for your team, your customers and the work
            that keeps your business moving.
          </p>
          <div className="cta-large-actions">
            <a href="/get-started" className="gold-btn">Get started with Kora</a>
            <a href="/contact" className="outline-btn">Talk to our team</a>
          </div>
        </div>
      </section>

      <section className="cta">
        <div>
          <h2>Ready to run your business with confidence?</h2>
          <a href="/get-started" className="gold-btn small-btn">
            Get started with Kora OS
          </a>
        </div>

        <div className="cta-note">
          <i />
          Better service businesses.
          <br />
          A brighter tomorrow.
          <span />
        </div>
      </section>

      <footer id="resources">
        <div className="shell footer-grid">
          <div className="footer-brand">
            <Logo />
            <p>
              The operating system for modern service businesses and the
              customers they serve.
            </p>
            <strong>koraafric.com</strong>
          </div>

          <div>
            <strong>Product</strong>
            <a href="#features">Features</a>
            <a href="#businesses">For Businesses</a>
            <a href="#customers">For Customers</a>
            <a href="#pricing">Pricing</a>
          </div>

          <div>
            <strong>Company</strong>
            <a href="/about">About us</a>
            <a href="/about#mission">Our mission</a>
            <a href="/careers">Careers</a>
            <a href="/contact">Contact</a>
          </div>

          <div>
            <strong>Support</strong>
            <a href="/help">Help center</a>
            <a href="/resources">Guides</a>
            <a href="/contact?type=support">Contact support</a>
            <a href="/privacy">Privacy policy</a>
          </div>

          <div className="footer-real">
            Developed by Realtegic Tech Solutions.
            <br />
            Built for people who keep communities moving.
          </div>
        </div>
      </footer>
    </main>
  );
}
