// Build PDF generator — Carfax-style vehicle history report in the Featured
// magazine's design language. Sections:
//   1. Cover band — G logo, car name, key stats, background-removed photo
//   2. Vehicle Identity — year/make/model/variant/VIN/mileage
//   3. Modification History — date | mileage | shop | title (+ cost if opted-in)
//   4. Maintenance History — date | mileage | shop | service details (+ cost)
//
// Drawn directly with jsPDF (vector text + embedded images, no DOM rasterizer),
// dynamically imported so the ~350 KB bundle only loads on generate.

import type { jsPDF as JsPDFClass } from 'jspdf'

// ── palette ──────────────────────────────────────────────────────────────────
const C_PAGE:   [number,number,number] = [244, 244, 242]  // warm off-white
const C_DARK:   [number,number,number] = [17, 17, 17]     // near-black
const C_INK:    [number,number,number] = [26, 26, 28]
const C_MID:    [number,number,number] = [110, 110, 116]
const C_FAINT:  [number,number,number] = [190, 190, 194]
const C_ACCENT: [number,number,number] = [200, 102, 26]   // #c8661a
const C_BURG:   [number,number,number] = [74, 20, 16]     // deep burgundy rule
const C_STRIPE: [number,number,number] = [232, 232, 228]  // zebra row bg

// ── data shapes ──────────────────────────────────────────────────────────────
export type PdfCar = {
  year: number | null
  make: string | null
  model: string | null
  variant: string | null
  vin: string | null
  current_mileage: number | null
  horsepower: number | null
  torque: number | null
  weight_lbs: number | null
  garage_photo_url: string | null     // background-removed PNG cutout
  original_photo_url?: string | null
}

export type PdfMod = {
  title: string
  brand: string | null
  category: string | null
  date_installed: string | null
  install_mileage: number | null
  installed_by: 'self' | 'shop' | null
  shop_name?: string | null
  parts_cost: number | null
  labor_cost: number | null
}

export type PdfService = {
  type: 'maintenance' | 'detail' | string
  date_performed: string
  mileage: number | null
  performed_by: 'self' | 'shop' | null
  shop_name: string | null
  title: string | null             // session title if any
  jobs: { title: string; cost: number | null }[]
  total_cost: number | null
  labor_cost: number | null
  tax_amount: number | null
  notes: string | null
}

export type PdfData = {
  car: PdfCar
  ownerName: string | null
  ownerHandle: string | null
  mods: PdfMod[]
  services: PdfService[]
  investment: number | null
  gLogoUrl: string           // base-URL for the G logo asset (Vite inlined)
  includePricing: boolean
}

// ── helpers ──────────────────────────────────────────────────────────────────
function money(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US')
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  const dt = new Date(d.slice(0,10) + 'T00:00:00')
  if (isNaN(dt.getTime())) return d
  return `${MONTHS[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`
}

async function imgToDataUrl(url: string): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) return null
    const blob = await res.blob()
    const dataUrl = await new Promise<string>((res, rej) => {
      const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(blob)
    })
    const dims = await new Promise<{ w: number; h: number }>((res, rej) => {
      const img = new Image(); img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight }); img.onerror = rej; img.src = dataUrl
    })
    return { dataUrl, ...dims }
  } catch { return null }
}

