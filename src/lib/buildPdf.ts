// Build PDF generator — renders a car's build sheet to a downloadable A4 PDF.
//
// Uses jsPDF direct drawing (vector text + embedded photos) rather than a DOM
// rasterizer, so the text stays crisp and selectable and the file stays small.
// Layout mirrors the on-screen Build Sheet: a cover (car photo + identity +
// stats + investment), then mods grouped Power / Chassis / Exterior / Interior
// / Other. Zero backend — generated entirely on-device, consistent with the
// app's $0 philosophy.

import type { jsPDF } from 'jspdf'

// ── palette (RGB tuples for jsPDF) ──────────────────────────────────────────
const INK: [number, number, number]   = [26, 26, 28]    // near-black body text
const MUTED: [number, number, number] = [120, 120, 126] // secondary text
const FAINT: [number, number, number] = [170, 170, 176] // captions / rules
const ACCENT: [number, number, number] = [200, 102, 26] // #c8661a burnt orange
const PAGEBG: [number, number, number] = [244, 244, 242] // warm off-white
const HEADER: [number, number, number] = [17, 17, 17]    // #111 masthead band

// ── data shapes (subset of the Build Sheet model) ───────────────────────────
export type PdfCar = {
  year: number | null
  make: string | null
  model: string | null
  variant: string | null
  garage_photo_url: string | null
  original_photo_url?: string | null
  horsepower: number | null
  torque: number | null
  weight_lbs: number | null
}

export type PdfMod = { title: string; brand: string | null }
export type PdfGroupEntry = { title: string; componentCount: number; total_cost: number | null }

export type PdfSection = {
  label: string          // Power / Chassis / Exterior / Interior / Other
  groups: PdfGroupEntry[] // titled multi-component sessions
  mods: PdfMod[]          // solo mods
}

export type PdfData = {
  car: PdfCar
  ownerName: string | null   // display name
  ownerHandle: string | null // @username
  sections: PdfSection[]
  investment: number | null  // total build spend, or null to omit
}

// ── image loading ───────────────────────────────────────────────────────────
// Fetch a (public Supabase) image and convert to a data URL jsPDF can embed.
// Returns null on any failure (CORS, 404) so the PDF still renders without it.
async function loadImage(url: string): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) return null
    const blob = await res.blob()
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result as string)
      r.onerror = reject
      r.readAsDataURL(blob)
    })
    const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
      img.onerror = reject
      img.src = dataUrl
    })
    return { dataUrl, ...dims }
  } catch {
    return null
  }
}

function money(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US')
}

