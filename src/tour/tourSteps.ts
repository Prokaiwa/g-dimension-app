// Onboarding tour — step data. The engine (TourContext) drives navigation to
// each step's `route`; the overlay (TourOverlay) renders the bubble; HomePage
// draws the cumulative glowing trail to `node` on home-map steps.
//
// Copy convention: **double-asterisks** mark a navigation keyword rendered in
// the amber accent (synced to the glowing line). `voice: true` renders the body
// in Cormorant (the personal/display voice); otherwise Hanken (functional).
// No em dashes in copy — they read as AI; use commas / full stops instead.

export type TourNode = 'home' | 'tuning' | 'timeline' | 'maintenance' | 'featured'

export interface TourStep {
  id: string
  route: string                       // the engine keeps the URL on this route
  node?: TourNode                     // home-map steps: glow trail + pulse this node (tap to advance)
  target?: string                     // data-tour key to spotlight + leave interactive
  waitFor?: string                    // advance when a page calls notify(<this>) (no Next button)
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
    body: 'Welcome to G‑Dimension. Every car has a story, and this is where you tell yours. Specs, mods, milestones, the whole build, documented and beautiful. Let’s take a quick lap.',
  },
  {
    id: 'node-home',
    route: '/home',
    node: 'home',
    // Home sits high on the map — keep the bubble low so it never covers the glow.
    place: 'bottom',
    body: 'First, follow the glow to **Home** and tap it. This opens your Garage, your car’s home base.',
  },
  {
    id: 'garage',
    route: '/garage',
    target: 'garage-tile-cars',
    waitFor: 'cars-opened',
    place: 'top',
    body: 'This is your **Garage**, the home base for everything about your car. Let’s start by adding it. Tap **My Cars**.',
  },
  {
    id: 'add-car',
    route: '/garage/cars',
    target: 'add-car',
    waitFor: 'add-open',
    place: 'top',
    body: 'Tap the **+** to add your first car.',
  },
  {
    id: 'add-car-fill',
    route: '/garage/cars',
    waitFor: 'car-added',
    place: 'top',
    body: 'Fill in your car’s details and tap Save. I’ll be right here.',
  },
  {
    id: 'car-success',
    route: '/garage/cars',
    target: 'car-details',
    place: 'top',
    voice: true,
    body: 'Beautiful. That’s your car in the garage. Tap **Details** any time to view or edit everything about it.',
  },
  {
    id: 'choose-car',
    route: '/garage/cars',
    target: 'choose-car',
    waitFor: 'car-chosen',
    place: 'top',
    body: 'Now tap **Choose** to set it as your active car. Everything you log follows it.',
  },
  {
    id: 'garage-tiles',
    route: '/garage',
    target: 'garage-tiles',
    place: 'top',
    body: 'Your Garage holds more too: documents, reminders, contacts, and a shareable Build PDF. Explore these whenever you like.',
  },
  {
    id: 'node-tuning',
    route: '/home',
    node: 'tuning',
    place: 'top',
    body: 'Now follow the line to **Tuning**, where the build comes alive. Tap it when you’re ready.',
  },
  {
    id: 'tuning',
    route: '/tuning',
    place: 'top',
    body: 'The **Build Sheet** is the catalog of all the work you’ve put into your car. Every mod you install, with optional DIY steps to help other builders. Got a new part you haven’t installed yet? Drop it in the **Parts Bin**.',
  },
  {
    id: 'node-maintenance',
    route: '/home',
    node: 'maintenance',
    place: 'top',
    body: 'Next, follow the line to **Maintenance** and tap to step inside.',
  },
  {
    id: 'maintenance',
    route: '/maintenance',
    place: 'top',
    body: 'Log every **Service** here, from an oil change to a brake job, and every **Detail** that keeps your car looking her best.',
  },
  {
    id: 'node-featured',
    route: '/home',
    node: 'featured',
    place: 'top',
    body: 'Now follow the line to **Featured**. This is the fun one. Tap it when you’re ready.',
  },
  {
    id: 'featured',
    route: '/featured',
    place: 'bottom',
    voice: true,
    body: 'This is your car’s own magazine feature. Build a cover, lay out the spreads, write the story. Your build, framed like the icons you grew up admiring.',
  },
  {
    id: 'node-timeline',
    route: '/home',
    node: 'timeline',
    place: 'top',
    body: 'Last stop. Follow the line to **Timeline** and tap to open it.',
  },
  {
    id: 'timeline',
    route: '/timeline',
    place: 'bottom',
    voice: true,
    body: 'Every milestone, chronicled in order, from the day you brought it home to your latest win. You can add your own entries too, like a track day or a car show, so the whole journey lives in one place.',
  },
  {
    id: 'closing',
    route: '/home',
    place: 'center',
    voice: true,
    body: 'That’s the lap. The garage is yours now. Go build something worth documenting, and enjoy the journey.',
  },
]
