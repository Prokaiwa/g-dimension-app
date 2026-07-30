import type { ReactNode } from 'react'
import { useIsAdmin } from '../hooks/useIsAdmin'
import { GRADIENT_APP_BG, FONT_UI, SPACE_LG } from '../tokens'

/**
 * Wraps an owner-only route. Renders nothing while admin status resolves (so a
 * real admin never sees a flash of the refusal), then either the page or a
 * deliberately bland "Not available."
 *
 * Why bland: a non-admin who wanders in learns only that the URL does nothing.
 * Naming the tool or saying "admin only" tells them something worth probing.
 *
 * NOT a security boundary — it hides UI. Anything that touches data does its own
 * server-side `is_admin` check (migration 084). These particular pages are
 * read-only tools, so hiding them is the whole requirement.
 */
export default function AdminOnly({ children }: { children: ReactNode }) {
  const admin = useIsAdmin()

  if (admin === null) return <div style={{ minHeight: '100dvh', background: GRADIENT_APP_BG }} />

  if (!admin) {
    return (
      <div style={{
        minHeight: '100dvh', background: GRADIENT_APP_BG, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: SPACE_LG,
      }}>
        <p style={{ fontFamily: FONT_UI, fontSize: 13, color: 'rgba(240,228,200,0.5)', textAlign: 'center' }}>
          Not available.
        </p>
      </div>
    )
  }

  return <>{children}</>
}
