// TODO: Implement full Header component — Part 9 (Component Patterns)
//
// Two variants:
//   1. Full header (Home screen /home only)
//      - Burgundy wedge shapes on both ends, dark center (#111111), height 44px
//      - Left: Avatar (28px circle → /profile) + Username (Hanken 700 13px uppercase 0.1em header-warm)
//      - Right: Small car icon (28×14 cream SVG) + car name (Hanken 700 13px mixed-case header-warm)
//
//   2. Minimal header (all sub-screens)
//      - Same burgundy wedge layout
//      - Left: Back chevron "<" (18px header-warm) + screen title
//      - Right: Small car icon + car name — informational ONLY, never tappable (Part 9 CRITICAL)
//
// CRITICAL: Avatar taps to /profile, NOT /settings (Part 9, Part 13)
// CRITICAL: Car name in header is NEVER tappable (Part 9, Part 13)
// SVG wedge paths from tokens: HEADER_WEDGE_LEFT, HEADER_WEDGE_RIGHT (Part 8)
// Header cast shadow overlay (Home map only) — see Part 9 for gradient

import {
  COLOR_HEADER_BLACK,
  COLOR_HEADER_WARM,
  COLOR_HEADER_TITLE,
  COLOR_BURGUNDY_L,
  COLOR_BURGUNDY_M,
  COLOR_BURGUNDY_R,
  HEADER_HEIGHT,
  HEADER_WEDGE_LEFT,
  HEADER_WEDGE_RIGHT,
  FONT_UI,
} from '../tokens'

export interface FullHeaderProps {
  variant: 'full'
  username: string
  carName: string
  onAvatarPress: () => void
  avatarUrl?: string
}

export interface MinimalHeaderProps {
  variant: 'minimal'
  title: string
  carName: string
  onBackPress: () => void
}

export type HeaderProps = FullHeaderProps | MinimalHeaderProps

// Suppress "unused" warnings on tokens until implementation
void COLOR_HEADER_BLACK
void COLOR_HEADER_WARM
void COLOR_HEADER_TITLE
void COLOR_BURGUNDY_L
void COLOR_BURGUNDY_M
void COLOR_BURGUNDY_R
void HEADER_HEIGHT
void HEADER_WEDGE_LEFT
void HEADER_WEDGE_RIGHT
void FONT_UI

export default function Header(props: HeaderProps) {
  if (props.variant === 'full') {
    return (
      <div style={{ height: HEADER_HEIGHT, background: COLOR_HEADER_BLACK }}>
        {/* TODO: Full header — Part 9 */}
        <span style={{ color: COLOR_HEADER_WARM, fontFamily: FONT_UI }}>
          {props.username}
        </span>
      </div>
    )
  }

  return (
    <div style={{ height: HEADER_HEIGHT, background: COLOR_HEADER_BLACK }}>
      {/* TODO: Minimal header — Part 9 */}
      <span style={{ color: COLOR_HEADER_WARM, fontFamily: FONT_UI }}>
        {props.title}
      </span>
    </div>
  )
}
