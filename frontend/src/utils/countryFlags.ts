// Country display name -> flag image URL.
//
// Brand.country stores the Country enum's full display name ("Germany"), not an
// ISO code — see slack_data/utilities/countries.py, where the loader resolves the
// source's alpha-2 codes to enum members. The flag files are named by code, so
// this is the inverse map, and it MUST stay in sync with that enum.
//
// Flag artwork is vendored into public/flags/ from flagcdn.com (Flagpedia's
// public-domain set) rather than hotlinked, so the app has no runtime dependency
// on a third-party CDN. Same one-line hosting switch as gear images.
export const FLAG_BASE_URL = import.meta.env.VITE_IMAGE_BASE_URL ?? ''

// Mirrors _COUNTRY_BY_CODE in slack_data/utilities/countries.py (inverted).
const CODE_BY_COUNTRY: Record<string, string> = {
  Argentina: 'ar',
  Australia: 'au',
  Austria: 'at',
  Belarus: 'by',
  Belgium: 'be',
  Bolivia: 'bo',
  Brazil: 'br',
  Canada: 'ca',
  Chile: 'cl',
  China: 'cn',
  Colombia: 'co',
  'Czech Republic': 'cz',
  Denmark: 'dk',
  France: 'fr',
  Germany: 'de',
  India: 'in',
  Iran: 'ir',
  Ireland: 'ie',
  Israel: 'il',
  Italy: 'it',
  Japan: 'jp',
  Latvia: 'lv',
  Lithuania: 'lt',
  Mexico: 'mx',
  Netherlands: 'nl',
  'New Zealand': 'nz',
  Norway: 'no',
  Peru: 'pe',
  Poland: 'pl',
  Portugal: 'pt',
  Romania: 'ro',
  Russia: 'ru',
  Singapore: 'sg',
  'South Africa': 'za',
  'South Korea': 'kr',
  Spain: 'es',
  Sweden: 'se',
  Switzerland: 'ch',
  Turkey: 'tr',
  Ukraine: 'ua',
  'United Kingdom': 'gb',
  'United States': 'us',
  // Country.OTHER has no flag by definition — it falls through to null below.
}

export function countryCode(country: string | null | undefined): string | null {
  if (!country) return null
  return CODE_BY_COUNTRY[country] ?? null
}

// The flag URL for a country, or null when there's no country or no flag for it.
// Callers render nothing on null — never a placeholder or "unknown" flag.
export function flagUrl(country: string | null | undefined): string | null {
  const code = countryCode(country)
  return code ? `${FLAG_BASE_URL}/flags/${code}.png` : null
}
