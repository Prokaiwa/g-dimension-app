// Single source of truth for Build Sheet / mod grouping.
//
// Every mod category maps to one of four display groups (+ 'other'). This drives
// the Build Sheet, the mod detail page, the Featured spec sheet, and their public
// mirrors. It used to be copied into six files that all had to be kept in sync
// (MOD_GROUPS / CATEGORY_TO_GROUP / CAT_TO_GROUP). Presentation-only constants
// (label casing, group order) stay local to each page — only the mapping lives here.
//
// Category ids must match part_categories.name in Supabase (FK from migration 025).

export type ModGroup = { id: string; label: string; categories: string[] }

export const MOD_GROUPS: ModGroup[] = [
  { id: 'power',    label: 'Power',    categories: ['Engine', 'Drivetrain', 'Forced Induction', 'Exhaust', 'Cooling', 'Fuel System', 'Electrical'] },
  { id: 'chassis',  label: 'Chassis',  categories: ['Suspension', 'Brakes', 'Wheels & Tires'] },
  { id: 'exterior', label: 'Exterior', categories: ['Exterior', 'Paint & Wrap', 'Lighting'] },
  { id: 'interior', label: 'Interior', categories: ['Interior', 'Audio', 'Safety'] },
  { id: 'other',    label: 'Other',    categories: ['Other'] },
]

// category name -> group id. Derived from MOD_GROUPS so it can never drift.
export const CATEGORY_TO_GROUP: Record<string, string> = Object.fromEntries(
  MOD_GROUPS.flatMap(g => g.categories.map(c => [c, g.id])),
)

// group id -> the cars.* column holding that group's Build Sheet photo.
// (No column for 'other' — it has no Build Sheet photo slot.)
export const GROUP_PHOTO_COL: Record<string, string> = {
  power:    'build_sheet_power_photo',
  chassis:  'build_sheet_chassis_photo',
  exterior: 'build_sheet_exterior_photo',
  interior: 'build_sheet_interior_photo',
}
