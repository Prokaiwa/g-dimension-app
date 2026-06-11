// Batch 1 — Universal Layer. Verbatim transcription. Do not alter any text.

import type { PoolLine, T4Line } from '../types'

// ─── T1 — Colon power formula ─────────────────────────────────────────────────
// Template: {Phrase}: {A/An} {hp} {Chassis|Model}
// Overall gate (applied in generate.ts): hpPresent + modTierStreet

export const T1_PHRASES: PoolLine[] = [
  { text: 'Boost Addiction',        gates: ['forcedInduction'] },
  { text: 'Talk Is Cheap',          gates: [] },
  { text: "Numbers Don't Lie",      gates: [] },
  { text: 'Built, Not Bought',      gates: [] },
  { text: 'The Hard Way',           gates: [] },
  { text: 'Proof Of Concept',       gates: [] },
  { text: 'More Than Enough',       gates: [] },
  { text: 'Power Trip',             gates: [] },
  { text: "Earning Its Keep",       gates: [] },
  { text: 'Spool Season',           gates: ['forcedInduction'] },
  { text: 'No Substitute',          gates: [] },
  { text: 'Doing The Math',         gates: [] },
]

// ─── T2 — Colon identity formula ─────────────────────────────────────────────
// Template: {Phrase}: {The/This} {ChassisDescriptor}
// Overall gate: chassisResolvable

export const T2_PHRASES: PoolLine[] = [
  { text: 'Unfinished Business',           gates: ['modCount4Plus'] },
  { text: 'Second Nature',                 gates: [] },
  { text: 'Known Quantity',                gates: [] },
  { text: 'The Long Way Around',           gates: [] },
  { text: 'Refining The Recipe',           gates: [] },
  { text: 'Old Habits',                    gates: [] },
  { text: 'Right Where It Belongs',        gates: [] },
  { text: 'The Quiet Type',                gates: ['modTierRestraint'] },
  { text: 'Still The One',                 gates: ['ownership5Plus'] },
  { text: 'Worth The Wait',                gates: [] },
]

// ─── T3 — Chassis + abstract noun ────────────────────────────────────────────
// Template: {Chassis} {Noun}
// Overall gate: chassisDB

export const T3_NOUNS: string[] = [
  'Perfection', 'Evolution', 'Heritage', 'Excellence',
  'Dreaming', 'Theory', 'Discipline', 'Form',
]

// ─── T4 — Philosophy standalone ──────────────────────────────────────────────
// restraintSafe (◦) = only set allowed for Survivor/Daily/OEMPlus/HighMileage

export const T4_PHRASES: T4Line[] = [
  { text: 'Less Is More',                            gates: [],                  restraintSafe: true },
  { text: 'Function Over Form',                      gates: [],                  restraintSafe: false },
  { text: 'Built With Purpose',                      gates: [],                  restraintSafe: false },
  { text: 'Form Follows Function',                   gates: [],                  restraintSafe: false },
  { text: 'Simple Works',                            gates: [],                  restraintSafe: true },
  { text: 'Substance First',                         gates: [],                  restraintSafe: true },
  { text: 'Driven, Not Trailered',                   gates: [],                  restraintSafe: false },
  { text: 'Period Correct',                          gates: ['age20Plus'],        restraintSafe: false },
  { text: 'Nothing Left Stock',                      gates: ['modCount13Plus'],   restraintSafe: false },
  { text: 'The Right Parts, For The Right Reasons',  gates: [],                  restraintSafe: false },
]

// ─── T6 — Mileage ─────────────────────────────────────────────────────────────
// Template slots: {N} = mileage in owner's units; {Miles|Kilometers} or {Mile|Kilometer}
// Overall gate: overlayHighMileage

export const T6_TEMPLATES: PoolLine[] = [
  { text: '{N} {Miles|Kilometers} And Counting',     gates: [] },
  { text: '{N} {Miles|Kilometers} Strong',           gates: [] },
  { text: '{N} {Miles|Kilometers} Later',            gates: [] },
  { text: '{N} {Miles|Kilometers}, No Excuses',      gates: [] },
  { text: '{N} {Miles|Kilometers} Deep',             gates: [] },
  { text: 'The {N}-{Mile|Kilometer} Club',           gates: [] },
]

// ─── T7 — Survivor / dignified standalone ─────────────────────────────────────
// Overall gate: archetypeSurvivorOrDaily

export const T7_PHRASES: PoolLine[] = [
  { text: 'Untouched',                               gates: ['modCountZero'] },
  { text: 'As {Make} Intended',                      gates: [] },
  { text: 'The Long Game',                           gates: [] },
  { text: 'Left Well Alone',                         gates: ['modCountZero'] },
  { text: 'Kept, Not Restored',                      gates: [] },
  { text: 'Time Capsule',                            gates: ['age25Plus'] },
  { text: 'Original & Unrepeatable',                 gates: ['engineOriginal'] },
  { text: 'Built To Last, Allowed To',               gates: [] },
]

// ─── Deck pools (by archetype) ────────────────────────────────────────────────

