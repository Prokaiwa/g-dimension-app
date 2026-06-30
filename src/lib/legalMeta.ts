// Single place to edit the facts referenced by the Terms and Privacy pages.
// Update these (especially `operator` and `governingLaw`) to match your real
// legal entity and jurisdiction before launch — see the notes inline.
export const LEGAL = {
  appName: 'G-Dimension',
  // The person/company that operates the service and is the data controller.
  // TODO: if you register an LLC/company, put its full legal name here.
  operator: 'G-Dimension',
  contactEmail: 'hi@gdimension.app',
  site: 'gdimension.app',
  // Shown as the "last updated" date on both documents.
  effectiveDate: 'June 30, 2026',
  // Used in the Governing Law clause. TODO: set your specific state + country
  // (e.g. "the State of California, United States") so venue is enforceable.
  governingLaw: 'the United States',
  // Minimum age to use the service (13 in the US/COPPA; 16 in much of the EU).
  minAge: 13,
} as const
