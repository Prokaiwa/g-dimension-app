# Store listing — competitor research + copy

Research done 2026-08-03 for the first App Store / Play Store submission.

Sources are review roundups and vendor marketing sites reached via search. The
store listings themselves (`play.google.com`, `apps.apple.com`) could not be
fetched directly from the build container: the sandbox proxy denies those hosts,
and the iTunes lookup API with them. So feature lists below are assembled from
vendor sites and secondary coverage rather than read off the listings verbatim.
**Re-check the exact wording of any competitor claim before quoting it.**

---

## 1. Field limits

| Field | App Store | Play Store |
|---|---|---|
| App name | 30 | 30 |
| Subtitle | 30 | — |
| Short description | — | 80 |
| Promotional text | 170 (editable without review) | — |
| Description | 4,000 | 4,000 |
| Keywords | 100 (comma separated, not shown to users) | — (Play indexes the description) |

On iOS only **name + subtitle + keywords** are indexed for search: 160
characters total. The description is not indexed, so it is pure persuasion. On
Play the **full description IS indexed**, so it has to do both jobs, which is
why every Play listing in this category reads keyword-stuffed.

---

## 2. Service trackers

### CARFAX Car Care
The category leader, free, enormous install base.

- Service history that **populates itself** from CARFAX's shop network
- Maintenance-due alerts (oil, tires, filters, inspections)
- **Recall alerts**
- Estimated vehicle value
- Repair cost estimates ("what should this cost")
- Shop ratings and reviews
- Fuel economy / fill-up tracking

**Writeup angle:** free, authoritative, safety. It sells trust and the fact that
you do not have to type anything.

### Drivvo
- Fuel and consumption control: every fill-up, cost per km, litres/month, price history
- Favourite stations and fuel types
- Expenses categorised: insurance, tax, parking, tolls, car wash, fines
- Services and maintenance with preventative reminders
- Reports
- Cars, motorcycles, buses, trucks; fleet tier scales to 100 vehicles

**Writeup angle:** cost control. Opens by naming the vehicle types, which is
keyword work as much as scope.

### Simply Auto
- Fuel log with partial fill-ups
- **GPS trip tracking**, business vs personal, for tax deduction
- Service reminders by date or mileage
- Multiple receipts per fill-up, service or expense
- **Multi-driver sharing** for a shared car
- Cloud backup and cross-device sync
- **CSV export/import** to device or Google Drive
- Web access on Pro

**Writeup angle:** mileage and tax, plus shared/family vehicles.

*(Fuelly / aCar is the other major name here: MPG obsessives and a community
fuel-economy database.)*

---

## 3. Mod / build trackers

This is the category G-Dimension actually competes in, and it is **more crowded
than it looks**. These are direct competitors, not adjacent ones.

### DynoLog — the closest competitor
- Mod log with receipt photos and build cost tracking
- **Performance runs**: ET, trap speed, 60-foot, atmospheric data, imported from HowFast
- Performance timeline **correlated against every mod**
- "Active setup" configuration
- **PDF build sheet export**: vehicle details, mod list with install dates and costs, run history, total investment, cost breakdown by category. Explicitly pitched for handing to a tuner or attaching to a for-sale listing
- Community: public builds and a feed
- Free covers 2 vehicles; **$6.99 one-time** Pro unlocks unlimited vehicles, PDF export, no ads. No subscription

This is the one to watch. The PDF-for-a-buyer pitch is nearly identical to
G-Dimension's build report, and the one-time price is aggressive.

### BuildSheet
- **AI receipt scanning** that extracts cost, date and part details
- **AI parts search** and **AI mod recommendations** by make, model and goal
- Expense tracking and maintenance logs
- "Professional build sheets"
- Share a build by URL or QR code
- Community
- Free plan

**Writeup angle:** leads on AI. Self-describes as "the #1 AI-powered car build
tracker".

### Auto ModList
- Detailed record of every modification, part and service
- **Auto-generated public web page per vehicle**, no hosting needed
- Share by link, **QR code**, or a printable **car show board**
- Wish list
- Browse other users' builds

**Writeup angle:** sharing and showing off. The car show board is a genuinely
smart physical-world touch.

*Also in the space:* Track My Mods (mods, maintenance, expenses, events, media
and receipts, "Future" flag for wishlisted mods, any vehicle type including boat
and plane), My Builds (100% offline), Garagelog (QR share), MotorMia (AI tuning
advisor), Trackara (project cars).

---

## 4. What the writeups have in common

Worth copying:

1. **A plain first sentence that names the category.** Every one of them says
   what it is in words people search for, in the first line. No poetry above the
   fold. On Play the description is indexed, so this is also ranking work.
2. **Bulleted feature blocks under short headers.** Nobody writes paragraphs.
3. **Nouns, not verbs, in bullets.** "Fuel log", "service reminders", not "you
   can log your fuel".
4. **Pricing stated plainly**, especially "no subscription" where true. DynoLog
   leads with it.
5. **Vehicle types named explicitly** (car, motorcycle, truck), which is scope
   and keywords at once.
6. Mod trackers **sell sharing**; service trackers **sell cost control**.

Worth avoiding:

- Emoji-headed sections and ALL-CAPS shouting. Common in this category, and
  cheap-looking next to G-Dimension's design.