export const DECK_POOLS: Record<string, PoolLine[]> = {
  TimeAttack: [
    { text: 'Built for lap times, not for likes.',                        gates: [] },
    { text: 'Every gram and every degree accounted for.',                  gates: [] },
    { text: 'Aero, grip, and zero compromise.',                            gates: [] },
    { text: 'The stopwatch is the only critic that matters.',              gates: [] },
    { text: 'Corner-tested, street-legal — barely.',                  gates: ['usageTrack'] },
    { text: 'Downforce does the talking.',                                 gates: ['hasExteriorMod'] },
  ],
  Drift: [
    { text: 'Angle first. Everything else second.',                        gates: [] },
    { text: 'Sideways by design.',                                         gates: [] },
    { text: "Tires are consumables. Commitment isn't.",                    gates: [] },
    { text: 'Throttle steers this one.',                                   gates: ['drivetrainRwd'] },
    { text: 'Grip is optional equipment.',                                 gates: [] },
    { text: 'Built to slide, maintained to repeat it.',                    gates: [] },
  ],
  Drag: [
    { text: 'Straight lines, short stories.',                              gates: [] },
    { text: 'From A to B, violently.',                                     gates: [] },
    { text: 'Launch hard, lift never.',                                    gates: [] },
    { text: 'Traction is a negotiation.',                                  gates: [] },
    { text: 'Every pass tells the truth.',                                 gates: [] },
    { text: 'Built for the quarter.',                                      gates: ['usageDrag'] },
  ],
  ShowStance: [
    { text: 'Fitment measured in millimeters and patience.',               gates: [] },
    { text: 'Presence over pace.',                                         gates: [] },
    { text: 'Every panel earns a second look.',                            gates: [] },
    { text: 'Stance is a discipline, not a phase.',                        gates: [] },
    { text: "Detail work you can't unsee.",                                gates: [] },
    { text: 'Parked low, photographed often.',                             gates: [] },
  ],
  VIP: [
    { text: 'Luxury, lowered.',                                            gates: [] },
    { text: 'Executive class, curbside clearance.',                        gates: [] },
    { text: 'Big body, bigger patience.',                                  gates: [] },
    { text: 'Comfort and camber, in equal measure.',                       gates: [] },
    { text: 'First class never sat this low.',                             gates: [] },
    { text: 'Quiet luxury, loud fitment.',                                 gates: [] },
  ],
  OffRoad: [
    { text: 'Built for where the pavement gives up.',                      gates: [] },
    { text: 'The trail decides what’s necessary.',                    gates: [] },
    { text: 'Ground clearance is confidence.',                             gates: [] },
    { text: 'Pointed away from the highway.',                              gates: [] },
    { text: 'Mud is a maintenance item.',                                  gates: [] },
    { text: 'Capability first, comfort negotiable.',                       gates: [] },
  ],
  Daily: [
    { text: 'An everyday {Model} with nothing to prove.',                  gates: [] },
    { text: 'Rush hour to back road, same car.',                           gates: [] },
    { text: 'Honest miles, honest machine.',                               gates: [] },
    { text: 'Reliability is the modification.',                            gates: [] },
    { text: "It starts every morning. That's the brief.",                  gates: [] },
    { text: 'The commute never looked this good.',                         gates: [] },
  ],
  Survivor: [
    { text: 'Unrestored, original, and all the better for it.',            gates: ['modCountZero'] },
    { text: 'Kept the way it left the factory.',                           gates: ['modCountZero'] },
    { text: 'Preservation as a point of pride.',                           gates: [] },
    { text: 'Some cars survive. This one was kept.',                       gates: [] },
    { text: 'Still wearing its years honestly.',                           gates: [] },
    { text: 'Almost nothing added, nothing taken away.',                   gates: ['modCount1to3'] },
  ],
  OEMPlus: [
    { text: 'Factory intent, executed better.',                            gates: [] },
    { text: 'The changes whisper.',                                        gates: [] },
    { text: 'Catalog parts, curated taste.',                               gates: [] },
    { text: "Looks stock. Isn't. That's the point.",                       gates: [] },
    { text: 'Restraint is the hardest mod.',                               gates: [] },
    { text: 'Subtle enough to miss, good enough to matter.',               gates: [] },
  ],
  StreetBuild: [
    { text: 'Street-driven, properly sorted.',                             gates: [] },
    { text: 'The right formula, well executed.',                           gates: [] },
    { text: 'Built in stages, driven in all of them.',                     gates: [] },
    { text: 'No trailer queen. No excuses.',                               gates: [] },
    { text: 'A running tally of good decisions.',                          gates: [] },
    { text: 'Progress you can hear.',                                      gates: ['hasExhaust'] },
  ],
  Exotic: [
    { text: 'Some cars are events.',                                       gates: [] },
    { text: 'The poster, in person.',                                      gates: [] },
    { text: 'Engineering as occasion.',                                    gates: [] },
    { text: 'It never needed help turning heads.',                         gates: [] },
    { text: 'Built by obsessives, kept by one.',                           gates: [] },
    { text: "Even parked, it's moving.",                                   gates: [] },
  ],
  Muscle: [
    { text: 'Street-driven, properly sorted.',                             gates: [] },
    { text: 'The right formula, well executed.',                           gates: [] },
    { text: 'Built in stages, driven in all of them.',                     gates: [] },
    { text: 'No trailer queen. No excuses.',                               gates: [] },
    { text: 'A running tally of good decisions.',                          gates: [] },
    { text: 'Progress you can hear.',                                      gates: ['hasExhaust'] },
  ],
  HighMileage: [
    { text: '{N} miles of proof.',                                         gates: [] },
    { text: 'The pride is in the maintenance.',                            gates: [] },
    { text: '{N} miles and not done yet.',                                 gates: [] },
    { text: "Odometers don't lie. Neither does this one.",                 gates: [] },
    { text: "Still earning miles, not collecting dust.",                   gates: [] },
    { text: 'Original engine, undefeated.',                                gates: ['engineOriginal'] },
  ],
  Tier3: [
    { text: 'Documented, driven, and not done.',                           gates: [] },
    { text: "One owner's standards, fully logged.",                        gates: [] },
    { text: 'The build record speaks for itself.',                         gates: ['modCount4Plus'] },
    { text: 'Kept right and kept moving.',                                 gates: [] },
    { text: 'Every entry earned.',                                         gates: [] },
  ],
}

