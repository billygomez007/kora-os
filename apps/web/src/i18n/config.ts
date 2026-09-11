export const locales = ["en", "fr"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";
export const localeCookieName = "KORA_LOCALE";

export const frenchFallbackCountries = new Set([
  "TG", "BJ", "CI", "SN", "BF", "ML", "NE", "GN", "GA", "CG", "CD", "CF",
]);

export const englishFallbackCountries = new Set([
  "GH", "NG", "GM", "SL", "LR", "KE", "UG", "TZ",
]);

export function isLocale(value: string | null | undefined): value is Locale {
  return locales.includes(value as Locale);
}

export function localeFromAcceptLanguage(value: string | null): Locale | null {
  if (!value) return null;

  const preferences = value
    .split(",")
    .map((part) => {
      const [tag, ...parameters] = part.trim().split(";");
      const quality = parameters
        .map((parameter) => parameter.trim().match(/^q=(0(?:\.\d+)?|1(?:\.0+)?)$/i))
        .find(Boolean)?.[1];
      return { tag: tag.toLowerCase(), quality: quality ? Number(quality) : 1 };
    })
    .filter(({ quality }) => quality > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of preferences) {
    const language = tag.split("-")[0];
    if (isLocale(language)) return language;
  }

  return null;
}

export function localeFromCountry(value: string | null): Locale | null {
  const country = value?.trim().toUpperCase();
  if (!country || country === "CM") return null;
  if (frenchFallbackCountries.has(country)) return "fr";
  if (englishFallbackCountries.has(country)) return "en";
  return null;
}

export function resolveLocale(input: {
  savedLocale?: string | null;
  acceptLanguage?: string | null;
  country?: string | null;
}): Locale {
  if (isLocale(input.savedLocale)) return input.savedLocale;
  return (
    localeFromAcceptLanguage(input.acceptLanguage ?? null) ??
    localeFromCountry(input.country ?? null) ??
    defaultLocale
  );
}
