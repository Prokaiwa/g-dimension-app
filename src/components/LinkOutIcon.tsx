// Shared link-out glyph (arrow angled up-right) — replaces the ↗ character,
// which iOS renders with the emoji presentation instead of a clean arrow.
// Inherits color from the parent (currentColor) so each surface's existing
// span color/opacity styling keeps working unchanged.
export default function LinkOutIcon({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" aria-hidden
      fill="none" stroke="currentColor" strokeWidth="2.6"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'block' }}
    >
      <path d="M7 17 17 7" />
      <path d="M9 7h8v8" />
    </svg>
  )
}
