import type {
  CarProfile, VariantData, ModData, OwnerUnits,
  GateContext, PoolLine, T4Line, HeadlineTemplate, GeneratedFeature,
} from './types'
import { buildContext } from './resolve'
import { allGatesPass, resolveSubaruEye } from './gates'
import { unlockedTemplates } from './matrix'
import {
  makeRng,
  SALT_HEADLINE, SALT_DECK, SALT_CAPTION,
} from './rng'
import {
  T1_PHRASES, T2_PHRASES, T3_NOUNS, T4_PHRASES, T6_TEMPLATES, T7_PHRASES,
  DECK_POOLS, CAPTIONS_DETAIL_POINTER, CAPTIONS_SPEC_FACT, CAPTIONS_IDENTITY,
} from './pools/universal'
import { ENGINE_FAMILIES, SWAP_CAPTIONS } from './pools/engines'
import { MAKE_HERITAGE } from './pools/makes'
import { CHASSIS_DB } from './pools/chassis'
import { convertDistance, convertPower } from '../../../utils/unitConversion'

// ─── No-repeat set ───────────────────────────────────────────────────────────
// Tracks evocative words used across slots. A word present here is not re-drawn.

function extractWords(text: string): Set<string> {
  // Extract meaningful words (4+ chars, skip filler)
  const SKIP = new Set([
    'that', 'this', 'with', 'from', 'have', 'been', 'were', 'what',
    'when', 'your', 'here', 'just', 'more', 'than', 'into', 'over',
    'does', 'even', 'only', 'them', 'they', 'some', 'like', 'made',
    'take', 'good', 'back', 'same', 'keep', 'never', 'every', 'still',
    'there', 'where', 'which', 'while', 'these', 'their', 'those',
  ])
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 4 && !SKIP.has(w)),
  )
}

function overlapsRepeatSet(text: string, usedWords: Set<string>): boolean {
  const words = extractWords(text)
  for (const w of words) {
    if (usedWords.has(w)) return true
  }
  return false
}

function addToRepeatSet(text: string, usedWords: Set<string>): void {
  for (const w of extractWords(text)) usedWords.add(w)
}

// ─── Template filling ─────────────────────────────────────────────────────────

function formatMileage(miles: number, unit: 'mi' | 'km'): string {
  const val = unit === 'km'
    ? Math.round(convertDistance(miles, 'km'))
    : miles
  return val.toLocaleString('en-US')
}

function formatHp(hp: number, unit: 'hp' | 'ps' | 'kw'): string {
  let val: number
  if (unit === 'ps') val = Math.round(convertPower(hp, 'ps'))
  else if (unit === 'kw') val = Math.round(convertPower(hp, 'kw'))
  else val = hp
  return `${val}${unit === 'ps' ? 'PS' : unit === 'kw' ? 'kW' : 'whp'}`
}

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'An' : 'A'
}

function chassisDescriptor(ctx: GateContext): string {
  if (ctx.chassisMatched) {
    const entry = CHASSIS_DB.find(e =>
      e.make.includes(ctx.make.toLowerCase()) &&
      e.codes.some(c => c.toUpperCase().replace(/[\s-]/g, '') === ctx.chassisCode)
    )
    if (entry && entry.epithets.length > 0) {
      const eligible = entry.epithets.filter(e => allGatesPass(e.gates, ctx))
      if (eligible.length > 0) return eligible[0].text
    }
    return ctx.chassisCode ?? ctx.model
  }
  return ctx.chassisCode ?? ctx.model
}

function resolveSubaruEyeText(ctx: GateContext): string | null {
  const eye = resolveSubaruEye(ctx)
  return eye  // 'bugeye' | 'blobeye' | 'hawkeye' | null
}

function miatagen(code: string | null): string {
  switch (code) {
    case 'NA': return 'one'
    case 'NB': return 'two'
    case 'NC': return 'three'
    case 'ND': return 'four'
    default:   return 'one'
  }
}