- Feature lists with no argument. Most of these read as inventories.

---

## 5. What competitors have that G-Dimension does not

Ordered by how much it matters.

| Gap | Who has it | Assessment |
|---|---|---|
| ~~**Fuel / MPG logging**~~ | All three service trackers | **CLOSED 2026-08 (migration 097, ADR-033, `/fuel`).** Was the biggest gap and the most searched term in the category. Tank-to-tank economy between full fills, with partial and missed fill-ups handled, so it is not the shallow version. The listing copy now carries `fuel` and `mpg` as keywords. |
| **AI receipt scanning (OCR)** | BuildSheet | High perceived value, removes the main friction of logging. **Now the top remaining gap.** |
| **Performance run logging** (dyno, 1/4 mile, 0-60) | DynoLog | Directly relevant to the tuner audience. |
| **QR code + printable car show board** | Auto ModList, Garagelog | Cheap to build, and the show board is a real-world hook G-Dimension's public page could use. |
| **AI mod recommendations / parts search** | BuildSheet, MotorMia | Fashionable. Unclear how much it retains. |
| **Recall alerts** | CARFAX | Genuine safety value, needs an NHTSA feed. |
| **Automatic service history from shops** | CARFAX | A data moat, not a feature. Not reachable. |
| **Estimated vehicle value** | CARFAX | Pairs naturally with the build report and the sell flow. |
| **GPS trip logging for tax** | Simply Auto | Different audience (rideshare, business). Probably not G-Dimension's fight. |
| **OBD-II integration** | Several | Hardware dependency. |
| **Multi-driver / shared vehicle** | Simply Auto | Relevant for family cars. |
| **CSV export** | Simply Auto | G-Dimension exports JSON and PDF but not CSV. Cheap to add. |
| **Offline mode** | My Builds | G-Dimension is online-only. |
| **Non-car vehicles** (moto, boat, truck) | Drivvo, Track My Mods | Deliberate scope choice, but it costs search traffic. |
| **Fleet / business tier** | Drivvo | Different product. |

---

## 6. What G-Dimension has that they do not

Nothing found in the research matches these:

- **Ownership transfer of the entire car profile to the buyer.** No competitor
  does this. They all stop at "export a PDF". This is the strongest single
  differentiator and it should lead.
- **SOLD provenance**: a car you sold stays in your history as a read-only
  keepsake, and the new owner's build links back.
- **An auto-generated magazine cover** for each build.
- **A timeline that assembles itself** from mods and services rather than being
  a separate thing you maintain.
- **DIY guides attached to mods**, with author credit that survives a transfer.
- **Parts Bin** with wishlist / on hand / in storage, and tyres that know which
  wheels they are mounted on.
- **Structured specs per part type** rather than a free-text note.
- **Background-removed car cutouts**, computed on device.
- **A private document vault** (VIN, registration, insurance) served by signed
  URLs and never public.
- **The blueprint public profile** as a place rather than a list.

---

## 7. The listing copy

**Moved into code.** The copy now lives in [`src/lib/storeListing.ts`](../src/lib/storeListing.ts)
and renders at **`/admin/store-shots`** with live character counts and a copy
button per field, alongside the screenshots and the privacy answers.

It was duplicated here and in that file for exactly one commit, which is the
usual lifespan of a fact kept in two places. This section is now a pointer so
the two can never disagree. What stays here is the *research* (sections 1 to 6
and 8) that produced the words; what moved is the words themselves.

Every length-capped field is asserted against its real store limit in
`src/lib/storeListing.test.ts`, so an overrun fails `npm run verify` rather
than failing in App Store Connect after you have pasted it.

**Two things changed when it moved (2026-08-14):**

- **`car` was dropped from the Apple keywords.** This document claimed the
  keyword list repeated no word from the name or subtitle. It did: the app name
  is "G-Dimension: Car Build Log". Words in the name are indexed anyway, so the
  repeat was four wasted characters. The test now enforces the claim.
- **`fuel` and `mpg` were added, and a FUEL LOG block was added to the
  description.** Section 5 called fuel logging the single biggest gap in the
  product, and section 8 recommended building it before the second release. It
  shipped (migration 097, ADR-033, `/fuel`), so the listing should say so. This
  was the most-searched term in the category and the listing was silent on it.

## 8. Recommendation

**~~Add fuel logging before the second release.~~ DONE, and it landed before the
FIRST release.** This was the one gap showing up in every competitor and across
the category's search terms, and without it the app was invisible to anyone
searching "fuel log" or "MPG tracker". It shipped properly rather than
shallowly: economy is computed between two FULL fills, with partial and missed
fill-ups handled, so the numbers do not come out quietly wrong. See migration
097, ADR-033, and the field research in
[`FUEL_LOG_RESEARCH.md`](./FUEL_LOG_RESEARCH.md).

**Next gap worth closing: receipt OCR.** With fuel done, the remaining item that
both removes real friction and reads well on a listing is scanning a receipt
into a mod or service record. It is the version of "AI" that earns its place.

**Lead the listing on transfer.** It is the only thing here nobody else does.
Everyone exports a PDF. Only G-Dimension hands over the car.

**Do not chase AI features yet.** BuildSheet and MotorMia are competing on it,
but a receipt scanner that reduces logging friction is the version worth
building, not a recommendation engine.
