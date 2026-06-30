// ── Tuning part example placeholders ──────────────────────────────────────
// Per-part-type example text for the mod **Title** field, keyed by the exact
// part_types.name. Shared by TuningAddPage and TuningModEditPage so the two
// screens never drift (they used to: Add showed per-part examples while Edit
// hardcoded "e.g. HKS Timing Belt"). Add new part types here, not in a page.

export const TITLE_PLACEHOLDER: Record<string, string> = {
  // Wheels & Tires
  'Wheels':                          'e.g. Enkei RPF1 17×9 +35',
  'Tires — Metric':                  'e.g. Michelin Pilot Sport 4S 235/40R17',
  'Tires — Truck/Standard':          'e.g. BFGoodrich All-Terrain T/A KO2 285/70R17',
  'Wheel Spacers / Adapters':        'e.g. H&R 20mm Wheel Spacers',
  // Suspension
  'Coilovers':                       'e.g. BC Racing BR Series Coilovers',
  'Air Suspension / Bags':           'e.g. Air Lift Performance 3P Kit',
  'Lowering Springs':                'e.g. Tein S-Tech Lowering Springs',
  'Sway Bars':                       'e.g. Whiteline 27mm Front Sway Bar',
  'Control Arms':                    'e.g. Megan Racing Adjustable Rear Upper Arms',
  // Brakes
  'Brake Pads':                      'e.g. Hawk HPS Performance Brake Pads',
  'Rotors':                          'e.g. StopTech Sport Slotted Rotors',
  'Brake Calipers':                  'e.g. Wilwood Superlite 4-Piston Calipers',
  'Big Brake Kit':                   'e.g. Brembo GT 4-Pot Big Brake Kit',
  'Brake Fluid':                     'e.g. Motul RBF 600 Brake Fluid',
  // Engine
  'Camshafts':                       'e.g. HKS 264° Step 2 Camshafts',
  'Cold Air Intake / Short Ram':     'e.g. AEM Cold Air Intake System',
  'Engine Management / ECU':         'e.g. Link G4X ECU',
  'Pistons':                         'e.g. Wiseco 86mm Forged Pistons',
  'Connecting Rods':                 'e.g. Eagle H-Beam Connecting Rods',
  'Head Work / Porting':             'e.g. Stage 2 Port & Polish by JGY Engines',
  // Forced Induction
  'Turbocharger':                    'e.g. HKS GT2530 Turbocharger',
  'Intercooler':                     'e.g. Mishimoto Front Mount Intercooler',
  'Wastegate':                       'e.g. TiAL 38mm External Wastegate',
  'Blow-off Valve / Bypass Valve':   'e.g. TiAL Q BOV',
  // Exhaust
  'Headers / Exhaust Manifold':      'e.g. Tomei Equal Length Exhaust Manifold',
  'Catback System':                  'e.g. HKS Hi-Power Catback Exhaust',
  'Downpipe / Frontpipe':            'e.g. Agency Power High Flow Downpipe',
  // Drivetrain
  'Clutch':                          'e.g. ACT Heavy Duty Clutch Kit',
  'Flywheel':                        'e.g. Fidanza Aluminum Lightweight Flywheel',
  'Differential':                    'e.g. Cusco Type RS LSD',
  'Driveshaft':                      'e.g. Driveshaft Shop Aluminum 1-Piece Driveshaft',
  // Cooling
  'Radiator':                        'e.g. Mishimoto Aluminum Racing Radiator',
  'Oil Cooler':                      'e.g. Setrab 16-Row Oil Cooler Kit',
  'Thermostat':                      'e.g. Mishimoto Racing Thermostat',
  // Electrical
  'Battery':                         'e.g. Odyssey PC680 AGM Battery',
  // Safety
  'Harness / Seatbelt':              'e.g. Sparco 4-Point FIA Harness',
  'Roll Bar / Roll Cage':            'e.g. Autopower 6-Point Street Roll Bar',
  'Helmet':                          'e.g. Bell GTX.3 Full Face Helmet',
  'Fire Suppression System':         'e.g. Lifeline Zero 2000 Fire System',
  // Exterior
  'Front Bumper / Lip':              'e.g. Greddy Front Lip Spoiler',
  'Rear Bumper / Diffuser':          'e.g. Voltex Rear Diffuser',
  'Side Skirts':                     'e.g. URAS Side Skirts',
  'Full Aero Kit':                   'e.g. Bomex Full Aero Kit',
  'Wing / Spoiler':                  'e.g. Voltex Type 1.5 GT Wing',
  'Fenders / Widebody':              'e.g. Work Wheels Overfenders +50mm',
  // Interior
  'Seats':                           'e.g. Bride Zeta III FRP Racing Seat',
  'Window Tint':                     'e.g. Llumar ATR 35% Window Tint',
  // Paint & Wrap
  'Full Paint':                      'e.g. Phantom Grey Pearl Custom Paint',
  'Vinyl Wrap':                      'e.g. 3M 1080 Matte Black Vinyl Wrap',
  // Audio
  'Head Unit':                       'e.g. Pioneer AVH-W4500NEX Head Unit',
  'Amplifier':                       'e.g. JL Audio RD400/4 Amplifier',
  'Subwoofer':                       'e.g. JL Audio 10W3v3 Subwoofer',
  // Lighting
  'Headlights':                      'e.g. Morimoto XB LED Headlights',
  // Fuel System
  'Fuel Injectors':                  'e.g. DeatschWerks 1000cc Fuel Injectors',
  'Fuel Pump':                       'e.g. Walbro 255lph High Pressure Fuel Pump',
}

// Fallback when a part type has no specific title example.
export const TITLE_FALLBACK = 'e.g. Add a title'

// Brand-field placeholder for a part type. Prefers the brand spec template's own
// per-part-type placeholder (DB-driven, e.g. "Varis, Voltex, APR…"); falls back
// to a neutral hint. `specs` is the loaded spec_templates list for the part type.
export function brandPlaceholder(
  specs: { spec_key: string; placeholder: string | null }[],
): string {
  return specs.find(s => s.spec_key === 'brand')?.placeholder || 'e.g. HKS'
}
