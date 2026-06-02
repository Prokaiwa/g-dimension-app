// Lightweight country list for the Profile location picker. Curated toward the
// app's enthusiast geography rather than an exhaustive ISO dump — enough to set
// users.country_code (char 2) so we can render a flag, with a free-text fallback
// for anywhere not listed. Codes are ISO 3166-1 alpha-2 (uppercase).
export type Country = { name: string; code: string }

export const COUNTRIES: Country[] = [
  { name: 'United States', code: 'US' },
  { name: 'Japan', code: 'JP' },
  { name: 'United Kingdom', code: 'GB' },
  { name: 'Australia', code: 'AU' },
  { name: 'New Zealand', code: 'NZ' },
  { name: 'Canada', code: 'CA' },
  { name: 'Germany', code: 'DE' },
  { name: 'France', code: 'FR' },
  { name: 'Italy', code: 'IT' },
  { name: 'Spain', code: 'ES' },
  { name: 'Netherlands', code: 'NL' },
  { name: 'Belgium', code: 'BE' },
  { name: 'Sweden', code: 'SE' },
  { name: 'Norway', code: 'NO' },
  { name: 'Denmark', code: 'DK' },
  { name: 'Finland', code: 'FI' },
  { name: 'Ireland', code: 'IE' },
  { name: 'Switzerland', code: 'CH' },
  { name: 'Austria', code: 'AT' },
  { name: 'Poland', code: 'PL' },
  { name: 'Portugal', code: 'PT' },
  { name: 'Mexico', code: 'MX' },
  { name: 'Brazil', code: 'BR' },
  { name: 'Argentina', code: 'AR' },
  { name: 'Chile', code: 'CL' },
  { name: 'South Africa', code: 'ZA' },
  { name: 'United Arab Emirates', code: 'AE' },
  { name: 'Saudi Arabia', code: 'SA' },
  { name: 'Qatar', code: 'QA' },
  { name: 'India', code: 'IN' },
  { name: 'Singapore', code: 'SG' },
  { name: 'Malaysia', code: 'MY' },
  { name: 'Thailand', code: 'TH' },
  { name: 'Indonesia', code: 'ID' },
  { name: 'Philippines', code: 'PH' },
  { name: 'South Korea', code: 'KR' },
  { name: 'Hong Kong', code: 'HK' },
  { name: 'Taiwan', code: 'TW' },
  { name: 'China', code: 'CN' },
]

// Look up an ISO code from a free-text country name (case-insensitive).
export function codeForCountry(name: string): string | null {
  const n = name.trim().toLowerCase()
  if (!n) return null
  return COUNTRIES.find(c => c.name.toLowerCase() === n)?.code ?? null
}

// Render an ISO alpha-2 code as a flag emoji via regional-indicator codepoints.
// Returns '' for anything that isn't two ASCII letters.
export function flagEmoji(code: string | null | undefined): string {
  if (!code || code.length !== 2 || !/^[a-zA-Z]{2}$/.test(code)) return ''
  const base = 0x1f1e6 // regional indicator 'A'
  const A = 'A'.charCodeAt(0)
  return String.fromCodePoint(
    ...code
      .toUpperCase()
      .split('')
      .map(ch => base + (ch.charCodeAt(0) - A)),
  )
}
