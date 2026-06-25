// Onboarding tour — step data. The engine (TourContext) drives navigation to
// each step's `route`; the overlay (TourOverlay) renders the bubble; HomePage
// draws the glowing orange line to `node` on home-map steps.
//
// Copy convention: **double-asterisks** mark a navigation keyword rendered in
// the amber accent (synced to the glowing line). `voice: true` renders the body
// in Cormorant (the personal/display voice); otherwise Hanken (functional).

export type TourNode = 'home' | 'tuning' | 'timeline' | 'maintenance' | 'featured'

export interface TourStep {
  id: string
  route: string                       // the engine keeps the URL on this route
  node?: TourNode                     // home-map steps: glow line + pulse this node
  body: string
  voice?: boolean
  place?: 'center' | 'top' | 'bottom' // bubble position (default: bottom)
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    route: '/home',
    place: 'center',
    voice: true,
    body: 'Welcome to G‑Dimension. Every car has a story — this is where you tell yours. Specs, mods, milestones, the whole build, documented and beautiful. Let’s take a quick lap.',
  },
  {
    id: 'node-home',
    route: '/home',
    node: 'home',
    place: 'top',
    body: 'Follow the line to **Home** — it opens your Garage, your car’s home base.',
  },
  {
    id: 'garage',
    route: '/garage',
    place: 'bottom',
    body: 'This is your **Garage**: your car’s identity, documents, reminders, snapshot, and build PDF all live here.',
  },
  {
    id: 'node-tuning',
    route: '/home',
    node: 'tuning',
    place: 'top',
    body: 'Next, follow the line to **Tuning** — where the build comes alive.',
  },
  {
    id: 'tuning',
    route: '/tuning',
    place: 'bottom',
    body: 'Your **Build Sheet** lists every mod by power, chassis, exterior and interior. Parts you own but haven’t installed wait in the **Parts Bin**.',
  },
  {
    id: 'node-maintenance',
    route: '/home',
    node: 'maintenance',
    place: 'top',
    body: 'Now to **Maintenance** — keep the running record.',
  },
  {
    id: 'maintenance',
    route: '/maintenance',
    place: 'bottom',
    body: 'Log every **Service** — oil, fluids, jobs with invoices — and every **Detail** to keep her looking right.',
  },
  {
    id: 'node-featured',
    route: '/home',
    node: 'featured',
    place: 'top',
    body: 'Now the fun one — follow the line to **Featured**.',
  },
  {
    id: 'featured',
    route: '/featured',
    place: 'bottom',
    voice: true,
    body: 'This is your car’s own magazine feature — build a cover, lay out the spreads, write the story. Your build, framed like the icons you grew up admiring.',
  },
  {
    id: 'node-timeline',
    route: '/home',
    node: 'timeline',
    place: 'top',
    body: 'Last stop — follow the line to **Timeline**.',
  },
  {
    id: 'timeline',
    route: '/timeline',
    place: 'bottom',
    voice: true,
    body: 'Every milestone in order — the day you bought it, the first mod, the proud days and the rough ones. The journal of your build.',
  },
  {
    id: 'closing',
    route: '/home',
    place: 'center',
    voice: true,
    body: 'That’s the lap. The garage is yours now — go build something worth documenting. Enjoy the journey.',
  },
]
