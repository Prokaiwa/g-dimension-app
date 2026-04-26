// TODO: Implement ConcretePanelInput — Part 9 (Component Patterns)
//
// panel-input:
//   background: GRADIENT_PANEL (180deg #e6e6e8 → #d8d8da 45% → #c4c4c6)
//   color: COLOR_PANEL_TEXT (#2a2a2c)
//   font: FONT_UI, weight 700, 14px
//   padding: 12px 14px, height 44px
//   border: none; border-bottom: 1px solid COLOR_PANEL_LINE (#6a6a6c)
//   border-radius: RADIUS_NONE (0) — non-negotiable per Part 8
//   transition: border-color TRANSITION_STANDARD (200ms ease-out)
//   :focus → border-bottom-color: COLOR_ACCENT (#c8661a), outline: none
//
// panel-input-label:
//   font: FONT_UI, weight 700, 10px, uppercase, letter-spacing 0.1em
//   color: COLOR_TEXT_SECONDARY (#8a8a8c)
//   margin-bottom: 4px (SPACE_XS)

import {
  GRADIENT_PANEL,
  COLOR_PANEL_TEXT,
  COLOR_PANEL_LINE,
  COLOR_ACCENT,
  COLOR_TEXT_SECONDARY,
  FONT_UI,
  SPACE_XS,
  RADIUS_NONE,
  TRANSITION_STANDARD,
} from '../tokens'

export interface ConcretePanelInputProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: 'text' | 'number' | 'email' | 'password' | 'tel'
  disabled?: boolean
}

void GRADIENT_PANEL
void COLOR_PANEL_TEXT
void COLOR_PANEL_LINE
void COLOR_ACCENT
void COLOR_TEXT_SECONDARY
void FONT_UI
void SPACE_XS
void RADIUS_NONE
void TRANSITION_STANDARD

export default function ConcretePanelInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled = false,
}: ConcretePanelInputProps) {
  return (
    <div>
      {/* TODO: Full ConcretePanelInput with label + concrete gradient — Part 9 */}
      <label style={{ fontFamily: FONT_UI, color: COLOR_TEXT_SECONDARY, fontSize: 10, marginBottom: SPACE_XS }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={{ background: GRADIENT_PANEL, color: COLOR_PANEL_TEXT, borderRadius: RADIUS_NONE }}
      />
    </div>
  )
}
