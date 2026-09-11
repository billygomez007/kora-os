import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  annualAmountMinorFromMonthly,
  PUBLIC_PRICING,
} from "../src/lib/pricing.ts";

test("approved public pricing uses the exact GHS minor-unit values", () => {
  assert.deepEqual(PUBLIC_PRICING, {
    starter: { monthlyAmountMinor: 14900, annualAmountMinor: 160920 },
    business: { monthlyAmountMinor: 29900, annualAmountMinor: 322920 },
    pro: { monthlyAmountMinor: 59900, annualAmountMinor: 646920 },
    enterprise: { monthlyAmountMinor: null, annualAmountMinor: null },
  });
});

test("annual prices are exactly 90% of twelve monthly payments", () => {
  for (const plan of ["starter", "business", "pro"] as const) {
    assert.equal(
      annualAmountMinorFromMonthly(PUBLIC_PRICING[plan].monthlyAmountMinor),
      PUBLIC_PRICING[plan].annualAmountMinor,
    );
  }
});

test("public pricing copy exposes the approved plan limits in both locales", () => {
  const root = join(
    process.cwd().endsWith("apps/web") ? process.cwd() : join(process.cwd(), "apps/web"),
    "messages",
  );
  const en = JSON.parse(readFileSync(join(root, "en.json"), "utf8"));
  const fr = JSON.parse(readFileSync(join(root, "fr.json"), "utf8"));
  for (const messages of [en, fr]) {
    assert.equal(messages.Pricing.plans.growth, undefined);
    assert.match(messages.Pricing.plans.starter.items.branches, /1/);
    assert.match(messages.Pricing.plans.starter.items.staff, /5/);
    assert.match(messages.Pricing.plans.business.items.branches, /3/);
    assert.match(messages.Pricing.plans.business.items.staff, /20/);
    assert.match(messages.Pricing.plans.pro.items.branches, /10/);
    assert.match(messages.Pricing.plans.pro.items.staff, /75/);
    assert.doesNotMatch(messages.Pricing.plans.enterprise.items.branches, /100/);
    assert.doesNotMatch(messages.Pricing.plans.enterprise.items.staff, /1,?000/);
  }
  assert.equal(en.Pricing.plans.business.items.branches, "Up to 3 configured branches");
  assert.equal(fr.Pricing.plans.business.items.branches, "Jusqu’à 3 établissements configurés");
});
