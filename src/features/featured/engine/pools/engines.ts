// Batch 2 §1 — Engine family registry (cross-make, code-gated).
// Batch 2 §3 — Swap & donor caption frames.
// Verbatim transcription. Do not alter any text.

import type { EngineFamilyEntry, PoolLine } from '../types'

// Code patterns: prefix matches on normalized engine string.
// BMW S14 collision: handled in resolve.ts (matches ONLY when make = BMW).

export const ENGINE_FAMILIES: EngineFamilyEntry[] = [

  // Honda B-series (B16 / B17 / B18 / B20)
  {
    prefixes: ['B16', 'B17', 'B18', 'B20'],
    decks: [
      { text: 'Eight thousand rpm is the whole point.',                                  gates: ['vtec'] },
      { text: 'A B-series at full song needs no exhaust note disclaimer.',              gates: [] },
    ],
    captions: [
      { text: 'The crossover hits, and everything makes sense.',                        gates: ['vtec'] },
      { text: 'VTEC, used exactly as directed.',                                        gates: ['vtec'] },
      { text: 'Small displacement, zero apologies.',                                    gates: [] },
      { text: 'No crossover, no drama — torque where it counts.',                       gates: ['bSeriesNonVTEC'] },
    ],
  },

  // Honda K-series (K20 / K24)
  {
    prefixes: ['K20', 'K24'],
    decks: [
      { text: 'K-power — the modern answer to an old question.',                        gates: [] },
    ],
    captions: [
      { text: 'The K does everything the spec sheet promises.',                         gates: [] },
      { text: "Revs like the old ones, pulls like it shouldn't.",                       gates: [] },
    ],
  },

  // Honda F-series (F20C / F22C)
  {
    prefixes: ['F20C', 'F22C'],
    decks: [
      { text: 'Nine thousand rpm, naturally.',                                          gates: ['forcedInductionNone'] },
    ],
    captions: [
      { text: 'No turbo. No need.',                                                     gates: ['forcedInductionNone'] },
      { text: 'The redline is the feature.',                                            gates: [] },
    ],
  },

  // Nissan SR20 (SR20DE / SR20DET)
  {
    prefixes: ['SR20'],
    decks: [
      { text: 'The SR does its best work at full lock.',                                gates: ['archetypeDrift'] },
    ],
    captions: [
      { text: 'That familiar SR rattle, in the best way.',                              gates: [] },
      { text: 'SR20 — the S-chassis default for a reason.',                             gates: [] },
    ],
  },

  // Nissan RB (RB25 / RB26)
  {
    prefixes: ['RB25', 'RB26'],
    decks: [
      { text: 'An RB straight-six, doing straight-six things.',                         gates: [] },
    ],
    captions: [
      { text: 'The RB pulls like the Group A footage.',                                 gates: ['engineRB26'] },
      { text: 'Six cylinders in a row, the old religion.',                              gates: [] },
    ],
  },

  // Nissan KA24
  {
    prefixes: ['KA24'],
    decks: [],
    captions: [
      { text: 'Truck torque, no shame, all motor.',                                     gates: ['forcedInductionNone'] },
      { text: 'The KA earns more respect every year.',                                  gates: [] },
    ],
  },

  // Nissan VQ (VQ35 / VQ37)
  {
    prefixes: ['VQ35', 'VQ37'],
    decks: [
      { text: 'Big-displacement V6, no substitute needed.',                             gates: [] },
    ],
    captions: [
      { text: 'The VQ note is unmistakable.',                                           gates: [] },
    ],
  },

  // Toyota 2JZ (2JZ-GE / 2JZ-GTE)
  {
    prefixes: ['2JZ'],
    decks: [
      { text: 'Bulletproof by reputation.',                                             gates: [] },
    ],
    captions: [
      { text: 'The 2JZ takes the abuse and asks for more.',                             gates: [] },
      { text: 'Overbuilt from the factory. Built on from there.',                       gates: ['modCount4Plus'] },
    ],
  },

  // Toyota 1JZ
  {
    prefixes: ['1JZ'],
    decks: [
      { text: 'A straight-six with a sense of occasion.',                               gates: [] },
    ],
    captions: [
      { text: "The 1JZ — the connoisseur's JZ.",                                       gates: [] },
    ],
  },

  // Toyota 4A-GE
  {
    prefixes: ['4AGE', '4AGE'],
    decks: [
      { text: 'Small engine, enormous reputation.',                                     gates: [] },
    ],
    captions: [
      { text: 'Sixteen valves doing the work of legend.',                               gates: [] },
    ],
  },

  // Toyota 3S-GTE
  {
    prefixes: ['3SGTE'],
    decks: [],
    captions: [
      { text: 'The 3S takes boost like it was born to.',                                gates: ['forcedInduction'] },
    ],
  },

  // Subaru EJ (EJ20 / EJ25)
  {
    prefixes: ['EJ20', 'EJ25'],
    decks: [
      { text: "That burble isn't an accessory. It's a birthright.",                    gates: [] },
    ],
    captions: [
      { text: 'Unequal-length headers, equal parts theater.',                           gates: [] },
      { text: 'The flat-four thrum carries the whole identity.',                        gates: [] },
    ],
  },

  // Mitsubishi 4G63
  {
    prefixes: ['4G63'],
    decks: [
      { text: 'The 4G63 takes boost like a promise.',                                  gates: ['forcedInduction'] },
    ],
    captions: [
      { text: 'Iron block, rally résumé.',                                              gates: [] },
    ],
  },

  // Mazda Rotary (13B / 20B)
  {
    prefixes: ['13B', '20B'],
    decks: [
      { text: 'Rotary purity, kept the way Mazda intended.',                           gates: ['engineOriginal'] },
    ],
    captions: [
      { text: 'Still braps.',                                                           gates: [] },
      { text: 'Apex seals willing, this one sings.',                                   gates: [] },
      { text: 'Two rotors, one obsession.',                                             gates: ['engine13B'] },
    ],
  },

  // BMW M straight-six (S50 / S52 / S54)
  {
    prefixes: ['S50', 'S52', 'S54'],
    decks: [
      { text: 'A high-revving M six, sharpened, not silenced.',                        gates: [] },
    ],
    captions: [
      { text: 'The S54 needs no introduction at 8,000 rpm.',                           gates: ['engineS54'] },
      { text: 'Bavarian straight-six smoothness, with intent.',                        gates: [] },
    ],
  },

  // BMW M5x (M50 / M52 / M54)
  {
    prefixes: ['M50', 'M52', 'M54'],
    decks: [],
    captions: [
      { text: 'The everyday straight-six, dialed in.',                                 gates: [] },
    ],
  },

  // GM LS family (LS1–LS7, LSA, LS3…)
  {
    prefixes: ['LS1', 'LS2', 'LS3', 'LS4', 'LS6', 'LS7', 'LSA', 'LSX', 'LS'],
    decks: [
      { text: 'No replacement for displacement, delivered.',                            gates: [] },
    ],
    captions: [
      { text: 'The LS answer to every power question.',                                 gates: [] },
      { text: 'Pushrods, torque, and zero drama.',                                      gates: [] },
    ],
  },

  // Toyota/Lexus 1UZ
  {
    prefixes: ['1UZ'],
    decks: [
      { text: 'Quiet, overbuilt, and utterly unbothered.',                              gates: [] },
    ],
    captions: [
      { text: 'The million-mile V8, give or take.',                                     gates: [] },
    ],
  },

  // Porsche flat-six (gate: make = Porsche applied in generate.ts)
  {
    prefixes: ['PORSCHE_FLAT6'],  // sentinel — matched by make check in resolve.ts
    decks: [
      { text: 'Flat-six behind, horizon ahead.',                                        gates: [] },
    ],
    captions: [
      { text: 'The engine sits where physics gets interesting.',                        gates: [] },
      { text: 'Air-cooled, as the faithful prefer.',                                   gates: ['model911', 'year1998OrBefore'] },
    ],
  },
]

// ─── Swap & donor caption frames (Batch 2 §3) ────────────────────────────────
// {EngineCode}, {donor_year}, {donor_make}, {donor_model}, {Chassis|Model} are
// filled by generate.ts.

export const SWAP_CAPTIONS: PoolLine[] = [
  {
    text: '{EngineCode} heart, from a donor {donor_year} {donor_make} {donor_model}.',
    gates: ['swapWithDonor'],
  },
  {
    text: 'Borrowed from a {donor_make} {donor_model}, at home here.',
    gates: ['swapWithDonor'],
  },
  {
    text: 'The swap nobody regrets: {EngineCode} into {Chassis|Model}.',
    gates: ['swapWithDonor'],
  },
  {
    text: 'Different heart, same soul.',
    gates: ['swapAny'],
  },
  {
    text: 'The purists can look away now.',
    gates: ['swapClaimFree'],
  },
]
