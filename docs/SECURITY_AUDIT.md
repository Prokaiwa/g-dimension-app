# G-Dimension — Audit Findings: Legal, Performance, Accessibility

**Date:** 2026-07-16
**Scope:** At the owner's request this pass covers **Area 5 (Legal/Compliance), Area 6 (Performance), and Area 7 (Accessibility & agent-readiness)** only. The security-hardening areas of the original audit brief were **deferred to a future session** — nothing in this document should be read as a clean security bill of health; those areas simply weren't in scope today.

**How to read this:** findings are ranked Critical → Low. Each entry lists what/where/why/fix and a **Status**: `FIXED` (landed in this session's commits), `OWNER ACTION` (dashboard/legal/admin step that cannot be done from code), or `DEFERRED` (deliberately skipped, with reasoning).

---

## Critical

### C1. No DMCA notice-and-takedown policy for a UGC platform — `OWNER ACTION`
- **What:** Users upload photos and long-form text (cars, build sheets, timeline stories, DIY guides), but the Terms of Service (`src/pages/TermsPage.tsx`, 13 sections) contain no copyright-infringement/takedown procedure, and no DMCA agent is designated.
- **Why it matters:** Without a published notice-and-takedown procedure **and** an agent registered with the U.S. Copyright Office, the site cannot claim the DMCA §512 safe harbor — meaning potential direct liability for user-uploaded infringing content. For a car-build community (users routinely photograph other people's cars, repost magazine scans, etc.) this is the single largest legal exposure.
- **Fix (three parts):**
  1. **Register a designated agent** at the U.S. Copyright Office DMCA portal — https://dmca.copyright.gov/ ($6 fee, renew every 3 years). This is a real-world admin step, not code.
  2. Add the takedown section to the ToS — **draft language is provided in Appendix A below**, marked for attorney review.
  3. Add the agent's contact to the ToS Contact section once registered.
- **Status:** `OWNER ACTION` — per this session's ground rules, legal text is not committed to the live ToS without a lawyer's sign-off. The draft is ready to paste (Appendix A).

---

## High

### H1. Render-blocking Google Fonts on the marketing page (~1,770 ms of the 3.6 s FCP/LCP) — `FIXED`
- **What:** `public/marketing.html:60-62` loaded Hanken Grotesk (6 weights) + Cormorant Garamond (3 italic weights) via a render-blocking `fonts.googleapis.com/css2` stylesheet, with a second DNS/TLS round-trip to `fonts.gstatic.com` for the woff2 files (~1,108 ms LCP tail per PageSpeed).
- **Fix applied:** the 9 latin-subset woff2 files are now **self-hosted** in `public/fonts/` with `@font-face` rules (Google's original `unicode-range`, `font-display: swap`) inlined into the page's `<style>` block, plus `<link rel="preload" as="font">` for the above-the-fold weights. The `fonts.googleapis.com`/`fonts.gstatic.com` round-trips are gone from the marketing page's critical path entirely.
- **Note:** `index.html` (the SPA shell, 6 families incl. the Featured/Parts-Bin island fonts) now loads its Google Fonts CSS **asynchronously** (`media="print"` + `onload` swap with a `<noscript>` fallback) — lower risk than self-hosting ~25 files, and the app is behind auth where LCP matters less. Full self-hosting for the app shell is a reasonable follow-up.

### H2. Forced reflow in the marketing parallax boot (~610 ms) — `FIXED`
- **What:** `public/marketing.html` (inline script starting at :1275): the world-surface entry animation performed three synchronous style **writes** on `#worldSurface`, then immediately called `getBoundingClientRect()` on `.world-stage` — a classic write-then-read forced synchronous layout, flagged by PageSpeed at ~line 1356. `updRect()` also re-ran `document.querySelector('.world-stage')` on every call.
- **Fix applied:** the `.world-stage` element is queried once and cached, and the initial rect **read happens before** the style writes. Behavior is pixel-identical; the layout flush is no longer forced mid-frame. (The React Home map in `src/pages/HomePage.tsx:215-217` was checked and already uses the correct measure-once-on-mount/resize pattern — it was not the source.)
- **CSP note:** this edit changed inline script #2's SHA-256; `vercel.json` was updated in the same commit, and a new mechanical check (`scripts/csp-hashes.mjs`, wired into `npm run verify`) now recomputes every inline-script hash and fails the build on any mismatch — this exact silent-breakage class caused a past production incident.

### H3. WCAG AA contrast failures across marketing.html — `FIXED`
- **What/where** (page background `--cavity: #050507` unless noted; ratios computed with the WCAG 2.x formula):

  | Element | Was | Ratio | Now | Ratio |
  |---|---|---|---|---|
  | `.h-signup` "Sign Up" chip (10px text) | `#fff` on `#c8661a` | 3.91:1 ✗ | `#050507` on `#c8661a` | 5.21:1 ✓ |
  | `.faq-eyebrow` "Questions" | `#3f3f46` | 1.95:1 ✗ | `#8a8a8c` | 5.91:1 ✓ |
  | `.catchphrase` "Build it. Log it. Own it." | `rgba(240,228,200,.5)` | 4.45:1 ✗ | alpha `.62` | ≥6.5:1 ✓ |
  | `.cta-login-line` body | `#3f3f46` | 1.95:1 ✗ | `#8a8a8c` | 5.91:1 ✓ |
  | `.cta-login-line a` "Log in" | `#8a8a8c` | 4.4:1 (borderline, on form-strip bg) | `#c8661a` accent (with underline already present) | 5.21:1 ✓ |
  | `.footer-brand` wordmark | `#fff` at opacity `.28` | 2.34:1 ✗ | opacity `.55` | 6.30:1 ✓ |
  | `.legal` Terms/Privacy/© links | `#181820` | **1.15:1** ✗ (near-invisible) | `#8a8a8c` | 5.91:1 ✓ |
  | `.ig` "@gdimensionapp" link | `#3f3f46` | 1.95:1 ✗ | `#8a8a8c` | 5.91:1 ✓ |
  | `.footer-updates-label` (a functional `<label for="email-footer">`) | `#3f3f46` | 1.95:1 ✗ | `#8a8a8c` | 5.91:1 ✓ |

- **Why it matters:** several of these are interactive (Sign Up, Log in, Terms/Privacy, IG) or functional labels; sub-2:1 text is effectively invisible to low-vision users and fails any accessibility review.
- **Palette discipline:** no new colors were introduced — `#8a8a8c` is the page's existing `--text-secondary`, `#c8661a` is `--accent`, `#050507` is `--cavity`; the remaining two fixes are opacity/alpha adjustments of existing values.

---

## Medium

### M1. No binding-arbitration / class-action-waiver clause in the ToS — `OWNER ACTION`
- **What:** `TermsPage.tsx` has Governing Law (California) and Limitation of Liability sections but no dispute-resolution clause.
- **Why:** without one, any dispute defaults to court litigation (including class actions) in whatever forum a plaintiff can establish. An arbitration + class-waiver clause is standard risk reduction for consumer apps — but it is also one of the most jurisdiction-sensitive clauses that exists (enforceability varies by state/country, and consumer-protection carve-outs apply, especially for EU users).
- **Fix:** **draft language in Appendix B below** — explicitly marked as requiring attorney review and tailoring. Do not paste it in without that review.
- **Status:** `OWNER ACTION` (lawyer).

### M2. CLS: no `<img>` on marketing.html had width/height — `FIXED`
- **What:** the header logo (`:959`), footer logo (`:1235`), and all five destination-node icons (`:1014-1018`) lacked intrinsic `width`/`height` attributes, so no layout box is reserved before decode (PageSpeed CLS flag).
- **Fix applied:** explicit intrinsic `width`/`height` attributes added to every `<img>` (logo 38×36; icons: garage 228×223, tuning 226×218, timeline 269×186, maintenance 145×226, photos 257×278). Existing CSS still controls displayed size, so rendering is unchanged — the browser just reserves the box earlier.

### M3. Header logo served at 1× (38×36 for a 36px-tall slot) — `OWNER ACTION`
- **What:** `.h-logo` displays at 36 px CSS height; on 2×/3× displays the browser needs ~72–108 px of source pixels, so the mark renders soft (PageSpeed flagged 57×54 needed).
- **Why not fixed here:** the inline base64 asset is the *only* copy of this exact wordmark rendering in the repo — the launcher icons (`icon-192.png` etc.) are a different composition, and upscaling a 38×36 PNG would look worse than the status quo.
- **Fix:** export the header logo at 2× (≈76×72) from the original design source, then swap the base64 in both `.h-logo` (`marketing.html:959`) and `.footer-logo` (`:1235`). Keep the CSS `height:36px`/`18px` as-is.

### M4. `/llms.txt` missing — `FIXED`
- **What:** no `public/llms.txt` existed (the spec requires an H1 title, a blockquote summary, and Markdown link sections).
- **Fix applied:** created `public/llms.txt` — spec-valid Markdown with the site description and links to the marketing page, `/terms`, `/privacy`, and an explanation of the public `/builds/:username` profiles. `public/robots.txt` already welcomes AI crawlers; this gives them a canonical summary.

### M5. Main-thread work ~2.5 s on the marketing route (Style & Layout 1,125 ms) — partially `FIXED`, rest `DEFERRED`
- The forced reflow (H2) was the largest single identified contributor. Re-profile after this deploy; if long tasks remain, the next candidates are the ~154 KB of base64 icon data parsed inline in the HTML (see D2) and the entry-animation cascade. No further change was made now — this is optimization-by-measurement territory.

---

## Low

### L1. Supabase preconnect missing from the app shell — `FIXED`
- `index.html` preconnected to Google Fonts but not to `https://uxqoernfrtgclpneirvc.supabase.co`, the app's primary API origin contacted on every boot (auth session check). A `preconnect` was added, shaving a DNS+TLS round-trip off first data fetch.

### L2. Stale CSP documentation in CLAUDE.md — `FIXED`
- `CLAUDE.md` said "two hashes belong to marketing.html's two inline scripts"; marketing.html has **three** executable inline scripts (`:14` standalone-guard, `:1275` form+parallax+reveal, `:1403` analytics) + one in `index.html` = the 4 hashes in `vercel.json`. Prose corrected and the new `scripts/csp-hashes.mjs` mechanical check documented.

### L3. Analytics disclosure in the Privacy Policy — **confirmed accurate, no change**
- `PrivacyPolicyPage.tsx` Section 2 ("Cookies & local storage") and Section 6 ("Analytics & cookies") already disclose Vercel Analytics (cookieless), the possibility of Google Analytics, and the app's localStorage usage. This matches reality (Vercel Web Analytics in both the SPA and `marketing.html`; no Google Analytics currently shipped). If Google Analytics is ever actually added, revisit — GA sets cookies and, for EU users, triggers consent-banner obligations that Vercel's cookieless analytics does not.

### L4. Legal entity placeholders (pre-existing, restating for the launch checklist) — `OWNER ACTION`
- `src/lib/legalMeta.ts` lists the operator as an individual (`David Scantee`) and governing law as California. Per CLAUDE.md's own note: confirm/replace with the real operating entity and have the whole ToS + Privacy Policy reviewed by a lawyer before launch. The Appendix A/B drafts below should be part of that same review.

---

## Deferred by explicit decision

- **D1. Inline CSS minification** (~3 KB savings on marketing.html's 27 KB hand-edited `<style>` block): skipped — the file is maintained by hand and the gzipped savings are marginal. If it ever matters, do it via a build step that minifies `public/marketing.html` at deploy time rather than committing minified source. (Vite already minifies the SPA's CSS — `vite.config.ts` uses default esbuild minification.)
- **D2. Destination-icon weight** (~154 KB of base64 PNG inline in marketing.html): the icons are ~2× their largest display size (correct for retina), but a lossless `oxipng`/zopfli pass — or conversion to WebP data URIs — would likely cut 40–60 KB of HTML. Deferred as a follow-up; needs visual QA on the transparent edges.
- **D3. Security-hardening areas** of the original audit brief: deferred to a future session at the owner's request.

---

## Appendix A — DRAFT: Copyright / DMCA section for the Terms of Service

> ⚠️ **DRAFT — NOT LEGAL ADVICE. Requires review by a qualified attorney before publication. The designated-agent details must match the actual U.S. Copyright Office registration (https://dmca.copyright.gov/), which must be completed first.**

**Copyright Complaints (DMCA).**
We respect the intellectual property rights of others and expect users to do the same. If you believe that content on G-Dimension infringes a copyright you own or control, you may submit a notification under the Digital Millennium Copyright Act (17 U.S.C. § 512) to our designated agent:

> **DMCA Designated Agent** — [NAME AS REGISTERED]
> [POSTAL ADDRESS AS REGISTERED]
> Email: [DEDICATED EMAIL, e.g. dmca@gdimension.app]

Your notice must include: (1) a physical or electronic signature of a person authorized to act on behalf of the copyright owner; (2) identification of the copyrighted work claimed to have been infringed; (3) identification of the material claimed to be infringing and information reasonably sufficient to permit us to locate it (e.g., the URL of the build page or photo); (4) your contact information; (5) a statement that you have a good-faith belief that use of the material is not authorized by the copyright owner, its agent, or the law; and (6) a statement, under penalty of perjury, that the information in the notification is accurate and that you are authorized to act on behalf of the owner.

Upon receipt of a valid notice we will remove or disable access to the identified material and make a reasonable attempt to notify the user who posted it. That user may submit a counter-notification meeting the requirements of 17 U.S.C. § 512(g)(3); if we receive one, we may restore the material in 10–14 business days unless the complainant notifies us that they have filed a court action. We may terminate the accounts of users who are repeat infringers. Knowingly misrepresenting that material is infringing may expose you to liability under 17 U.S.C. § 512(f).

---

## Appendix B — DRAFT: Dispute Resolution / Arbitration section for the Terms of Service

> ⚠️ **DRAFT — NOT LEGAL ADVICE and NOT legally sufficient as written. Arbitration and class-waiver clauses are among the most jurisdiction-sensitive terms in a consumer contract: enforceability varies by U.S. state and is heavily restricted for EU/UK consumers. A qualified attorney must review, select the arbitral body (the AAA consumer rules are the common U.S. choice; the ICC referenced in some guidance is typically for cross-border commercial disputes and is likely a poor fit for a consumer app), confirm fee allocation complies with the chosen body's consumer standards, and tailor the carve-outs.**

**Dispute Resolution; Binding Arbitration; Class Action Waiver.**
Please read this section carefully — it affects your legal rights.

Most concerns can be resolved quickly by emailing us at [CONTACT EMAIL]. You and [OPERATOR ENTITY] agree that before initiating any formal proceeding, each party will first attempt to resolve any dispute informally by written notice, and will negotiate in good faith for at least sixty (60) days.

If the dispute is not resolved informally, you and [OPERATOR ENTITY] agree that any dispute, claim, or controversy arising out of or relating to these Terms or the Service shall be resolved by **binding individual arbitration** administered by [ARBITRAL BODY — e.g., the American Arbitration Association under its Consumer Arbitration Rules], rather than in court, except that either party may (a) bring an individual claim in small-claims court, and (b) seek injunctive relief in a court of competent jurisdiction for infringement or misuse of intellectual property. The arbitration shall be seated in [SEAT/COUNTY], conducted in English, and judgment on the award may be entered in any court of competent jurisdiction. [FEE-ALLOCATION LANGUAGE PER THE CHOSEN BODY'S CONSUMER STANDARDS.]

**Class action waiver:** You and [OPERATOR ENTITY] each waive the right to a trial by jury and the right to participate in a class, collective, consolidated, or representative action. The arbitrator may award relief only in favor of the individual party seeking relief and only to the extent necessary to resolve that party's individual claim.

**Opt-out:** You may opt out of this arbitration agreement by emailing [CONTACT EMAIL] within thirty (30) days of first accepting these Terms, stating your account username and your intent to opt out. Opting out does not affect any other section of these Terms.

**Severability & consumer carve-outs:** If the class action waiver is found unenforceable as to a particular claim, that claim (and only that claim) shall proceed in court. Nothing in this section limits rights that cannot be waived under the mandatory consumer-protection law of your country of residence [EU/UK CONSUMER CARVE-OUT LANGUAGE REQUIRED HERE].

---

## Owner action checklist (nothing below can be done from code)

1. **Register a DMCA designated agent** — https://dmca.copyright.gov/ ($6, renew every 3 years). Then have a lawyer review Appendix A and add it to `TermsPage.tsx` (new `<LegalSection heading="Copyright Complaints (DMCA)">` block; the section components are in `src/components/LegalLayout.tsx`).
2. **Attorney review of Appendix B** (arbitration/class waiver), including choice of arbitral body, seat, fees, opt-out window, and EU/UK consumer carve-outs — then add to `TermsPage.tsx` and bump `effectiveDate` in `src/lib/legalMeta.ts`.
3. **Confirm the operating entity + governing law** in `src/lib/legalMeta.ts` before launch (existing CLAUDE.md launch item).
4. **Export a 2× header logo** (~76×72 PNG) from the design source and swap the base64 in `marketing.html` (see M3).
5. After this deploy, **re-run PageSpeed Insights** on https://gdimension.app to confirm the FCP/LCP and reflow wins, and to get a fresh long-task profile for M5/D2.
