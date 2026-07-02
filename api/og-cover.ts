// Magazine-cover unfurl image for /builds/:username/featured links.
//
// api/og.js swaps in the car's raw photo as the unfurl image everywhere else,
// but Featured is the magazine island (see FEATURED.md) — its unfurl should
// look like a magazine cover, not a bare photo. This is a Vercel Edge
// Function using @vercel/og (satori) to rasterize a 1200x630 card.
//
// Deliberately a plain .ts file with satori's OBJECT element syntax — no JSX.
// A .tsx file in api/ needs the function bundler to transpile JSX, which broke
// the deploy in this non-Next project; the object form is officially supported
// by satori and removes that variable entirely.
//
// Reachable directly as a URL (crawlers fetch og:image itself, unlike
// api/og.js which is only ever hit via the /builds/* rewrite) — vercel.json
// has an explicit /api/(.*) route before the SPA fallback for this.
//
// Same graceful-fallback philosophy as api/og.js: any failure (bad username,
// missing photo, font fetch hiccup, Supabase hiccup) still renders SOME
// branded 1200x630 image with a 200. Never a 500.

import { ImageResponse } from '@vercel/og'

export const config = { runtime: 'edge' }

const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://uxqoernfrtgclpneirvc.supabase.co'
// Public anon key — already shipped in the client bundle (see api/og.js).
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4cW9lcm5mcnRnY2xwbmVpcnZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxNzY3NjEsImV4cCI6MjA5Mjc1Mjc2MX0.JPDzzgf7PqNKpQ-VUJfeA84WqIuQXBl_uNk58Nqc1-E'

// Brand tokens mirrored as literals (api/ can't import from src/tokens).
const COLOR_BRAND = '#780E12'
const COLOR_ACCENT = '#c8661a'

const WIDTH = 1200
const HEIGHT = 630

type CarRow = {
  id: string
  year: number | null
  make: string | null
  model: string | null
  variant: string | null
  nickname: string | null
  username: string
  display_name: string | null
  original_photo_url: string | null
  showcase_photo_url: string | null
  active_car_id: string | null
  created_at: string
  featured_layout: { headline?: string; deck?: string } | null
}

// Satori element in object form: { type, props: { style, children, ... } }.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type El = { type: string; props: Record<string, any> }

function el(type: string, props: Record<string, unknown>, children?: El | El[] | string): El {
  return { type, props: children === undefined ? props : { ...props, children } }
}

function carName(car: CarRow): string {
  if (car.nickname && car.nickname.trim()) return car.nickname.trim()
  return [car.year, car.make, car.model, car.variant].filter(Boolean).join(' ').trim()
}

// Featured prefers the full original photo (never the background-removed
// cutout PNG — that reads as a floating sticker on a magazine cover).
function carImage(car: CarRow): string | null {
  return car.original_photo_url || car.showcase_photo_url || null
}

// Mirrors api/og.js's resolveCar: ?car -> owner's active car -> newest public
// car. Null for private/missing (caller renders a generic branded card).
async function resolveCar(username: string, carParam: string | null): Promise<CarRow | null> {
  if (!username || !SUPABASE_ANON_KEY) return null
  const select =
    'id,year,make,model,variant,nickname,username,display_name,' +
    'original_photo_url,showcase_photo_url,active_car_id,created_at,featured_layout'
  const url =
    `${SUPABASE_URL}/rest/v1/public_car_profiles` +
    `?username=eq.${encodeURIComponent(username)}` +
    `&select=${encodeURIComponent(select)}` +
    `&order=created_at.desc`
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  })
  if (!res.ok) return null
  const rows = (await res.json()) as CarRow[]
  if (!Array.isArray(rows) || rows.length === 0) return null
  const activeId = rows[0].active_car_id
  return (
    (carParam ? rows.find(r => r.id === carParam) : null) ||
    rows.find(r => r.id === activeId) ||
    rows[0] ||
    null
  )
}

// Google Fonts serves satori-parseable TTF/woff when the UA looks legacy —
// the standard fetch-font-once trick for @vercel/og. Cached at module scope.
const LEGACY_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6; rv:2.0.1) Gecko/20100101 Firefox/4.0.1'

