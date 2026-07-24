// Permit progression helpers for the rank-up celebration + avatar grade-frame.
//
// "Seen grade" is the last permit tier the user has been shown a celebration
// for, kept in localStorage. When the earned grade (the ratcheted
// users.license_grade) outranks the seen grade, we owe them a celebration.
// Device-local for v1 (a returning user on a new device may re-see one
// celebration — harmless); a users column is the cross-device upgrade later.
import { GRADES, type GradeId } from './license'

const SEEN_KEY = 'gdim_permit_seen'

export function getSeenGrade(): GradeId | null {
  try {
    const v = localStorage.getItem(SEEN_KEY)
    return v && GRADES.some(g => g.id === v) ? (v as GradeId) : null
  } catch {
    return null
  }
}

export function setSeenGrade(id: GradeId | null): void {
  try {
    if (id) localStorage.setItem(SEEN_KEY, id)
    else localStorage.removeItem(SEEN_KEY)
  } catch {
    /* private mode / disabled storage — non-critical */
  }
}

/** Ladder position of a grade id (-1 = unlicensed / unknown). */
export function rankOf(id: GradeId | null | undefined): number {
  return id ? GRADES.findIndex(g => g.id === id) : -1
}

/** True when `earned` is a higher rung than `seen` — a celebration is owed. */
export function isRankUp(earned: GradeId | null, seen: GradeId | null): boolean {
  return rankOf(earned) > rankOf(seen)
}

// Avatar grade-frame ring color per tier (mirrors the card materials). The
// higher your permit, the more distinguished your avatar reads everywhere.
export const GRADE_RING: Record<GradeId, string> = {
  P:  '#c3c7cd', // learner — cool white
  C:  '#b98a52', // bronze
  B:  '#cacace', // silver
  A:  '#d4ac54', // gold
  IA: '#8a1f25', // crimson
  S:  '#c8661a', // carbon → warm accent (visible on a dark ring)
}
