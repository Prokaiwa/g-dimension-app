// Mounted on the Home hub. Once the tour is out of the way, it recomputes the
// permit from live data, ratchets/persists it, and — if the earned grade
// outranks what the user has already been shown — fires the celebration and
// marks it seen. Also reports the current grade up so the header avatar can
// wear its grade-frame. Rendering nothing until there's something to celebrate.
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getLicenseStats, resolveLicense, type GradeId } from '../lib/license'
import { getSeenGrade, setSeenGrade, isRankUp } from '../lib/permit'
import { prewarmRankUp } from '../lib/sound'
import { useTour } from '../tour/TourContext'
import PermitCelebration from './PermitCelebration'

export default function PermitWatcher({ onState }: {
  onState?: (s: { grade: GradeId | null; pending: boolean }) => void
}) {
  const { active } = useTour()
  const [celebrate, setCelebrate] = useState<GradeId | null>(null)
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
        .from('users').select('license_grade').eq('id', uid).maybeSingle()
      if (cancelled) return
      const stored = (row as { license_grade: string | null } | null)?.license_grade ?? null

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
      if (pending && earned) setCelebrate(earned)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  if (!celebrate) return null
  return (
    <PermitCelebration
      gradeId={celebrate}
      onDone={() => {
        setSeenGrade(earnedRef.current)
        setCelebrate(null)
        onState?.({ grade: earnedRef.current, pending: false })
      }}
    />
  )
}
