// Mounted on the Home hub. Once the tour is out of the way, it recomputes the
// permit from live data, ratchets/persists it, and reports both the grade and
// whether a rank-up is owed, so the header avatar can wear its grade-frame and
// glow when there's something to claim.
//
// The celebration is deliberately NOT automatic: landing on Home behind a
// full-screen takeover the user never asked for is jarring, so the reveal waits
// for the `open` gate — Home flips it when the user taps the glowing avatar.
// That also means the celebration always starts from a real tap, which keeps
// iOS audio unlocked for the rank-up track.
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getLicenseStats, resolveLicense, type GradeId, type Grade, type GradeProgress } from '../lib/license'
import { getSeenGrade, setSeenGrade, isRankUp } from '../lib/permit'
import { prewarmRankUp } from '../lib/sound'
import { useTour } from '../tour/TourContext'
import PermitCelebration from './PermitCelebration'

type Celebration = {
  grade: Grade
  next: Grade | null
  toNext: GradeProgress[]
  driver: string
  handle: string
  licensed: string
  profileUrl: string
}

// "MM.YYYY" for the permit's Licensed field (matches ProfilePage's licensedDate).
function licensedFmt(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

export default function PermitWatcher({ open = false, onState }: {
  /** Set by Home when the user taps the glowing avatar to claim their permit. */
  open?: boolean
  onState?: (s: { grade: GradeId | null; pending: boolean }) => void
}) {
  const { active } = useTour()
  const [celebration, setCelebration] = useState<Celebration | null>(null)
  const ranRef = useRef(false)
  const earnedRef = useRef<GradeId | null>(null)

  useEffect(() => {
    if (active) return          // never interrupt the onboarding tour
    if (ranRef.current) return
    ranRef.current = true
    prewarmRankUp()             // warm the celebration track before it's needed
    let cancelled = false
    ;(async () => {
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth.user?.id
      if (!uid || cancelled) return

      const stats = await getLicenseStats(uid)
      if (cancelled) return
      const { data: row } = await supabase
        .from('users').select('license_grade, username, display_name, created_at').eq('id', uid).maybeSingle()
      if (cancelled) return
      const u = (row as { license_grade: string | null; username: string; display_name: string | null; created_at: string } | null)
      const stored = u?.license_grade ?? null

      const lic = resolveLicense(stats, stored)
      const earned = lic.persistId
      earnedRef.current = earned
      // Persist upward (ratchet) so the public badge stays current.
      if (earned !== stored) {
        supabase.from('users').update({ license_grade: earned }).eq('id', uid).then(() => {}, () => {})
      }

      const seen = getSeenGrade()
      const pending = isRankUp(earned, seen)
      onState?.({ grade: earned, pending })
      if (pending && lic.current && u) {
        setCelebration({
          grade: lic.current, next: lic.next, toNext: lic.toNext,
          driver: (u.display_name && u.display_name.trim()) || u.username,
          handle: `@${u.username}`,
          licensed: licensedFmt(u.created_at),
          profileUrl: `https://gdimension.app/builds/${u.username}`,
        })
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  if (!open || !celebration) return null
  return (
    <PermitCelebration
      {...celebration}
      onDone={() => {
        setSeenGrade(earnedRef.current)
        setCelebration(null)
        onState?.({ grade: earnedRef.current, pending: false })
      }}
    />
  )
}