function fillTemplate(
  text: string,
  ctx: GateContext,
  partName?: string,
): string {
  const mi = ctx.currentMileage ?? 0
  const distLabel = ctx.distanceUnit === 'km' ? 'Kilometers' : 'Miles'
  const distLabelSing = ctx.distanceUnit === 'km' ? 'Kilometer' : 'Mile'
  const mileStr = formatMileage(mi, ctx.distanceUnit)
  const hpStr = ctx.horsepower ? formatHp(ctx.horsepower, ctx.powerUnit) : ''
  const chassis = ctx.chassisCode ?? ctx.model
  const desc = chassisDescriptor(ctx)
  const eyeText = resolveSubaruEyeText(ctx) ?? ''
  const gen = miatagen(ctx.chassisCode)

  return text
    .replace(/\{N\}/g,              mileStr)
    .replace(/\{Miles\|Kilometers\}/g, distLabel)
    .replace(/\{Mile\|Kilometer\}/g,   distLabelSing)
    .replace(/\{hp\}/g,             hpStr)
    .replace(/\{A\/An\}/g,          article(hpStr))
    .replace(/\{Chassis\|Model\}/g,  chassis)
    .replace(/\{Chassis\}/g,         chassis)
    .replace(/\{ChassisDescriptor\}/g, desc)
    .replace(/\{The\/This\}/g,       'The')
    .replace(/\{Make\}/g,            ctx.make)
    .replace(/\{Model\}/g,           ctx.model)
    .replace(/\{Year\}/g,            String(ctx.year))
    .replace(/\{EngineCode\}/g,      ctx.engineCode ?? '')
    .replace(/\{donor_year\}/g,      String(ctx.donorYear ?? ''))
    .replace(/\{donor_make\}/g,      ctx.donorMake ?? '')
    .replace(/\{donor_model\}/g,     ctx.donorModel ?? '')
    .replace(/\{part\}/g,            partName ?? '')
    .replace(/\{Part\}/g,            partName ? (partName[0].toUpperCase() + partName.slice(1)) : '')
    .replace(/\{eye\}/g,             eyeText)
    .replace(/\{gen\}/g,             gen)
}

// ─── Eligible pool filter ──────────────────────────────────────────────────────

function eligible(lines: PoolLine[], ctx: GateContext): PoolLine[] {
  return lines.filter(l => allGatesPass(l.gates, ctx))
}

// ─── Draw with no-repeat guard ────────────────────────────────────────────────

function drawNoRepeat(
  pool: PoolLine[],
  ctx: GateContext,
  usedWords: Set<string>,
  rng: () => number,
  partName?: string,
): string | null {
  const copy = eligible(pool, ctx).map(l => ({ ...l }))
  // Shuffle copy via rng
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]]
  }
  for (const line of copy) {
    const filled = fillTemplate(line.text, ctx, partName)
    if (!overlapsRepeatSet(filled, usedWords)) {
      addToRepeatSet(filled, usedWords)
      return filled
    }
  }
  // Fallback: take first eligible even if it overlaps
  if (copy.length > 0) {
    const filled = fillTemplate(copy[0].text, ctx, partName)
    addToRepeatSet(filled, usedWords)
    return filled
  }
  return null
}

// ─── Headline generation ─────────────────────────────────────────────────────

