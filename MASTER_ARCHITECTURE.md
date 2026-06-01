# G-Dimension — Master Architecture
**Version:** 3.0
**Status:** In Progress — Supabase schema complete. Database ready. Next: Step 5 — Auth screens.
**Last Updated:** April 2026
**Domain:** gdimension.app
**Instagram:** @gdimensionapp
**Repository:** GitHub — `g-dimension-app` (account: prokaiwa)
**Support email:** hi@gdimension.app

---

## HOW TO USE THIS FILE

This is the single source of truth for G-Dimension. It supersedes all prior session notes and the DESIGN_TOKENS.md v1.0 on every point of conflict. If you are a Claude session, a Claude Code agent, or a human developer:

1. Read this file in full before writing a single line of code or copy.
2. When this file and any other document conflict, this file wins.
3. When this file doesn't cover an edge case, use the **Decisions Log** (Part 27) to reason about what the intent would have been.
4. Sections marked `[NEEDS DISCUSSION — DO NOT BUILD]` are incomplete and must not be implemented until finalized.
5. The design and the architecture are tightly coupled. Aesthetic decisions have structural consequences. Read both.

**Note on design token drift:** The DESIGN_TOKENS.md v1.0 and the live marketing page at gdimension.app may have minor color and spacing inconsistencies. This master file is the corrected, authoritative version. Reconcile the marketing page to this file during the first build session, not the other way around.

---

## PART 1 — PRODUCT PHILOSOPHY

G-Dimension is a car build journal **Progressive Web App (PWA)**. The PWA is the current and initial deployment format — it runs in the browser and can be installed on any phone's home screen without an app store. The long-term goal is a **full native app launch on the Apple App Store and Google Play Store**. The PWA serves as the primary testing and preview environment until that native launch is ready.

G-Dimension allows enthusiasts to document their builds over time — modifications, maintenance, detailing, photos, receipts — in a beautiful, purpose-built experience that feels like a place, not software. It is deliberately anti-SaaS-dashboard.

### Aesthetic DNA

The visual and experiential reference is **Gran Turismo 4 (2004) combined with 90s JDM culture** — not as pastiche but as a DNA donor.

**Gran Turismo 4's aesthetic:**
- Sophisticated and minimalist UI with clean, functional transitions — not flashy
- "Jet-set" atmosphere — worldly, high-end, like a curated automotive museum
- Automotive romance: the beauty of cars treated like a documentary or high-end car magazine
- A distinct cool blue filter applied throughout — slightly nostalgic, clean, melancholic
- Liminal, atmospheric environments — serene, almost haunting empty spaces
- Professional and almost "soulful" — more like a high-end car museum than a video game

**90s JDM culture:**
- The swooping double-stroke G logo — directly referencing JDM car badges (Silvia Q's/K's, Skyline GT)
- Hanken Grotesk as the UI font — clean, modern, slightly sporty
- The collector mentality — care, documentation, pride in the machine

Together: clinical where it needs to be, warm and romantic when it counts. The product is deliberately anti-SaaS-dashboard.

### North Star Phrases
Use these to resolve any unspecified design decision:

1. **"Built by someone who loves cars for people who love cars"** — every screen should signal enthusiast authenticity.
2. **"The app should feel like a place, not a piece of software"** — spatial metaphors over flat app patterns.
3. **"Sharp when it needs to be, warm when it counts"** — cool-toned architecture with selective warm accents for emotional moments.

### Brand Copy
- **Slogan:** Build it. Log it. Own it. *(punchy three-part line — Instagram, marketing, hero)*
- **Catchphrase:** Your build. Documented. *(quiet, confident sub-line — under wordmark, app sub-headers)*
- **Hero headline:** Your build has a story. Give it somewhere to live.
- **Support email:** hi@gdimension.app

---

## PART 2 — BRAND IDENTITY

### Origin of the Name

G-Dimension is named in tribute to **G-Dimensions**, a shop in California in the early 2000s that specialized in Nissan 240SX builds. The founder brought his car there often; the shop was known for quality work and genuine warmth toward the enthusiast community. They have since closed. G-Dimension (without the "s") is a reimagining of that name — a digital space that carries the same spirit of caring about the car and the community. The gravitational constant G is a secondary layer of meaning: the force that holds things in orbit, that anchors everything to the ground. A quiet metaphor for what the app does for a build over time.

### Logo System

Five files exist. All are high-resolution PNG. No SVG versions currently exist.

| File | Description | Use Case |
|---|---|---|
| `gdimensionGwhitebg.png` | G mark badge on white background | Marketing, Instagram branding, press kit — approved for production use |
| `gdimensionlight.png` | G mark badge + wordmark, white on burgundy | In-app hero moments, dark backgrounds |
| `gdimensiondark.png` | G mark badge + wordmark, dark on white | Marketing, press kit, light backgrounds |
| `g-dimension_words_light.png` | Wordmark only, white | In-app wordmark on dark |
| `g-dimension_words_dark.png` | Wordmark only, black | Marketing, documents |

**File location on creator's machine:** `~/g-dimension/images/`
**Add to project at:** `src/assets/logo/`

**The G mark:** A double-stroke swooping G inside a rounded square badge. References 90s Japanese car badges — Nissan Silvia Q's/K's and the Skyline GT badge. Also references G as the gravitational constant. White G on `#780E12` burgundy background.

**The wordmark:** "G-Dimension" in Hanken Grotesk, 600 weight, italic, approximately -0.10em letter-spacing. Mixed case. The hyphen is part of the name — never write "G Dimension" or "GDimension."

**Instagram brand palette:** Burgundy, black, and white.

**Critical rule:** Never recreate the G mark in CSS or SVG from scratch. Always use the PNG files.

---

## PART 3 — COLOR TOKENS

```css
/* === BRAND === */
--brand:             #780E12;
--brand-light:       #8e1016;
--brand-dark:        #4a0a0c;

/* === ACCENT === */
--accent:            #c8661a;    /* burnt orange — used sparingly */
--accent-dim:        #8a4810;
--accent-text:       #fff5dc;

/* === HEADER === */
--header-black:      #111111;
--header-warm:       #f0e4c8;
--header-title:      #ffffff;

/* === BURGUNDY (header wedge shapes) === */
--burgundy-l:        #6e281e;
--burgundy-m:        #4a1410;
--burgundy-r:        #2a0a06;

/* === DARK UI === */
--cavity-bg:         #050507;
--app-bg-radial:     radial-gradient(ellipse at center, #202224 0%, #050505 100%);

/* === PANEL === */
--panel-light:       #e6e6e8;
--panel-mid:         #d8d8da;
--panel-dark:        #c4c4c6;
--panel-line:        #6a6a6c;
--panel-gradient:    linear-gradient(180deg, #e6e6e8 0%, #d8d8da 45%, #c4c4c6 100%);
--panel-text:        #2a2a2c;

/* === COOL WORLD (Home map surface) === */
--world-horizon:     #d4dce2;
--world-mid:         #a8b2ba;
--world-low:         #6a737a;
--world-floor:       #3a4248;

/* === TIMELINE (the only light destination) === */
--timeline-bg:       #f5f2ee;    /* warm off-white — parchment-adjacent */
--timeline-card:     #faf8f5;    /* slightly lighter than bg — cards lift off the page */
--timeline-text:     #1a1814;    /* near-black warm — primary text on light bg */
--timeline-muted:    #8a8278;    /* muted warm brown — secondary text, dates */
--timeline-year:     #c8b89a;    /* warm sand — year marker text */
--timeline-rule:     #e0d8ce;    /* warm light rule — year divider lines */
--timeline-chevron:  #c8a050;    /* amber-gold — the only back navigation element */

/* === TIMELINE CARD ACCENT STRIPES (3px left border) === */
--timeline-mod:      #c8c4bc;    /* warm stone grey — modification entries */
--timeline-service:  #d4b86a;    /* soft warm gold — maintenance/service entries */
--timeline-detail:   #8ab0c8;    /* muted cool blue — detailing entries */

/* === TEXT === */
--text-primary:      #f5f5f5;
--text-secondary:    #8a8a8c;
--text-muted:        #3f3f46;
--text-black:        #000000;
```

---

## PART 4 — TYPOGRAPHY

Two fonts only. Load via Google Fonts:

```css
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@1,500;1,600&family=Hanken+Grotesk:wght@400;500;600;700;800;900&display=swap');
```

```js
export const FONT_UI    = "'Hanken Grotesk', 'Helvetica Neue', Helvetica, Arial, sans-serif";
export const FONT_TITLE = "'Cormorant Garamond', 'Garamond', serif";
```

### Hanken Grotesk — the UI font
Weights 400–900. Used for everything except display moments:
- All UI labels, buttons, nav labels, stat values
- Usernames, car names in headers
- Body text, form fields, back buttons, chevrons
- Numbers: `font-variant-numeric: tabular-nums`
- **Tuning section exclusively — Hanken throughout, no Cormorant**
- **Timeline — Hanken for labels, dates, category tags, year markers**

**Wordmark:** 600 weight, italic, -0.10em letter-spacing.
**UI labels:** uppercase, 0.08–0.2em letter-spacing.
**Car names in headers:** Hanken 700, mixed case, not italicized.

