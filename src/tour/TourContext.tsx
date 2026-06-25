// Onboarding tour engine. Holds tour state, drives route navigation to keep the
// URL on the active step's route, auto-starts once after the handle claim, and
// exposes a replay entry point for Settings.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { markTutorialSeen, resetTutorial } from '../lib/userProfile'
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
  notify: (event: string) => void
  jump: (stepId: string) => void
}

const noop = () => {}
const TourCtx = createContext<TourValue>({
  active: false, step: null, index: 0, total: TOUR_STEPS.length,
  next: noop, back: noop, skip: noop, replay: noop, notify: noop, jump: noop,
})

export const useTour = () => useContext(TourCtx)

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false)
  const [index, setIndex] = useState(0)
  const indexRef = useRef(0); indexRef.current = index
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

  // Pages call notify() at key moments (e.g. 'car-added'); if the active step is
  // waiting on that event, the tour advances. This is how the interactive
  // Garage flow (tap My Cars → add a car → Choose Car) gates on real actions.
  const activeRef = useRef(active); activeRef.current = active
  const notify = useCallback((event: string) => {
    if (!activeRef.current) return
    if (TOUR_STEPS[indexRef.current]?.waitFor === event) next()
  }, [next])

  // Jump straight to a step by id (e.g. skip the add-car steps when a car
  // already exists, on replay).
  const jump = useCallback((stepId: string) => {
    if (!activeRef.current) return
    const i = TOUR_STEPS.findIndex(s => s.id === stepId)
    if (i >= 0 && i !== indexRef.current) setIndex(i)
  }, [])

  const replay = useCallback(() => {
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id
      if (!uid) return
      uidRef.current = uid
      resetTutorial(uid).finally(() => { setIndex(0); setActive(true); navigate('/home') })
    })
  }, [navigate])

  // Auto-start once per session, when landing on /home, if not yet seen.
  // Retries the tutorial_seen read: right after sign-in the auth token may not
  // be attached yet, and a transient query failure must not silently suppress
  // the tour (which looked like "it only starts after a refresh").
  useEffect(() => {
    if (autoChecked.current) return
    if (location.pathname !== '/home') return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      const uid = data.user?.id
      if (!uid || cancelled) return
      for (let i = 0; i < 4; i++) {
        const { data: row, error } = await supabase
          .from('users').select('tutorial_seen').eq('id', uid).single()
        if (cancelled) return
        if (!error) {
          autoChecked.current = true
          if ((row as { tutorial_seen?: boolean })?.tutorial_seen === false) {
            uidRef.current = uid; setIndex(0); setActive(true)
          }
          return
        }
        // transient (token not ready / column cache) — back off and retry
        await new Promise(r => setTimeout(r, 400 * (i + 1)))
      }
      // all retries errored — leave autoChecked false so a later /home visit retries
    })()
    return () => { cancelled = true }
  }, [location.pathname])

  // Keep the URL on the active step's route. Fires only when the STEP changes
  // (not on every location change) so the user's own taps/navigations during
  // the interactive Garage flow aren't yanked back.
  useEffect(() => {
    if (!active || !step) return
    if (window.location.pathname !== step.route) navigate(step.route)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, index])

  return (
    <TourCtx.Provider value={{ active, step, index, total: TOUR_STEPS.length, next, back, skip, replay, notify, jump }}>
      {children}
    </TourCtx.Provider>
  )
}