async function loadGoogleFont(family: string, weight: number): Promise<ArrayBuffer | null> {
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}`
    const cssRes = await fetch(cssUrl, { headers: { 'User-Agent': LEGACY_UA } })
    if (!cssRes.ok) return null
    const css = await cssRes.text()
    const match = css.match(/src: url\(([^)]+)\) format\('(?:opentype|truetype|woff)'\)/)
    if (!match) return null
    const fontRes = await fetch(match[1])
    if (!fontRes.ok) return null
    return await fontRes.arrayBuffer()
  } catch {
    return null
  }
}

type FontDef = { name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal' }
let fontsPromise: Promise<FontDef[]> | null = null

function loadFonts(): Promise<FontDef[]> {
  if (!fontsPromise) {
    fontsPromise = Promise.all([
      loadGoogleFont('Anton', 400),
      loadGoogleFont('Hanken+Grotesk', 700),
    ]).then(([anton, hanken]) => {
      const fonts: FontDef[] = []
      if (anton) fonts.push({ name: 'Anton', data: anton, weight: 400, style: 'normal' })
      if (hanken) fonts.push({ name: 'Hanken Grotesk', data: hanken, weight: 700, style: 'normal' })
      return fonts
    })
  }
  return fontsPromise
}

// ---- Card builders (satori object elements) --------------------------------

function masthead(): El {
  return el('div', {
    style: { display: 'flex', alignItems: 'center', backgroundColor: COLOR_BRAND, padding: '10px 20px' },
  }, el('span', {
    style: {
      fontFamily: 'Anton', fontSize: 26, color: '#fff5dc',
      textTransform: 'uppercase', letterSpacing: 2, transform: 'skewX(-8deg)',
    },
  }, 'G-DIMENSION'))
}

function card(imageUrl: string | null, headline: string, deck: string): El {
  const children: El[] = []

  if (imageUrl) {
    children.push(el('img', {
      src: imageUrl, width: WIDTH, height: HEIGHT,
      style: { position: 'absolute', top: 0, left: 0, width: WIDTH, height: HEIGHT, objectFit: 'cover' },
    }))
    children.push(el('div', {
      style: {
        position: 'absolute', top: 0, left: 0, width: WIDTH, height: HEIGHT, display: 'flex',
        backgroundImage: 'linear-gradient(180deg, rgba(5,5,7,0) 28%, rgba(5,5,7,0.45) 62%, rgba(5,5,7,0.92) 100%)',
      },
    }))
  }

  children.push(el('div', { style: { position: 'absolute', top: 40, left: 48, display: 'flex' } }, masthead()))

  children.push(el('div', {
    style: { position: 'absolute', left: 48, right: 48, bottom: 56, display: 'flex', flexDirection: 'column' },
  }, [
    el('div', {
      style: {
        display: 'flex', fontFamily: 'Hanken Grotesk', fontSize: 22, fontWeight: 700,
        color: COLOR_ACCENT, textTransform: 'uppercase', letterSpacing: 3, marginBottom: 14,
      },
    }, deck),
    el('div', {
      style: {
        display: 'flex', fontFamily: 'Anton', fontSize: headline.length > 22 ? 58 : 76,
        lineHeight: 0.98, color: '#f5f5f5', textTransform: 'uppercase', letterSpacing: -1,
      },
    }, headline),
  ]))

  return el('div', {
    style: {
      width: WIDTH, height: HEIGHT, display: 'flex', flexDirection: 'column',
      position: 'relative', backgroundColor: '#0d0d0f',
      backgroundImage: imageUrl ? undefined : 'radial-gradient(ellipse at 50% 40%, #202224 0%, #050505 100%)',
    },
  }, children)
}

function fallbackCard(): El {
  return el('div', {
    style: {
      width: WIDTH, height: HEIGHT, display: 'flex', flexDirection: 'column',
      alignItems: 'flex-start', justifyContent: 'flex-end', padding: 48,
      backgroundImage: 'radial-gradient(ellipse at 50% 40%, #202224 0%, #050505 100%)',
    },
  }, [
    el('div', { style: { display: 'flex', marginBottom: 24 } }, masthead()),
    el('div', { style: { display: 'flex', fontSize: 56, color: '#f5f5f5', textTransform: 'uppercase' } },
      'Your car build journal'),
  ])
}

const CACHE_HEADERS = { 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' }

export default async function handler(req: Request) {
  const url = new URL(req.url)
  const username = url.searchParams.get('u') || ''
  const carParam = url.searchParams.get('car')

  const fonts = await loadFonts()

  let car: CarRow | null = null
  try {
    car = await resolveCar(username, carParam)
  } catch {
    car = null
  }

  const headline = car
    ? (car.featured_layout?.headline?.trim() || carName(car) || 'G-Dimension')
    : 'G-Dimension'
  const deck = car
    ? (car.featured_layout?.deck?.trim() || `A build by @${car.username}`)
    : 'Your car build journal'
  const imageUrl = car ? carImage(car) : null

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new ImageResponse(card(imageUrl, headline, deck) as any, {
      width: WIDTH, height: HEIGHT, fonts, headers: CACHE_HEADERS,
    })
  } catch {
    // Last-resort branded fallback — never a 500, even if satori/font/image
    // rendering itself throws (e.g. an unreachable car photo host).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new ImageResponse(fallbackCard() as any, {
      width: WIDTH, height: HEIGHT, headers: CACHE_HEADERS,
    })
  }
}
