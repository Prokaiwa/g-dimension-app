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

// Common alternate spellings / abbreviations → ISO code. Keys are in the
// normalized form produced by normName() below (lowercase, punctuation → space).
const COUNTRY_ALIASES: Record<string, string> = {
  'usa': 'US', 'us': 'US', 'u s': 'US', 'u s a': 'US',
  'america': 'US', 'united states of america': 'US', 'the united states': 'US', 'states': 'US',
  'uk': 'GB', 'u k': 'GB', 'britain': 'GB', 'great britain': 'GB',
  'england': 'GB', 'scotland': 'GB', 'wales': 'GB', 'the united kingdom': 'GB',
  'uae': 'AE', 'the uae': 'AE',
  'korea': 'KR', 'south korea': 'KR',
  'holland': 'NL', 'the netherlands': 'NL',
  'nz': 'NZ',
}

// Normalize a free-text country name: lowercase, punctuation → spaces, collapse
// runs of whitespace. So "U.S.A.", "U S A", and "usa" all converge.
function normName(s: string): string {
  return s.toLowerCase().replace(/[.\-_,]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Look up an ISO code from a free-text country name. Matches the canonical list
// first, then common aliases/abbreviations. Returns null if unrecognized.
export function codeForCountry(name: string): string | null {
  const n = normName(name)
  if (!n) return null
  const byName = COUNTRIES.find(c => normName(c.name) === n)
  if (byName) return byName.code
  return COUNTRY_ALIASES[n] ?? null
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
