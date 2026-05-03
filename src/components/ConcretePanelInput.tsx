import { useState } from 'react'
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
  autoComplete?: string
}

export default function ConcretePanelInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled = false,
  autoComplete,
}: ConcretePanelInputProps) {
  const [focused, setFocused] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <label
        style={{
          fontFamily: FONT_UI,
          fontWeight: 700,
          fontSize: 10,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: COLOR_TEXT_SECONDARY,
          marginBottom: SPACE_XS,
        }}
      >
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          background: GRADIENT_PANEL,
          color: COLOR_PANEL_TEXT,
          fontFamily: FONT_UI,
          fontWeight: 700,
          fontSize: 14,
          padding: '12px 14px',
          height: 44,
          border: 'none',
          borderBottom: `1px solid ${focused ? COLOR_ACCENT : COLOR_PANEL_LINE}`,
          borderRadius: RADIUS_NONE,
          outline: 'none',
          transition: `border-color ${TRANSITION_STANDARD}`,
          boxSizing: 'border-box',
          width: '100%',
          opacity: disabled ? 0.5 : 1,
        }}
      />
    </div>
  )
}
