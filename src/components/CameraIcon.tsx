// Camera glyph — matches the Garage carousel "Add Photo" icon (GarageCarsPage).
// Stroked, inherits a color so it can sit on light or dark surfaces.
export function CameraIcon({ size = 22, color, strokeWidth = 1.6 }: {
  size?: number
  color: string
  strokeWidth?: number
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2L8 5h8l1.5 2h2A1.5 1.5 0 0 1 21 8.5V18a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  )
}
