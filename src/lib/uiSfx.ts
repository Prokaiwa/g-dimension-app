// One delegated listener drives every UI sound, so coverage is consistent
// across the whole app and new buttons get a sound for free — nothing stays
// silent, and there's a single source of truth instead of per-button calls.
//
// Classification of the pressed element (nearest match wins):
//   data-sfx="back" | "confirm" | "tick" | "skip"  — explicit override
//   a header back chevron (aria-label "Back", or text starting with ‹) — back
//   any other <button>, <a href>, or [role="button"]                   — tick
// Plain divs, inputs and text are ignored (mark them data-sfx if they need one).
//
// Each play* already no-ops when sound is disabled, so this respects the
// Settings toggle. Fires on pointerdown for snappy, native-feeling feedback.
import { playTick, playConfirm, playBack } from './sound'

let armed = false

export function initUiSfx(): void {
  if (typeof window === 'undefined' || armed) return
  armed = true

  window.addEventListener('pointerdown', (e) => {
    const start = e.target as Element | null
    if (!start) return
    const el = start.closest('[data-sfx], button, a[href], [role="button"]') as HTMLElement | null
    if (!el) return

    const tag = el.getAttribute('data-sfx')
    if (tag === 'skip') return
    if (tag === 'back')    { playBack(); return }
    if (tag === 'confirm') { playConfirm(); return }
    if (tag === 'tick')    { playTick(); return }

    // Heuristic back-button detection — covers every ‹ chevron with no marking.
    const label = (el.getAttribute('aria-label') || '').trim().toLowerCase()
    const text  = (el.textContent || '').trim()
    if (label === 'back' || text.startsWith('‹')) { playBack(); return }

    playTick()
  }, { capture: true })
}
