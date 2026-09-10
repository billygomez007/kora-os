import MarketingFooter from "./MarketingFooter";
import MarketingHeader from "./MarketingHeader";

export default function CompanyPageLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="company-page">
      <div className="company-nav-wrap">
        <MarketingHeader />
      </div>
      {children}
      <MarketingFooter />
    </main>
  );
}