// ── main entry ────────────────────────────────────────────────────────────────
export async function generateBuildPdf(data: PdfData): Promise<jsPDF> {
  // Dynamic import keeps jsPDF (~350 KB) out of the main bundle — only loaded
  // when the user actually generates a PDF.
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const PW = doc.internal.pageSize.getWidth()   // 210
  const PH = doc.internal.pageSize.getHeight()  // 297
  const MX = 18                                  // left/right margin
  const CW = PW - MX * 2                          // content width

  const { car, ownerName, ownerHandle, sections, investment } = data
  const title = [car.year, car.model, car.variant].filter(Boolean).join(' ') || 'Unknown Build'

  // Prefer the original (full) photo for print; fall back to the cutout PNG.
  const photo =
    (car.original_photo_url ? await loadImage(car.original_photo_url) : null) ||
    (car.garage_photo_url ? await loadImage(car.garage_photo_url) : null)

  // ── COVER ───────────────────────────────────────────────────────────────────
  doc.setFillColor(...PAGEBG); doc.rect(0, 0, PW, PH, 'F')

  // Masthead band
  const bandH = 26
  doc.setFillColor(...HEADER); doc.rect(0, 0, PW, bandH, 'F')
  doc.setFont('helvetica', 'bolditalic'); doc.setFontSize(20); doc.setTextColor(244, 244, 242)
  doc.text('G-DIMENSION', MX, 17)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...ACCENT)
  doc.text('BUILD SHEET', PW - MX, 16, { align: 'right' })

  // Car photo — fit within a box, centered
  let y = bandH + 10
  const boxH = 92
  if (photo) {
    const ar = photo.w / photo.h
    let iw = CW, ih = CW / ar
    if (ih > boxH) { ih = boxH; iw = boxH * ar }
    const ix = MX + (CW - iw) / 2
    const fmt = photo.dataUrl.includes('image/png') ? 'PNG' : 'JPEG'
    doc.addImage(photo.dataUrl, fmt, ix, y + (boxH - ih) / 2, iw, ih)
  } else {
    // Placeholder slab
    doc.setFillColor(232, 232, 230); doc.rect(MX, y, CW, boxH, 'F')
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...FAINT)
    doc.text('No photo', PW / 2, y + boxH / 2, { align: 'center' })
  }
  y += boxH + 14

  // Identity — Times italic echoes the Cormorant display voice
  doc.setFont('times', 'italic'); doc.setTextColor(...INK); doc.setFontSize(30)
  doc.text(title, MX, y)
  y += 8
  if (car.make) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...MUTED)
    doc.text(car.make.toUpperCase(), MX, y, { charSpace: 0.6 })
    y += 9
  } else { y += 3 }

  // Stat row
  const stats: { v: number; u: string }[] = []
  if (car.horsepower != null) stats.push({ v: car.horsepower, u: 'HP' })
  if (car.torque != null)     stats.push({ v: car.torque, u: 'LB-FT' })
  if (car.weight_lbs != null) stats.push({ v: car.weight_lbs, u: 'LB' })
  if (stats.length) {
    doc.setDrawColor(...FAINT); doc.setLineWidth(0.2)
    doc.line(MX, y, MX + CW, y); y += 9
    const colW = CW / stats.length
    stats.forEach((s, i) => {
      const cx = MX + colW * i
      doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(...INK)
      doc.text(String(s.v), cx, y)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED)
      doc.text(s.u, cx, y + 5, { charSpace: 0.5 })
    })
    y += 11
    doc.setDrawColor(...FAINT); doc.line(MX, y, MX + CW, y); y += 10
  }

  // Owner + investment footer block
  if (ownerName || ownerHandle) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...FAINT)
    doc.text('OWNER', MX, y, { charSpace: 0.6 })
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(...INK)
    doc.text([ownerName, ownerHandle ? '@' + ownerHandle : ''].filter(Boolean).join('  '), MX, y + 6)
  }
  if (investment != null && investment > 0) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...FAINT)
    doc.text('BUILD INVESTMENT', PW - MX, y, { align: 'right', charSpace: 0.6 })
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...ACCENT)
    doc.text(money(investment), PW - MX, y + 6, { align: 'right' })
  }

  // Cover footer
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...FAINT)
  doc.text('gdimension.app', PW / 2, PH - 12, { align: 'center' })

  // ── CONTENT PAGES — sections ──────────────────────────────────────────────
  const TOP = 22, BOTTOM = PH - 18
  let cy = TOP
  let started = false

  const newPage = () => {
    doc.addPage()
    doc.setFillColor(...PAGEBG); doc.rect(0, 0, PW, PH, 'F')
    cy = TOP
  }
  const ensure = (need: number) => { if (cy + need > BOTTOM) newPage() }

  const lineItem = (primary: string, secondary: string | null) => {
    ensure(9)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(...INK)
    const maxW = secondary ? CW - 40 : CW
    const lines = doc.splitTextToSize(primary, maxW) as string[]
    doc.text(lines[0], MX, cy)
    if (secondary) {
      doc.setFontSize(9); doc.setTextColor(...MUTED)
      doc.text(secondary, MX + CW, cy, { align: 'right' })
    }
    cy += 5.5
    doc.setDrawColor(238, 238, 236); doc.setLineWidth(0.2)
    doc.line(MX, cy, MX + CW, cy)
    cy += 3.5
  }

  sections.forEach(sec => {
    if (sec.groups.length === 0 && sec.mods.length === 0) return
    // Section header
    ensure(18)
    cy += started ? 6 : 0
    started = true
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...INK)
    doc.text(sec.label.toUpperCase(), MX, cy, { charSpace: 1 })
    cy += 2.5
    doc.setDrawColor(...ACCENT); doc.setLineWidth(0.6)
    doc.line(MX, cy, MX + 16, cy)
    cy += 7

    // Group cards (titled sessions)
    sec.groups.forEach(g => {
      const parts: string[] = [`${g.componentCount} component${g.componentCount !== 1 ? 's' : ''}`]
      if (g.total_cost != null) parts.push(money(Number(g.total_cost)))
      lineItem(g.title, parts.join('  ·  '))
    })
    // Solo mods
    sec.mods.forEach(m => lineItem(m.title, m.brand ? m.brand.toUpperCase() : null))
  })

  if (!started) {
    // No mods logged yet
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(...MUTED)
    doc.text('No modifications logged yet.', MX, cy + 4)
  }

  // ── page footers (numbered, skip the cover) ─────────────────────────────────
  const pages = doc.getNumberOfPages()
  for (let p = 2; p <= pages; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...FAINT)
    doc.text(title, MX, PH - 10)
    doc.text('gdimension.app', PW / 2, PH - 10, { align: 'center' })
    doc.text(String(p - 1).padStart(2, '0'), PW - MX, PH - 10, { align: 'right' })
  }

  return doc
}

// Build a safe filename like "2006-LS-430-build-sheet.pdf"
export function pdfFilename(car: PdfCar): string {
  const base = [car.year, car.model, car.variant].filter(Boolean).join(' ') || 'build'
  return base.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() + '-build-sheet.pdf'
}