// ── main generator ────────────────────────────────────────────────────────────
export async function generateBuildPdf(data: PdfData): Promise<JsPDFClass> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const PW = doc.internal.pageSize.getWidth()   // 210 mm
  const PH = doc.internal.pageSize.getHeight()  // 297 mm
  const MX = 16                                  // outer margin
  const CW = PW - MX * 2                         // 178 mm content width
  const { car, ownerName, ownerHandle, mods, services, investment, gLogoUrl, includePricing } = data

  const carTitle = [car.year, car.model, car.variant].filter(Boolean).join(' ') || 'Unknown Build'

  // Load images concurrently
  const [carPhoto, gLogo] = await Promise.all([
    car.garage_photo_url ? imgToDataUrl(car.garage_photo_url) : Promise.resolve(null),
    imgToDataUrl(gLogoUrl),
  ])

  // ── layout state ────────────────────────────────────────────────────────────
  let cy = 0
  const BOTTOM = PH - 14

  function newPage() {
    doc.addPage()
    doc.setFillColor(...C_PAGE); doc.rect(0, 0, PW, PH, 'F')
    // Subtle top rule on continuation pages
    doc.setDrawColor(...C_BURG); doc.setLineWidth(0.8)
    doc.line(0, 0, PW, 0)
    cy = 16
    // Mini header — wordmark left, car title right
    doc.setFont('helvetica','bolditalic'); doc.setFontSize(9); doc.setTextColor(...C_ACCENT)
    doc.text('G-DIMENSION', MX, cy)
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...C_MID)
    doc.text(carTitle, PW - MX, cy, { align: 'right' })
    cy += 8
    doc.setDrawColor(...C_FAINT); doc.setLineWidth(0.2); doc.line(MX, cy, PW - MX, cy)
    cy += 6
  }

  function ensure(need: number) { if (cy + need > BOTTOM) newPage() }

  // ── COVER PAGE ───────────────────────────────────────────────────────────────
  doc.setFillColor(...C_PAGE); doc.rect(0, 0, PW, PH, 'F')

  // Top accent stripe
  doc.setFillColor(...C_BURG); doc.rect(0, 0, PW, 1.2, 'F')

  // G logo + wordmark header block
  const HEADER_H = 22
  cy = 10
  if (gLogo) {
    const lh = HEADER_H * 0.9
    const lw = lh * (gLogo.w / gLogo.h)
    const fmt = gLogo.dataUrl.includes('image/png') ? 'PNG' : 'WEBP'
    doc.addImage(gLogo.dataUrl, fmt, MX, cy - lh * 0.7, lw, lh)
    doc.setFont('helvetica','bolditalic'); doc.setFontSize(18); doc.setTextColor(...C_DARK)
    doc.text('G-DIMENSION', MX + lw + 4, cy)
  } else {
    doc.setFont('helvetica','bolditalic'); doc.setFontSize(18); doc.setTextColor(...C_DARK)
    doc.text('G-DIMENSION', MX, cy)
  }
  doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(...C_ACCENT)
  doc.text('BUILD REPORT', PW - MX, cy, { align: 'right', charSpace: 0.8 })
  cy += 3

  // Under-header rule
  doc.setDrawColor(...C_BURG); doc.setLineWidth(0.8); doc.line(MX, cy, PW - MX, cy); cy += 10

  // — Car photo (top-left cutout) + Identity block side-by-side ———————————————
  const PHOTO_W = 72, PHOTO_H = 54
  if (carPhoto) {
    // Place the background-removed PNG directly on the page bg — no border,
    // so the transparent edges blend with the warm off-white.
    const ar = carPhoto.w / carPhoto.h
    let iw = PHOTO_W, ih = PHOTO_W / ar
    if (ih > PHOTO_H) { ih = PHOTO_H; iw = ih * ar }
    const iy = cy + (PHOTO_H - ih) / 2
    const fmt = carPhoto.dataUrl.includes('image/png') ? 'PNG' : 'JPEG'
    doc.addImage(carPhoto.dataUrl, fmt, MX, iy, iw, ih)
  }

  // Identity block to the right of the photo
  const ID_X = MX + PHOTO_W + 8
  const ID_W = CW - PHOTO_W - 8
  let iy2 = cy

  doc.setFont('times','italic'); doc.setFontSize(28); doc.setTextColor(...C_INK)
  const titleLines = doc.splitTextToSize(carTitle, ID_W) as string[]
  doc.text(titleLines.slice(0,2), ID_X, iy2)
  iy2 += titleLines.slice(0,2).length * 10 + 2

  if (car.make) {
    doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(...C_MID)
    doc.text(car.make.toUpperCase(), ID_X, iy2, { charSpace: 0.6 })
    iy2 += 8
  }

  // Stats row
  const stats: { v: string; u: string }[] = []
  if (car.horsepower != null) stats.push({ v: String(car.horsepower), u: 'HP' })
  if (car.torque != null)     stats.push({ v: String(car.torque), u: 'LB-FT' })
  if (car.weight_lbs != null) stats.push({ v: String(car.weight_lbs), u: 'LBS' })
  if (stats.length) {
    const sw = ID_W / stats.length
    stats.forEach((s, i) => {
      const sx = ID_X + sw * i
      doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.setTextColor(...C_INK)
      doc.text(s.v, sx, iy2)
      doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(...C_MID)
      doc.text(s.u, sx, iy2 + 4.5, { charSpace: 0.4 })
    })
    iy2 += 11
  }

  if (includePricing && investment != null && investment > 0) {
    doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(...C_MID)
    doc.text('BUILD INVESTMENT', ID_X, iy2, { charSpace: 0.4 })
    iy2 += 5
    doc.setFont('helvetica','bold'); doc.setFontSize(16); doc.setTextColor(...C_ACCENT)
    doc.text(money(investment), ID_X, iy2)
  }

  cy = Math.max(cy + PHOTO_H, iy2) + 10

  // Under-photo rule
  doc.setDrawColor(...C_FAINT); doc.setLineWidth(0.3); doc.line(MX, cy, PW - MX, cy); cy += 8

  // ── Vehicle Identity block (Carfax-style) ────────────────────────────────────
  function sectionHeader(label: string, sub?: string) {
    ensure(16)
    doc.setFillColor(...C_DARK); doc.rect(MX, cy, CW, 8, 'F')
    doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(244, 244, 242)
    doc.text(label.toUpperCase(), MX + 4, cy + 5.3, { charSpace: 0.8 })
    if (sub) {
      doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(180, 180, 180)
      doc.text(sub, PW - MX - 4, cy + 5.3, { align: 'right' })
    }
    cy += 10
  }

  function idRow(label: string, value: string | null | undefined) {
    if (value == null || value === '') return
    ensure(7)
    doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(...C_MID)
    doc.text(label, MX + 2, cy + 4.6, { charSpace: 0.4 })
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(...C_INK)
    doc.text(String(value), MX + 50, cy + 4.6)
    cy += 5.5
    doc.setDrawColor(...C_STRIPE); doc.setLineWidth(0.2); doc.line(MX, cy, PW - MX, cy)
    cy += 1.5
  }

  sectionHeader('Vehicle Information')
  idRow('Year',            car.year ? String(car.year) : null)
  idRow('Make',            car.make)
  idRow('Model',           car.model)
  idRow('Variant / Trim',  car.variant)
  idRow('VIN',             car.vin)
  idRow('Current Mileage', car.current_mileage != null ? car.current_mileage.toLocaleString() + ' mi' : null)
  if (ownerName || ownerHandle) {
    idRow('Owner',         [ownerName, ownerHandle ? '@'+ownerHandle : ''].filter(Boolean).join('  '))
  }
  cy += 6

  // ── Modification History ──────────────────────────────────────────────────────
  const modCount = `${mods.length} modification${mods.length !== 1 ? 's' : ''}`
  sectionHeader('Modification History', modCount)

  if (mods.length === 0) {
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(...C_MID)
    doc.text('No modifications logged yet.', MX + 2, cy + 5); cy += 12
  } else {
    // Column layout:  Date(28)  Mileage(22)  Shop(42)  Title(rest)  Cost(opt, 20)
    const COL_DATE = MX + 2
    const COL_MI   = MX + 32
    const COL_SHOP = MX + 58
    const COL_TITLE = MX + 102
    const COL_COST = PW - MX - 2

    // Column headers
    doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.setTextColor(...C_FAINT)
    doc.text('DATE',    COL_DATE,  cy + 4, { charSpace: 0.4 })
    doc.text('MILEAGE', COL_MI,    cy + 4, { charSpace: 0.4 })
    doc.text('SHOP',    COL_SHOP,  cy + 4, { charSpace: 0.4 })
    doc.text('MODIFICATION', COL_TITLE, cy + 4, { charSpace: 0.4 })
    if (includePricing) doc.text('COST', COL_COST, cy + 4, { align: 'right', charSpace: 0.4 })
    cy += 5.5
    doc.setDrawColor(...C_BURG); doc.setLineWidth(0.4); doc.line(MX, cy, PW - MX, cy); cy += 2

    mods.forEach((m, idx) => {
      const rowH = 7
      ensure(rowH + 2)
      if (idx % 2 === 0) {
        doc.setFillColor(...C_STRIPE); doc.rect(MX, cy, CW, rowH, 'F')
      }
      const shop = m.installed_by === 'shop' ? (m.shop_name || 'Shop') : m.installed_by === 'self' ? 'Self' : ''
      const cost = includePricing ? ((m.parts_cost ?? 0) + (m.labor_cost ?? 0)) : 0
      const titleW = includePricing ? COL_COST - COL_TITLE - 22 : PW - MX - COL_TITLE - 4
      const titleLines = doc.splitTextToSize(m.title, titleW) as string[]

      doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...C_MID)
      doc.text(fmtDate(m.date_installed), COL_DATE, cy + 4.8)
      doc.text(m.install_mileage != null ? m.install_mileage.toLocaleString() : '—', COL_MI, cy + 4.8)
      doc.text(shop, COL_SHOP, cy + 4.8)
      doc.setTextColor(...C_INK)
      doc.text(titleLines[0] || m.title, COL_TITLE, cy + 4.8)
      if (includePricing && cost > 0) {
        doc.setFont('helvetica','bold'); doc.setTextColor(...C_INK)
        doc.text(money(cost), COL_COST, cy + 4.8, { align: 'right' })
      }
      cy += rowH
    })
    cy += 6
  }

  // ── Maintenance & Detail History ───────────────────────────────────────────
  const svcCount = `${services.length} service record${services.length !== 1 ? 's' : ''}`
  sectionHeader('Maintenance & Service History', svcCount)

  if (services.length === 0) {
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(...C_MID)
    doc.text('No service records logged yet.', MX + 2, cy + 5); cy += 12
  } else {
    const COL_DATE  = MX + 2
    const COL_MI    = MX + 32
    const COL_SHOP  = MX + 58
    const COL_DETAIL = MX + 102
    const COL_COST  = PW - MX - 2

    doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.setTextColor(...C_FAINT)
    doc.text('DATE',    COL_DATE,   cy + 4, { charSpace: 0.4 })
    doc.text('MILEAGE', COL_MI,     cy + 4, { charSpace: 0.4 })
    doc.text('SHOP',    COL_SHOP,   cy + 4, { charSpace: 0.4 })
    doc.text('SERVICE', COL_DETAIL, cy + 4, { charSpace: 0.4 })
    if (includePricing) doc.text('COST', COL_COST, cy + 4, { align: 'right', charSpace: 0.4 })
    cy += 5.5
    doc.setDrawColor(...C_BURG); doc.setLineWidth(0.4); doc.line(MX, cy, PW - MX, cy); cy += 2

    services.forEach((s, idx) => {
      // Service label: session title, or list of job titles, or type
      const label = s.title
        || (s.jobs.length > 0 ? s.jobs.map(j => j.title).join(', ') : null)
        || (s.type === 'detail' ? 'Detailing' : 'Maintenance')
      const shop = s.performed_by === 'shop' ? (s.shop_name || 'Shop') : s.performed_by === 'self' ? 'Self' : ''
      const totalCost = includePricing ? (s.total_cost ?? 0) : 0

      const detailW = includePricing ? COL_COST - COL_DETAIL - 22 : PW - MX - COL_DETAIL - 4
      const labelLines = doc.splitTextToSize(label, detailW) as string[]
      const rowH = Math.max(7, labelLines.length * 5)

      ensure(rowH + 2)
      if (idx % 2 === 0) {
        doc.setFillColor(...C_STRIPE); doc.rect(MX, cy, CW, rowH, 'F')
      }

      doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...C_MID)
      doc.text(fmtDate(s.date_performed), COL_DATE, cy + 4.8)
      doc.text(s.mileage != null ? s.mileage.toLocaleString() : '—', COL_MI, cy + 4.8)
      doc.text(shop, COL_SHOP, cy + 4.8)
      doc.setTextColor(...C_INK)
      doc.text(labelLines[0] || label, COL_DETAIL, cy + 4.8)
      if (labelLines.length > 1) {
        doc.setTextColor(...C_MID)
        doc.text(labelLines.slice(1).join(' '), COL_DETAIL, cy + 9.8)
      }
      if (includePricing && totalCost > 0) {
        doc.setFont('helvetica','bold'); doc.setTextColor(...C_INK)
        doc.text(money(totalCost), COL_COST, cy + 4.8, { align: 'right' })
      }
      cy += rowH
    })
    cy += 6
  }

  // ── Page footers ─────────────────────────────────────────────────────────────
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setDrawColor(...C_BURG); doc.setLineWidth(0.5)
    doc.line(MX, PH - 10, PW - MX, PH - 10)
    doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(...C_MID)
    doc.text(carTitle, MX, PH - 6)
    doc.text('gdimension.app', PW / 2, PH - 6, { align: 'center' })
    doc.text(`${p} / ${pages}`, PW - MX, PH - 6, { align: 'right' })
  }

  return doc
}

export function pdfFilename(car: PdfCar): string {
  const base = [car.year, car.model, car.variant].filter(Boolean).join(' ') || 'build'
  return base.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() + '-build-report.pdf'
}
