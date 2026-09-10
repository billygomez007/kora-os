import assert from "node:assert/strict";
import { test } from "node:test";
import {
  localeFromAcceptLanguage,
  localeFromCountry,
  resolveLocale,
} from "../src/i18n/config.ts";
import {
  localeInPathname,
  localizePathname,
  stripLocale,
} from "../src/i18n/routing.ts";

test("detects English from browser language", () => {
  assert.equal(localeFromAcceptLanguage("en-GB,en;q=0.9,fr;q=0.8"), "en");
});

test("detects French from browser language quality", () => {
  assert.equal(localeFromAcceptLanguage("en;q=0.5,fr-FR;q=0.9"), "fr");
});

test("recognizes an explicit locale route without redirecting it", () => {
  assert.equal(localeInPathname("/fr/marketplace/acme"), "fr");
  assert.equal(stripLocale("/fr/marketplace/acme"), "/marketplace/acme");
});

test("saved manual preference overrides browser and country", () => {
  assert.equal(
    resolveLocale({ savedLocale: "en", acceptLanguage: "fr", country: "TG" }),
    "en",
  );
});

test("unknown country falls back to English when browser is unsupported", () => {
  assert.equal(resolveLocale({ acceptLanguage: "de", country: "DE" }), "en");
});

test("Cameroon never overrides browser preference", () => {
  assert.equal(localeFromCountry("CM"), null);
  assert.equal(resolveLocale({ acceptLanguage: "en-CM", country: "CM" }), "en");
  assert.equal(resolveLocale({ acceptLanguage: "fr-CM", country: "CM" }), "fr");
});

test("locale switching preserves route and avoids duplicate locale segments", () => {
  assert.equal(localizePathname("/en/app/staff", "fr"), "/fr/app/staff");
  assert.equal(localizePathname("/app/staff", "fr"), "/fr/app/staff");
});

test("localized roots strip cleanly without creating redirect loops", () => {
  assert.equal(stripLocale("/en"), "/");
  assert.equal(localizePathname("/en", "en"), "/en");
});
