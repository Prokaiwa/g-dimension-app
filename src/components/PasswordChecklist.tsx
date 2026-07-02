// Shared live password-requirements checklist for Signup + Reset Password.
// Quiet, compact — this is a dark minimal auth screen, not a SaaS form.
import {
  COLOR_SUCCESS,
  COLOR_TEXT_SECONDARY,
  FONT_UI,
  SPACE_XS,
} from '../tokens'

export interface PasswordRequirementResult {
  label: string
  met: boolean
}

const HAS_LOWER = /[a-z]/
const HAS_UPPER = /[A-Z]/
const HAS_NUMBER = /[0-9]/
const HAS_SYMBOL = /[^a-zA-Z0-9]/

export function passwordRequirements(password: string, confirm?: string): PasswordRequirementResult[] {
  const reqs: PasswordRequirementResult[] = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'A lowercase letter', met: HAS_LOWER.test(password) },
    { label: 'An uppercase letter', met: HAS_UPPER.test(password) },
    { label: 'A number', met: HAS_NUMBER.test(password) },
    { label: 'A symbol', met: HAS_SYMBOL.test(password) },
  ]
  if (confirm !== undefined && confirm.length > 0) {
    reqs.push({ label: 'Passwords match', met: password.length > 0 && password === confirm })
  }
  return reqs
}

// True once every base requirement is met AND (when confirm is provided) it matches.
export function passwordMeetsAll(password: string, confirm?: string): boolean {
  const base =
    password.length >= 8 &&
    HAS_LOWER.test(password) &&
    HAS_UPPER.test(password) &&
    HAS_NUMBER.test(password) &&
    HAS_SYMBOL.test(password)
  if (confirm === undefined) return base
  return base && confirm.length > 0 && password === confirm
}

export interface PasswordChecklistProps {
  password: string
  confirm?: string
}

export default function PasswordChecklist({ password, confirm }: PasswordChecklistProps) {
  const reqs = passwordRequirements(password, confirm)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        marginTop: SPACE_XS,
      }}
    >
      {reqs.map((r) => (
        <div
          key={r.label}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: FONT_UI,
            fontSize: 11,
            lineHeight: 1.4,
            color: r.met ? COLOR_SUCCESS : COLOR_TEXT_SECONDARY,
            transition: 'color 160ms ease',
          }}
        >
          <span style={{ fontSize: 11, width: 10, textAlign: 'center', flexShrink: 0 }}>
            {r.met ? '✓' : '·'}
          </span>
          {r.label}
        </div>
      ))}
    </div>
  )
}
