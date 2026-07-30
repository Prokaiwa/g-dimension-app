// Route: /admin — the owner's hub. Every surface that exists for the operator
// rather than for drivers, in one reachable place instead of a set of URLs you
// have to remember.
//
// Reached from a NavRow in Profile that only renders for admins. Wrapped in
// AdminOnly like the tools it links to.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getReportQueue, getSuspendedUsers } from '../lib/moderation'
import { invalidateAttention } from '../lib/attention'
import { getCurrentUserProfile } from '../lib/userProfile'
import {
  GRADIENT_APP_BG, COLOR_HEADER_BLACK, COLOR_HEADER_TITLE, COLOR_ACCENT,
  FONT_UI, FONT_TITLE, HEADER_HEIGHT, SPACE_XS, SPACE_SM, SPACE_MD, SPACE_LG, SPACE_XL,
} from '../tokens'

const CREAM = '#f0e4c8'
const MUTED = 'rgba(240,228,200,0.5)'
const FAINT = 'rgba(240,228,200,0.32)'

type Tool = {
  label: string
  sub: string
  /** In-app route. Mutually exclusive with `href`. */
  to?: string
  /** Full URL, for things that want a real navigation (query-param consoles). */
  href?: string
  /** Right-aligned status, e.g. the open-report count. */
  badge?: string | null
}

function Section({ title, note, tools, onGo }: {
  title: string; note?: string; tools: Tool[]; onGo: (t: Tool) => void
}) {
  const shown = tools.filter(t => t.to || t.href)
  if (shown.length === 0) return null
  return (
    <>
      <p style={{
        fontFamily: FONT_UI, fontWeight: 800, fontSize: 9, letterSpacing: '0.18em',
        textTransform: 'uppercase', color: FAINT, margin: `${SPACE_XL}px 0 ${SPACE_XS}px`,
      }}>{title}</p>
      {note && (
        <p style={{ fontFamily: FONT_UI, fontSize: 11.5, color: FAINT, margin: `0 0 ${SPACE_XS}px`, lineHeight: 1.5 }}>
          {note}
        </p>
      )}
      <div>
        {shown.map(t => (
          <div
            key={t.label}
            role="button" tabIndex={0}
            onClick={() => onGo(t)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onGo(t) } }}
            style={{
              display: 'flex', alignItems: 'center', gap: SPACE_MD, padding: '14px 0',
              borderBottom: '1px solid rgba(240,228,200,0.07)', cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 15, color: CREAM, margin: 0, lineHeight: 1.2 }}>
                {t.label}
              </p>
              <p style={{ fontFamily: FONT_UI, fontSize: 12, color: MUTED, margin: '3px 0 0', lineHeight: 1.4 }}>
                {t.sub}
              </p>
            </div>
            {t.badge && (
              <span style={{
                fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, color: COLOR_ACCENT, flexShrink: 0,
              }}>{t.badge}</span>
            )}
            <span style={{ flexShrink: 0, color: FAINT, fontSize: 20, lineHeight: 1 }}>›</span>
          </div>
        ))}
      </div>
    </>
  )
}

export default function AdminHubPage() {
  const navigate = useNavigate()
  const [openReports, setOpenReports] = useState<number | null>(null)
  const [handle, setHandle] = useState<string | null>(null)
  const [suspended, setSuspended] = useState<number | null>(null)

  useEffect(() => {
    // Opening the hub is a good moment to re-check, so the glow can't be stale
    // by the time you're looking at the thing it points to.
    invalidateAttention()
    getReportQueue().then(rs => setOpenReports(rs.filter(r => r.status === 'open').length))
    getCurrentUserProfile().then(p => setHandle(p?.username ?? null))
    getSuspendedUsers().then(rs => setSuspended(rs.length))
  }, [])

  const go = (t: Tool) => {
    if (t.href) window.location.assign(t.href)
    else if (t.to) navigate(t.to)
  }

  return (
    <div style={{
      minHeight: '100dvh', background: GRADIENT_APP_BG,
      paddingBottom: `calc(${SPACE_XL}px + env(safe-area-inset-bottom))`,
    }}>
      <div style={{
        height: HEADER_HEIGHT, background: COLOR_HEADER_BLACK, display: 'flex', alignItems: 'center',
        padding: `0 ${SPACE_MD}px`, gap: SPACE_SM, position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button onClick={() => navigate('/profile')} style={{
          background: 'none', border: 'none', cursor: 'pointer', color: COLOR_HEADER_TITLE,
          fontSize: 22, lineHeight: 1, padding: 0, WebkitTapHighlightColor: 'transparent',
        }}>‹</button>
        <span style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 19, color: COLOR_HEADER_TITLE }}>
          Admin
        </span>
      </div>

      <div style={{ padding: `0 ${SPACE_MD}px ${SPACE_LG}px` }}>
        <Section
          title="Moderation"
          tools={[{
            label: 'Reports',
            // Deliberately NOT "nothing waiting" when the count is 0: the queue
            // read returns an empty list on failure too, so that would be a
            // false reassurance on the one screen where it matters. The badge's
            // absence says "none I could see", which claims nothing.
            sub: 'Review, dismiss, hide, or suspend',
            to: '/admin/reports',
            badge: openReports ? `${openReports} open` : null,
          }, {
            label: 'Suspended accounts',
            sub: 'Review and lift suspensions',
            to: '/admin/suspended',
            badge: suspended ? `${suspended}` : null,
          }]}
          onGo={go}
        />

        <Section
          title="Design tools"
          note="Read-only previews. Safe to open on a real phone."
          tools={[
            { label: 'Sound board',    sub: 'Audition every UI sound. Ignores the Settings toggle', to: '/sound-test' },
            { label: 'Permit ladder',  sub: 'Every licence grade with sample data, front and back', to: '/license-preview' },
            { label: 'Trading cards',  sub: 'Print-ready front/back PNGs for any public car',       to: '/dev/trading-cards' },
          ]}
          onGo={go}
        />

        <Section
          title="Map console"
          note="Live-edits the public profile's node positions and road curves. Changes are local only — copy the values into the code."
          tools={[{
            label: 'Tune the public map',
            sub: handle ? `Opens /builds/${handle} with the console` : 'Needs your handle to load',
            href: handle ? `/builds/${handle}?tune` : undefined,
          }]}
          onGo={go}
        />

        <p style={{
          fontFamily: FONT_UI, fontSize: 11, color: FAINT, lineHeight: 1.6,
          marginTop: SPACE_XL, textAlign: 'center',
        }}>
          Everything here is gated on the <strong>admin</strong> user flag.
          Actions re-check it server-side, so this menu grants nothing on its own.
          <br /><br />
          <code>/spec-test</code> is deliberately not listed: it writes real rows
          to a real car and only exists in a dev build.
        </p>
      </div>
    </div>
  )
}
