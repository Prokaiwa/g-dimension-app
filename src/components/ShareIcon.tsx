// Share glyph — arrow rising out of a tray (iOS-style share affordance).
// Stroked, inherits a color so it can sit on light or dark surfaces.
// Same shared-icon precedent as CameraIcon; buttons stay hand-rolled per page.
export function ShareIcon({ size = 18, color, strokeWidth = 2 }: {
  size?: number
  color: string
  strokeWidth?: number
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
      <path d="M12 15V3" />
      <path d="m7 8 5-5 5 5" />
    </svg>
  )
}
