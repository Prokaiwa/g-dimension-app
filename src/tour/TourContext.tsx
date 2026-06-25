// Onboarding tour engine. Holds tour state, drives route navigation to keep the
// URL on the active step's route, auto-starts once after the handle claim, and
// exposes a replay entry point for Settings.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { hasSeenTutorial, markTutorialSeen, resetTutorial } from '../lib/userProfile'
import { TOUR_STEPS, type TourStep } from './tourSteps'

interface TourValue {
  active: boolean
  step: TourStep | null
  index: number
  total: number
  next: () => void
  back: () => void
  skip: () => void
  replay: () => void
}

const noop = () => {}
const TourCtx = createContext<TourValue>({
  active: false, step: null, index: 0, total: TOUR_STEPS.length,
  next: noop, back: noop, skip: noop, replay: noop,
})

export const useTour = () => useContext(TourCtx)

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false)
  const [index, setIndex] = useState(0)
  const uidRef = useRef<string | null>(null)
  const autoChecked = useRef(false)
  const navigate = useNavigate()
  const location = useLocation()

  const step = active ? (TOUR_STEPS[index] ?? null) : null

  const finish = useCallback(() => {
    setActive(false)
    if (uidRef.current) markTutorialSeen(uidRef.current)
    navigate('/home')
  }, [navigate])

  const next = useCallback(() => {
    setIndex(i => {
      if (i >= TOUR_STEPS.length - 1) { finish(); return i }
      return i + 1
    })
  }, [finish])

  const back = useCallback(() => setIndex(i => Math.max(0, i - 1)), [])
  const skip = useCallback(() => finish(), [finish])

  const replay = useCallback(() => {
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id
      if (!uid) return
      uidRef.current = uid
      resetTutorial(uid).finally(() => { setIndex(0); setActive(true); navigate('/home') })
    })
  }, [navigate])

  // Auto-start once per session, when landing on /home, if not yet seen.
  useEffect(() => {
    if (autoChecked.current) return
    if (location.pathname !== '/home') return
    autoChecked.current = true
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id
      if (!uid) return
      const seen = await hasSeenTutorial(uid)
      if (!seen) { uidRef.current = uid; setIndex(0); setActive(true) }
    })
  }, [location.pathname])

  // Keep the URL on the active step's route (this is the "walk into each
  // section" mechanism — advancing a step navigates the app).
  useEffect(() => {
    if (!active || !step) return
    if (location.pathname !== step.route) navigate(step.route)
  }, [active, step, location.pathname, navigate])

  return (
    <TourCtx.Provider value={{ active, step, index, total: TOUR_STEPS.length, next, back, skip, replay }}>
      {children}
    </TourCtx.Provider>
  )
}