function buildHeadline(
  ctx: GateContext,
  template: HeadlineTemplate,
  usedWords: Set<string>,
  rng: () => number,
): { text: string; cormorantLine: string | null } {
  switch (template) {
    case 'T1': {
      const phrases = eligible(T1_PHRASES, ctx)
      const phrase = phrases.length > 0
        ? phrases[Math.floor(rng() * phrases.length)].text
        : 'Built, Not Bought'
      const hpStr = formatHp(ctx.horsepower!, ctx.powerUnit)
      const chassis = ctx.chassisCode ?? ctx.model
      const art = article(hpStr)
      const text = `${phrase}: ${art} ${hpStr} ${chassis}`
      addToRepeatSet(text, usedWords)
      return { text, cormorantLine: null }
    }
    case 'T2': {
      const phrases = eligible(T2_PHRASES, ctx)
      const phrase = phrases.length > 0
        ? phrases[Math.floor(rng() * phrases.length)].text
        : 'Known Quantity'
      const desc = chassisDescriptor(ctx)
      const text = `${phrase}: The ${desc}`
      addToRepeatSet(text, usedWords)
      // Epithet becomes cormorant line if it's an actual nickname
      const epithetLine = ctx.chassisMatched ? getEpithet(ctx) : null
      return { text, cormorantLine: epithetLine }
    }
    case 'T3': {
      const chassis = ctx.chassisCode ?? ctx.model
      const noun = T3_NOUNS[Math.floor(rng() * T3_NOUNS.length)]
      const text = `${chassis} ${noun}`
      addToRepeatSet(text, usedWords)
      return { text, cormorantLine: getEpithet(ctx) }
    }
    case 'T4': {
      const isRestraint =
        ctx.archetype === 'Survivor' ||
        ctx.archetype === 'Daily' ||
        ctx.archetype === 'OEMPlus' ||
        ctx.overlay === 'HighMileage'
      const pool: PoolLine[] = isRestraint
        ? eligible(T4_PHRASES.filter((p: T4Line) => p.restraintSafe), ctx)
        : eligible(T4_PHRASES, ctx)
      const line = pool.length > 0
        ? pool[Math.floor(rng() * pool.length)]
        : T4_PHRASES.find(p => p.text === 'Less Is More')!
      const text = fillTemplate(line.text, ctx)
      addToRepeatSet(text, usedWords)
      return { text, cormorantLine: null }
    }
    case 'T6': {
      const eligs = eligible(T6_TEMPLATES, ctx)
      const tmpl = eligs.length > 0
        ? eligs[Math.floor(rng() * eligs.length)]
        : T6_TEMPLATES[0]
      const text = fillTemplate(tmpl.text, ctx)
      addToRepeatSet(text, usedWords)
      return { text, cormorantLine: null }
    }
    case 'T7': {
      const eligs = eligible(T7_PHRASES, ctx)
      const line = eligs.length > 0
        ? eligs[Math.floor(rng() * eligs.length)]
        : T7_PHRASES.find(p => p.text === 'The Long Game')!
      const text = fillTemplate(line.text, ctx)
      addToRepeatSet(text, usedWords)
      return { text, cormorantLine: null }
    }
  }
}

// ─── Epithet (Cormorant italic line) ──────────────────────────────────────────

function getEpithet(ctx: GateContext): string | null {
  if (!ctx.chassisMatched || !ctx.chassisCode) return null
  const entry = CHASSIS_DB.find(e =>
    e.make.includes(ctx.make.toLowerCase()) &&
    e.codes.some(c =>
      c.toUpperCase().replace(/[\s-]/g, '') === ctx.chassisCode
    )
  )
  if (!entry) return null
  const eligs = eligible(entry.epithets, ctx)
  if (eligs.length === 0) return null
  // Prefer proper-noun epithets (start with capital or 'the')
  const proper = eligs.filter(e =>
    /^[A-Z]/.test(e.text) || e.text.toLowerCase().startsWith('the ')
  )
  const chosen = proper.length > 0 ? proper[0] : eligs[0]
  return fillTemplate(chosen.text, ctx)
}

// ─── Deck generation ──────────────────────────────────────────────────────────

