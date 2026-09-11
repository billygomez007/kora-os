"use client";

import Link from "next/link";
import { useState } from "react";
import {
  formatGhsMinor,
  type PublicPricingPlan,
} from "@/lib/pricing";

type Plan = {
  code: PublicPricingPlan;
  label: string;
  name: string;
  body: string;
  cta: string;
  href: string;
  monthlyAmountMinor: number | null;
  annualAmountMinor: number | null;
  annualBeforeAmountMinor: number | null;
  items: string[];
};

type Props = {
  plans: Plan[];
  monthlyLabel: string;
  annualLabel: string;
  saveAnnualLabel: string;
  perMonthLabel: string;
  perYearLabel: string;
  customLabel: string;
  toggleLabel: string;
  pricingNote: string;
};

export default function PricingPlanGrid({
  plans,
  monthlyLabel,
  annualLabel,
  saveAnnualLabel,
  perMonthLabel,
  perYearLabel,
  customLabel,
  toggleLabel,
  pricingNote,
}: Props) {
  const [annual, setAnnual] = useState(false);

  return (
    <>
      <div className="public-content-pricing-toggle" role="group" aria-label={toggleLabel}>
        <button
          type="button"
          className={!annual ? "is-active" : ""}
          aria-pressed={!annual}
          onClick={() => setAnnual(false)}
        >
          {monthlyLabel}
        </button>
        <button
          type="button"
          className={annual ? "is-active" : ""}
          aria-pressed={annual}
          onClick={() => setAnnual(true)}
        >
          {annualLabel}
        </button>
      </div>

      {annual ? <p className="public-content-pricing-saving">{saveAnnualLabel}</p> : null}
      <p className="public-content-pricing-note">{pricingNote}</p>

      <div className="public-content-pricing-grid">
        {plans.map((plan) => {
          const amountMinor = annual ? plan.annualAmountMinor : plan.monthlyAmountMinor;
          const amount = formatGhsMinor(amountMinor);
          const isEnterprise = plan.code === "enterprise";
          const isFeatured = plan.code === "business";

          return (
            <article key={plan.code} className={isFeatured ? "is-featured" : ""}>
              <span className="public-content-index">{plan.label}</span>
              <h3>{plan.name}</h3>
              <p>{plan.body}</p>
              <strong>{amount ?? customLabel}</strong>
              {!isEnterprise ? <small className="public-content-pricing-period">{annual ? perYearLabel : perMonthLabel}</small> : null}
              {annual && plan.annualBeforeAmountMinor !== null ? (
                <small className="public-content-pricing-before">{formatGhsMinor(plan.annualBeforeAmountMinor)}</small>
              ) : null}
              <ul>
                {plan.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <Link className={isFeatured ? "gold-btn" : "outline-btn"} href={plan.href}>{plan.cta}</Link>
            </article>
          );
        })}
      </div>
    </>
  );
}
