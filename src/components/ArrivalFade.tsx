// Fade-in-from-dark for the five pages the Home map's zoom-exit dives into
// (/garage, /tuning, /maintenance, /timeline, /featured), so the exit dive
// and the arrival read as one continuous camera move. Renders a one-shot
// overlay that fades out and stays inert (pointer-events: none throughout).
export default function ArrivalFade() {
  return (
    <>
      <style>{'@keyframes gdimArrive { from { opacity: 1; } to { opacity: 0; } }'}</style>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 90,
        background: '#050507',
        pointerEvents: 'none',
        animation: 'gdimArrive 280ms ease-out 40ms both',
      }} />
    </>
  )
}
