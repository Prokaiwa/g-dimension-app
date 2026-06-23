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

// Load an image and re-encode it to PNG via a canvas. jsPDF can't decode WEBP
// (it renders a black box), so we always normalize to PNG and preserve any
// alpha channel (needed for the background-removed car cutout + the G badge).
async function imgToDataUrl(url: string): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) return null
    const blob = await res.blob()
    const rawUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader(); r.onload = () => resolve(r.result as string); r.onerror = reject; r.readAsDataURL(blob)
    })
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = rawUrl
    })
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0)
    return { dataUrl: canvas.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight }
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
  const { car, mods, services, investment, gLogoUrl, includePricing } = data

  const carTitle = [car.year, car.model, car.variant].filter(Boolean).join(' ') || 'Unknown Build'

  // Load images concurrently
  const [carPhoto, gLogo] = await Promise.all([
    car.garage_photo_url ? imgToDataUrl(car.garage_photo_url) : Promise.resolve(null),
    imgToDataUrl(gLogoUrl),
  ])

  // ── layout state ────────────────────────────────────────────────────────────
  let cy = 0
  // BOTTOM leaves room for the footer zone: disclaimer (~4mm) + footnote (optional, ~4mm)
  // + rule + page number + a clear gap above all of that.
  const BOTTOM = PH - 26
  // Active section context — re-drawn at the top of each continuation page so a
  // reader always knows which section the spilled rows belong to.
  let curSection: string | null = null
  let curSub: string | undefined
  let drawCols: (() => void) | null = null   // table column-header redraw, if any

  // Draws the dark section band at the current cy (no page-break logic).
  function drawSectionBand(label: string, sub: string | undefined, continued: boolean) {
    doc.setFillColor(...C_DARK); doc.rect(MX, cy, CW, 8, 'F')
    doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(244, 244, 242)
    doc.text(label.toUpperCase() + (continued ? '  (CONTINUED)' : ''), MX + 4, cy + 5.3, { charSpace: 0.8 })
    if (sub && !continued) {
      doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(180, 180, 180)
      doc.text(sub, PW - MX - 4, cy + 5.3, { align: 'right' })
    }
    cy += 10
  }

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
    // Repeat the active section header + column headers so the reader keeps context.
    if (curSection) {
      drawSectionBand(curSection, curSub, true)
      if (drawCols) drawCols()
    }
  }

  function ensure(need: number) { if (cy + need > BOTTOM) newPage() }

  // ── COVER PAGE ───────────────────────────────────────────────────────────────
  doc.setFillColor(...C_PAGE); doc.rect(0, 0, PW, PH, 'F')

  // Top accent stripe
  doc.setFillColor(...C_BURG); doc.rect(0, 0, PW, 1.2, 'F')

  // — Header: G badge + wordmark left, BUILD REPORT right ————————————————————
  const LOGO_SZ = 12          // badge height (square-ish)
  const HEAD_Y  = 8           // top of the logo
  const HEAD_MID = HEAD_Y + LOGO_SZ / 2  // vertical center of the header row
  if (gLogo) {
    const lw = LOGO_SZ * (gLogo.w / gLogo.h)
    doc.addImage(gLogo.dataUrl, 'PNG', MX, HEAD_Y, lw, LOGO_SZ)
    doc.setFont('helvetica','bolditalic'); doc.setFontSize(17); doc.setTextColor(...C_DARK)
    doc.text('G-DIMENSION', MX + lw + 3, HEAD_MID + 2)
  } else {
    doc.setFont('helvetica','bolditalic'); doc.setFontSize(17); doc.setTextColor(...C_DARK)
    doc.text('G-DIMENSION', MX, HEAD_MID + 2)
  }
  doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(...C_ACCENT)
  doc.text('BUILD REPORT', PW - MX, HEAD_MID - 1, { align: 'right', charSpace: 0.8 })
  // Generation date — "Pulled MM/DD/YYYY" beneath the BUILD REPORT label
  const now = new Date()
  const pulled = `Pulled ${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`
  doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(...C_MID)
  doc.text(pulled, PW - MX, HEAD_MID + 4, { align: 'right' })

  // Under-header rule (sits clearly below the badge)
  cy = HEAD_Y + LOGO_SZ + 4
  doc.setDrawColor(...C_BURG); doc.setLineWidth(0.8); doc.line(MX, cy, PW - MX, cy); cy += 10

  // — Car photo (boxed dark stage, Snapshot-style) + Identity block ————————————
  const PHOTO_W = 74, PHOTO_H = 55
  // Warm greige rounded stage so the background-removed cutout sits cleanly
  // and harmonizes with the warm off-white page.
  doc.setFillColor(213, 209, 204)
  doc.roundedRect(MX, cy, PHOTO_W, PHOTO_H, 2.5, 2.5, 'F')
  if (carPhoto) {
    const pad = 5
    const boxW = PHOTO_W - pad * 2, boxH = PHOTO_H - pad * 2
    const ar = carPhoto.w / carPhoto.h
    let iw = boxW, ih = boxW / ar
    if (ih > boxH) { ih = boxH; iw = ih * ar }
    const ix = MX + (PHOTO_W - iw) / 2
    const iy = cy + (PHOTO_H - ih) / 2
    doc.addImage(carPhoto.dataUrl, 'PNG', ix, iy, iw, ih)
  } else {
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(140, 140, 144)
    doc.text('No photo', MX + PHOTO_W / 2, cy + PHOTO_H / 2 + 1, { align: 'center' })
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
    doc.text(money(investment) + '*', ID_X, iy2)
  }

  cy = Math.max(cy + PHOTO_H, iy2) + 10

  // Under-photo rule
  doc.setDrawColor(...C_FAINT); doc.setLineWidth(0.3); doc.line(MX, cy, PW - MX, cy); cy += 8

  // ── Vehicle Identity block (Carfax-style) ────────────────────────────────────
  function sectionHeader(label: string, sub?: string) {
    // Clear context before the break check so a section boundary starts a clean
    // page (no stale "(continued)" band) rather than repeating the prior section.
    curSection = null; curSub = undefined; drawCols = null
    ensure(16)
    curSection = label; curSub = sub
    drawSectionBand(label, sub, false)
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

    // Column headers — registered so they repeat at the top of a continuation page.
    const modCols = () => {
      doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.setTextColor(...C_FAINT)
      doc.text('DATE',    COL_DATE,  cy + 4, { charSpace: 0.4 })
      doc.text('MILEAGE', COL_MI,    cy + 4, { charSpace: 0.4 })
      doc.text('SHOP',    COL_SHOP,  cy + 4, { charSpace: 0.4 })
      doc.text('MODIFICATION', COL_TITLE, cy + 4, { charSpace: 0.4 })
      if (includePricing) doc.text('COST', COL_COST, cy + 4, { align: 'right', charSpace: 0.4 })
      cy += 5.5
      doc.setDrawColor(...C_BURG); doc.setLineWidth(0.4); doc.line(MX, cy, PW - MX, cy); cy += 2
    }
    modCols()
    drawCols = modCols

    mods.forEach((m, idx) => {
      const shop = m.installed_by === 'shop' ? (m.shop_name || 'Shop') : ''
      const hasLabor = m.installed_by === 'shop' && (m.labor_cost ?? 0) > 0
      const cost = includePricing ? ((m.parts_cost ?? 0) + (m.labor_cost ?? 0)) : 0
      // Always reserve cost-column space so wrap is identical with/without pricing.
      const titleW = COL_COST - COL_TITLE - 22
      const titleLines = doc.splitTextToSize(m.title, titleW) as string[]
      const LINE_H = 5.2
      const ROW_PAD = 4
      const rowH = Math.max(8, titleLines.length * LINE_H + ROW_PAD)

      ensure(rowH + 2)
      if (idx % 2 === 0) {
        doc.setFillColor(...C_STRIPE); doc.rect(MX, cy, CW, rowH, 'F')
      }

      const textY = titleLines.length === 1
        ? cy + rowH / 2 + 2.5
        : cy + ROW_PAD / 2 + LINE_H

      doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...C_MID)
      doc.text(fmtDate(m.date_installed), COL_DATE, textY)
      doc.text(m.install_mileage != null ? m.install_mileage.toLocaleString() : '—', COL_MI, textY)
      doc.text(shop, COL_SHOP, textY)
      doc.setTextColor(...C_INK)
      titleLines.forEach((line, li) => {
        doc.text(line, COL_TITLE, textY + li * LINE_H)
      })
      if (includePricing && cost > 0) {
        doc.setFont('helvetica','bold'); doc.setTextColor(...C_INK)
        doc.text(money(cost) + (hasLabor ? '*' : ''), COL_COST, textY, { align: 'right' })
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

    const svcCols = () => {
      doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.setTextColor(...C_FAINT)
      doc.text('DATE',    COL_DATE,   cy + 4, { charSpace: 0.4 })
      doc.text('MILEAGE', COL_MI,     cy + 4, { charSpace: 0.4 })
      doc.text('SHOP',    COL_SHOP,   cy + 4, { charSpace: 0.4 })
      doc.text('SERVICE', COL_DETAIL, cy + 4, { charSpace: 0.4 })
      if (includePricing) doc.text('COST', COL_COST, cy + 4, { align: 'right', charSpace: 0.4 })
      cy += 5.5
      doc.setDrawColor(...C_BURG); doc.setLineWidth(0.4); doc.line(MX, cy, PW - MX, cy); cy += 2
    }
    svcCols()
    drawCols = svcCols

    services.forEach((s, idx) => {
      // Service label: session title, or list of job titles, or type
      const label = s.title
        || (s.jobs.length > 0 ? s.jobs.map(j => j.title).join(', ') : null)
        || (s.type === 'detail' ? 'Detailing' : 'Maintenance')
      const shop = s.performed_by === 'shop' ? (s.shop_name || 'Shop') : ''
      const svcHasLabor = s.performed_by === 'shop' && (s.labor_cost ?? 0) > 0
      const totalCost = includePricing ? (s.total_cost ?? 0) : 0

      // Always reserve cost-column space so text wraps identically regardless of
      // whether pricing is shown — prevents the row height from changing on toggle.
      const detailW = COL_COST - COL_DETAIL - 22
      const labelLines = doc.splitTextToSize(label, detailW) as string[]
      const LINE_H = 5.2
      const ROW_PAD = 4  // top + bottom breathing room
      const rowH = Math.max(8, labelLines.length * LINE_H + ROW_PAD)

      ensure(rowH + 2)
      if (idx % 2 === 0) {
        doc.setFillColor(...C_STRIPE); doc.rect(MX, cy, CW, rowH, 'F')
      }

      // Baseline for first text line: vertically centred for single-line rows,
      // starting from top-pad for multi-line rows.
      const textY = labelLines.length === 1
        ? cy + rowH / 2 + 2.5
        : cy + ROW_PAD / 2 + LINE_H

      doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...C_MID)
      doc.text(fmtDate(s.date_performed), COL_DATE, textY)
      doc.text(s.mileage != null ? s.mileage.toLocaleString() : '—', COL_MI, textY)
      doc.text(shop, COL_SHOP, textY)
      // All label lines stay C_INK — continuation lines are the same content, not notes.
      doc.setTextColor(...C_INK)
      labelLines.forEach((line, li) => {
        doc.text(line, COL_DETAIL, textY + li * LINE_H)
      })
      if (includePricing && totalCost > 0) {
        doc.setFont('helvetica','bold'); doc.setTextColor(...C_INK)
        doc.text(money(totalCost) + (svcHasLabor ? '*' : ''), COL_COST, textY, { align: 'right' })
      }
      cy += rowH
    })
    cy += 6
  }

  // ── Page footers ─────────────────────────────────────────────────────────────
  const DISCLAIMER = 'All information provided by the vehicle owner. G-Dimension makes no representation as to accuracy or completeness. This report is not a substitute for a professional inspection.'
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    // Disclaimer — very light, centered, above the rule
    doc.setFont('helvetica','italic'); doc.setFontSize(5.5); doc.setTextColor(190, 190, 190)
    doc.text(DISCLAIMER, PW / 2, PH - 17, { align: 'center', maxWidth: CW })
    if (includePricing) {
      doc.setFont('helvetica','italic'); doc.setFontSize(6.5); doc.setTextColor(...C_MID)
      doc.text('* Cost reflects parts + labor combined', MX, PH - 13)
    }
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
