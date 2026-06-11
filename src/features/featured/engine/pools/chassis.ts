// Batch 3 — Chassis Database. Verbatim transcription. Do not alter any text.
// Free-text chassis codes may match INTO this DB; they never create an entry.
// Epithets are used as {ChassisDescriptor} in T2; paired with T3 nouns.

import type { ChassisEntry } from '../types'

export const CHASSIS_DB: ChassisEntry[] = [

  // ─── Honda / Acura ────────────────────────────────────────────────────────

  // EG (EG6, EG9) — make: Honda
  {
    codes: ['EG', 'EG6', 'EG9'],
    make: ['honda'],
    epithets: [
      { text: 'the golden-era hatch',                               gates: [] },
      { text: 'the Kanjo favorite',                                 gates: [] },
    ],
    captions: [
      { text: 'EG lines, timeless from any angle.',                 gates: [] },
    ],
    decks: [
      { text: 'The hatch that defined an era of doing more with less.', gates: [] },
    ],
  },

  // EK (EK4, EK9) — make: Honda
  {
    codes: ['EK', 'EK4', 'EK9'],
    make: ['honda'],
    epithets: [
      { text: 'the EK hatch',                                       gates: [] },
      { text: 'the Type R original',                                gates: ['trimEK9orTypeR'] },
    ],
    captions: [
      { text: 'Championship White, worn correctly.',                gates: ['trimEK9orTypeR', 'colorWhite'] },
      { text: 'Championship White heritage, whatever this one wears.', gates: ['trimEK9orTypeR', 'colorNullOrNonWhite'] },
      { text: 'The EK still sets the FF benchmark conversation.',   gates: [] },
    ],
    decks: [],
  },

  // DC2 / DC5 — make: Honda or Acura
  {
    codes: ['DC2', 'DC5'],
    make: ['honda', 'acura'],
    epithets: [
      { text: 'the Integra',                                        gates: [] },
      { text: 'the front-drive benchmark',                          gates: ['trimTypeR'] },
    ],
    captions: [
      { text: 'The DC2-R argument: the best FF chassis, period.',   gates: ['trimTypeR'] },
      { text: 'Integra balance, still undefeated at its weight.',   gates: [] },
    ],
    decks: [],
  },

  // AP1 / AP2 — make: Honda
  {
    codes: ['AP1', 'AP2'],
    make: ['honda'],
    epithets: [
      { text: 'the S2000',                                          gates: [] },
      { text: 'the nine-thousand-rpm roadster',                     gates: ['chassisAP1'] },
    ],
    captions: [
      { text: 'An S2000 needs no modification to justify. These were chosen anyway.', gates: ['modCount4Plus'] },
    ],
    decks: [
      { text: 'The roadster Honda built to prove a point.',         gates: [] },
    ],
  },

  // NA1 / NA2 — make: Honda or Acura
  {
    codes: ['NA1', 'NA2'],
    make: ['honda', 'acura'],
    epithets: [
      { text: 'the analog supercar',                                gates: [] },
      { text: 'the everyday exotic',                                gates: [] },
    ],
    captions: [
      { text: 'The NSX thesis: a supercar you could actually live with.', gates: [] },
    ],
    decks: [
      { text: 'Aluminum, balance, and a senna-era sense of purpose.', gates: [] },
    ],
  },

  // FD2 — make: Honda
  {
    codes: ['FD2'],
    make: ['honda'],
    epithets: [
      { text: 'the four-door Type R',                               gates: [] },
    ],
    captions: [
      { text: 'The FD2 — the Type R that took itself most seriously.', gates: [] },
    ],
    decks: [],
  },

  // ─── Nissan ───────────────────────────────────────────────────────────────

  // S30 (incl. HS30, S30Z — 240Z / Fairlady Z) — make: Nissan OR Datsun
  {
    codes: ['S30', 'HS30', 'S30Z'],
    make: ['nissan', 'datsun'],
    epithets: [
      { text: 'the first Z',                                        gates: [] },
      { text: 'the Fairlady',                                       gates: [] },
    ],
    captions: [
      { text: 'The S30 — the shape that made Japanese performance undeniable.', gates: [] },
      { text: 'Midnight blue on an S30 carries a certain Wangan legend.', gates: ['colorBlue'] },
    ],
    decks: [
      { text: 'Fifty years on, still the silhouette to beat.',      gates: [] },
      { text: 'Built the way the Bayshore stories tell it.',        gates: ['modTierStreet'] },
    ],
  },

  // S13 (incl. PS13, RPS13 / "180SX") — make: Nissan
  {
    codes: ['S13', 'PS13', 'RPS13'],
    make: ['nissan'],
    epithets: [
      { text: 'the drift blueprint',                                gates: [] },
      { text: 'the original S-chassis',                             gates: [] },
    ],
    captions: [
      { text: 'Every drift story traces back to a chassis like this.', gates: [] },
    ],
    decks: [
      { text: 'The S13 — where sideways became a discipline.',      gates: [] },
    ],
  },

  // S14 — make: Nissan
  {
    codes: ['S14'],
    make: ['nissan'],
    epithets: [
      { text: 'the underrated Silvia',                              gates: [] },
      { text: 'the wide-body-ready S',                              gates: [] },
    ],
    captions: [
      { text: 'The S14 — overlooked then, hunted now.',             gates: [] },
    ],
    decks: [
      { text: 'The middle child of the S-chassis family, finally getting its due.', gates: [] },
    ],
  },

  // S15 — make: Nissan
  {
    codes: ['S15'],
    make: ['nissan'],
    epithets: [
      { text: 'the Silvia swansong',                                gates: [] },
      { text: 'the last S',                                         gates: [] },
    ],
    captions: [
      { text: 'The S15 ended the Silvia line on its highest note.', gates: [] },
    ],
    decks: [
      { text: 'The swansong Silvia, kept singing.',                 gates: [] },
    ],
  },

  // R32 / BNR32 — make: Nissan
  {
    codes: ['R32', 'HCR32', 'ECR32', 'BNR32'],
    make: ['nissan'],
    epithets: [
      { text: 'Godzilla',                                           gates: ['gtr'] },
      { text: 'the Group A legend',                                 gates: ['gtr'] },
      { text: 'the R32',                                            gates: [] },
    ],
    captions: [
      { text: "Godzilla's reputation was earned, not granted.",     gates: ['gtr'] },
      { text: "The R32 that lets the GT-R take the headlines — and quietly keeps up.", gates: [] },
    ],
    decks: [],
  },

  // R33 / BCNR33 — make: Nissan
  {
    codes: ['R33', 'BCNR33', 'ECR33'],
    make: ['nissan'],
    epithets: [
      { text: 'the R33',                                            gates: [] },
    ],
    captions: [
      { text: 'The R33 GT-R: underrated by everyone except physics.', gates: ['gtr'] },
    ],
    decks: [],
  },

  // R34 / BNR34 — make: Nissan
  {
    codes: ['R34', 'BNR34', 'ER34'],
    make: ['nissan'],
    epithets: [
      { text: 'the R34',                                            gates: [] },
    ],
    captions: [
      { text: 'The R34 — the one on every bedroom wall.',           gates: ['gtr'] },
    ],
    decks: [],
  },

  // Z32 / Z33 / Z34 — make: Nissan
  {
    codes: ['Z32', 'Z33', 'Z34'],
    make: ['nissan'],
    epithets: [
      { text: 'the Z',                                              gates: [] },
    ],
    captions: [
      { text: 'Z lineage — fifty years of the same good idea.',     gates: [] },
    ],
    decks: [],
  },

  // ─── Toyota / Lexus ───────────────────────────────────────────────────────

  // AE86 — make: Toyota
  {
    codes: ['AE86'],
    make: ['toyota'],
    epithets: [
      { text: 'the Hachiroku',                                      gates: [] },
      { text: 'the balance benchmark',                              gates: [] },
    ],
    captions: [
      { text: 'Hachiroku — the chassis that made momentum a philosophy.', gates: [] },
      { text: 'The panda livery comes with expectations.',          gates: ['colorPanda'] },
      { text: 'Made for the downhill. The cup of water stays put.', gates: [] },
    ],
    decks: [
      { text: 'The car that taught a generation to drive.',         gates: [] },
      { text: 'Some deliveries are faster than others.',            gates: ['archetypeDrift'] },
    ],
  },

  // JZA80 — make: Toyota
  {
    codes: ['JZA80'],
    make: ['toyota'],
    epithets: [
      { text: 'the MK4',                                            gates: [] },
      { text: 'the icon',                                           gates: [] },
    ],
    captions: [
      { text: 'The JZA80 silhouette needs no introduction.',        gates: [] },
    ],
    decks: [
      { text: 'The Supra that made "stock bottom end" a flex.',     gates: [] },
    ],
  },

  // A90 / A91 — make: Toyota
  {
    codes: ['A90', 'A91'],
    make: ['toyota'],
    epithets: [
      { text: 'the new Supra',                                      gates: [] },
    ],
    captions: [
      { text: "The A90 carries the badge into its next argument.",  gates: [] },
    ],
    decks: [],
  },

  // ZN6 — make: Toyota (Subaru ZC6 mirrored)
  {
    codes: ['ZN6', 'ZC6'],
    make: ['toyota', 'subaru'],
    epithets: [
      { text: 'the 86',                                             gates: [] },
      { text: 'the modern Hachiroku heir',                          gates: [] },
    ],
    captions: [
      { text: 'The 86 brief: grip is earned, not bought.',          gates: [] },
    ],
    decks: [],
  },

  // JZX90 / JZX100 — make: Toyota
  {
    codes: ['JZX90', 'JZX100'],
    make: ['toyota'],
    epithets: [
      { text: 'the drift sedan',                                    gates: [] },
      { text: 'the JZX',                                            gates: [] },
    ],
    captions: [
      { text: 'Four doors, one JZ, endless angle.',                 gates: ['archetypeDrift'] },
    ],
    decks: [],
  },

  // SW20 / AW11 — make: Toyota
  {
    codes: ['SW20', 'AW11'],
    make: ['toyota'],
    epithets: [
      { text: 'the mid-engined Toyota',                             gates: [] },
      { text: 'the origami MR2',                                    gates: ['chassisAW11'] },
    ],
    captions: [
      { text: "Toyota's mid-engine experiment, still converting skeptics.", gates: [] },
    ],
    decks: [],
  },

  // UCF10 / UCF20 / UCF30 — make: Toyota or Lexus
  {
    codes: ['UCF10', 'UCF20', 'UCF30'],
    make: ['toyota', 'lexus'],
    epithets: [
      { text: 'the Celsior',                                        gates: [] },
      { text: 'the VIP canvas',                                     gates: [] },
    ],
    captions: [
      { text: 'The Celsior — bippu royalty by birthright.',         gates: ['archetypeVIP'] },
    ],
    decks: [
      { text: 'Executive hardware, street-level ride height.',      gates: ['archetypeVIP'] },
    ],
  },

  // JZS147 / JZS161 — make: Toyota or Lexus
  {
    codes: ['JZS147', 'JZS161'],
    make: ['toyota', 'lexus'],
    epithets: [
      { text: 'the Aristo',                                         gates: [] },
      { text: 'the sleeper saloon',                                 gates: [] },
    ],
    captions: [
      { text: 'A 2JZ sedan from the factory. The aftermarket noticed.', gates: [] },
    ],
    decks: [],
  },

  // ─── Mazda ────────────────────────────────────────────────────────────────

  // FC3S — make: Mazda
  {
    codes: ['FC3S'],
    make: ['mazda'],
    epithets: [
      { text: 'the underdog RX-7',                                  gates: [] },
    ],
    captions: [
      { text: 'The FC — the RX-7 for people who did the reading.',  gates: [] },
    ],
    decks: [],
  },

  // FD3S — make: Mazda
  {
    codes: ['FD3S'],
    make: ['mazda'],
    epithets: [
      { text: 'the masterpiece',                                    gates: [] },
      { text: 'the perfect silhouette',                             gates: [] },
    ],
    captions: [
      { text: 'The FD3S still looks like a concept car that escaped.', gates: [] },
    ],
    decks: [
      { text: 'The shape rotary devotion built.',                   gates: [] },
    ],
  },

  // NA / NB / NC / ND Miata — make: Mazda
  // Make-collision guard: keyed (make + code) per §0 rule 4
  {
    codes: ['NA', 'NB', 'NC', 'ND'],
    make: ['mazda'],
    epithets: [
      { text: 'the roadster',                                       gates: [] },
      { text: 'the answer',                                         gates: [] },
    ],
    captions: [
      { text: 'Miata is always the answer. This one just shows the work.', gates: [] },
    ],
    decks: [
      // Generation text substituted in generate.ts via {gen} slot
      { text: 'Jinba ittai, generation {gen}.',                     gates: [] },
    ],
  },

  // SE3P — make: Mazda
  {
    codes: ['SE3P'],
    make: ['mazda'],
    epithets: [
      { text: 'the RX-8',                                           gates: [] },
      { text: 'the four-door rotary',                               gates: [] },
    ],
    captions: [
      { text: 'The unloved rotary, loved correctly here.',          gates: [] },
    ],
    decks: [],
  },

  // ─── Subaru ───────────────────────────────────────────────────────────────

  // GC8 — make: Subaru
  {
    codes: ['GC8'],
    make: ['subaru'],
    epithets: [
      { text: 'the rally icon',                                     gates: [] },
      { text: 'the GC',                                             gates: [] },
    ],
    captions: [
      { text: 'GC8 — the silhouette every rally fan can draw from memory.', gates: [] },
    ],
    decks: [
      { text: 'Group A bones, gravel-bred manners.',                gates: [] },
    ],
  },

  // GDB / GD — make: Subaru
  {
    codes: ['GDB', 'GD'],
    make: ['subaru'],
    epithets: [
      { text: 'the tarmac STI',                                     gates: ['trimSTI'] },
      { text: 'the bugeye',                                         gates: ['subEyeBugeye'] },
      { text: 'the blobeye',                                        gates: ['subEyeBlobeye'] },
      { text: 'the hawkeye',                                        gates: ['subEyeHawkeye'] },
    ],
    captions: [
      { text: 'The {eye} face — instantly placeable to anyone who knows.', gates: ['subEyeAny'] },
      { text: 'The GD chassis — rally heritage in its sharpest road form.', gates: [] },
    ],
    decks: [],
  },

  // GRB / GVB — make: Subaru
  {
    codes: ['GRB', 'GVB'],
    make: ['subaru'],
    epithets: [
      { text: 'the hatch-era STI',                                  gates: [] },
    ],
    captions: [
      { text: 'The widebody-from-factory generation.',              gates: [] },
    ],
    decks: [],
  },

  // ─── Mitsubishi ───────────────────────────────────────────────────────────

  // CT9A — make: Mitsubishi
  {
    codes: ['CT9A'],
    make: ['mitsubishi'],
    epithets: [
      { text: 'the Evo VII–IX',                                     gates: [] },
      { text: 'the 4G63 swan song',                                 gates: [] },
    ],
    captions: [
      { text: 'CT9A — the Evolution at full maturity.',             gates: [] },
    ],
    decks: [
      { text: 'Homologation logic, perfected over three evolutions.', gates: [] },
    ],
  },

  // CN9A / CP9A — make: Mitsubishi
  {
    codes: ['CN9A', 'CP9A'],
    make: ['mitsubishi'],
    epithets: [
      { text: 'the mid-era Evo',                                    gates: [] },
    ],
    captions: [
      { text: 'The era when Evolution meant exactly that — yearly.', gates: [] },
    ],
    decks: [],
  },

  // CZ4A — make: Mitsubishi
  {
    codes: ['CZ4A'],
    make: ['mitsubishi'],
    epithets: [
      { text: 'the Evo X',                                          gates: [] },
      { text: 'the final Evolution',                                gates: [] },
    ],
    captions: [
      { text: 'The last Evolution. The badge retired undefeated.',  gates: [] },
    ],
    decks: [],
  },

  // ─── BMW ─────────────────────────────────────────────────────────────────

  // E30 — make: BMW
  {
    codes: ['E30'],
    make: ['bmw'],
    epithets: [
      { text: 'the box',                                            gates: [] },
      { text: 'the homologation original',                          gates: ['modelM3'] },
    ],
    captions: [
      { text: 'The E30 M3 — built to race, forced to be road-legal.', gates: ['modelM3'] },
      { text: 'E30 proportions — the template everything gets measured against.', gates: [] },
    ],
    decks: [],
  },

  // E36 / E46 — make: BMW
  {
    codes: ['E36', 'E46'],
    make: ['bmw'],
    epithets: [
      { text: "the driver's M3",                                    gates: ['modelM3'] },
      { text: 'the E-chassis sweet spot',                           gates: [] },
    ],
    captions: [
      { text: 'The E46 generation — analog enough, modern enough.', gates: [] },
    ],
    decks: [],
  },

  // E34 / E39 — make: BMW
  {
    codes: ['E34', 'E39'],
    make: ['bmw'],
    epithets: [
      { text: 'the executive express',                              gates: [] },
    ],
    captions: [
      { text: "The fast sedan formula, in its handsomest suit.",    gates: [] },
    ],
    decks: [],
  },

  // ─── Porsche ─────────────────────────────────────────────────────────────

  // 930 / 964 / 993 — make: Porsche
  {
    codes: ['930', '964', '993'],
    make: ['porsche'],
    epithets: [
      { text: 'the last air-cooled',                                gates: [] },  // 993 only — filtered by exact code match in generate.ts
      { text: 'the widowmaker era',                                 gates: [] },  // 930 only
      { text: 'the bridge classic',                                 gates: [] },  // 964 only
    ],
    captions: [
      { text: 'The 993 — where the air-cooled story ends, on purpose.', gates: [] },
      { text: 'Turbo lag as a character-building exercise.',        gates: [] },
    ],
    decks: [],
  },

  // 996 / 997 / 991 — make: Porsche
  {
    codes: ['996', '997', '991'],
    make: ['porsche'],
    epithets: [
      { text: 'the water-cooled era',                               gates: [] },
      { text: 'the consensus favorite',                             gates: [] },  // 997 only
    ],
    captions: [
      { text: 'The 997 — the one even the purists forgive.',        gates: [] },
    ],
    decks: [],
  },
]