// ─── Caption pools ────────────────────────────────────────────────────────────

// §3a — Detail-pointer frames (slot: job/group photos)
// {part} = verified brand + title from the job
export const CAPTIONS_DETAIL_POINTER: PoolLine[] = [
  { text: 'Under the hood: {part}.',                 gates: [] },
  { text: 'The {part} does a lot of the talking.',   gates: [] },
  { text: 'Worth a closer look: {part}.',            gates: [] },
  { text: 'First thing you notice: {part}.',         gates: [] },
  { text: 'No mistaking the {part}.',                gates: [] },
  { text: "{Part}, doing exactly what it's there for.", gates: [] },
  { text: '{Part} — function you can see.',     gates: [] },
  { text: "The {part} wasn't optional.",             gates: [] },
]

// §3b — Spec-fact tags (slot: power/mileage captions)
// {Figure} {unit}. + one tag below
export const CAPTIONS_SPEC_FACT: PoolLine[] = [
  { text: 'The number speaks for itself.',           gates: [] },
  { text: 'Right where the owner wants it.',         gates: [] },
  { text: 'And room to grow.',                       gates: ['forcedInduction'] },
  { text: 'More than it needs. Exactly as intended.',gates: [] },
  { text: "That's with the windows up.",             gates: [] },
  { text: 'Earned the slow way.',                    gates: ['ownership5Plus'] },
  { text: '{N} miles in.',                           gates: ['overlayHighMileage', 'mileageInBounds'] },
]

// §3c — Identity reframes (slot: full-body / cover-adjacent photos)
// Keyed by archetype label used in generate.ts
export const CAPTIONS_IDENTITY: Record<string, PoolLine[]> = {
  TimeAttack: [
    { text: 'Every vent has a job.',                 gates: [] },
    { text: 'Nothing here is decoration.',           gates: [] },
  ],
  Drift: [
    { text: "The rear tires know what's coming.",    gates: [] },
    { text: 'Built around the slide.',               gates: [] },
  ],
  ShowStance: [
    { text: "Photographed the way it's parked: deliberately.", gates: [] },
    { text: 'The gap between wheel and fender is the résumé.', gates: [] },
  ],
  VIP: [
    { text: "Photographed the way it's parked: deliberately.", gates: [] },
    { text: 'The gap between wheel and fender is the résumé.', gates: [] },
  ],
  Survivor: [
    { text: "Stock-bodied, and that's the point.",   gates: ['noExteriorMods'] },
    { text: 'An honest car, photographed honestly.', gates: [] },
  ],
  Daily: [
    { text: "Stock-bodied, and that's the point.",   gates: ['noExteriorMods'] },
    { text: 'An honest car, photographed honestly.', gates: [] },
  ],
  OEMPlus: [
    { text: "You'd walk past it. You'd be wrong.",   gates: [] },
    { text: 'The factory would approve.',            gates: [] },
  ],
  StreetBuild: [
    { text: 'No apologies on this one.',             gates: [] },
    { text: 'The whole car agrees with itself.',     gates: [] },
  ],
  Muscle: [
    { text: 'No apologies on this one.',             gates: [] },
    { text: 'The whole car agrees with itself.',     gates: [] },
  ],
  Exotic: [
    { text: 'It photographs like it drives.',        gates: [] },
    { text: 'No bad angles by design.',              gates: [] },
  ],
  OffRoad: [
    { text: "The scratches are mileage.",            gates: [] },
    { text: "Built for the part where the map goes quiet.", gates: [] },
  ],
  Universal: [
    { text: '{Year} {Make} {Model}, as kept.',       gates: [] },
    { text: 'The car, as documented.',               gates: [] },
  ],
}
