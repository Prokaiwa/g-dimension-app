// Keyboard-aware input scrolling.
//
// On Android especially, focusing a text field near the bottom of the screen
// can leave it hidden behind the on-screen keyboard. `interactive-widget=
// resizes-content` (index.html) asks the browser to shrink the layout viewport
// so its own scroll-into-view has room to work — but that's proven flaky in the
// field (Chrome doesn't always re-run scroll-into-view once the keyboard
// finishes animating, and installed-PWA webviews vary). So we drive it
// explicitly here, and in a way that works whether or not the browser honors
// resizes-content:
//
//   - We compare the focused field's rect against the VISUAL viewport's visible
//     bottom (visualViewport.offsetTop + height). Under resizes-visual the
//     visual viewport shrinks while the layout viewport doesn't, so the field's
//     layout-coordinate rect sits below the visible bottom → we detect it and
//     scroll. Under resizes-content both shrink together and the browser usually
//     already handled it → the field is above the visible bottom → we no-op.
//   - Because we only scroll when the field is genuinely occluded, there are no
//     gratuitous jumps for fields that are already visible (desktop included).
//
// Installed once from main.tsx (mirrors installChunkReloadGuard).

function isEditable(el: Element | null): el is HTMLElement {
  if (!el) return false
  const tag = el.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    (el as HTMLElement).isContentEditable
  )
}

export function installKeyboardScroll(): void {
  if (typeof window === 'undefined') return

  const bringFocusedIntoView = () => {
    const el = document.activeElement
    if (!isEditable(el)) return

    const vv = window.visualViewport
    const visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight
    const rect = el.getBoundingClientRect()

    // Only act when the field is actually under (or within 12px of) the
    // keyboard-occluded region. `block: 'center'` lifts it clear.
    if (rect.bottom > visibleBottom - 12) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }

  // Focusing a field opens the keyboard on a delay; wait for it to settle.
  document.addEventListener('focusin', (e) => {
    if (isEditable(e.target as Element)) setTimeout(bringFocusedIntoView, 300)
  })

  // Also catch the keyboard opening/resizing after focus (rAF-coalesced so a
  // burst of resize events during the open animation runs the check once).
  const vv = window.visualViewport
  if (vv) {
    let raf = 0
    vv.addEventListener('resize', () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(bringFocusedIntoView)
    })
  }
}
