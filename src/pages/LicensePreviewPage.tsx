// Dev/preview tool at /license-preview — renders every G-Dimension Permit grade
// (front + tap-to-flip checklist) with sample data, so the whole ladder can be
// eyeballed without grinding the real counts to each grade. Unlinked from any
// nav (same pattern as /sound-test); ships to prod but hidden.
import { useNavigate } from 'react-router-dom'
import { GRADES, computeLicense, type LicenseStats } from '../lib/license'
import LicenseCard from '../components/LicenseCard'
import { FONT_UI, COLOR_ACCENT, COLOR_CAVITY_BG } from '../tokens'

// A stats object that sits the holder EXACTLY at grade index `i`: every
// requirement up to and including grade i is met, and the next grade is
// partially met (~55%) so the flip side shows a realistic in-progress mix.
function statsAtGrade(i: number): LicenseStats {
  const s: LicenseStats = {
    cars: 0, mods: 0, timeline: 0, services: 0, details: 0,
    buildSheetPhotos: 0, diyGuides: 0, featuredPublished: 0, publicShared: 0,
  }
  // Meet every req of grades 0..i (take the max threshold seen per key).
  for (let g = 0; g <= i; g++) {
    for (const r of GRADES[g].reqs) s[r.key] = Math.max(s[r.key], r.need)
  }
  // Partially advance toward grade i+1 (leave it short so it can't tip over).
  const next = GRADES[i + 1]
  if (next) {
    for (const r of next.reqs) {
      const partial = Math.max(s[r.key], Math.floor(r.need * 0.55))
      // never actually satisfy the next grade
      s[r.key] = partial >= r.need ? r.need - 1 : partial
    }
  }
  return s
}

export default function LicensePreviewPage() {
  const navigate = useNavigate()
  return (
    <div style={{ minHeight: '100dvh', background: COLOR_CAVITY_BG, padding: '20px 16px calc(40px + env(safe-area-inset-bottom))' }}>
      <button onClick={() => navigate('/profile')} style={{ background: 'none', border: 'none', color: COLOR_ACCENT, fontFamily: FONT_UI, fontWeight: 700, fontSize: 14, cursor: 'pointer', padding: '4px 0 16px' }}>
        ‹ Profile
      </button>
      <h1 style={{ fontFamily: FONT_UI, fontWeight: 900, fontSize: 20, color: '#f5f5f5', margin: '0 0 4px' }}>Permit Preview</h1>
      <p style={{ fontFamily: FONT_UI, fontSize: 12.5, color: 'rgba(245,240,228,0.5)', margin: '0 0 24px', lineHeight: 1.5 }}>
        Every grade, front and flipped. Tap a card to see its next-grade checklist. Sample data only, this doesn't touch your account.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 30, maxWidth: 420, margin: '0 auto' }}>
        {GRADES.map((g, i) => {
          const lic = computeLicense(statsAtGrade(i))
          return (
            <div key={g.id}>
              <div style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(245,240,228,0.4)', margin: '0 0 10px' }}>
                Grade {g.id} · {g.className}
              </div>
              <LicenseCard
                grade={lic.current}
                next={lic.next}
                toNext={lic.toNext}
                driver="Hiroshi"
                handle="@hiroshi_ls430"
                licensed="06.2026" profileUrl="https://gdimension.app/builds/hiroshi_ls430"
              />
            </div>
          )
        })}

        {/* The pre-first-car provisional state */}
        <div>
          <div style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(245,240,228,0.4)', margin: '0 0 10px' }}>
            Provisional (no car yet)
          </div>
          <LicenseCard grade={null} next={null} toNext={[]} driver="Hiroshi" handle="@hiroshi_ls430" licensed="06.2026" profileUrl="https://gdimension.app/builds/hiroshi_ls430" />
        </div>
      </div>
    </div>
  )
}
