// Mulberry32 seeded PRNG — deterministic, zero deps.
// Seed = car.id (hashed to uint32). Per-slot XOR salts from Batch 1 §4.

export const SALT_HEADLINE  = 0x48454144
export const SALT_DECK      = 0xDECC0DE5
export const SALT_CAPTION   = (n: number) => (0xCAB0 + n) >>> 0

export function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return function () {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Hash a UUID string to a uint32 seed. */
export function seedFrom(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function makeRng(carId: string, salt: number): () => number {
  return mulberry32((seedFrom(carId) ^ salt) >>> 0)
}

/** Draw one item from `pool` using the given rng, without mutating the pool. */
export function draw<T>(pool: T[], rng: () => number): T | null {
  if (pool.length === 0) return null
  const idx = Math.floor(rng() * pool.length)
  return pool[idx]
}

/**
 * Draw without replacement: remove and return one item from the pool array.
 * Mutates the array — pass a copy when the original must be preserved.
 */
export function drawRemove<T>(pool: T[], rng: () => number): T | null {
  if (pool.length === 0) return null
  const idx = Math.floor(rng() * pool.length)
  return pool.splice(idx, 1)[0]
}
