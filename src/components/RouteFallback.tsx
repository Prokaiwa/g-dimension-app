// Shown while a lazily-loaded route chunk is downloading. Deliberately just the
// app's dark canvas (#050507) — no spinner — so it's visually identical to the
// fade-from-dark the destinations already arrive through (ArrivalFade). In-app
// the home zoom hides it entirely; routes are also prefetched on idle so it's
// rarely seen at all.
export default function RouteFallback() {
  return <div style={{ position: 'fixed', inset: 0, background: '#050507' }} aria-hidden />
}