function buildDeck(
  ctx: GateContext,
  usedWords: Set<string>,
  rng: () => number,
): string {
  // High-Mileage overlay may claim deck
  const overlayDeck =
    ctx.overlay === 'HighMileage'
      ? drawNoRepeat(DECK_POOLS['HighMileage'], ctx, usedWords, rng)
      : null
  if (overlayDeck) return overlayDeck

  // Tier-3: degradation only
  if (ctx.tier === 3) {
    return (
      drawNoRepeat(DECK_POOLS['Tier3'], ctx, usedWords, rng) ??
      'Documented, driven, and not done.'
    )
  }

  // Weighted pool: archetype (5) + engine family (3) + make heritage (2)
  const archetypePool = DECK_POOLS[ctx.archetype] ?? DECK_POOLS['Daily']
  const enginePool = getEngineFamilyDecks(ctx)
  const makePool = getMakeHeritageDecks(ctx)

  const weighted: PoolLine[] = [
    ...archetypePool, ...archetypePool, ...archetypePool, ...archetypePool, ...archetypePool,
    ...enginePool, ...enginePool, ...enginePool,
    ...makePool, ...makePool,
  ]

  return (
    drawNoRepeat(weighted, ctx, usedWords, rng) ??
    drawNoRepeat(archetypePool, ctx, usedWords, rng) ??
    'Documented, driven, and not done.'
  )
}

// ─── Engine family pool helpers ───────────────────────────────────────────────

function getEngineFamilyDecks(ctx: GateContext): PoolLine[] {
  if (!ctx.engineCode) return []
  const ec = ctx.engineCode
  const makeL = ctx.make.toLowerCase()

  // Special: Porsche flat-six
  if (makeL === 'porsche') {
    const pf = ENGINE_FAMILIES.find(f => f.prefixes.includes('PORSCHE_FLAT6'))
    return pf ? eligible(pf.decks, ctx) : []
  }

  // BMW S14 guard
  if (ec === 'S14') {
    return makeL === 'bmw' ? [] : []
  }

  for (const family of ENGINE_FAMILIES) {
    const matched = family.prefixes.some(p => {
      const norm = p.toUpperCase().replace(/[\s-]/g, '')
      return ec.startsWith(norm) && norm !== 'PORSCHE_FLAT6'
    })
    if (matched) return eligible(family.decks, ctx)
  }
  return []
}

function getEngineFamilyCaptions(ctx: GateContext): PoolLine[] {
  if (!ctx.engineCode) return []
  const ec = ctx.engineCode
  const makeL = ctx.make.toLowerCase()

  if (makeL === 'porsche') {
    const pf = ENGINE_FAMILIES.find(f => f.prefixes.includes('PORSCHE_FLAT6'))
    return pf ? eligible(pf.captions, ctx) : []
  }

  if (ec === 'S14') return []

  for (const family of ENGINE_FAMILIES) {
    const matched = family.prefixes.some(p => {
      const norm = p.toUpperCase().replace(/[\s-]/g, '')
      return ec.startsWith(norm) && norm !== 'PORSCHE_FLAT6'
    })
    if (matched) return eligible(family.captions, ctx)
  }
  return []
}

function getMakeHeritageDecks(ctx: GateContext): PoolLine[] {
  if (ctx.tier === 3) return []
  const entry = MAKE_HERITAGE.find(h => h.make === ctx.make.toLowerCase())
  if (!entry) return []
  return eligible(entry.decks, ctx)
}

function getMakeHeritageCaptions(ctx: GateContext): PoolLine[] {
  if (ctx.tier === 3) return []
  const entry = MAKE_HERITAGE.find(h => h.make === ctx.make.toLowerCase())
  if (!entry) return []
  return eligible(entry.captions, ctx)
}

function getChassisCaptions(ctx: GateContext): PoolLine[] {
  if (!ctx.chassisMatched || !ctx.chassisCode) return []
  const entry = CHASSIS_DB.find(e =>
    e.make.includes(ctx.make.toLowerCase()) &&
    e.codes.some(c => c.toUpperCase().replace(/[\s-]/g, '') === ctx.chassisCode)
  )
  if (!entry) return []
  return eligible(entry.captions, ctx)
}

// ─── Caption generation ───────────────────────────────────────────────────────

export interface PhotoSlot {
  id: string
  type: 'job' | 'build_group' | 'full_body'
  partName?: string   // for job photos
  group?: string      // mod category for build_group photos (e.g. 'Engine')
  existingCaption?: string
}

