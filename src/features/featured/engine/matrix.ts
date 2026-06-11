import type { GateContext, HeadlineTemplate, Archetype } from './types'

// Which headline templates are unlocked for a given context.
// Returns an ordered preference list — generate.ts picks from eligible ones.
// When HighMileage overlay is active, T6 heads the list and is strongly preferred.

export function unlockedTemplates(ctx: GateContext): HeadlineTemplate[] {
  const { archetype, overlay, modTier, hpInBounds } = ctx
  const isRestraintArchetype =
    archetype === 'Survivor' ||
    archetype === 'Daily' ||
    archetype === 'OEMPlus' ||
    overlay === 'HighMileage'

  if (isRestraintArchetype) {
    // T1 hard-blocked. HighMileage overlay claims headline via T6 (first = highest priority).
    if (overlay === 'HighMileage') {
      const templates: HeadlineTemplate[] = ['T6', 'T4']
      if (archetype === 'Survivor' || archetype === 'Daily') templates.push('T7')
      return templates
    }
    // Restraint without overlay: T4◦ / T7 only.
    const templates: HeadlineTemplate[] = ['T4']
    if (archetype === 'Survivor' || archetype === 'Daily') templates.push('T7')
    return templates
  }

  const templates: HeadlineTemplate[] = []

  // T1: hp present + mod-tier ≥ street
  if (hpInBounds && (modTier === 'street' || modTier === 'full'))
    templates.push('T1')

  // T2/T3: chassis/model resolvable
  if (ctx.chassisCode !== null || ctx.model !== '')
    templates.push('T2')

  if (ctx.chassisMatched)
    templates.push('T3')

  // T4: any tier
  templates.push('T4')

  return templates
}

// Pro-Touring flavor: Muscle archetype + Suspension/Brakes mods
export function isProTouring(ctx: GateContext): boolean {
  return (
    ctx.archetype === 'Muscle' &&
    (ctx.modCategories.includes('Suspension') ||
      ctx.modCategories.includes('Brakes'))
  )
}

// Pool weight ratios (approximate; used by generate.ts for weighted draw)
// Batch 2 §4: 50% archetype / 30% engine family / 20% heritage
export const POOL_WEIGHTS = {
  archetype: 5,
  engineFamily: 3,
  heritage: 2,
  chassis: 4,  // chassis lines feel like archetype specificity
} as const

// Archetypes that use the restraint register (hype vocabulary hard-blocked)
export const RESTRAINT_ARCHETYPES: readonly Archetype[] = [
  'Survivor',
  'Daily',
  'OEMPlus',
]

// Tokens that are blocked in restraint tier (Tier-3 also blocks these)
export const HYPE_TOKENS = [
  'icon', 'weapon', 'legend', 'beast', 'monster', 'savage', 'killer',
  'machine', 'warrior', 'dominator',
]
