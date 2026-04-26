// TODO: Implement DestinationNode — Part 9 (Component Patterns), Part 10 (coordinates)
//
// Home map destination node — NO cast shadow (Home map is its own visual world — Part 6, Part 23)
//
// Standard node:   86×86px wrapper
// Focal node (HOME): 120×120px wrapper + amber underline (22px × 2px) + pulsing amber halo (garagePulse)
//
// dest: position absolute, flex-col, align-center, cursor pointer, translate(-50%, -50%)
// dest-icon-wrap: width/height per wrapper size, position relative
// img: max-width/height 100%, filter: SHADOW_ICON_STANDARD
//
// dest-label:
//   margin-top: 4px, font-weight 800, 11.5px
//   color: #1a1e24, letter-spacing 0.16em, text-transform uppercase
//   text-shadow: light emboss (see Part 9)
//
// Coordinates (center-anchored) from MAP_NODE_* tokens — Part 8

import {
  ICON_WRAPPER_STANDARD,
  ICON_WRAPPER_FOCAL,
  FOCAL_UNDERLINE_W,
  FOCAL_UNDERLINE_H,
  COLOR_ACCENT,
  SHADOW_ICON_STANDARD,
  FONT_UI,
  MAP_NODE_HOME,
  MAP_NODE_TUNING,
  MAP_NODE_TIMELINE,
  MAP_NODE_MAINTENANCE,
  MAP_NODE_PHOTOS,
} from '../tokens'

export interface DestinationNodeProps {
  label: string
  iconSrc: string
  isFocal?: boolean
  onClick: () => void
  /** Absolute position in px on the 390×844 canvas */
  position: { left: number; top: number }
}

void ICON_WRAPPER_STANDARD
void ICON_WRAPPER_FOCAL
void FOCAL_UNDERLINE_W
void FOCAL_UNDERLINE_H
void COLOR_ACCENT
void SHADOW_ICON_STANDARD
void FONT_UI
void MAP_NODE_HOME
void MAP_NODE_TUNING
void MAP_NODE_TIMELINE
void MAP_NODE_MAINTENANCE
void MAP_NODE_PHOTOS

export default function DestinationNode({
  label,
  iconSrc,
  isFocal = false,
  onClick,
  position,
}: DestinationNodeProps) {
  const size = isFocal ? ICON_WRAPPER_FOCAL : ICON_WRAPPER_STANDARD

  return (
    <div
      onClick={onClick}
      style={{
        position: 'absolute',
        left: position.left,
        top: position.top,
        transform: 'translate(-50%, -50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        cursor: 'pointer',
      }}
    >
      {/* TODO: Amber halo (garagePulse) behind icon for focal node — Part 9 */}
      <div style={{ width: size, height: size, position: 'relative' }}>
        <img
          src={iconSrc}
          alt={label}
          style={{ maxWidth: '100%', maxHeight: '100%', filter: SHADOW_ICON_STANDARD }}
        />
      </div>
      <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 11.5, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
        {label}
      </span>
      {/* TODO: Amber underline for focal node — Part 9 */}
      {isFocal && (
        <div style={{ width: FOCAL_UNDERLINE_W, height: FOCAL_UNDERLINE_H, background: COLOR_ACCENT, marginTop: 2 }} />
      )}
    </div>
  )
}
