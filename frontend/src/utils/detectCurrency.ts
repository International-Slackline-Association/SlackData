// Guess the viewer's currency from the browser itself.
//
// Browser-side on purpose: it needs no infrastructure and behaves identically
// in local dev, in Cypress and in production. A hosted deployment can do better
// (CloudFront's viewer-country header, echoed by /fx/rates as
// `detected_currency`), and the context prefers that when it's there — but
// detection must not DEPEND on it, or every non-hosted environment falls back
// to a hardcoded currency and the feature looks broken.
//
// Partial by design: an unmapped region gets the default rather than a guess.

const COUNTRY_CURRENCY: Record<string, string> = {
  AT: 'EUR', BE: 'EUR', CY: 'EUR', DE: 'EUR', EE: 'EUR', ES: 'EUR', FI: 'EUR',
  FR: 'EUR', GR: 'EUR', HR: 'EUR', IE: 'EUR', IT: 'EUR', LT: 'EUR', LU: 'EUR',
  LV: 'EUR', MT: 'EUR', NL: 'EUR', PT: 'EUR', SI: 'EUR', SK: 'EUR',
  US: 'USD', GB: 'GBP', CH: 'CHF', CA: 'CAD', AU: 'AUD', NZ: 'NZD', JP: 'JPY',
  CN: 'CNY', CZ: 'CZK', PL: 'PLN', DK: 'DKK', SE: 'SEK', NO: 'SEK', IL: 'ILS',
  IN: 'INR', BR: 'BRL', MX: 'MXN', ZA: 'ZAR', RU: 'RUB', TR: 'TRY', SG: 'SGD',
  HK: 'HKD', KR: 'KRW', AR: 'ARS', CL: 'CLP', CO: 'COP', PE: 'PEN', BO: 'BOB',
  UA: 'UAH',
}

// Enough zones to cover the regions a locale often fails to name — a browser
// set to plain "en" still reports a real time zone.
const TIMEZONE_COUNTRY: Record<string, string> = {
  'Europe/Berlin': 'DE', 'Europe/Vienna': 'AT', 'Europe/Paris': 'FR',
  'Europe/Madrid': 'ES', 'Europe/Rome': 'IT', 'Europe/Amsterdam': 'NL',
  'Europe/Brussels': 'BE', 'Europe/Lisbon': 'PT', 'Europe/Dublin': 'IE',
  'Europe/Helsinki': 'FI', 'Europe/Athens': 'GR', 'Europe/Bratislava': 'SK',
  'Europe/Ljubljana': 'SI', 'Europe/Zagreb': 'HR', 'Europe/Tallinn': 'EE',
  'Europe/Riga': 'LV', 'Europe/Vilnius': 'LT', 'Europe/Luxembourg': 'LU',
  'Europe/London': 'GB', 'Europe/Zurich': 'CH', 'Europe/Prague': 'CZ',
  'Europe/Warsaw': 'PL', 'Europe/Copenhagen': 'DK', 'Europe/Stockholm': 'SE',
  'Europe/Oslo': 'NO', 'Europe/Moscow': 'RU', 'Europe/Kyiv': 'UA',
  'Europe/Istanbul': 'TR',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
  'America/Los_Angeles': 'US', 'America/Phoenix': 'US', 'America/Anchorage': 'US',
  'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA',
  'America/Mexico_City': 'MX', 'America/Sao_Paulo': 'BR', 'America/Santiago': 'CL',
  'America/Bogota': 'CO', 'America/Lima': 'PE', 'America/Argentina/Buenos_Aires': 'AR',
  'Asia/Tokyo': 'JP', 'Asia/Shanghai': 'CN', 'Asia/Hong_Kong': 'HK',
  'Asia/Singapore': 'SG', 'Asia/Seoul': 'KR', 'Asia/Kolkata': 'IN',
  'Asia/Calcutta': 'IN', 'Asia/Jerusalem': 'IL', 'Asia/Tel_Aviv': 'IL',
  'Africa/Johannesburg': 'ZA',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Perth': 'AU',
  'Pacific/Auckland': 'NZ',
}

export const DEFAULT_CURRENCY = 'USD'

// "en-US" → "US", "de" → undefined, "zh-Hans-CN" → "CN".
function regionOf(locale: string | undefined): string | undefined {
  if (!locale) return undefined
  const region = locale.split('-').find(part => /^[A-Za-z]{2}$/.test(part) && part === part.toUpperCase())
  return region?.toUpperCase()
}

export function detectCountry(): string | undefined {
  const fromLanguage = regionOf(typeof navigator === 'undefined' ? undefined : navigator.language)
  if (fromLanguage) return fromLanguage

  try {
    const resolved = new Intl.DateTimeFormat().resolvedOptions()
    const fromLocale = regionOf(resolved.locale)
    if (fromLocale) return fromLocale
    if (resolved.timeZone && TIMEZONE_COUNTRY[resolved.timeZone]) {
      return TIMEZONE_COUNTRY[resolved.timeZone]
    }
  } catch {
    // Intl is unavailable — fall through to the default.
  }
  return undefined
}

export function currencyForCountry(country: string | undefined | null): string | undefined {
  return country ? COUNTRY_CURRENCY[country.toUpperCase()] : undefined
}

/** The viewer's likely currency. Always returns something — `DEFAULT_CURRENCY` when unsure. */
export function detectCurrency(): string {
  return currencyForCountry(detectCountry()) ?? DEFAULT_CURRENCY
}