### Cormorant Garamond — the display font
Italic, 500 or 600 weight only. Emotional/chapter moments:
- Main title watermark on Home screen
- Screen headings on Garage hero
- Large hero taglines
- "Tell your story" step heading in Add Car flow
- **Timeline journal entries exclusively** — personal written notes are the one moment Cormorant appears in the Timeline

**Rule:** If it doesn't feel like a chapter-title or personal-voice moment, use Hanken.

---

## PART 5 — SPACING & SIZING SCALE

```
  2px   hairline border, tight padding
  4px   sub-element margin
  6px   small gap (icon to label)
  8px   standard gap
 10px   card inner padding
 12px   header horizontal padding
 16px   screen edge padding (standard)
 18px   row gap in icon grids
 22px   icon to label spacing (large contexts)
 24px   section spacing
 32px   major visual separation
 44px   tappable minimum / header height
```

**Phone canvas:** 390 × 844px (iPhone 14/15 Pro).
**Tap targets:** minimum 44 × 44px.

---

## PART 6 — SHADOWS

```css
/* Standard drop shadow on skeuomorphic icons */
filter: drop-shadow(0 5px 8px rgba(0, 0, 0, 0.55));

/* Heavy focal drop shadow */
filter: drop-shadow(0 6px 10px rgba(0, 0, 0, 0.55));

/* Amber glow — focal HOME destination on Home map */
background: radial-gradient(circle at center, rgba(200, 102, 26, 0.12) 0%, transparent 65%);

/* Phone container shadow */
box-shadow: 0 50px 100px -10px rgba(0, 0, 0, 0.85), 0 0 0 1px #2a2a2c;

/* Ground shadow under icon */
background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.55) 0%, transparent 70%);
filter: blur(2px);

/* Timeline card lift shadow — warm, soft, not dramatic */
box-shadow: 0 4px 16px rgba(0, 0, 0, 0.10), 0 1px 4px rgba(0, 0, 0, 0.06);
```

### Skeuomorphic Icon Cast Shadow

**The 22.5° cast shadow applies to the Garage dashboard grid ONLY.**

```css
.icon-shadow {
  position: absolute;
  width: 56px; height: 44px;
  background: #000000;
  top: 56%; left: 52%;
  transform: translate(-50%, -50%) rotate(22.5deg) skewX(-14deg);
  opacity: 0.42;
  filter: blur(1.4px);
  border-radius: 2px;
  z-index: 0;
}
.nav-card:nth-child(even) .icon-shadow {
  transform: translate(-50%, -50%) rotate(-22.5deg) skewX(14deg);
}
```

---

## PART 7 — ANIMATION TOKENS

```css
transition: 200ms ease-out;
cubic-bezier(0.22, 1, 0.36, 1)   /* entry/settle */
:active { transform: scale(0.95); }

@keyframes doorSettle {
  0%   { transform: translateY(-16px); opacity: 0; }
  100% { transform: translateY(0); opacity: 1; }
}
@keyframes carAppear {
  0%   { opacity: 0; } 100% { opacity: 1; }
}
@keyframes iconFadeIn {
  0%   { opacity: 0; transform: translateY(6px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes pulse {
  0%, 100% { opacity: 1; } 50% { opacity: 0.4; }
}
@keyframes garagePulse {
  0%, 100% { opacity: 0.5; transform: translateX(-50%) scale(1); }
  50%       { opacity: 1.0; transform: translateX(-50%) scale(1.06); }
}

/* Timeline entry fade-in on scroll */
@keyframes timelineEntryReveal {
  0%   { opacity: 0; transform: translateY(12px); }
  100% { opacity: 1; transform: translateY(0); }
}
/* Applied via IntersectionObserver — triggers when entry enters viewport */
/* Duration: 400ms, cubic-bezier(0.22, 1, 0.36, 1) */
```

**Stagger pattern for grid reveals:**
```js
animationDelay: `${400 + index * 70}ms`
```

---

## PART 8 — BORDER & SHAPE RULES

**No border-radius on architectural elements.** Headers, stat panels, inputs, nav cards — all sharp corners. Non-negotiable.

Border-radius only on:
- Pill buttons: full radius
- Bottom sheet top corners: `12px`
- Avatars: `50%`
- Notification dots: `50%`
- Tiny accent badges: `1–2px`
- **Timeline cards: `4px`** — the one exception.

**No pure white.** Cap at `#f5f5f5` in dark screens.

**Pill buttons in the app:** Used sparingly. Only where a single decisive action is needed (Save, Choose, Add).

---

## PART 9 — COMPONENT PATTERNS

### Header — Two Variants

**Full header (Home screen only)**
```
Height: 44px
Burgundy wedge shapes on both ends, dark center (#111111)
Left:  Avatar (28px) → Profile. Username (Hanken 700, 13px, uppercase, header-warm)
Right: Small car icon + car name (Hanken 700, 13px, mixed case, header-warm)
```

**Minimal header (all sub-screens except Timeline)**
```
Height: 44px. Same burgundy wedge layout.
Left:  Back chevron "<" (18px, header-warm) + screen title
Right: Small car icon + car name (informational only — NOT tappable)
```

**Timeline has NO header.** See Part 12.

**CRITICAL:** Car name is **never tappable.** Avatar opens **Profile** (`/profile`).

### Header Cast Shadow (Home map only)
```css
.header-cast-shadow {
  position: absolute; top: 0; left: 0; right: 0; height: 32px;
  z-index: 50; pointer-events: none;
  background: linear-gradient(180deg,
    rgba(0,0,0,0.60) 0%, rgba(0,0,0,0.38) 35%,
    rgba(0,0,0,0.18) 65%, rgba(0,0,0,0.05) 85%, transparent 100%);
  border-top: 1px solid rgba(0,0,0,0.55);
}
```

### Concrete Panel Input
```css
.panel-input {
  background: linear-gradient(180deg, #e6e6e8 0%, #d8d8da 45%, #c4c4c6 100%);
  color: #2a2a2c; font-weight: 700; font-size: 14px;
  padding: 12px 14px; height: 44px;
  border: none; border-bottom: 1px solid #6a6a6c; border-radius: 0;
  transition: border-color 200ms ease-out;
}
.panel-input:focus { border-bottom-color: #c8661a; outline: none; }
.panel-input-label {
  font-weight: 700; font-size: 10px; letter-spacing: 0.1em;
  text-transform: uppercase; color: #8a8a8c; margin-bottom: 4px;
}
```

### Home Map Destination Node
```css
.dest { position: absolute; display: flex; flex-direction: column;
  align-items: center; cursor: pointer; transform: translate(-50%, -50%); }
.dest-icon-wrap { width: 86px; height: 86px; position: relative; }
.dest-icon-wrap img { max-width: 100%; max-height: 100%;
  filter: drop-shadow(0 5px 8px rgba(0,0,0,0.55)); }
.dest-label { margin-top: 4px; font-weight: 800; font-size: 11.5px;
  color: #1a1e24; letter-spacing: 0.16em; text-transform: uppercase;
  text-shadow: 0 1px 0 rgba(255,255,255,0.55),
    -1px -1px 0 rgba(255,255,255,0.30), 1px -1px 0 rgba(255,255,255,0.30); }
```

**Focal (HOME):** Wrapper 120×120px. Amber underline. Pulsing amber halo.

---

## PART 10 — SCREEN INVENTORY

### Primary Destinations (Home Map)

| Map Label | Inside Label | Purpose | Coords | Wrapper | Route |
|---|---|---|---|---|---|
| **HOME** | Garage | Car profile, docs, car switching | `left: 195px, top: 220px` | 120×120 | `/garage` |
| **TUNING** | Tuning | Modification management | `left: 295px, top: 405px` | 86×86 | `/tuning` |
| **TIMELINE** | Timeline | Build story — cinematic, journal | `left: 95px, top: 405px` | 86×86 | `/timeline` |
| **MAINTENANCE** | Maintenance | Service, detailing, reminders | `left: 270px, top: 625px` | 86×86 | `/maintenance` |
| **PHOTOS** | Photos | Masonry gallery | `left: 120px, top: 625px` | 86×86 | `/photos` |

**Reserved:** One map region reserved for Track/Strip destination (future Pro feature).

### Full Route Map

```
/                              → Landing
/login · /signup               → Auth
/home                          → Home map

/garage                        → Garage hero
/garage/cars                   → My Cars carousel
/garage/cars/new               → Add Car
/garage/cars/:carId/edit       → Edit Car
/garage/snapshot               → Snapshot
/garage/documents              → Documentation
/garage/contacts               → Contacts
/garage/reminders              → Reminders
/garage/pdf                    → Build PDF

/tuning                        → Tuning dashboard
/tuning/build-sheet            → Build Sheet
/tuning/blueprint              → Blueprint
/tuning/parts-bin              → Parts Bin
/tuning/add                    → Add Modification
/tuning/mods/:modId            → Mod Detail
/tuning/mods/:modId/edit       → Edit Mod

/maintenance                   → Maintenance overview
/maintenance/:sessionId        → Session Detail
/maintenance/detail            → Detailing log
/maintenance/detail/new        → Add Detail Session

/timeline                      → Timeline scroll
/timeline/entry/:entryId       → Entry Detail (read-only)

/photos                        → Masonry gallery

/profile                       → Own profile
/settings                      → Settings
/settings/archived             → Archived Cars
/builds/:username              → Public Profile (non-auth)
```

