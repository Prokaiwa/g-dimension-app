// Route: /notifications — what's happened to your account and builds
// (migration 087, ADR-025).
//
// The Profile bell opens the SHEET version of this; the route stays because it
// is deep-linkable and because the suspension banner points people here by
// name. Both render the same <NoticeList>, so the copy can only ever exist in
// one place.
import { useNavigate } from 'react-router-dom'
import NoticeList from '../components/NoticeList'
import {
  GRADIENT_APP_BG, COLOR_HEADER_BLACK, COLOR_HEADER_TITLE,
  FONT_TITLE, HEADER_HEIGHT_SAFE, SAFE_TOP, SPACE_MD, SPACE_SM, SPACE_LG,
} from '../tokens'

export default function NotificationsPage() {
  const navigate = useNavigate()
  return (
    <div style={{
      minHeight: '100dvh', background: GRADIENT_APP_BG,
      paddingBottom: `calc(${SPACE_LG}px + env(safe-area-inset-bottom))`,
    }}>
      <div style={{
        height: HEADER_HEIGHT_SAFE, background: COLOR_HEADER_BLACK, display: 'flex', alignItems: 'center',
        padding: `0 ${SPACE_MD}px`, gap: SPACE_SM, position: 'sticky', top: 0, zIndex: 10, paddingTop: SAFE_TOP }}>
        <button onClick={() => navigate('/profile')} style={{
          background: 'none', border: 'none', cursor: 'pointer', color: COLOR_HEADER_TITLE,
          fontSize: 22, lineHeight: 1, padding: 0, WebkitTapHighlightColor: 'transparent',
        }}>‹</button>
        <span style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 19, color: COLOR_HEADER_TITLE }}>
          Notifications
        </span>
      </div>

      <div style={{ padding: SPACE_MD }}>
        <NoticeList onGo={(href, state) => navigate(href, state ? { state } : undefined)} />
      </div>
    </div>
  )
}
