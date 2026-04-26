// TODO: Implement SkeuomorphicIconWrapper — Part 6 (Shadows), Part 9 (Component Patterns)
//
// Garage dashboard grid ONLY — 3×2 grid (Part 10).
// The 22.5° cast shadow applies HERE and NOWHERE ELSE (Part 6 CRITICAL, Part 23).
//
// Cast shadow positioning:
//   position absolute, width 56px, height 44px, background #000000
//   top 56%, left 52%, opacity 0.42, filter blur(1.4px), border-radius 2px, z-index 0
//   odd items:  rotate(22.5deg) skewX(-14deg)   — CAST_SHADOW_ROTATE_ODD
//   even items: rotate(-22.5deg) skewX(14deg)   — CAST_SHADOW_ROTATE_EVEN
//   These exact values are non-negotiable (Part 6)
//
// Icon wrapper: 56–120px tappable region (min 44px tap target — Part 5)
// Ground shadow (soft ellipse blur) behind icon — SHADOW_GROUND (Part 6)
// Drop shadow on icon itself — SHADOW_ICON_STANDARD (Part 6)
//
// Stagger animation on grid reveal: 400 + index * 70ms — STAGGER_BASE_MS, STAGGER_STEP_MS (Part 7)

import {
  CAST_SHADOW_ROTATE_ODD,
  CAST_SHADOW_ROTATE_EVEN,
  CAST_SHADOW_OPACITY,
  CAST_SHADOW_BLUR,
  SHADOW_ICON_STANDARD,
  SHADOW_GROUND,
  STAGGER_BASE_MS,
  STAGGER_STEP_MS,
  ICON_WRAPPER_GRID,
  ICON_WRAPPER_GRID_H,
  SPACE_TAP,
} from '../tokens'

export interface SkeuomorphicIconWrapperProps {
  iconSrc: string
  label: string
  index: number
  onClick: () => void
}

void CAST_SHADOW_ROTATE_ODD
void CAST_SHADOW_ROTATE_EVEN
void CAST_SHADOW_OPACITY
void CAST_SHADOW_BLUR
void SHADOW_ICON_STANDARD
void SHADOW_GROUND
void STAGGER_BASE_MS
void STAGGER_STEP_MS
void ICON_WRAPPER_GRID
void ICON_WRAPPER_GRID_H
void SPACE_TAP

export default function SkeuomorphicIconWrapper({
  iconSrc,
  label,
  index,
  onClick,
}: SkeuomorphicIconWrapperProps) {
  const isEven = index % 2 === 1
  const shadowTransform = isEven ? CAST_SHADOW_ROTATE_EVEN : CAST_SHADOW_ROTATE_ODD
  const staggerDelay = `${STAGGER_BASE_MS + index * STAGGER_STEP_MS}ms`

  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        minWidth: SPACE_TAP,
        minHeight: SPACE_TAP,
        cursor: 'pointer',
        animationDelay: staggerDelay,
      }}
    >
      {/* TODO: Ground shadow ellipse — Part 6 */}
      {/* TODO: Cast shadow — 22.5° Garage dashboard only — Part 6 */}
      <div
        style={{
          position: 'absolute',
          width: ICON_WRAPPER_GRID,
          height: ICON_WRAPPER_GRID_H,
          background: '#000000',
          top: '56%',
          left: '52%',
          transform: shadowTransform,
          opacity: CAST_SHADOW_OPACITY,
          filter: `blur(${CAST_SHADOW_BLUR})`,
          borderRadius: 2,
          zIndex: 0,
        }}
      />
      <img
        src={iconSrc}
        alt={label}
        style={{ position: 'relative', zIndex: 1, filter: SHADOW_ICON_STANDARD }}
      />
      <span>{label}</span>
    </div>
  )
}
