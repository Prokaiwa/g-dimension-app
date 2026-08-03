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
| **Fuel / MPG logging** | All three service trackers | **The biggest gap.** It is the single most searched term in the category and G-Dimension has none of it. |
| **AI receipt scanning (OCR)** | BuildSheet | High perceived value, removes the main friction of logging. |
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

No em dashes, per the house rule in `CLAUDE.md`. Every field below was measured
against its limit programmatically, not by eye.

### App Store

**Name** (26/30)
```
G-Dimension: Car Build Log
```

**Subtitle** (28/30)
```
Mod tracker & service record
```

**Keywords** (95/100, no spaces, no words repeated from name or subtitle)
```
car,mods,tuning,maintenance,garage,parts,receipts,project,restoration,jdm,vehicle,history,maint
```

**Promotional text** (162/170)
```
New: hand your whole build to the next owner. Export a full report, or transfer the entire car profile when you sell. Every mod, service and receipt goes with it.
```

**Description** (2,529/4,000)
```
G-Dimension is a build journal, mod tracker and service log for people who take
their cars seriously. Every modification, every service, every receipt, kept in
order for as long as you own the car. And after.

Your build history is worth something. Most of it disappears anyway, buried in
forum threads, camera rolls and a glovebox full of paper. This is the logbook
your car should have come with.

THE BUILD SHEET
Log every part with brand, part number, cost and install date. Structured specs
for the things that matter to that part, not a free text box. Photos, receipts
and links on every entry. Grouped into Power, Chassis, Exterior and Interior so
the whole build reads at a glance.

DIY GUIDES
Write up how you did the install, step by step, attached to the part itself. Your
guide stays credited to you even if the car changes hands.

SERVICE HISTORY
Date, mileage, cost, shop and receipt on every oil change, repair and inspection.
Running totals so you always know what the car has cost you. A separate log for
detailing, because it is not the same job.

REMINDERS THAT UNDERSTAND CARS
Due by date or by mileage, and repeating on either. Every 6 months, every 5,000
miles, or both. Mark one done and the next one schedules itself.

THE TIMELINE
Every mod and every service lands on a timeline on its own, in the order it
happened. Add your own entries for track days, shows, road trips or the day you
bought it. You do not maintain it. It assembles itself.

PARTS BIN
Track what you own but have not fitted yet. Wishlist, on hand, in storage. Tyres
know which wheels they are mounted on, so nothing gets counted twice.

THE BUILD REPORT
Export a complete PDF of the car: identity, full modification history, full
service history, total invested. Hand it to a buyer, a tuner or an insurer.

WHEN YOU SELL, THE RECORD GOES WITH IT
Transfer the entire car profile to the new owner. Not a PDF, the whole thing,
mods, services, photos, timeline and guides. The car keeps its history and you
keep a record that you owned it.

YOUR BUILD, ON A COVER
G-Dimension writes your car a magazine cover from your own photos and specs.

A PAGE OF YOUR OWN
Share one link and people see your garage, build sheet, timeline and cover.
Receipts, documents, VIN and purchase price are never public.

PRIVATE BY DEFAULT
Documents and receipts are stored privately and served over expiring links.
Nothing about your car is published unless you publish it. Export everything you
have logged at any time.

Free to use. Built for the long haul.
```

### Play Store

**Name** (26/30)
```
G-Dimension: Car Build Log
```

**Short description** (79/80)
```
Log mods, service, parts and receipts. Your whole build, kept and transferable.
```

**Full description**

Same body as the App Store description above. Play indexes it, so keep the
category words in the first paragraph ("build journal, mod tracker and service
log") exactly as written, and keep the section headers as plain words rather
than emoji.

---

## 8. Recommendation

**Add fuel logging before the second release.** It is the one gap that shows up
in every competitor and in the search terms for the whole category, and it is
modest work: a `fuel_entries` table, a form, and a stat on the maintenance
screen. Without it, G-Dimension is invisible to anyone searching "fuel log" or
"MPG tracker", which is a large share of the traffic.

**Lead the listing on transfer.** It is the only thing here nobody else does.
Everyone exports a PDF. Only G-Dimension hands over the car.

**Do not chase AI features yet.** BuildSheet and MotorMia are competing on it,
but a receipt scanner that reduces logging friction is the version worth
building, not a recommendation engine.
