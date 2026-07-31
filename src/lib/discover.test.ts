import { describe, it, expect } from 'vitest'
import { hitHref, buildCountLabel, MIN_QUERY, EMPTY_HOME, type SearchHit } from './discover'

const base: SearchHit = {
  kind: 'build', user_id: 'u1', username: 'scantee', display_name: 'Scan',
  avatar_url: null, city: null, country_code: null,
  car_id: 'car1', car_label: '2006 Lexus LS 430', nickname: 'Big Body',
  photo_url: null, build_count: 2, score: 3, sim: 0.8,
}

describe('hitHref', () => {
  // The whole point of a build hit is that it opens THAT car. Dropping the
  // param would land on whichever car the owner happens to have active, which
  // is a different build than the one that was tapped.
  it('pins the car a build hit refers to', () => {
    expect(hitHref(base)).toBe('/builds/scantee?car=car1')
  })

  it('sends a person hit to the profile with no car pinned', () => {
    expect(hitHref({ ...base, kind: 'person', car_id: null })).toBe('/builds/scantee')
  })

  // A build row that somehow lost its car id must still go somewhere real
  // rather than building '/builds/scantee?car=null'.
  it('falls back to the profile when a build hit has no car id', () => {
    expect(hitHref({ ...base, car_id: null })).toBe('/builds/scantee')
  })

  it('gives up when there is no handle to route to', () => {
    expect(hitHref({ ...base, username: null })).toBeNull()
  })
})

describe('buildCountLabel', () => {
  it('singularises one', () => {
    expect(buildCountLabel(1)).toBe('1 build')
  })
  it('pluralises everything else, including zero', () => {
    expect(buildCountLabel(0)).toBe('0 builds')
    expect(buildCountLabel(7)).toBe('7 builds')
  })
})

describe('discovery constants', () => {
  // One character matches a large fraction of any corpus and reads as noise;
  // the floor is what keeps the first keystroke from dumping the whole list.
  it('requires at least two characters before searching', () => {
    expect(MIN_QUERY).toBe(2)
  })

  // The page renders straight from this when the RPC fails or predates 092, so
  // every collection has to be a real empty array, never undefined.
  it('has a fully-formed empty landing payload', () => {
    expect(EMPTY_HOME.total).toBe(0)
    expect(EMPTY_HOME.people).toBe(0)
    expect(EMPTY_HOME.models).toEqual([])
    expect(EMPTY_HOME.makes).toEqual([])
    expect(EMPTY_HOME.recent).toEqual([])
  })
})
