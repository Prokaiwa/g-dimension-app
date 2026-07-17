// One-shot "open the box" entry transition for the Parts Bin aesthetic island.
// Two warm-black flaps cover the screen, hold for a beat ("soft goes black for
// a moment"), then part from the center outward — like opening a shipping box —
// revealing the kraft interior. A faint amber line on each flap's inner edge
// reads as the cut edge of cardboard catching warm light from inside.
//
// Mirrors the ArrivalFade pattern: a fixed overlay that animates on mount and
// then rests inert off-screen (pointer-events: none throughout, so it never
// blocks taps). Parts Bin only — this is a signature moment for the island,
// not a global transition.
//
// Knobs (tune freely): the `0%,21%` hold split = the closed beat; the 620ms
// duration = part speed; the rgba(...) inset line = seam glow.
export default function PartsBoxOpen() {
  return (
    <>
      <style>{`
        @keyframes partsBoxLeft  { 0%,21% { transform: translateX(0); } 100% { transform: translateX(-101%); } }
        @keyframes partsBoxRight { 0%,21% { transform: translateX(0); } 100% { transform: translateX(101%); } }
      `}</style>
      <div style={{ position: 'fixed', inset: 0, zIndex: 95, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', top: 0, bottom: 0, left: 0, width: '50.6%',
          background: 'linear-gradient(90deg, #0a0806 0%, #0a0806 86%, #170f08 100%)',
          boxShadow: 'inset -1px 0 0 rgba(200,140,70,0.16), 6px 0 18px rgba(0,0,0,0.5)',
          animation: 'partsBoxLeft 620ms cubic-bezier(0.22,1,0.36,1) both',
        }} />
        <div style={{
          position: 'absolute', top: 0, bottom: 0, right: 0, width: '50.6%',
          background: 'linear-gradient(270deg, #0a0806 0%, #0a0806 86%, #170f08 100%)',
          boxShadow: 'inset 1px 0 0 rgba(200,140,70,0.16), -6px 0 18px rgba(0,0,0,0.5)',
          animation: 'partsBoxRight 620ms cubic-bezier(0.22,1,0.36,1) both',
        }} />
      </div>
    </>
  )
}
