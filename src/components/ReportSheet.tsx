import { useRef, useState } from 'react'
import BottomSheet, { FieldLabel, sheetInput } from './BottomSheet'
import {
  REPORT_REASONS,
  isSevereReason,
  reportContent,
  blockUser,
  type ReportReason,
  type ReportTargetType,
} from '../lib/moderation'
import {
  FONT_UI, SPACE_XS, SPACE_SM, SPACE_MD, SPACE_LG,
  RADIUS_BUTTON, COLOR_ACCENT, COLOR_ERROR, COLOR_SUCCESS,
} from '../tokens'

const CREAM = '#f0e4c8'
const MUTED = 'rgba(240,228,200,0.5)'
const FAINT = 'rgba(240,228,200,0.32)'

// Report → block, in one flow (App Store Guideline 1.2). Three steps:
//   1. pick a reason
//   2. confirmation, which is also where blocking is offered
//   3. done
// Blocking is offered rather than automatic: reporting a photo as spam is not
// the same as never wanting to see that person again, and conflating them makes
// the block list meaningless.
export default function ReportSheet({
  open,
  onClose,
  targetType,
  targetId,
  targetUserId,
  targetLabel,
  blockLabel,
}: {
  open: boolean
  onClose: () => void
  targetType: ReportTargetType
  targetId: string
  /** Who to offer blocking. Omit to skip the block step (e.g. your own content). */
  targetUserId?: string | null
  /** What the user is reporting, e.g. "@dscan007" or "this photo". */
  targetLabel: string
  /**
   * Who blocking would apply to, when that isn't the thing being reported.
   * You block a person, never a photo — without this the block step reads
   * "Block this photo".
   */
  blockLabel?: string
}) {
  const whom = blockLabel ?? targetLabel
  const [reason, setReason]   = useState<ReportReason | null>(null)
  const [details, setDetails] = useState('')
  const [step, setStep]       = useState<'pick' | 'done'>('pick')
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [hidden, setHidden]   = useState(false)
  const [blocked, setBlocked] = useState(false)
  // Synchronous guard — the `busy` state updates asynchronously, so two taps in
  // the same tick would both pass a state check and file two reports. Same
  // pattern as the six create/save paths (2026-07-28 adversarial pass).
  const submitting = useRef(false)

  function reset() {
    setReason(null); setDetails(''); setStep('pick')
    setBusy(false); setError(null); setHidden(false); setBlocked(false)
    submitting.current = false
  }

  function close() { reset(); onClose() }

  async function submit() {
    if (!reason || submitting.current) return
    submitting.current = true
    setBusy(true); setError(null)
    const res = await reportContent(targetType, targetId, reason, details)
    setBusy(false)
    submitting.current = false
    if (!res.ok) { setError(res.error); return }
    setHidden(res.autoHidden)
    setStep('done')
  }

  async function doBlock() {
    if (!targetUserId || submitting.current) return
    submitting.current = true
    setBusy(true)
    const res = await blockUser(targetUserId)
    setBusy(false)
    submitting.current = false
    if (res.ok) setBlocked(true)
    else setError(res.error ?? 'Could not block.')
  }

  return (
    <BottomSheet open={open} onClose={close} title={step === 'done' ? 'Thanks' : 'Report'} busy={busy}>
      {step === 'pick' ? (
        <>
          <p style={{ fontFamily: FONT_UI, fontSize: 12.5, color: MUTED, margin: `0 0 ${SPACE_MD}px`, lineHeight: 1.5 }}>
            What's wrong with {targetLabel}? Reports are private. The owner is not told who reported.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginBottom: SPACE_MD }}>
            {REPORT_REASONS.map(r => {
              const active = reason === r.id
              return (
                <button
                  key={r.id}
                  onClick={() => setReason(r.id)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
                    width: '100%', textAlign: 'left', cursor: 'pointer',
                    padding: `${SPACE_SM}px ${SPACE_SM}px`,
                    background: active ? 'rgba(200,102,26,0.14)' : 'transparent',
                    border: `1px solid ${active ? COLOR_ACCENT : 'rgba(240,228,200,0.10)'}`,
                    borderRadius: 0, WebkitTapHighlightColor: 'transparent', minHeight: 44,
                  }}>
                  <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 13.5, color: active ? CREAM : 'rgba(240,228,200,0.8)' }}>
                    {r.label}
                  </span>
                  <span style={{ fontFamily: FONT_UI, fontSize: 11, color: FAINT }}>{r.sub}</span>
                </button>
              )
            })}
          </div>

          {reason && isSevereReason(reason) && (
            <p style={{
              fontFamily: FONT_UI, fontSize: 11.5, color: 'rgba(200,102,26,0.9)',
              margin: `0 0 ${SPACE_MD}px`, lineHeight: 1.5,
            }}>
              This build will be hidden straight away while it is reviewed.
            </p>
          )}

          <FieldLabel>Anything else (optional)</FieldLabel>
          <textarea
            value={details}
            onChange={e => setDetails(e.target.value.slice(0, 500))}
            rows={3}
            placeholder="Add context that would help."
            style={{ ...sheetInput, resize: 'none', marginBottom: SPACE_MD }}
          />

          {error && (
            <p style={{ fontFamily: FONT_UI, fontSize: 12, color: COLOR_ERROR, margin: `0 0 ${SPACE_SM}px` }}>{error}</p>
          )}

          <button
            onClick={submit}
            disabled={!reason || busy}
            style={{
              width: '100%', minHeight: 46, cursor: reason ? 'pointer' : 'default',
              background: reason ? COLOR_ACCENT : 'rgba(240,228,200,0.08)',
              color: reason ? '#fff5dc' : FAINT,
              border: 'none', borderRadius: RADIUS_BUTTON,
              fontFamily: FONT_UI, fontWeight: 800, fontSize: 13,
              letterSpacing: '0.10em', textTransform: 'uppercase',
              WebkitTapHighlightColor: 'transparent',
            }}>
            {busy ? 'Sending…' : 'Send report'}
          </button>
        </>
      ) : (
        <>
          <p style={{ fontFamily: FONT_UI, fontSize: 13.5, color: CREAM, margin: `0 0 ${SPACE_XS}px`, lineHeight: 1.5 }}>
            Report sent. We review every one.
          </p>
          <p style={{ fontFamily: FONT_UI, fontSize: 12, color: MUTED, margin: `0 0 ${SPACE_LG}px`, lineHeight: 1.5 }}>
            {hidden
              ? 'This build has been hidden while we take a look.'
              : 'Nothing changes on your end unless we find a problem.'}
          </p>

          {targetUserId && !blocked && (
            <>
              <p style={{ fontFamily: FONT_UI, fontSize: 12.5, color: MUTED, margin: `0 0 ${SPACE_SM}px`, lineHeight: 1.5 }}>
                Do you also want to block {whom}? They won't be told, and you can undo this in Settings.
              </p>
              {error && (
                <p style={{ fontFamily: FONT_UI, fontSize: 12, color: COLOR_ERROR, margin: `0 0 ${SPACE_SM}px` }}>{error}</p>
              )}
              <button
                onClick={doBlock}
                disabled={busy}
                style={{
                  width: '100%', minHeight: 46, cursor: 'pointer', marginBottom: SPACE_SM,
                  background: 'transparent', color: COLOR_ACCENT,
                  border: `1px solid ${COLOR_ACCENT}`, borderRadius: RADIUS_BUTTON,
                  fontFamily: FONT_UI, fontWeight: 800, fontSize: 13,
                  letterSpacing: '0.10em', textTransform: 'uppercase',
                  WebkitTapHighlightColor: 'transparent',
                }}>
                {busy ? 'Blocking…' : `Block ${whom}`}
              </button>
            </>
          )}

          {blocked && (
            <p style={{ fontFamily: FONT_UI, fontSize: 12.5, color: COLOR_SUCCESS, margin: `0 0 ${SPACE_MD}px` }}>
              Blocked. You can undo this in Settings.
            </p>
          )}

          <button
            onClick={close}
            style={{
              width: '100%', minHeight: 46, cursor: 'pointer',
              background: 'rgba(240,228,200,0.08)', color: CREAM,
              border: 'none', borderRadius: RADIUS_BUTTON,
              fontFamily: FONT_UI, fontWeight: 800, fontSize: 13,
              letterSpacing: '0.10em', textTransform: 'uppercase',
              WebkitTapHighlightColor: 'transparent',
            }}>
            Done
          </button>
        </>
      )}
    </BottomSheet>
  )
}