### Garage Dashboard Grid

3×2 skeuomorphic grid. **22.5° cast shadow here only.**

```
Row 1:  My Cars  |  Snapshot  |  Build PDF
Row 2:  Docs     |  Contacts  |  Reminders
```

### My Cars Carousel

Stats: Year · Make · Model · Color · Horsepower · Torque · Mileage *(in user's unit preferences)*
Actions: **Choose** · **Edit**. Final card: Add a Car.

---

## PART 11 — TUNING DESTINATION

### Overview

Modern performance-facing aesthetic. Hanken Grotesk exclusively — no Cormorant anywhere in Tuning.

### Background Treatment

`tuning_hero.jpg` — cool-toned performance shop. Industrial, precise.

```css
.tuning-overlay {
  position: absolute; inset: 0;
  background: linear-gradient(180deg,
    rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.88) 35%, rgba(0,0,0,0.93) 100%);
}
```

### Dashboard — 4 Tiles

| Tile | Purpose | Icon |
|---|---|---|
| **Add Modification** | Log a new part | Torque wrench |
| **Build Sheet** | Installed mods — spec view | Partially unfolded catalog page |
| **Blueprint** | Planned mods — wishlist | Blueprint paper with car profile |
| **Parts Bin** | Owned, not installed | Worn cardboard box, coilover poking out |

Icons: `src/assets/icons/tuning-dashboard/`

### Part Lifecycle System

```
Planned    → Blueprint
Purchased  → Parts Bin (On Hand)
Installed  → Build Sheet
Removed    → Parts Bin (Pulled) — if still owned; history only if sold/scrapped
Sold       → Historical record only
Scrapped   → Historical record only
```

"Remove from Car" action prompts: *"Where is this part now?"*
- "Still in my garage" → `Removed` + `still_owned = true` → auto-appears in Parts Bin
- "No longer with the car" → `Sold` or `Scrapped` → history only

History is never deleted. Every part that touched the car stays in the record permanently.

### Build Sheet — Design Spec

```
Car nickname:    Hanken 900, uppercase, ~22px, tight tracking, white
Category header: Hanken 900, uppercase, ~11px, 0.2em tracking
Mod row:
  Brand:         Hanken 500, ~12px, muted — omitted if no brand logged
  Part name:     Hanken 700, ~14px, white
  Date:          Hanken 400, ~11px, amber, tabular-nums, right-aligned
```

**Mechanical category order:** Engine → Drivetrain → Suspension → Brakes → Wheels & Tires → Exhaust → Cooling → Fuel System → Electrical → Audio → Safety → Exterior → Paint & Wrap → Interior

**Copy Build Sheet:** Plain text, no branding. Pro: PDF export.

**PUBLIC PROFILE BUILD SHEET:** Brand + title + category visible publicly. Cost per part is PRIVATE — never shown on /builds/:username unless the user specifically enables it.

---

## PART 12 — TIMELINE DESTINATION — FULL DESIGN

### Philosophy

The Timeline is the **emotional heart of G-Dimension** — the one place where the build becomes a story rather than a record. The only light destination, no header, explicitly cinematic.

### Navigation

No header. Floating amber-gold chevron `‹` top-left only.
```
Color:    #c8a050
Size:     16px, Hanken 300/400
Hit area: 44×44px
```

### Screen Background
```css
background-color: #f5f2ee;  /* --timeline-bg */
```

### Origin Entry

Special record created on first Timeline open. Auto-populated from `cars.purchase_story`. Cannot be deleted — only edited via long-press. Protected by database trigger.

**Card:** Full-bleed photo at top, Cormorant Garamond italic for story text, amber-gold date. No accent stripe — it's the cover page.

### Timeline Scroll

**Sort order:** Oldest at top (Origin Entry), newest at bottom. Scroll down = forward in time. Year markers as chapter dividers.

### Entry Cards — Standard

3px left border accent stripe by type:
```
Modification:  #c8c4bc  (warm stone grey)
Service:       #d4b86a  (soft warm gold)
Detail:        #8ab0c8  (muted cool blue)
```

Card layout:
```
[ TYPE LABEL ]   [ DATE right-aligned ]
Title or job count + shop name

[ PHOTO if exists — full card width, ~160px tall ]
[ Journal entry — 2 lines max, Cormorant Garamond italic ]
```

### Add to Timeline Toggle

```
[ ◉ Add this to my Timeline ]
```
- Default ON for modifications
- Default OFF for routine maintenance
- Default ON for detail sessions

Only entries with toggle ON appear in Timeline. All entries exist in the database and are accessible from Tuning/Maintenance/Photos.

---

## PART 13 — MAINTENANCE DESTINATION — FULL DESIGN

### Philosophy

Maintenance is treated with the same respect as every other destination — its own world, its own atmosphere — but it never pretends to be more glamorous than it is.

### Aesthetic Reference

**GT Auto from Gran Turismo 4** — warm amber-gold, diagonal graphic element, user's car center stage, mechanic figure in background, skeuomorphic icons below.

### Landing Screen

Background: `maintenance_hero.jpg` — warm amber-gold, diagonal graphic flair, mechanic silhouette. Car compositing reuses background-removed `garage_photo_url`.

**Two destination tiles (diagonally offset):**
- Service (`/maintenance/service`) — amber check engine light icon
- Detail (`/maintenance/detail`) — sponge and bucket icon

### Service Screen — Invoice Aesthetic

```
Background:   Dark near-black
Document:     G watermark 6–8% opacity, burgundy rules at 30% opacity
Typography:   Hanken, tight, utilitarian, uppercase labels
```

Form fields: Date, Mileage, Performed By, Shop Name, repeatable Jobs, Total Cost, Timeline toggle.

### Detail Sessions

Warm dark aesthetic. Clean list format. Default Timeline toggle ON.

---

## PART 14 — PHOTOS DESTINATION — FULL DESIGN

### Philosophy

No landing screen. No ceremony. Immediately in the gallery. Content IS the design.

### Layout — Asymmetric Masonry Grid

```css
.photos-grid {
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  gap: 3px;
  background: #0a0a0a;
}
```

### Filter Row

```
ALL  ·  MODIFICATIONS  ·  SERVICE  ·  DETAIL  ·  GARAGE
```

Small uppercase Hanken text, amber underline on active state.

### Photo Sources

| Source | Filter |
|---|---|
| `job_photos` where type = modification | MODIFICATIONS |
| `job_photos` where type = maintenance | SERVICE |
| `job_photos` where type = detail | DETAIL |
| `sessions.timeline_photo_url` | Pulled into relevant filter |
| `timeline_entries.photo_url` (Origin Entry) | ALL only — "THE BEGINNING" |
| `cars.garage_photo_url` + `cars.showcase_photo_url` | GARAGE |

### Origin Entry Photo

Appears at bottom of ALL filter. Single amber label: `THE BEGINNING`. Only labeled photo in the grid.

---

## PART 15 — CAR PROFILE & SNAPSHOT FIELDS

### Add Car Flow

**Step 1 — Basics (required)**
```
Year · Make (autocomplete from vehicle_makes) · Model (autocomplete) · 
Variant/Trim (autocomplete from vehicle_variants — optional but recommended) ·
Chassis Code (auto-filled from variant or manual entry) ·
Nickname (required) · Current Mileage
```

**Step 2 — Tell Your Story (optional)**
```
Purchase Date · Purchase Price · Purchase Currency · Mileage at Purchase
Where you got it · Purchase story (text area)
```
→ `CONTINUE` or `SKIP FOR NOW`

**Note:** Purchase story auto-populates Origin Entry journal.

### Full Car Profile Fields

**IDENTITY:** Year, Make, Model, Trim, Variant (chassis-level), Chassis Code, Nickname (required), Color

**VEHICLE SPECS:** VIN, Paint Code, License Plate, Engine Type, Transmission, Drivetrain, Forced Induction, Horsepower (stored in hp), Torque (stored in lb-ft), Current Mileage (stored in miles)

**CONSUMABLES:** Tire Size, Oil Type, Battery Model

**PURCHASE / ORIGIN:** Purchase Date, Purchase Price, Purchase Currency, Mileage at Purchase, Where Purchased, Purchase Story

**PHOTOS:** Garage Photo, Showcase Photo, Photo Y Offset (0–100% slider)

**NOTES:** Free-form — quirks, things to watch, how it drives

**SYSTEM:** Is Public toggle, Is Import flag (JDM/EU), Show Investment Publicly toggle

### Snapshot Fields

```
IDENTITY:     Year / Make / Model / Variant / Chassis Code · Nickname · Color · VIN · Plate
ENGINE:       Engine Type / Engine Code · Forced Induction · Horsepower · Torque
CONSUMABLES:  Oil Type · Tire Size · Battery Model
INSURANCE:    Provider · Policy number · Expiry (from car_documents)
SERVICE:      Last service date + type · Next reminder
BUILD INVESTMENT: (bottom, below fold) — only shown if costs exist AND visible to current viewer
```

**BUILD INVESTMENT PUBLIC VISIBILITY:** Shown on public profile only if `cars.show_investment_publicly = true`. Default false. Toggled per car in settings.

---

## PART 16 — USER PREFERENCES & UNIT SYSTEM

All preferences on the **user profile** — not per car. Stored in base unit, converted at display time only. Switching units is instant and requires no data migration.

```
Distance:  stored in miles    → display in mi or km (× 1.60934)
Power:     stored in hp       → display in hp, PS (÷ 0.9863), or kW (× 0.7457)
Torque:    stored in lb-ft    → display in lb-ft or Nm (× 1.35582)
```

**280 PS note:** The Japanese gentleman's agreement was 280 PS (≈276 hp). Displaying in PS honors that culturally significant distinction. 276 hp ÷ 0.9863 = 279.8 PS → displayed as "280 PS". The factory R32 GT-R figure.

**Settings — Units section:**
```
DISTANCE   [mi]  [km]
POWER      [hp]  [PS]  [kW]
TORQUE     [lb-ft]  [Nm]
```

---

## PART 17 — DATA MODEL (Supabase / Postgres)

**Migration files:** `supabase/migrations/001_*.sql` through `023_*.sql`
**Run order:** 001 → 023 in sequence. Each file is documented and idempotent.

### `users`

```sql
create table users (
  id                  uuid primary key references auth.users(id) on delete cascade,
  -- Matches auth.users.id exactly — NOT a separate surrogate key
  username            text unique not null,
  email               text unique not null,
  avatar_url          text,
  display_name        text,
  city                text,
  country             text,
  country_code        char(2),
  bio                 text,
  subscription_status text check (subscription_status in ('free','pro')) default 'free',
  distance_unit       text check (distance_unit in ('mi','km')) default 'mi',
  power_unit          text check (power_unit in ('hp','ps','kw')) default 'hp',
  torque_unit         text check (torque_unit in ('lbft','nm')) default 'lbft',
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  deleted_at          timestamptz
);
```

**Auto-sync trigger:** `on_auth_user_created` fires on every `auth.users` INSERT. Creates the matching `public.users` row automatically. Zero app code required for user creation.

### `vehicle_makes`

```sql
create table vehicle_makes (
  id            serial primary key,
  make_name     text unique not null,   -- Title Case normalized
  country       text,                   -- ISO 3166-1 alpha-2: JP, US, DE, KR
  regions       text[] default '{}',    -- Markets: ['US'], ['JP'], ['US','JP']
  source        text check (source in ('nhtsa','carquery','jdm_manual','eu_manual','user_added')),
  nhtsa_make_id integer,                -- NHTSA dedup key
  is_active     boolean default true,
  created_at    timestamptz default now()
);
```

Trigram index on `make_name` for fuzzy autocomplete.

### `vehicle_models`

```sql
create table vehicle_models (
  id            serial primary key,
  make_id       integer references vehicle_makes(id),
  model_name    text not null,          -- Title Case normalized
  year_start    integer,
  year_end      integer,                -- null = still in production
  body_style    text,                   -- sedan, coupe, hatchback, wagon, suv, truck, van, convertible
  is_jdm_only   boolean default false,
  source        text,
  created_at    timestamptz default now(),
  unique (make_id, model_name)
);
```

### `vehicle_variants` *(new)*

Sub-model / chassis code layer. **This is the level enthusiasts actually care about.**

```sql
create table vehicle_variants (
  id            serial primary key,
  model_id      integer references vehicle_models(id) on delete cascade,
  variant_name  text not null,          -- "S14 Kouki", "Type R", "GT-R V-Spec II"
  chassis_code  text,                   -- "S14", "EK9", "BNR34", "JZX100"
  trim_level    text,                   -- "Spec-R", "Spec-S", "K's", "Q's"
  year_start    integer,
  year_end      integer,
  engine_code   text,                   -- "SR20DET", "B16B", "RB26DETT", "2JZ-GTE"
  engine_cc     integer,
  power_hp      integer,                -- Factory HP — stored in hp (base unit)
  torque_lbft   integer,                -- Factory torque — stored in lb-ft (base unit)
  drive         text,                   -- rwd/fwd/awd/4wd
  body_style    text,
  is_jdm_only   boolean default false,
  source        text,                   -- carquery/jdm_manual/nhtsa/eu_manual/user_added
  created_at    timestamptz default now(),
  unique (model_id, variant_name)
);
```

**Seed data included:** R32/R33/R34 all variants, S13/S14 Zenki/S14 Kouki/S15, JZX100 Tourer V, EK9 Type R, DC2 JDM/USDM, FD3S Spirit R, Evo VI GSR/RS/Tommi Makinen, and more.

### `vehicle_search_aliases` *(new)*

Solves the "Evo vs Evolution" problem and all similar enthusiast shorthand.

```sql
create table vehicle_search_aliases (
  id          serial primary key,
  alias       text not null,            -- lowercase: "evo", "ek9", "s14 kouki"
  canonical   text not null,            -- "Lancer Evolution", "Civic Type R EK9"
  alias_type  text,                     -- make/model/variant/chassis
  make_id     integer references vehicle_makes(id),
  model_id    integer references vehicle_models(id),
  variant_id  integer references vehicle_variants(id),
  source      text,                     -- curated/user_suggested/carquery
  unique (alias, make_id, model_id)
);
```

**100+ curated aliases seeded:** "evo"/"evolution"/"lancer evo" → Lancer Evolution, "s13"/"s14"/"s15" → Silvia variants, "240sx" → Silvia (US name), "ae86"/"hachi roku"/"trueno"/"levin" → Corolla AE86, "r32"/"r33"/"r34" → Skyline, "ek9" → Civic Type R, "fd"/"fd3s" → RX-7 FD3S, and many more.

**Search query pattern:**
```sql
SELECT DISTINCT canonical, model_id FROM vehicle_search_aliases
WHERE lower(alias) LIKE lower($1) || '%'
UNION
SELECT model_name, id FROM vehicle_models
WHERE lower(model_name) LIKE lower($1) || '%'
LIMIT 10;
```

### `cars`

```sql
create table cars (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references users(id) on delete cascade,

  -- Identity
  year                  integer,
  make                  text,               -- Free text (may match vehicle_makes.make_name)
  model                 text,               -- Free text (may match vehicle_models.model_name)
  trim                  text,
  nickname              text not null,

  -- Reference FKs (optional — set when user selects from autocomplete)
  make_id               integer references vehicle_makes(id) on delete set null,
  model_id              integer references vehicle_models(id) on delete set null,
  variant_id            integer references vehicle_variants(id) on delete set null,
  chassis_code          text,               -- Auto-filled from variant or manual entry

  -- Market context
  is_import             boolean default false,  -- JDM/EU import flag
  color                 text,

  -- Documentation
  vin                   text,
  paint_code            text,
  license_plate         text,

  -- Powertrain
  engine_type           text,
  transmission          text check (transmission in ('manual','automatic','sequential','cvt','other')),
  drivetrain            text check (drivetrain in ('rwd','fwd','awd','4wd')),
  forced_induction      text check (forced_induction in ('none','turbo','supercharged','twin-turbo','e-boost','other')) default 'none',

  -- Performance — ALL STORED IN BASE UNITS
  horsepower            integer,            -- stored in hp
  torque                integer,            -- stored in lb-ft
  current_mileage       integer,            -- stored in miles

  -- Consumables
  tire_size             text,
  oil_type              text,
  battery_model         text,

  -- Purchase / Origin
  purchase_date         date,
  purchase_price        decimal(10,2),
  purchase_currency     char(3) default 'USD',  -- ISO 4217 — JPY for JDM imports
  mileage_at_purchase   integer,            -- stored in miles
  purchase_dealer       text,
  purchase_story        text,               -- Auto-populates Origin Entry journal

  -- Notes
  notes                 text,

  -- Photos
  garage_photo_url      text,               -- Background-removed via Remove.bg
  showcase_photo_url    text,
  photo_y_offset        integer default 50 check (photo_y_offset between 0 and 100),

  -- Visibility
  is_public             boolean default true,
  show_investment_publicly boolean default false,  -- Build total on public profile

  -- Timestamps
  created_at            timestamptz default now(),
  updated_at            timestamptz default now(),
  deleted_at            timestamptz         -- 7-day soft delete recovery window
);
```

### `sessions`

```sql
create table sessions (
  id                  uuid primary key default gen_random_uuid(),
  car_id              uuid references cars(id) on delete cascade,
  type                text check (type in ('modification','maintenance','detail')),
  date_performed      date default current_date,
  performed_by        text check (performed_by in ('self','shop')),
  shop_name           text,
  total_cost          decimal(10,2),
  cost_currency       char(3) default 'USD',
  mileage             integer,             -- stored in miles
  time_taken          text,               -- "3 hours", "full day"
  notes               text,               -- session-level notes
  add_to_timeline     boolean default false,
  timeline_photo_url  text,               -- hero photo for Timeline card
  journal_entry       text,               -- personal note (Cormorant Garamond)
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);
```

**Timeline sync trigger:** When `add_to_timeline` changes to true, automatically creates a `timeline_entries` row. When changed to false, removes the entry.

### `jobs`

```sql
create table jobs (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid references sessions(id) on delete cascade,
  -- NULL for Blueprint (planned) and Parts Bin (purchased) — no session yet

  car_id          uuid references cars(id) on delete cascade,
  -- Direct car anchor — required when session_id is null
  -- Auto-populated from session chain via trigger when session_id is set

  type            text check (type in ('modification','maintenance','detail')),
  category        text,
  title           text not null,

  -- Lifecycle
  status          text check (status in ('planned','purchased','installed','removed','sold','scrapped'))
                    default 'installed',
  date_installed  date,
  date_removed    date,
  still_owned     boolean default false,
  -- When status → removed: true = user kept the part
  -- Trigger auto-creates new 'purchased' job (Parts Bin entry)

  -- Part identification (price aggregator keys)
  brand           text,
  part_number     text,

  -- Cost
  cost            decimal(10,2),
  cost_currency   char(3) default 'USD',
  cost_notes      text,
  -- Non-null = excluded from price aggregation
  -- Use for: "free from friend", "sponsored", "warranty replacement"

  products_used   text,                   -- detail-specific
  notes           text,                   -- job-level technical notes (future: searchable)
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),

  constraint jobs_must_have_car_anchor check (
    session_id is not null or car_id is not null
  )
);
```

**Category values:**
```
modification:  Engine, Drivetrain, Suspension, Brakes, Wheels & Tires, Exhaust,
               Cooling, Fuel System, Electrical, Audio, Safety,
               Exterior, Paint & Wrap, Interior, Other

maintenance:   Oil Change, Tires, Brakes, Fluids, Filters, Inspection,
               Transmission, Cooling, Other

detail:        Wash, Clay, Polish, Ceramic Coating, Paint Protection Film,
               Interior, Other
```

**Triggers:**
1. `jobs_auto_car_id` — populates `car_id` from session chain on every INSERT
2. `jobs_removal_to_parts_bin` — when `status → removed AND still_owned = true`, auto-creates new `purchased` job row (the part reappears in Parts Bin)

### `timeline_entries`

```sql
create table timeline_entries (
  id            uuid primary key default gen_random_uuid(),
  car_id        uuid references cars(id) on delete cascade,
  session_id    uuid references sessions(id) on delete cascade,
  -- NULL for Origin Entry; populated for standard entries

  entry_type    text check (entry_type in ('origin','modification','maintenance','detail')),
  is_origin     boolean default false,
  photo_url     text,
  journal_entry text,
  display_date  date not null,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),

  -- Only one Origin Entry per car (enforced by exclusion constraint)
  constraint timeline_entries_one_origin_per_car
    exclude (car_id with =) where (is_origin = true)
);
```

**Origin Entry protection:** `BEFORE DELETE` trigger raises exception for `is_origin = true` rows. Cannot be bypassed by any application code.

### `job_photos`

```sql
create table job_photos (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid references jobs(id) on delete cascade,
  car_id        uuid references cars(id) on delete cascade,
  -- Denormalized for Photos gallery performance (avoids 3-hop join)
  photo_url     text not null,
  caption       text,
  display_order integer default 0,
  created_at    timestamptz default now()
);
```

### `receipts`

```sql
create table receipts (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid references sessions(id) on delete cascade,
  job_id        uuid references jobs(id) on delete set null,
  car_id        uuid references cars(id) on delete cascade,
  -- Denormalized for Build Investment total query performance
  file_url      text not null,
  file_type     text check (file_type in ('image','pdf')),
  file_name     text,
  amount        decimal(10,2),
  currency      char(3) default 'USD',
  vendor        text,
  receipt_date  date,
  created_at    timestamptz default now()
);
```

### `car_contacts`

> **Superseded (migration 035).** The Contacts screen now uses `user_contacts` —
> a per-**user** (cross-car) contact book, so insurance / dealership / roadside /
> mechanic carry across every car instead of being re-entered per car.
> `car_contacts` is left in place (unused by the app) and may be dropped in a
> later cleanup migration. Same columns, keyed on `user_id` instead of `car_id`.

```sql
create table car_contacts (
  id            uuid primary key default gen_random_uuid(),
  car_id        uuid references cars(id) on delete cascade,
  label         text not null,            -- "Mechanic", "Insurance", "Tuner"
  name          text,
  phone         text,
  email         text,
  website       text,
  notes         text,
  display_order integer default 0,
  created_at    timestamptz default now()
);
```

### `car_documents`

```sql
create table car_documents (
  id          uuid primary key default gen_random_uuid(),
  car_id      uuid references cars(id) on delete cascade,
  doc_type    text check (doc_type in (
                'registration','insurance','title','emissions',
                'inspection','warranty','purchase','other')),
  label       text,
  file_url    text,
  file_type   text check (file_type in ('image','pdf')),
  file_name   text,
  issued_date date,
  expiry_date date,                       -- Used for reminder auto-creation
  created_at  timestamptz default now()
);
```

> **Extended (migration 036).** `doc_type` now also allows `'receipt'`, and the
> table gained `amount decimal(10,2)` + `currency char(3)`. A `doc_type='receipt'`
> row is a standalone titled receipt (insurance payment, registration fee) shown
> on the Documents → Receipts tab. These live here (private vault) rather than in
> `receipts` because they are ownership costs, **not** build spend — they are
> never counted toward Build Investment. The Receipts tab also surfaces the real
> `receipts` rows (service + part purchases) read-only.

### `car_reminders`

```sql
create table car_reminders (
  id          uuid primary key default gen_random_uuid(),
  car_id      uuid references cars(id) on delete cascade,
  title       text not null,
  category    text check (category in (
                'registration','insurance','emissions','inspection',
                'warranty','lease','service','other')),
  notes       text,
  due_date    date,
  due_mileage integer,                    -- stored in miles
  is_complete boolean default false,
  completed_at timestamptz,
  document_id uuid references car_documents(id) on delete set null,
  created_at  timestamptz default now()
);
```

> **Extended (migration 034).** Added `job_id uuid references jobs(id) on delete
> set null` — an optional link to a specific part/mod. Powers part-level
> service-interval reminders ("rebuild the turbo every 30k mi"), set via the
> "⚙ Set a service reminder" action on a serviceable part/mod detail page. Pairs
> naturally with `due_mileage`.

### `user_flags` *(new)*

Per-user feature flags for staged rollouts and beta access.

```sql
create table user_flags (
  user_id     uuid references users(id) on delete cascade,
  flag        text not null,
  enabled     boolean default true,
  granted_by  uuid references users(id) on delete set null,
  expires_at  timestamptz,              -- Optional: for time-limited trials
  created_at  timestamptz default now(),
  primary key (user_id, flag)
);
```

**Planned flags:** `beta_marketplace`, `price_aggregator`, `api_access`, `pro_trial`, `carquery_variants`

### `audit_log` *(new)*

Immutable change history. Applied to: `cars`, `jobs`, `sessions`, `timeline_entries`.

```sql
create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id) on delete set null,
  table_name  text not null,
  row_id      uuid not null,
  operation   text check (operation in ('UPDATE','DELETE')),
  old_data    jsonb,
  new_data    jsonb,
  changed_at  timestamptz default now()
);
```

### `notification_preferences` *(new)*

Push notification settings per user per device. Ready for native app launch.

```sql
create table notification_preferences (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references users(id) on delete cascade,
  reminders_enabled   boolean default true,
  milestones_enabled  boolean default true,
  marketing_enabled   boolean default false,  -- Default OFF — explicit opt-in
  digest_enabled      boolean default false,
  push_token          text,
  push_platform       text check (push_platform in ('ios','android','web')),
  token_active        boolean default true,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  unique (user_id, push_token)
);
```

### `error_logs`

```sql
create table error_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id) on delete set null,
  session_id  text,                       -- Browser tab identifier (not DB session)
  error_type  text,                       -- 'auth','upload','database','render','network'
  message     text,
  stack_trace text,
  route       text,
  metadata    jsonb,
  app_version text,
  created_at  timestamptz default now()
);
```

### `analytics_events`

```sql
create table analytics_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id) on delete set null,
  event_name  text not null,
  properties  jsonb,
  platform    text,                       -- 'pwa','ios','android'
  app_version text,
  created_at  timestamptz default now()
);
```

Key events: `add_car`, `add_session`, `add_job`, `job_status_changed`, `timeline_entry_created`, `origin_entry_created`, `build_sheet_copied`, `pdf_exported`, `photo_uploaded`, `upgrade_click`, `upgrade_completed`, `snapshot_viewed`, `public_profile_viewed`, `nightly_purge_completed`.

### Public Profile Database Views *(new)*

Three views power the public `/builds/:username` profile:

**`public_build_sheet`** — Installed mods for public cars. **Cost columns intentionally excluded.**
```sql
-- Exposes: brand, title, category, status, date_installed
-- Excludes: cost, cost_currency, cost_notes
```

**`public_car_profiles`** — Clean car data for public profile header.
```sql
-- Exposes: identity, specs, purchase_story, photos
-- Excludes: vin, license_plate, purchase_price, purchase_dealer
```

**`build_investment_public`** — Total spend only when `show_investment_publicly = true`.

### Row-Level Security

All user tables have RLS enabled. Full policy set in `015_rls_policies.sql` and `023_public_profile_boundary.sql`.

**Public profile data boundary (decided):**
- PUBLIC: car identity, specs, timeline, photos, Build Sheet (brand+title+category, NO costs)
- PRIVATE ALWAYS: receipts, contacts, documents, session details, VIN, license plate, purchase price
- PRIVATE BY DEFAULT: Build Investment total (toggleable per car via `show_investment_publicly`)

**Reference tables** (`vehicle_makes`, `vehicle_models`, `vehicle_variants`, `vehicle_search_aliases`): Public read via `GRANT SELECT`. Service role writes only (import scripts).

### Soft Delete (cars)
```sql
-- Soft delete:
update cars set deleted_at = now() where id = $1 and user_id = auth.uid();

-- Restore (within 7 days):
update cars set deleted_at = null where id = $1 and user_id = auth.uid()
  and deleted_at > now() - interval '7 days';

-- Hard delete (nightly Edge Function handles this + Storage cleanup):
delete from cars where deleted_at is not null
  and deleted_at < now() - interval '7 days';
```

---

## PART 18 — NAVIGATION RULES

1. Home map is the hub. All destinations reached from here.
2. No persistent tab bar anywhere.
3. Every sub-screen: back chevron `<` top-left. **Exception: Timeline uses amber-gold `‹` floating, no header.**
4. Avatar → **Profile** (`/profile`). Settings inside Profile.
5. Car name in every header: **informational only, never tappable.**
6. Back navigation is linear.
7. `/builds/:username` is the **only non-authenticated route.**

---

## PART 19 — ONBOARDING FLOW

No tutorial slideshow. Contextual coachmarks via `localStorage` flags.

```js
localStorage.setItem('gd.onboarding.homeVisited',     'true');
localStorage.setItem('gd.onboarding.firstCarCreated', 'true');
localStorage.setItem('gd.onboarding.myCarsVisited',   'true');
localStorage.setItem('gd.onboarding.originEntryDone', 'true');
```

**Flow:**
1. Landing → Signup → `/home`
2. HOME pulses. Speech bubble: *"Welcome to G-Dimension. Let's start by adding your car."*
3. Empty My Cars → Add Car: Basics → Story (skippable). No photo step.
4. Return to My Cars coachmark.
5. Empty Garage: lit floor + `+` icon + *"When you're ready, tap here to place your car in the garage."*
6. First Timeline open → Origin Entry prompt (photo + pre-filled story from Add Car Step 2)

---

## PART 20 — MONETIZATION

| Feature | Free | Pro |
|---|---|---|
| Cars | 1 | Unlimited |
| Modification entries | 20 | Unlimited |
| Maintenance / Detail / Blueprint / Parts Bin | Unlimited | Unlimited |
| Photo uploads | Limited | Unlimited |
| Receipt uploads | Limited | Unlimited |
| Build Sheet copy | ✓ | ✓ |
| Public profile | ✓ | ✓ |
| Build PDF export | ✗ | ✓ |
| Snapshot PDF share | ✗ | ✓ |

**Pro:** $7/month or $60/year
**PDF à la carte:** $15 one-time → funnel to Pro

**Payments:** No payments in PWA phase. RevenueCat at App Store launch. Stripe for web post-launch.

---

## PART 21 — TECH STACK

```
Frontend:           React 18 + Vite
Styling:            Tailwind CSS + inline styles
Routing:            React Router v6
State:              React state + Supabase realtime
Backend:            Supabase
Hosting:            Vercel
Payments:           RevenueCat (app store) + Stripe (web, post-launch)
Background removal: Remove.bg API
```

**No component libraries.** No shadcn, Radix, MUI, Chakra. Everything from scratch.

### Folder Structure
```
/src
  /components
  /pages
  /hooks          useAuth, useCars, useActiveCar, useSessions, useJobs, useTimeline
  /lib            supabase.js, removebg.js
  /assets
    /logo
    /icons/home · /icons/tuning-dashboard · /icons/tuning · /icons/maintenance
    /backgrounds
  /tokens
  /utils          unitConversion.ts (mi↔km, hp↔ps↔kw, lbft↔nm)

/supabase
  /migrations     001_users.sql → 023_public_profile_boundary.sql
  /edge-functions
    /nightly-purge index.ts
  /storage        buckets.sql
  AUTH_SETUP.md
  SUMMARY.md

/scripts
  import_nhtsa.js
  import_carquery.js
```

---

## PART 22 — INFRASTRUCTURE

| Service | Purpose | Provider | Login |
|---|---|---|---|
| Domain | gdimension.app | Namecheap | dscan007@gmail.com |
| Hosting | Vercel + GitHub | Vercel | dscan007@gmail.com |
| Repository | g-dimension-app | GitHub | prokaiwa.english@gmail.com |
| Email forwarding | hi@gdimension.app | ImprovMX | dscan007@gmail.com |
| Email / waitlist | Loops.so | Loops | dscan007@gmail.com |
| Analytics | Vercel Analytics | Vercel | Enabled |
| Database | Supabase | Supabase | hi@gdimension.app |

**Loops Form ID:** `cmocyy0aj083u0izcdzfjo266`
**Supabase settings:** Data API ON · Auto-expose OFF · Auto RLS ON

### Storage Buckets (5 total)

| Bucket | Public | File Types | Max Size | Stores |
|---|---|---|---|---|
| `car-photos` | YES | images | 10MB | garage_photo_url, showcase_photo_url |
| `job-photos` | YES | images | 20MB | job_photos.photo_url |
| `receipts` | **NO** | images + PDF | 20MB | receipts.file_url (signed URL only) |
| `timeline-photos` | YES | images | 15MB | sessions.timeline_photo_url, origin entry |
| `car-documents` | **NO** | images + PDF | 20MB | car_documents.file_url (signed URL only) |

**CRITICAL:** `receipts` and `car-documents` are PRIVATE buckets. They contain financial records, VINs, insurance policy numbers, and registration data. These must NEVER be public. Access via Supabase `createSignedUrl()` only — signed URLs expire after a short window.

### Edge Function: nightly-purge

**Location:** `supabase/edge-functions/nightly-purge/index.ts`
**Schedule:** `0 3 * * *` (3 AM UTC daily)
**Deploy:** `supabase functions deploy nightly-purge --schedule "0 3 * * *"`
**Dashboard deploy:** Edge Functions → New Function → paste code → Deploy → Schedules → Add

**What it does:**
1. Finds cars with `deleted_at < now() - 7 days` (past 7-day recovery window)
2. Deletes all Storage files across all 5 buckets for those cars
3. Hard-deletes car rows (ON DELETE CASCADE handles all child tables)
4. Logs result to `analytics_events`

**Why NOT pg_cron:** pg_cron can only run SQL — it cannot call the Storage API. Orphaned files would accumulate forever. The Edge Function handles both DB and Storage in one run.

---

## PART 23 — MARKETING PAGE

**Status: COMPLETE. Do not rebuild.**

`index.html` at gdimension.app. GT4 world map hero · G logo · Loops waitlist · Vercel Analytics · Full SEO · `og.jpg` added.

---

## PART 24 — VEHICLE DATABASE

### Primary Sources

| Source | Coverage | Cost | When to Run |
|---|---|---|---|
| NHTSA API | US market makes + models | Free | At initial setup (Step 4) |
| Manual JDM seed | 50+ core JDM models + variants | Free | Auto-runs in migrations |
| CarQuery API | Global, 1950–present, trims/variants | ~$9/month commercial | Before or at launch |
| Community contribution | User-submitted unlisted vehicles | Free | Future feature |

### NHTSA Import

```
https://vpic.nhtsa.dot.gov/api/vehicles/getallmakes?format=json
https://vpic.nhtsa.dot.gov/api/vehicles/getmodelsformake/{make}?format=json
```

Script: `scripts/import_nhtsa.js` — idempotent, rate-limited, includes JDM seed data.

### CarQuery Import

Script: `scripts/import_carquery.js` — global coverage, trim/variant data, engine specs.

**CarQuery provides:** variant names, chassis-level data, engine codes, displacement, factory HP/torque, body style, drive type, year ranges per trim.

**Conflict resolution (IMPORTANT):** Both scripts normalize all make/model names to Title Case before inserting. `"NISSAN"` and `"Nissan"` both become `"Nissan"`. Running either script in any order produces identical results — no duplicates.

### Import Sequence

```
1. Run migrations 001–023 (tables must exist first)
2. node scripts/import_nhtsa.js      (free, US + JDM seed — run immediately)
3. node scripts/import_carquery.js   (global enrichment — run when ready)
4. Verify with SQL queries (see script output)
```

### Fallback

Free-text entry for any make/model not found in autocomplete. The `source = 'user_added'` path in the schema supports community contributions (future feature — users submit, admin approves).

### Vehicle Identity Hierarchy

```
Make          → vehicle_makes    (e.g., Nissan)
  Model       → vehicle_models   (e.g., Silvia)
    Variant   → vehicle_variants (e.g., S14 Kouki — engine: SR20DET, 220 HP, RWD)
      cars.chassis_code          (e.g., S14 — free text fallback)
```

### Search Alias System

`vehicle_search_aliases` table with 100+ curated entries. Users typing "Evo", "S14", "240SX", "AE86", "Hachi Roku", "EK9", "FD", "R34", etc. get correct suggestions immediately.

---

## PART 25 — ASSET INVENTORY

### Logo — `src/assets/logo/`
`gdimensionGwhitebg.png` · `gdimensionlight.png` · `gdimensiondark.png` · `g-dimension_words_light.png` · `g-dimension_words_dark.png`

### Home Map Icons — `src/assets/icons/home/`
`home_garage.png` · `home_tuning.png` · `home_timeline.png` · `home_maintenance.png` · `home_photos.png` · `home_settings.png`

### Tuning Dashboard Tiles — `src/assets/icons/tuning-dashboard/`
`tuning_add.png` · `tuning_buildsheet.png` · `tuning_blueprint.png` · `tuning_partsbin.png`

### Tuning Category Icons — `src/assets/icons/tuning/`
Existing: `tuning_engine.png` · `tuning_suspension.png` · `tuning_brakes.png` · `tuning_drivetrain.png` · `tuning_lighting.png` · `tuning_interior.png` · `tuning_exterior.png` · `tuning_wheels.png` · `tuning_intake.png`
Missing: `tuning_exhaust.png` · `tuning_cooling.png` · `tuning_fuelsystem.png` · `tuning_audio.png` · `tuning_safety.png` · `tuning_paintwrap.png` · `maintenance_detail.png`

### Backgrounds — `src/assets/backgrounds/`
`garage_hero.jpg` · `maintenance_hero.jpg` · `tuning_hero.jpg` *(still needed)*

### Still Needed
PWA icons · Favicon · `tuning_hero.jpg` · Manufacturer logos · 7 missing tuning icons

---

## PART 26 — BUILD ORDER

```
 1. Project init — Vite + React 18 + Router v6 + Tailwind + folder structure + Google Fonts
 2. Design tokens — /src/tokens/ from Parts 3–8
 3. Base components — Header (both), ConcretePanelInput, DestinationNode, SkeuomorphicIconWrapper
 4. Supabase setup — run migrations 001–023, configure auth, create storage buckets,
                     deploy nightly-purge Edge Function, run import_nhtsa.js,
                     run import_carquery.js, verify with checklist in Part 30
 5. Auth screens — Landing, Login, Signup
 6. Home map — port prototype, 5 nodes, header, cast shadow, amber halo
 7. Garage hero — port prototype, background, car compositing, empty state
 8. Garage dashboard — 3×2 grid, 22.5° cast shadow
 9. My Cars carousel — swipeable, stats with unit conversion, Choose/Edit/Add
10. Add Car form — Basics (with variant autocomplete) → Story, make/model/variant search
11. Onboarding coachmarks
12. Tuning destination — dashboard, Build Sheet, Blueprint, Parts Bin, Add Mod
13. Maintenance destination — overview, session+job structure, detailing sub-section
14. Timeline destination — Origin Entry prompt, scroll, year markers, fade-in, entry cards
15. Photos masonry
16. Garage sub-screens — Snapshot, Docs, Contacts, Reminders, Build PDF
17. Profile + Settings (including unit preferences, feature flags read)
18. Public Profile (/builds/:username — uses public_build_sheet and public_car_profiles views)
19. Error logging — error boundary, try/catch wrappers, upload/auth tracking
20. Unit conversion layer — /src/utils/unitConversion.ts applied everywhere
21. Background removal pipeline — Remove.bg on garage + showcase photos
22. PDF generator — Build Report + Snapshot PDF (Pro)
23. PWA manifest + service worker
24. Payment integration — NOT during PWA phase. RevenueCat at App Store launch.
```

---

## PART 27 — DECISIONS LOG

**Timeline is the only light destination** — The contrast is the point. Arriving at Timeline feels like opening a logbook.

**Timeline has no header** — No burgundy, no wedge, no car name. The only navigation is the floating amber-gold `‹`. Cinematic by design.

**Photos gets out of its own way** — No landing screen, no ceremony. Content IS the design.

**Photos has no header — same floating amber `‹` as Timeline** — Two destinations break the header convention. The pattern is consistent and intentional.

**Asymmetric masonry grid** — Curated feel, not exported.

**No metadata on grid thumbnails** — Context lives in full-screen only. Grid is purely visual.

**Origin Entry photo gets "THE BEGINNING" label** — Only labeled photo. One amber distinction.

**Filter row uses text labels not pills** — Not pill buttons — too app-like.

**Maintenance aesthetic is GT Auto** — The car is always the star.

**Maintenance has no burgundy wedge header** — The GT Auto-inspired landing IS the hero.

**Service invoice assembles in real time** — The form is the input. The invoice is the output.

**Detail and Service are diagonally offset** — Diagonal placement mirrors the background graphic.

**Service history strip only appears after first session** — No empty state clutter.

**Detail sessions default to Timeline ON, Service defaults to Timeline OFF** — Defaults reflect emotional weight.

**Background removal reuses already-processed asset** — No second Remove.bg API call for Maintenance.

**Scroll order: Origin Entry at top, newest at bottom** — Standard scroll, beginning first.

**Year markers as chapter dividers** — Chapter marker in a book.

**Fade-in on scroll — once, not continuously** — The story unfolds as you arrive.

**"Add to Timeline" toggle — curated highlight reel** — Not every oil change belongs in the story.

**Three card types — left border stripe only** — Enough to read at a glance, not enough to shout.

**Origin Entry is its own record type** — The day you brought the car home is the beginning, not a logged event.

**Origin Entry cannot be deleted** — Protected at DB level by `BEFORE DELETE` trigger. Long-press to edit only.

**Cormorant Garamond in Timeline for journal entries only** — The human voice deserves the romantic serif.

**Sessions + jobs data model** — Real-world visits have multiple jobs. One session, many jobs.

**Job-level notes are searchable (future feature)** — Each job has notes. Future search surfaces specific installs.

**Purchase story auto-populates Origin Entry journal** — Users wrote it once. Flows automatically.

**Journal entry at session level** — One personal note per visit. Job notes are technical; session journal is narrative.

**Removed part + still_owned → auto-Parts Bin** — Database trigger creates new purchased job automatically.

**Cost notes exclude from price aggregation** — "Free from friend", "sponsored" = real cost to them is $0; not market data.

**Public profile shows Build Sheet, not costs** — Enthusiast culture embraces showing parts; cost is personal.

**Build Investment private by default** — Toggleable per car. Some want the flex; some have reasons.

**All units stored in base, converted at display** — No data migration ever needed.

**$15 PDF à la carte** — Funnel to Pro.

**No payments in PWA phase** — Testing environment only.

**22.5° cast shadow on Garage dashboard only** — Each screen is its own world.

**7-day soft delete on cars** — Safety net without UI clutter. Edge Function handles both DB and Storage cleanup.

**"Choose" not "Get In"** — Neutral, accurate.

**Edge Function over pg_cron for nightly purge** — pg_cron cannot access Storage API. Orphaned files cost money. Edge Function handles both.

**car-documents is a separate private bucket** — Legal documents (registration, VIN, insurance) must never be in a public bucket.

**users.id references auth.users.id directly** — Not a surrogate key. Auth sync trigger handles row creation automatically.

**job_photos.car_id and receipts.car_id denormalized** — Hot path performance. 3-hop join → 1-hop.

**vehicle_variants layer added** — Make/model is not specific enough for enthusiasts. S14 Kouki and S14 Zenki are meaningfully different cars.

**vehicle_search_aliases** — Evo and Evolution are the same thing. The database knows this.

---

## PART 28 — OPEN ITEMS

| Topic | What Needs Resolving |
|---|---|
| Snapshot share flow | Screenshot only? PDF (Pro)? Shareable link? |
| Public Profile content | ✅ Decided — see Part 17 RLS section |
| Manufacturer logo sourcing | `carlogos.org` CDN vs. bundled SVG subset |
| Tuning dashboard tile layout | Exact positions of 4 tiles — needs prototype |
| Blueprint entry fields | Budget? Target date? Notes only? |
| Parts Bin re-install flow | Fields pre-filled from existing job record (brand, part_number, title, cost) |
| Maintenance wallpaper asset | Founder to create `maintenance_hero.jpg` |
| `maintenance_service.png` icon | Nano Banana — amber check engine light |
| `maintenance_detail.png` icon | Nano Banana — sponge and bucket |
| `home_photos.png` icon | Nano Banana — Polaroid stack or camera |
| Future: job notes search | UI deferred — data model ready |
| Multi-currency display | Designed (currency fields on jobs, sessions, cars) — display logic deferred |

---

## PART 29 — FUTURE FEATURES ROADMAP

Features below are NOT built yet. Data models are designed into the schema now so no breaking changes are needed when these launch.

### Phase 2 — Shortly After Native App Launch

**Community Vehicle Contribution**
Users submit unlisted makes/models/variants. Schema already supports this via `source = 'user_added'` and `is_active = false`. Admin approves via Supabase dashboard.

**Push Notifications**
`notification_preferences` table is ready. Requires APNs (iOS) + FCM (Android). Not available in PWA phase (iOS Safari limitation). Integrate RevenueCat + APNs/FCM at native launch.

**Staged Feature Rollouts**
`user_flags` table ready. Insert a flag row for beta testers. No code deploys needed. Roll out to all when confident.

### Phase 3 — Price Aggregator

**Trigger:** 500+ active users with logged build costs.

**What exists already in the data:** `jobs.brand`, `jobs.part_number`, `jobs.cost`, `jobs.cost_notes` (excludes free parts), `jobs.status` (only `installed` counts), `cars.make_id`, `cars.model_id`.

**What to build:**
```sql
-- Add when ready — no schema changes needed:
CREATE MATERIALIZED VIEW api_parts_popularity AS
  SELECT j.brand, j.part_number, j.category,
         vm.make_name, vmo.model_name,
         COUNT(*) as install_count,
         AVG(j.cost) as avg_cost,
         MIN(j.cost) as min_cost,
         MAX(j.cost) as max_cost
  FROM jobs j
  JOIN sessions s ON s.id = j.session_id
  JOIN cars c ON c.id = j.car_id
  LEFT JOIN vehicle_makes vm ON vm.id = c.make_id
  LEFT JOIN vehicle_models vmo ON vmo.id = c.model_id
  WHERE j.status = 'installed'
    AND j.cost > 0
    AND j.cost_notes IS NULL
    AND c.is_public = true
  GROUP BY j.brand, j.part_number, j.category, vm.make_name, vmo.model_name
  HAVING COUNT(*) >= 5;

-- Refresh monthly
REFRESH MATERIALIZED VIEW CONCURRENTLY api_parts_popularity;
```

**Outlier filter:** Exclude `cost > AVG(cost) * 3`. Minimum 5 data points before showing an average.

### Phase 4 — Marketplace

**Trigger:** Post price aggregator. Credible data foundation required.

**New tables needed:**
```sql
create table listings (
  id              uuid primary key,
  car_id          uuid references cars(id),  -- The build history IS the listing
  user_id         uuid references users(id),
  asking_price    decimal(10,2),
  asking_currency char(3) default 'USD',
  description     text,
  location_city   text,
  location_country text,
  is_active       boolean default true,
  views           integer default 0,
  created_at      timestamptz,
  sold_at         timestamptz,
  sold_price      decimal(10,2)
);

create table listing_inquiries (
  id          uuid primary key,
  listing_id  uuid references listings(id),
  user_id     uuid references users(id),
  message     text,
  created_at  timestamptz
);
```

**Automatic provenance:** Build history, service records, receipts, and photos already exist on the car. The listing page displays them — no extra data entry. This is the competitive moat against Craigslist and Facebook Marketplace.

### Phase 5 — API Product

**Trigger:** Post marketplace, 1M+ build records.

**New tables needed:**
```sql
create table api_keys (
  id          uuid primary key,
  user_id     uuid references users(id),
  key_hash    text unique,             -- Never store raw key
  key_prefix  text,                   -- First 8 chars for display
  plan        text,                   -- starter/pro/enterprise
  rate_limit  integer default 1000,   -- requests per day
  is_active   boolean default true,
  last_used   timestamptz,
  created_at  timestamptz,
  expires_at  timestamptz
);

create table api_requests (
  id          bigserial primary key,
  key_id      uuid references api_keys(id),
  endpoint    text,
  status_code integer,
  response_ms integer,
  created_at  timestamptz
);
```

**Data product:** Aggregate queries against `api_parts_popularity`. Valuable because it's real transaction data from verified builds — not scraped listings.

### Phase 6 — Read Replicas (Infrastructure Only)

**Trigger:** 500+ sustained concurrent active users.
**Action:** Supabase dashboard → Database → Replication → Add Replica.
**Code changes required:** Zero.
**Cost:** ~$25/month per replica on Supabase Pro.

---

## PART 30 — PRE-RELEASE CHECKLIST

Everything here must be complete before a real user touches the app.

### Database Migrations
- [ ] Run migrations 001–023: `supabase db push` (or paste each in SQL Editor)
- [ ] Verify no errors on any migration file
- [ ] Confirm all user tables have RLS enabled:
  ```sql
  SELECT tablename, rowsecurity FROM pg_tables
  WHERE schemaname = 'public' AND rowsecurity = false
    AND tablename NOT IN ('vehicle_makes','vehicle_models',
                          'vehicle_variants','vehicle_search_aliases');
  -- Expect: 0 rows
  ```

### Vehicle Data Import
- [ ] `node scripts/import_nhtsa.js`
- [ ] Verify: `SELECT COUNT(*) FROM vehicle_makes;` → 500+
- [ ] Verify: `SELECT COUNT(*) FROM vehicle_models;` → 5,000+
- [ ] Verify: `SELECT COUNT(*) FROM vehicle_variants;` → 50+
- [ ] Verify: `SELECT COUNT(*) FROM vehicle_search_aliases;` → 100+
- [ ] Test: search "evo" → returns Lancer Evolution rows
- [ ] Test: search "s14" → returns Silvia S14 rows
- [ ] `node scripts/import_carquery.js` (when CarQuery API key available)
- [ ] Verify no duplicate makes: `SELECT make_name, COUNT(*) FROM vehicle_makes GROUP BY make_name HAVING COUNT(*) > 1;` → 0 rows

### Authentication
- [ ] Email/Password provider enabled, confirm email ON
- [ ] Google OAuth configured (see AUTH_SETUP.md)
- [ ] Apple OAuth configured (see AUTH_SETUP.md — required for App Store)
- [ ] Link Identities enabled: Dashboard → Auth → Settings → ON
- [ ] Site URL set: `https://gdimension.app`
- [ ] Redirect URLs added (see AUTH_SETUP.md)
- [ ] Test: Create test user → verify `public.users` row created automatically

### Storage Buckets
- [ ] Run `supabase/storage/buckets.sql` or create manually
- [ ] Verify 5 buckets: car-photos, job-photos, receipts, timeline-photos, car-documents
- [ ] Verify car-photos is PUBLIC
- [ ] Verify receipts is PRIVATE
- [ ] Verify car-documents is PRIVATE
- [ ] Test: Upload to car-photos as auth user → success
- [ ] Test: Read from receipts as anon → fail

### Edge Function
- [ ] Deploy: `supabase functions deploy nightly-purge --schedule "0 3 * * *"`
- [ ] Or: Dashboard → Edge Functions → New Function → paste code → Add Schedule
- [ ] Test invoke: `supabase functions invoke nightly-purge`
- [ ] Verify logged: `SELECT * FROM analytics_events WHERE event_name = 'nightly_purge_completed';`

### Final Verification
- [ ] Origin entry protection: `DELETE FROM timeline_entries WHERE is_origin = true LIMIT 1;` → ERROR
- [ ] Public profile view: `SELECT cost FROM public_build_sheet LIMIT 1;` → column does not exist
- [ ] Auth trigger working: create user → check `SELECT * FROM users ORDER BY created_at DESC LIMIT 1;`

---

## PART 31 — DOCUMENT INVENTORY

All files produced during the Supabase setup session (Step 4):

**Migration Files** (`supabase/migrations/`):
- `001_users.sql` — users table + auth sync trigger
- `002_vehicle_makes.sql` — makes reference table
- `003_vehicle_models.sql` — models reference table
- `004_cars.sql` — cars table
- `005_sessions.sql` — sessions table
- `006_jobs.sql` — jobs with Parts Bin lifecycle trigger
- `007_timeline_entries.sql` — timeline with origin entry protection
- `008_job_photos.sql` — job photos with car_id denormalization
- `009_receipts.sql` — receipts with car_id denormalization
- `010_014_support_tables.sql` — contacts, documents, reminders, error_logs, analytics
- `015_rls_policies.sql` — all Row Level Security policies
- `016_indexes.sql` — performance indexes
- `017_vehicle_variants.sql` — chassis codes + seed data
- `018_vehicle_search_aliases.sql` — enthusiast shorthand aliases
- `019_022_infrastructure_tables.sql` — user_flags, audit_log, notification_preferences
- `023_public_profile_boundary.sql` — public profile views + build investment toggle

**Edge Functions** (`supabase/edge-functions/`):
- `nightly-purge/index.ts` — nightly DB + Storage cleanup

**Storage** (`supabase/storage/`):
- `buckets.sql` — 5 bucket definitions with RLS policies

**Documentation** (`supabase/`):
- `AUTH_SETUP.md` — complete auth configuration guide
- `SUMMARY.md` — all decisions, scores, pre-release checklist

**Scripts** (`scripts/`):
- `import_nhtsa.js` — NHTSA bulk import + JDM seed
- `import_carquery.js` — CarQuery global import

---

*End of G-Dimension Master Architecture v3.0*
