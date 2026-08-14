// Store listing copy is length-capped by the consoles, and the consoles only
// tell you AFTER you have pasted. These assertions move that feedback into
// `npm run verify`, where editing the copy is cheap.
import { describe, it, expect } from 'vitest'
import {
  APP_STORE_FIELDS, PLAY_STORE_FIELDS,
  APPLE_PRIVACY, PLAY_DATA_SAFETY, LISTING_FACTS,
} from './storeListing'

const field = (id: string) =>
  [...APP_STORE_FIELDS, ...PLAY_STORE_FIELDS].find(f => f.id === id)!

describe('store listing fields', () => {
  it('every capped field is within its store limit', () => {
    for (const f of [...APP_STORE_FIELDS, ...PLAY_STORE_FIELDS]) {
      if (f.limit === undefined) continue
      expect(
        f.value.length,
        `${f.id} is ${f.value.length}/${f.limit}`,
      ).toBeLessThanOrEqual(f.limit)
    }
  })

  it('no field is accidentally empty', () => {
    for (const f of [...APP_STORE_FIELDS, ...PLAY_STORE_FIELDS]) {
      expect(f.value.trim().length, `${f.id} is empty`).toBeGreaterThan(0)
    }
  })

  // Apple indexes ONLY these three, and the budget is shared across them.
  it('Apple search budget stays within 160 characters', () => {
    const indexed =
      field('apple-name').value.length +
      field('apple-subtitle').value.length +
      field('apple-keywords').value.length
    expect(indexed).toBeLessThanOrEqual(160)
  })

  it('Apple keywords are comma separated with no spaces', () => {
    const kw = field('apple-keywords').value
    expect(kw).not.toMatch(/\s/)
    expect(kw.split(',').every(k => k.length > 0)).toBe(true)
  })

  // A keyword already present in the name or subtitle is indexed anyway, so
  // repeating it burns characters that could carry a new term.
  it('Apple keywords never repeat a word from the name or subtitle', () => {
    const words = new Set(
      `${field('apple-name').value} ${field('apple-subtitle').value}`
        .toLowerCase().split(/[^a-z]+/).filter(Boolean),
    )
    const repeated = field('apple-keywords').value
      .split(',').filter(k => words.has(k.toLowerCase()))
    expect(repeated, `repeated in name/subtitle: ${repeated.join(', ')}`).toEqual([])
  })

  // House rule (CLAUDE.md): em dashes read as AI-generated, and this copy is
  // the most public prose the project has.
  it('contains no em dashes', () => {
    for (const f of [...APP_STORE_FIELDS, ...PLAY_STORE_FIELDS]) {
      expect(f.value.includes('—'), `${f.id} has an em dash`).toBe(false)
    }
  })

  // Play ranks on the full description, and the ranking words are the ones a
  // person would actually search. Guard them against a well-meaning rewrite.
  it('Play full description opens with the category words', () => {
    const first = field('play-full').value.split('\n')[0].toLowerCase()
    for (const term of ['build journal', 'mod tracker', 'service log']) {
      expect(first, `missing "${term}" in the indexed first paragraph`).toContain(term)
    }
  })

  it('both stores ship the same description body', () => {
    expect(field('play-full').value).toBe(field('apple-description').value)
  })
})

describe('privacy answers', () => {
  it('nothing is declared as used for tracking', () => {
    // If this ever needs to change, NSPrivacyTracking in
    // ios/App/App/PrivacyInfo.xcprivacy has to change with it.
    expect(APPLE_PRIVACY.every(a => a.purpose !== 'Third-Party Advertising')).toBe(true)
  })

  it('every Apple privacy row names a category, type and purpose', () => {
    for (const a of APPLE_PRIVACY) {
      expect(a.category.length).toBeGreaterThan(0)
      expect(a.type.length).toBeGreaterThan(0)
      expect(a.purpose.length).toBeGreaterThan(0)
    }
  })

  it('Play data safety states deletion and encryption, which Google requires', () => {
    const labels = PLAY_DATA_SAFETY.map(r => r.label.toLowerCase()).join(' ')
    expect(labels).toContain('deletion')
    expect(labels).toContain('encrypted')
  })
})

describe('listing facts', () => {
  it('every URL is absolute https', () => {
    for (const f of LISTING_FACTS) {
      if (!f.label.toLowerCase().includes('url')) continue
      expect(f.value, `${f.label} is not https`).toMatch(/^https:\/\//)
    }
  })
})
