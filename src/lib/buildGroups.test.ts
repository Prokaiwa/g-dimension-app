import { describe, it, expect } from 'vitest'
import { MOD_GROUPS, CATEGORY_TO_GROUP, GROUP_PHOTO_COL } from './buildGroups'

describe('MOD_GROUPS shape', () => {
  it('has unique group ids', () => {
    const ids = MOD_GROUPS.map(g => g.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every group has a label and at least one category', () => {
    for (const g of MOD_GROUPS) {
      expect(g.label.length).toBeGreaterThan(0)
      expect(g.categories.length).toBeGreaterThan(0)
    }
  })

  it('no category appears in more than one group', () => {
    const all = MOD_GROUPS.flatMap(g => g.categories)
    expect(new Set(all).size).toBe(all.length)
  })

  it('contains the five canonical groups in display order', () => {
    expect(MOD_GROUPS.map(g => g.id)).toEqual(['power', 'chassis', 'exterior', 'interior', 'other'])
  })
})

describe('CATEGORY_TO_GROUP derivation', () => {
  it('maps every category of every group back to that group (can never drift)', () => {
    for (const g of MOD_GROUPS) {
      for (const c of g.categories) {
        expect(CATEGORY_TO_GROUP[c]).toBe(g.id)
      }
    }
  })

  it('contains no categories that are missing from MOD_GROUPS', () => {
    const declared = new Set(MOD_GROUPS.flatMap(g => g.categories))
    for (const c of Object.keys(CATEGORY_TO_GROUP)) {
      expect(declared.has(c)).toBe(true)
    }
  })

  it('unknown category yields undefined (callers must handle it)', () => {
    expect(CATEGORY_TO_GROUP['Not A Real Category']).toBeUndefined()
  })
})

describe('GROUP_PHOTO_COL', () => {
  it('covers exactly the four photo groups (other has no photo slot)', () => {
    expect(Object.keys(GROUP_PHOTO_COL).sort()).toEqual(['chassis', 'exterior', 'interior', 'power'])
  })

  it('every photo column follows the build_sheet_*_photo naming', () => {
    for (const [group, col] of Object.entries(GROUP_PHOTO_COL)) {
      expect(col).toBe(`build_sheet_${group}_photo`)
    }
  })

  it('every photo group exists in MOD_GROUPS', () => {
    const ids = new Set(MOD_GROUPS.map(g => g.id))
    for (const group of Object.keys(GROUP_PHOTO_COL)) {
      expect(ids.has(group)).toBe(true)
    }
  })
})
