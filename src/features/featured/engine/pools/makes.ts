// Batch 2 §2 — Make heritage layers. Verbatim transcription. Do not alter any text.

import type { MakeHeritageEntry } from '../types'

export const MAKE_HERITAGE: MakeHeritageEntry[] = [

  // Honda
  {
    make: 'honda',
    decks: [
      { text: 'The front-wheel-drive giant-killer, doing its thing.',    gates: [] },
      { text: 'Rev-happy by birth, modified by conviction.',             gates: ['modCount4Plus'] },
    ],
    captions: [
      { text: 'Type R energy, whatever the badge says.',                 gates: ['modCount4Plus'] },
      { text: 'Honda reliability, enthusiast intentions.',               gates: [] },
      // Si trim layer
      { text: 'The Si badge — where most Honda stories start.',          gates: ['trimSi'] },
      { text: 'Si: attainable, tunable, unkillable.',                    gates: ['trimSi'] },
      { text: "The factory's idea of fun, taken further.",               gates: ['trimSi', 'modCount4Plus'] },
    ],
  },

  // Acura (shares Honda engine families; own heritage)
  {
    make: 'acura',
    decks: [
      { text: 'The badge says luxury. The chassis says Honda.',          gates: [] },
    ],
    captions: [
      { text: 'Integra lineage runs deep here.',                         gates: ['modelIntegra'] },
    ],
  },

  // Nissan
  {
    make: 'nissan',
    decks: [
      { text: 'S-chassis heritage, kept alive the right way.',           gates: ['chassisSChassis'] },
      { text: "Drift's birthplace badge, worn honestly.",                gates: ['archetypeDrift'] },
    ],
    captions: [
      { text: 'Nissan built the platform. The owner built the rest.',    gates: ['modCount4Plus'] },
      { text: 'ATTESA underneath, patience on top.',                     gates: ['drivetrainAwd'] },
    ],
  },

  // Toyota
  {
    make: 'toyota',
    decks: [
      { text: 'Overbuilt from the factory — the Toyota way.',            gates: [] },
      { text: 'The long-game engineering company, proven again.',        gates: [] },
    ],
    captions: [
      { text: 'Toyota longevity, fully exploited.',                      gates: ['overlayHighMileage'] },
      { text: 'Built to outlast its trends.',                            gates: [] },
    ],
  },

  // Lexus
  {
    make: 'lexus',
    decks: [
      { text: 'Quiet money, properly spent.',                            gates: ['archetypeVIPorShow'] },
      { text: 'Toyota bones, executive tailoring.',                      gates: [] },
    ],
    captions: [
      { text: 'The dealership never imagined this.',                     gates: ['modCount8Plus'] },
    ],
  },

  // Mazda
  {
    make: 'mazda',
    decks: [
      { text: 'Driving purity as company policy.',                       gates: [] },
      { text: 'Jinba ittai, taken personally.',                          gates: ['modelMX5orMiata'] },
    ],
    captions: [
      { text: 'Mazda does momentum better than anyone.',                 gates: [] },
    ],
  },

  // Subaru
  {
    make: 'subaru',
    decks: [
      { text: 'Rally-bred, road-registered.',                            gates: [] },
      { text: 'Gravel pedigree, tarmac manners.',                        gates: [] },
    ],
    captions: [
      { text: 'Symmetrical AWD doing quiet heroics.',                    gates: ['drivetrainAwd'] },
      { text: 'World Rally heritage, parked in a driveway.',             gates: [] },
    ],
  },

  // Mitsubishi
  {
    make: 'mitsubishi',
    decks: [
      { text: 'Homologation heritage, still paying dividends.',          gates: ['modelEvoOrLancer'] },
      { text: 'The giant-killer badge, earned the loud way.',            gates: ['modTierStreet'] },
    ],
    captions: [
      { text: 'Rally roots show in everything it does.',                 gates: [] },
    ],
  },

  // BMW
  {
    make: 'bmw',
    decks: [
      { text: "The driver's car thesis, defended.",                       gates: [] },
      { text: "Munich balance, owner's conviction.",                      gates: [] },
    ],
    captions: [
      { text: 'Fifty-fifty weight distribution, one hundred percent intent.', gates: ['drivetrainRwd'] },
      { text: 'M-division logic, applied at home.',                      gates: ['modCount4Plus'] },
    ],
  },

  // Porsche
  {
    make: 'porsche',
    decks: [
      { text: "Stuttgart's idiosyncratic physics, embraced.",             gates: [] },
      { text: 'Engineering as a family argument, won.',                  gates: [] },
    ],
    captions: [
      { text: 'The 911 shape needs no caption.',                         gates: ['model911'] },
      { text: 'Rear-engined and right about it.',                        gates: ['model911'] },
    ],
  },
]
