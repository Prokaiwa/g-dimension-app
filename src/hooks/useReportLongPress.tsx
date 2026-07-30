// Long-press to report — the per-photo / per-entry half of App Store
// Guideline 1.2 (ADR-023 shipped the build-level report; this reaches the
// things a visitor is actually looking at).
//
// WHY A HOOK AND NOT A COMPONENT: the public pages don't share a photo viewer.
// Each one has its own hand-built pager (PublicModDetailPage, PublicEntryDetail
// Page) or its own layout (the timeline cards, the magazine spreads), and the
// private ImageCarouselLightbox is never used out here. Wrapping them all in a
// common component would mean rewriting four viewers; a hook that hands back
// press handlers leaves every viewer exactly as it is.
//
// Per page the wiring is three lines:
//   const report = useReportLongPress(username)
//   <div {...report.bind('photo', p.id, 'this photo')} style={{...report.pressStyle}}>
//   {report.sheet}
//
// WHAT CAN BE REPORTED: only the target types the DB can actually resolve back
// to a car (084's `content_reports_autohide`): 'photo' → job_photos,
// 'timeline_entry' → timeline_entries, 'car' → itself. A DIY step photo or a
// Build Sheet group photo has no resolvable row of its own, so those surfaces
// report the CAR — the most specific thing that can be identified, and the
// thing moderation acts on anyway (084: "the lever is the car, not the photo").

import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import ReportSheet from '../components/ReportSheet'
import { supabase } from '../lib/supabase'
import { playConfirm } from '../lib/sound'
import type { ReportTargetType } from '../lib/moderation'

const HOLD_MS = 500
// Generous, because a hold on a phone is never perfectly still. Anything that
// travels further than this is a scroll or a swipe, not a press.
const MOVE_TOL = 12

type Target = { type: ReportTargetType; id: string; label: string }

/** Kills the iOS image callout ("Save Image…") that would otherwise race us. */
export const NO_CALLOUT: React.CSSProperties = {
  WebkitTouchCallout: 'none',
  WebkitUserSelect: 'none',
  userSelect: 'none',
}

/**
 * Exposed so a page whose element already uses these handlers can compose
 * rather than clobber (the timeline card's press-dim, for instance).
 */
export type PressHandlers = {
  onPointerDown?: (e: React.PointerEvent) => void
  onPointerMove?: (e: React.PointerEvent) => void
  onPointerUp?: (e: React.PointerEvent) => void
  onPointerCancel?: (e: React.PointerEvent) => void
  onPointerLeave?: (e: React.PointerEvent) => void
  onClickCapture?: (e: React.MouseEvent) => void
  onContextMenu?: (e: React.MouseEvent) => void
}

export type ReportLongPress = {
  /** Spread onto the element that should respond to a hold. */
  bind: (type: ReportTargetType, id: string, label: string) => PressHandlers
  /** Spread into that element's style so iOS doesn't open its own menu first. */
  pressStyle: React.CSSProperties
  /** Render once per page. Null until something has been pressed. */
  sheet: React.ReactNode
  /** False on your own build, so you're never offered a report on yourself. */
  enabled: boolean
}

/**
 * @param username the public profile being viewed, used to resolve who to
 *   offer blocking afterwards.
 * @param ownerIdHint pass it when the page already knows, to skip the lookup.
 */
export function useReportLongPress(
  username: string | undefined,
  ownerIdHint?: string | null,
): ReportLongPress {
  const [ownerId, setOwnerId] = useState<string | null>(ownerIdHint ?? null)
  const [viewerId, setViewerId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [target, setTarget] = useState<Target | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => { if (ownerIdHint) setOwnerId(ownerIdHint) }, [ownerIdHint])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      if (!alive) return
      setViewerId(data.session?.user?.id ?? null)
      // Only the definer view exposes the owner: anon's column grant on `cars`
      // deliberately excludes user_id (053/076).
      if (!ownerIdHint && username) {
        const { data: row } = await supabase
          .from('public_car_profiles').select('user_id').eq('username', username).limit(1).maybeSingle()
        if (!alive) return
        setOwnerId((row as { user_id: string } | null)?.user_id ?? null)
      }
      setReady(true)
    })()
    return () => { alive = false }
  }, [username, ownerIdHint])

  // Two gates:
  //  - signed in. Reporting needs an account (the row is keyed on reporter_id),
  //    and PublicProfilePage already hides "Report this build" from anon rather
  //    than letting someone pick a reason, type details, and only then be told
  //    to sign in. Verified live 2026-07-30: without this the anon flow runs to
  //    the end and fails with "Sign in to report."
  //  - not your own build. `ready` matters here: an owner pressing their own
  //    photo in the first moments would otherwise be offered a report on
  //    themself while the lookup was still in flight.
  const enabled = ready && !!viewerId && (!ownerId || viewerId !== ownerId)

  // One press is in flight at a time, so a single record is enough for every
  // bound element on the page.
  const press = useRef({ timer: 0, x: 0, y: 0, fired: false, touch: false })

  const cancel = () => {
    if (press.current.timer) { window.clearTimeout(press.current.timer); press.current.timer = 0 }
  }
  useEffect(() => cancel, [])

  const bind = (type: ReportTargetType, id: string, label: string): PressHandlers => {
    if (!enabled || !id) return {}
    return {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return
        cancel()
        press.current.x = e.clientX
        press.current.y = e.clientY
        press.current.fired = false
        press.current.touch = e.pointerType !== 'mouse'
        press.current.timer = window.setTimeout(() => {
          press.current.timer = 0
          press.current.fired = true
          // A hold has no visual of its own until the sheet animates in, so a
          // sound is the "yes, that registered". Confirm, not tick: the global
          // uiSfx listener already ticked on pointerdown for anything
          // button-ish, and two identical ticks read as one thing happening
          // twice rather than as a hold completing.
          playConfirm()
          setTarget({ type, id, label })
          setOpen(true)
        }, HOLD_MS)
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (!press.current.timer) return
        if (Math.abs(e.clientX - press.current.x) > MOVE_TOL ||
            Math.abs(e.clientY - press.current.y) > MOVE_TOL) cancel()
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onPointerLeave: cancel,
      // Swallow the click the browser fires when the finger lifts, so a hold on
      // a timeline card opens the sheet instead of also navigating into it.
      onClickCapture: (e: React.MouseEvent) => {
        if (!press.current.fired) return
        press.current.fired = false
        e.preventDefault()
        e.stopPropagation()
      },
      // Suppress the OS menu on touch only. On a desktop right-click, "Save
      // image" is a reasonable thing to want and we don't take it away.
      onContextMenu: (e: React.MouseEvent) => { if (press.current.touch) e.preventDefault() },
    }
  }

  // Kept mounted after close so the sheet can animate out rather than vanish.
  const sheet = target ? (
    <ReportSheet
      open={open}
      onClose={() => setOpen(false)}
      targetType={target.type}
      targetId={target.id}
      targetUserId={ownerId}
      targetLabel={target.label}
      blockLabel={username ? `@${username}` : 'this owner'}
    />
  ) : null

  return { bind, pressStyle: NO_CALLOUT, sheet, enabled }
}