function buildCaptions(
  ctx: GateContext,
  photos: PhotoSlot[],
  usedWords: Set<string>,
  _rng: () => number,
): Record<string, string> {
  const result: Record<string, string> = {}

  for (let n = 0; n < photos.length; n++) {
    const photo = photos[n]
    // User caption always wins
    if (photo.existingCaption && photo.existingCaption.trim() !== '') continue

    const captionRng = makeRng(ctx.carId, SALT_CAPTION(n))

    let text: string | null = null

    if (photo.type === 'job' && photo.partName) {
      // §3a detail-pointer — only for that job's own part
      text = drawNoRepeat(CAPTIONS_DETAIL_POINTER, ctx, usedWords, captionRng, photo.partName)
    } else if (photo.type === 'build_group') {
      // §3b spec-fact or engine-family captions (if power group) or identity
      const specPool: PoolLine[] = ctx.hpInBounds
        ? eligible(CAPTIONS_SPEC_FACT, ctx)
        : []
      const engineCaps = getEngineFamilyCaptions(ctx)
      const makeCaps = getMakeHeritageCaptions(ctx)
      const chassisCaps = getChassisCaptions(ctx)
      const combined = [...specPool, ...engineCaps, ...makeCaps, ...chassisCaps]
      text = drawNoRepeat(combined, ctx, usedWords, captionRng)
    } else if (photo.type === 'full_body') {
      // §3c identity reframes
      const identityPool =
        CAPTIONS_IDENTITY[ctx.archetype] ??
        CAPTIONS_IDENTITY['Universal']
      const universalPool = CAPTIONS_IDENTITY['Universal']
      const swapPool = ctx.engineOrigin === 'swapped'
        ? eligible(SWAP_CAPTIONS, ctx)
        : []
      const combined = [...identityPool, ...swapPool, ...universalPool]
      text = drawNoRepeat(combined, ctx, usedWords, captionRng)
    }

    if (text) result[photo.id] = text
  }

  return result
}

// ─── Template selection ───────────────────────────────────────────────────────

function selectTemplate(
  ctx: GateContext,
  rng: () => number,
): HeadlineTemplate {
  const templates = unlockedTemplates(ctx)
  if (templates.length === 0) return 'T4'

  // HighMileage overlay: T6 is first in the list and always wins
  if (templates[0] === 'T6') return 'T6'

  // T1 weight: prefer when hp+mods warrant it (~70% when available)
  if (templates.includes('T1') && rng() < 0.7) return 'T1'
  if (templates.includes('T2') && templates.includes('T3') && ctx.chassisMatched) {
    return rng() < 0.5 ? 'T2' : 'T3'
  }
  // Default: pick from unlocked set
  return templates[Math.floor(rng() * templates.length)]
}

// ─── Public entry point ───────────────────────────────────────────────────────

export function generateFeature(
  profile: CarProfile,
  mods: ModData[],
  variant: VariantData | null,
  ownerUnits: OwnerUnits,
  photos: PhotoSlot[] = [],
): GeneratedFeature {
  const ctx = buildContext(profile, mods, variant, ownerUnits)

  const headlineRng = makeRng(ctx.carId, SALT_HEADLINE)
  const deckRng     = makeRng(ctx.carId, SALT_DECK)

  const usedWords = new Set<string>()

  // 1. Template selection
  const templateRng = makeRng(ctx.carId, SALT_HEADLINE ^ 0x54454D50)
  const template = selectTemplate(ctx, templateRng)

  // 2. Headline
  const { text: headline, cormorantLine } = buildHeadline(
    ctx, template, usedWords, headlineRng,
  )

  // 3. Deck
  const deck = buildDeck(ctx, usedWords, deckRng)

  // 4. Captions
  const captions = buildCaptions(ctx, photos, usedWords, deckRng)

  return {
    headline,
    headlineTemplate: template,
    cormorantLine,
    deck,
    captions,
    archetype: ctx.archetype,
    tier: ctx.tier,
  }
}

// Re-export context builder for test harnesses
export { buildContext }
