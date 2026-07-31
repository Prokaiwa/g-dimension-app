import { describe, it, expect, beforeEach } from 'vitest'

// vitest runs in the `node` environment (vitest.config.ts), so there is no DOM
// and no localStorage. A five-line in-memory stand-in is the right scope here:
// switching the whole suite to jsdom for one file would slow every other test
// and change the environment they were written against.
const store = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)) },
  removeItem: (k: string) => { store.delete(k) },
  clear: () => { store.clear() },
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size },
} as Storage
import {
  getRecentSearches, addRecentSearch, removeRecentSearch, clearRecentSearches, recentHref,
} from './recentSearches'

const KEY = 'gdim_recent_searches'
const person = (id: string) => ({ kind: 'person' as const, id, username: `u${id}`, label: `User ${id}`, sub: null, image: null })

describe('recentSearches', () => {
  beforeEach(() => { localStorage.clear() })

  it('keeps the most recent tap at the front', () => {
    addRecentSearch(person('a'))
    addRecentSearch(person('b'))
    expect(getRecentSearches().map(r => r.id)).toEqual(['b', 'a'])
  })

  // The list is a SET ordered by recency. Re-tapping something you already
  // looked at should move it up, not sit twice in the list.
  it('promotes rather than duplicates on a re-tap', () => {
    addRecentSearch(person('a'))
    addRecentSearch(person('b'))
    addRecentSearch(person('a'))
    const rows = getRecentSearches()
    expect(rows.map(r => r.id)).toEqual(['a', 'b'])
    expect(rows).toHaveLength(2)
  })

  // A person and a build can share an id in principle; identity is the pair.
  it('treats a person and a build with the same id as different entries', () => {
    addRecentSearch({ ...person('x') })
    addRecentSearch({ kind: 'build', id: 'x', username: 'ux', label: 'A car', sub: null, image: null })
    expect(getRecentSearches()).toHaveLength(2)
  })

  it('caps the list at eight', () => {
    for (const c of 'abcdefghijkl') addRecentSearch(person(c))
    const rows = getRecentSearches()
    expect(rows).toHaveLength(8)
    expect(rows[0].id).toBe('l')
  })

  it('removes one entry without touching the rest', () => {
    addRecentSearch(person('a'))
    addRecentSearch(person('b'))
    expect(removeRecentSearch('person', 'b').map(r => r.id)).toEqual(['a'])
    expect(getRecentSearches().map(r => r.id)).toEqual(['a'])
  })

  it('clears everything', () => {
    addRecentSearch(person('a'))
    clearRecentSearches()
    expect(getRecentSearches()).toEqual([])
  })

  // Nothing without an identity or a handle can be routed to, so it must never
  // reach the list in the first place.
  it('refuses an entry that could not be opened', () => {
    addRecentSearch({ ...person('a'), id: '' })
    addRecentSearch({ ...person('b'), username: '' })
    expect(getRecentSearches()).toEqual([])
  })

  // localStorage is user-writable and survives deploys, so a malformed or
  // outdated payload must degrade to "no recents", never to a broken row.
  it('survives junk in storage', () => {
    localStorage.setItem(KEY, 'not json at all')
    expect(getRecentSearches()).toEqual([])
    localStorage.setItem(KEY, '{"not":"an array"}')
    expect(getRecentSearches()).toEqual([])
    localStorage.setItem(KEY, '[null, 3, {"kind":"person"}, {"kind":"person","id":"a","username":"ua","label":"A"}]')
    expect(getRecentSearches().map(r => r.id)).toEqual(['a'])
  })

  it('routes a build to its own car and a person to their profile', () => {
    expect(recentHref({ kind: 'build', id: 'car1', username: 'scantee', label: '', sub: null, image: null, at: 0 }))
      .toBe('/builds/scantee?car=car1')
    expect(recentHref({ kind: 'person', id: 'u1', username: 'scantee', label: '', sub: null, image: null, at: 0 }))
      .toBe('/builds/scantee')
  })
})
