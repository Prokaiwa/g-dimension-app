// Single place to edit the facts referenced by the Terms and Privacy pages.
// Update these (especially `operator` and `governingLaw`) to match your real
// legal entity and jurisdiction before launch — see the notes inline.
export const LEGAL = {
  appName: 'G-Dimension',
  // The person/company that operates the service and is the data controller.
  // (Update to a company's full legal name if you later form an LLC.)
  operator: 'David Scantee',
  contactEmail: 'hi@gdimension.app',
  site: 'gdimension.app',
  // Shown as the "last updated" date on both documents.
  effectiveDate: 'June 30, 2026',
  // Governing Law clause venue.
  governingLaw: 'the State of California, United States',
  // Minimum age to use the service (13 in the US/COPPA; 16 in much of the EU).
  minAge: 13,
} as const
