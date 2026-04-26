# G-Dimension — Master Architecture
**Version:** 2.1  
**Status:** In Progress — App at zero code. Marketing page live. Prototypes validated.  
**Last Updated:** April 2026  
**Domain:** gdimension.app  
**Instagram:** @gdimensionapp  
**Repository:** GitHub — `g-dimension-app`  
**Support email:** hi@gdimension.app

---

## HOW TO USE THIS FILE

This is the single source of truth for G-Dimension. It supersedes DESIGN_TOKENS.md v1.0 and all prior session notes on every point of conflict. If you are a Claude session, a Claude Code agent, or a human developer:

1. Read this file in full before writing a single line of code or copy.
2. When this file and any other document conflict, this file wins.
3. When this file doesn't cover an edge case, use the **Decisions Log** (Part 23) to reason about what the intent would have been.
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

**The G mark:** A double-stroke swooping G inside a rounded square badge. The badge shape references 90s Japanese car badges — specifically the Nissan Silvia Q's/K's badging and the Skyline GT badge. The form also references G as in the gravitational constant. White G on `#780E12` burgundy background.

**The wordmark:** "G-Dimension" in Hanken Grotesk, 600 weight, italic, approximately -0.10em letter-spacing. Mixed case. The hyphen is part of the name — never write "G Dimension" or "GDimension."

**Instagram brand palette:** Burgundy, black, and white — consistent with how `gdimensionGwhitebg.png` is used in branding context.

**Critical rule:** Never recreate the G mark in CSS or SVG from scratch in a session. Always use the PNG files.

---

## PART 3 — COLOR TOKENS

```css
/* === BRAND === */
--brand:             #780E12;    /* maroon burgundy — badge, primary brand color */
--brand-light:       #8e1016;    /* lighter variant */
--brand-dark:        #4a0a0c;    /* darker variant */

/* === ACCENT === */
/* The ONLY warm color in the UI. Used sparingly for: stat values, active states,
   focal highlights, warm lighting, CTA actions, notification dots. */
--accent:            #c8661a;    /* burnt orange — primary accent */
--accent-dim:        #8a4810;    /* darker variant for hovers/pressed states */
--accent-text:       #fff5dc;    /* cream text on amber backgrounds */

/* === HEADER === */
--header-black:      #111111;    /* dark portion of the header bar */
--header-warm:       #f0e4c8;    /* warm cream — username, back buttons, secondary header text */
--header-title:      #ffffff;    /* white — main header title text */

/* === BURGUNDY (header wedge shapes) === */
--burgundy-l:        #6e281e;
--burgundy-m:        #4a1410;
--burgundy-r:        #2a0a06;

/* === DARK UI === */
--cavity-bg:         #050507;    /* garage interior darkness */
--app-bg-radial:     radial-gradient(ellipse at center, #202224 0%, #050505 100%);

/* === PANEL (concrete inputs and stat panels) === */
--panel-light:       #e6e6e8;
--panel-mid:         #d8d8da;
--panel-dark:        #c4c4c6;
--panel-line:        #6a6a6c;
--panel-gradient:    linear-gradient(180deg, #e6e6e8 0%, #d8d8da 45%, #c4c4c6 100%);
--panel-text:        #2a2a2c;    /* dark text on light panels */

/* === COOL WORLD (Home map surface — GT4 blue filter) === */
--world-horizon:     #d4dce2;
--world-mid:         #a8b2ba;
--world-low:         #6a737a;
--world-floor:       #3a4248;

/* === TEXT === */
--text-primary:      #f5f5f5;    /* never pure white — cap at #f5f5f5 */
--text-secondary:    #8a8a8c;
--text-muted:        #3f3f46;
--text-black:        #000000;    /* dark text on concrete panels */
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
- Body text, form fields
- Back buttons and chevrons
- Numbers: `font-variant-numeric: tabular-nums`

**Wordmark specific:** 600 weight, italic, -0.10em letter-spacing.
**UI labels:** uppercase, letter-spacing 0.08–0.2em.
**Car names in headers:** Hanken 700, mixed case, not italicized.

### Cormorant Garamond — the display font
Italic, 500 or 600 weight only. Used sparingly for emotional/chapter moments only:
- Main title watermark on Home screen
- Screen headings on hero screens ("Hiroshi's Garage")
- Large hero taglines
- "Tell your story" step heading in Add Car flow

**Rule:** If it doesn't feel like a chapter-title moment, switch to Hanken.

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

**Phone canvas:** 390 × 844px (iPhone 14/15 Pro). All screens sized to this.
**Tap targets:** minimum 44 × 44px. Skeuomorphic icons sit in wrappers of 56–120px.

---

## PART 6 — SHADOWS

```css
/* Standard drop shadow on skeuomorphic icons */
filter: drop-shadow(0 5px 8px rgba(0, 0, 0, 0.55));

/* Heavier drop shadow for focal/featured elements */
filter: drop-shadow(0 6px 10px rgba(0, 0, 0, 0.55));

/* Amber glow — focal HOME destination on Home map */
background: radial-gradient(circle at center, rgba(200, 102, 26, 0.12) 0%, transparent 65%);

/* Phone container shadow (prototypes / marketing mockup) */
box-shadow: 0 50px 100px -10px rgba(0, 0, 0, 0.85), 0 0 0 1px #2a2a2c;

/* Ground shadow under icon (soft ellipse) */
background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.55) 0%, transparent 70%);
filter: blur(2px);
```

### Skeuomorphic Icon Cast Shadow

**IMPORTANT: The 22.5° cast shadow treatment applies to the Garage dashboard grid ONLY — not the Home map.** Each screen is its own visual world.

```css
/* Garage dashboard grid icons only */
.icon-shadow {
  position: absolute;
  width: 56px;
  height: 44px;
  background: #000000;
  top: 56%;
  left: 52%;
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

The 22.5° rotation + skewX + blur + 0.42 opacity is what makes it read as a real cast shadow. Do not change these values.

---

## PART 7 — ANIMATION TOKENS

```css
/* Standard ease */
transition: 200ms ease-out;

/* Entry / settle — bouncy deceleration */
cubic-bezier(0.22, 1, 0.36, 1)

/* Press feedback — every interactive element */
:active { transform: scale(0.95); }
/* 0.92 for emphasis, 0.97 for subtle */

@keyframes doorSettle {
  0%   { transform: translateY(-16px); opacity: 0; }
  100% { transform: translateY(0); opacity: 1; }
}
@keyframes carAppear {
  0%   { opacity: 0; }
  100% { opacity: 1; }
}
@keyframes iconFadeIn {
  0%   { opacity: 0; transform: translateY(6px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}
@keyframes garagePulse {
  0%, 100% { opacity: 0.5; transform: translateX(-50%) scale(1); }
  50%       { opacity: 1.0; transform: translateX(-50%) scale(1.06); }
}
```

**Stagger pattern** for grid reveals:
```js
animationDelay: `${400 + index * 70}ms`
```

---

## PART 8 — BORDER & SHAPE RULES

**No border-radius on architectural elements.** Headers, stat panels, input fields, nav cards, concrete panels — all sharp corners. This is the single strongest visual separator from generic consumer apps and is non-negotiable.

Border-radius is only permitted on:
- Pill buttons: full radius (`height / 2`)
- Bottom sheet top corners: `12px`
- Avatars: `50%`
- Notification dots: `50%`
- Tiny accent badges: `1–2px`

**No pure white.** Cap text at `#f5f5f5`.

**Note on pill buttons in the app:** Pills appear far less frequently in the app than on the marketing page. The app should not feel like a traditional consumer app. Use pills only where a single decisive action is needed (Save, Choose, Add). The majority of interactive elements are icon tiles, concrete panel rows, and inline taps.

---

## PART 9 — COMPONENT PATTERNS

### Header — Two Variants

**Full header (Home screen only)**
```
Height: 44px
Burgundy wedge shapes on both ends, dark center fill (#111111)
Left wedge:  M 0 0 → L 180 0 → L 200 44 → L 0 44 → Z
Right wedge: M 390 0 → L 230 0 → L 210 44 → L 390 44 → Z

Content:
  Left:   Avatar (28px circle) → taps to open Profile (/profile)
          Username (Hanken 700, 13px, uppercase, 0.1em, header-warm color)
  Right:  Small car icon SVG (28×14, cream) + car name (Hanken 700, 13px, mixed case, header-warm)
```

**Minimal header (all sub-screens)**
```
Height: 44px
Same burgundy wedge layout

Content:
  Left:   Back chevron "<" (18px, header-warm) + screen title
  Right:  Small car icon + car name (informational only — NOT tappable)
```

**CRITICAL:** The car name in the header is **informational only — never tappable.** Car switching happens exclusively through Home → My Cars.

**CRITICAL:** Avatar taps to **Profile** (`/profile`). Settings lives within Profile — it is not the first destination when tapping your avatar.

### Header Cast Shadow (Home map only)

```css
.header-cast-shadow {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 32px;
  z-index: 50;
  pointer-events: none;
  background: linear-gradient(
    180deg,
    rgba(0, 0, 0, 0.60) 0%,
    rgba(0, 0, 0, 0.38) 35%,
    rgba(0, 0, 0, 0.18) 65%,
    rgba(0, 0, 0, 0.05) 85%,
    transparent 100%
  );
  border-top: 1px solid rgba(0, 0, 0, 0.55);
}
```

### Concrete Panel Input

```css
.panel-input {
  background: linear-gradient(180deg, #e6e6e8 0%, #d8d8da 45%, #c4c4c6 100%);
  color: #2a2a2c;
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 14px;
  padding: 12px 14px;
  height: 44px;
  border: none;
  border-bottom: 1px solid #6a6a6c;
  border-radius: 0;
  transition: border-color 200ms ease-out;
}
.panel-input:focus {
  border-bottom-color: #c8661a;
  outline: none;
}
.panel-input-label {
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #8a8a8c;
  margin-bottom: 4px;
}
```

### Home Map Destination Node

```css
.dest {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  transform: translate(-50%, -50%);
}
.dest-icon-wrap {
  width: 86px;
  height: 86px;
  position: relative;
}
.dest-icon-wrap img {
  max-width: 100%;
  max-height: 100%;
  filter: drop-shadow(0 5px 8px rgba(0, 0, 0, 0.55));
}
.dest-label {
  margin-top: 4px;
  font-weight: 800;
  font-size: 11.5px;
  color: #1a1e24;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  text-shadow:
     0 1px 0 rgba(255, 255, 255, 0.55),
    -1px -1px 0 rgba(255, 255, 255, 0.30),
     1px -1px 0 rgba(255, 255, 255, 0.30);
}
```

**Focal destination (HOME on Home map):**
- Wrapper: 120 × 120px (vs standard 86 × 86)
- Amber underline below label: 22px wide, 2px tall
- Pulsing amber radial halo behind the icon (`garagePulse` keyframe)

**No cast shadow on Home map nodes.** Each screen is its own visual world.

---

## PART 10 — SCREEN INVENTORY

### Primary Destinations (Home Map)

Five destinations in a diamond layout. The center-top destination node is labeled **"HOME"** on the map — but once you enter it, every screen inside is contextually called **"Garage."** This mirrors GT4's navigation, where you went to a place on the map and everything inside was contextually that place.

Coordinates are center-anchored via `transform: translate(-50%, -50%)`:

| Map Label | Inside Label | Purpose | Coords | Wrapper | Route |
|---|---|---|---|---|---|
| **HOME** | Garage | Car profile, docs, car switching | `left: 195px, top: 220px` | 120×120 (focal) | `/garage` |
| **TUNING** | Tuning | Category-browsing mod experience | `left: 295px, top: 405px` | 86×86 | `/tuning` |
| **TIMELINE** | Timeline | Chronological build narrative | `left: 95px, top: 405px` | 86×86 | `/timeline` |
| **MAINTENANCE** | Maintenance | Service logging, detailing, reminders | `left: 270px, top: 625px` | 86×86 | `/maintenance` |
| **PHOTOS** | Photos | Masonry gallery of all photos | `left: 120px, top: 625px` | 86×86 | `/photos` |

**Reserved space:** One map region is reserved for a future sixth destination — likely Track/Strip for lap times, drag times, autocross. Pro-tier feature. A dead-end road spur in the prototype gestures toward this. Do not fill it.

### Full Route Map

```
/                              → Landing / Marketing gate
/login                         → Login
/signup                        → Signup
/home                          → Home map (hub)

/garage                        → Garage hero
/garage/cars                   → My Cars carousel
/garage/cars/new               → Add Car (multi-step)
/garage/cars/:carId/edit       → Edit Car
/garage/snapshot               → Snapshot (quick-reference card)
/garage/documents              → Documentation (uploaded files)
/garage/contacts               → Contacts (emergency/service numbers)
/garage/reminders              → Reminders (deadlines + due dates)
/garage/pdf                    → Build PDF

/tuning                        → Tuning category browser
/tuning/:category              → Category detail
/tuning/:category/new          → Add Modification
/tuning/mods/:modId            → Mod Detail
/tuning/mods/:modId/edit       → Edit Mod

/maintenance                   → Maintenance overview
/maintenance/:serviceId        → Service Record Detail
/maintenance/detail            → Detailing log overview
/maintenance/detail/new        → Add Detail Session

/timeline                      → Timeline scroll (all entries, chronological)
/entries/:entryId              → Entry Detail (read-only — mod, service, or detail)

/photos                        → Masonry gallery

/profile                       → Own profile (accessed via avatar on Home)
/settings                      → Settings (accessed from within Profile)
/settings/archived             → Archived Cars (7-day restore window)
/builds/:username              → Public Profile (only non-auth route)
```

### Explaining Key Screens

**Maintenance overview (`/maintenance`):** List of all service records — oil changes, tire rotations, inspections, brake work, etc. Each row: date, type, shop or self, mileage. Tapping opens Service Record Detail.

**Service Record Detail (`/maintenance/:serviceId`):** Full view of one service event — what was done, when, where, mileage, cost, notes, receipt image.

**Detailing log (`/maintenance/detail`):** Sub-section of Maintenance with its own icon (sponge and bucket). Log professional detail sessions (what was done, products used, who did it, receipt) or personal sessions (what products used, what process). Same structure as service records but contextually separate — detailing is care, not repair.

**Timeline (`/timeline`):** Chronological scroll of everything that has happened to the car — modifications, services, detail sessions — newest first. Read-only. Tapping any entry opens Entry Detail.

**Entry Detail (`/entries/:entryId`):** Full record of one event, regardless of type. Read-only display screen. Editing happens from the source destination (Tuning or Maintenance).

**Snapshot (`/garage/snapshot`):** Designed to be handed to a mechanic or shared quickly. Read-only reference view. See Part 11 for fields.

**Profile (`/profile`):** The user's own profile. Contains their public profile preview, avatar, display name, bio, and access to Settings. Accessed by tapping the avatar on the Home screen.

**Public Profile (`/builds/:username`):** The only screen accessible without logging in. Anyone can visit `gdimension.app/builds/david` without an account. Read-only view of a user's public car(s) and timeline.

### Garage Dashboard Grid

3×2 grid of skeuomorphic icon tiles. Cast shadow treatment (22.5° skewed) applied here — Garage dashboard only.

```
Row 1:  My Cars  |  Snapshot  |  Build PDF
Row 2:  Docs     |  Contacts  |  Reminders
```

### My Cars Carousel

Swipeable 3/4 car showcase. One card per car.

**Stats on car card:** Year · Color · Horsepower · Torque · Current Mileage
*(Fields omitted if empty — only show what has been filled in.)*

**Actions:** "Choose" (primary amber — sets active car, returns to `/garage`) | "Edit" (secondary)
**Final card:** "Add a Car" — + icon, dashed accent border

---

## PART 11 — CAR PROFILE & SNAPSHOT FIELDS

### Add Car Flow (Multi-Step)

**Step 1 — Basics (required)**
```
Year            (number input — 4 digits)
Make            (auto-complete from vehicle database — see Part 18)
Model           (auto-complete, filtered by make)
Trim            (text input, optional at this step)
Nickname        (required — used throughout app and in headers)
Current Mileage (number)
```
→ `CONTINUE`

**Step 2 — Tell Your Story (optional)**
Heading in Cormorant Garamond italic: *"Tell your story."*
```
Purchase Date
Purchase Price
Mileage at Purchase
Where you got it    (dealer, private seller, auction)
How you found it    (text area — the story behind the car)
```
→ `CONTINUE` or `SKIP FOR NOW`

**Step 3 — Photo**
Not part of the onboarding step. Photo is added later via the Garage screen. After the car is saved, the garage screen shows the floor lit up with a `+` icon and a quiet message: *"When you're ready, tap here to place your car in the garage."* No urgency.

### All Car Profile Fields (Full Edit Car Form)

**IDENTITY**
```
Year
Make
Model
Trim
Nickname         (required)
Color            (e.g., "Midnight Blue Pearl")
```

**VEHICLE SPECS**
```
VIN              (17-character, format-validated)
Paint Code
License Plate
Engine Type      (e.g., "RB26DETT", "2JZ-GTE", "K24")
Transmission     (manual / automatic / sequential / CVT / other)
Drivetrain       (RWD / FWD / AWD / 4WD)
Forced Induction (none / turbo / supercharged / twin-turbo / e-boost / other)
Horsepower       (number, at flywheel)
Torque           (number — user selects lb-ft or Nm in Settings)
Current Mileage  (number)
```

**CONSUMABLES & SERVICE REFS**
```
Tire Size        (e.g., "235/45R17")
Oil Type         (e.g., "5W-30 Full Synthetic")
Battery Model    (e.g., "Optima Red Top 35")
```

**PURCHASE / ORIGIN**
```
Purchase Date
Purchase Price
Mileage at Purchase
Where Purchased
Purchase Story   (text area)
```

**PHOTOS**
```
Garage Photo     (front or rear — used for Garage hero compositing)
Showcase Photo   (3/4 angle — used for My Cars carousel)
Photo Y Offset   (0–100% slider — controls vertical crop on Garage hero)
```

**NOTES**
```
Free-form notes field — quirks, things to watch, how it drives, anything
```

**SYSTEM**
```
Is Public        (toggle — controls /builds/:username visibility)
```

### Snapshot Fields

Snapshot is a quick-reference view only. All data is pulled from the car profile — no editing here.

```
IDENTITY
  Year / Make / Model / Trim
  Nickname · Color · VIN · License Plate

ENGINE
  Engine Type · Forced Induction
  Horsepower · Torque

CONSUMABLES
  Oil Type · Tire Size · Battery Model

INSURANCE  (from car_documents)
  Provider name · Policy number · Expiry date

SERVICE
  Last service date and type
  Next reminder (date or mileage)

BUILD INVESTMENT  (bottom of Snapshot — below the fold)
  Total logged spend across all modifications
  Only shown if at least one entry has a cost logged
```

Snapshot is read-only. Can be shared via screenshot or as PDF export (Pro only).

---

## PART 12 — DATA MODEL (Supabase / Postgres)

### `users`
```sql
create table users (
  id                  uuid primary key default gen_random_uuid(),
  username            text unique not null,
  email               text unique not null,
  avatar_url          text,
  display_name        text,
  city                text,
  country             text,
  country_code        char(2),
  bio                 text,
  subscription_status text check (subscription_status in ('free', 'pro')) default 'free',
  created_at          timestamptz default now(),
  deleted_at          timestamptz
);
```

### `cars`
```sql
create table cars (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references users(id) on delete cascade,

  -- Identity
  year                integer,
  make                text,
  model               text,
  trim                text,
  nickname            text not null,
  color               text,

  -- Vehicle specs
  vin                 text,
  paint_code          text,
  license_plate       text,
  engine_type         text,
  transmission        text check (transmission in ('manual','automatic','sequential','cvt','other')),
  drivetrain          text check (drivetrain in ('rwd','fwd','awd','4wd')),
  forced_induction    text check (forced_induction in ('none','turbo','supercharged','twin-turbo','e-boost','other')) default 'none',
  horsepower          integer,
  torque              integer,
  torque_unit         text check (torque_unit in ('lbft','nm')) default 'lbft',
  current_mileage     integer,

  -- Consumables
  tire_size           text,
  oil_type            text,
  battery_model       text,

  -- Purchase / origin
  purchase_date       date,
  purchase_price      decimal(10,2),
  mileage_at_purchase integer,
  purchase_dealer     text,
  purchase_story      text,

  -- Free-form
  notes               text,

  -- Photos
  garage_photo_url    text,
  showcase_photo_url  text,
  photo_y_offset      integer default 50,

  -- Visibility
  is_public           boolean default true,

  -- Soft delete
  created_at          timestamptz default now(),
  deleted_at          timestamptz
);

create index cars_user_id_active on cars(user_id) where deleted_at is null;
```

### `modifications` (mods + maintenance + detailing — unified)
```sql
create table modifications (
  id                    uuid primary key default gen_random_uuid(),
  car_id                uuid references cars(id) on delete cascade,

  -- Type determines which sub-app this belongs to
  type                  text check (type in ('modification','maintenance','detail')),

  title                 text not null,
  category              text,   -- validated per type (see below)

  date_performed        date,
  cost                  decimal(10,2),
  mileage_at_service    integer,
  performed_by          text check (performed_by in ('self','shop')),
  shop_name             text,

  -- Modification-specific
  brand                 text,
  part_number           text,

  -- Detail-specific
  products_used         text,

  -- Shared
  notes                 text,
  next_service_date     date,
  next_service_mileage  integer,
  create_reminder       boolean default false,

  created_at            timestamptz default now()
);
```

**Category values by type:**
```
modification: Engine, Drivetrain, Suspension, Brakes, Wheels & Tires, Exterior,
              Interior, Exhaust, Electrical, Cooling, Fuel System, Audio, Safety, Other

maintenance:  Oil Change, Tires, Brakes, Fluids, Filters, Inspection,
              Transmission, Cooling, Other

detail:       Wash, Clay, Polish, Ceramic Coating, Paint Protection Film, Interior, Other
```

### `modification_photos`
```sql
create table modification_photos (
  id                uuid primary key default gen_random_uuid(),
  modification_id   uuid references modifications(id) on delete cascade,
  photo_url         text,
  caption           text,
  display_order     integer default 0,
  created_at        timestamptz default now()
);
```

### `receipts`
```sql
create table receipts (
  id                uuid primary key default gen_random_uuid(),
  modification_id   uuid references modifications(id) on delete cascade,
  file_url          text,
  file_type         text check (file_type in ('image','pdf')),
  amount            decimal(10,2),
  vendor            text,
  date              date,
  created_at        timestamptz default now()
);
```

### `car_contacts`
```sql
create table car_contacts (
  id            uuid primary key default gen_random_uuid(),
  car_id        uuid references cars(id) on delete cascade,
  label         text not null,
  name          text,
  phone         text,
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
                'inspection','warranty','purchase','other'
              )),
  label       text,
  file_url    text,
  file_type   text check (file_type in ('image','pdf')),
  issued_date date,
  expiry_date date,
  created_at  timestamptz default now()
);
```

### `car_reminders`
```sql
create table car_reminders (
  id          uuid primary key default gen_random_uuid(),
  car_id      uuid references cars(id) on delete cascade,
  title       text not null,
  due_date    date,
  due_mileage integer,
  category    text check (category in (
                'registration','insurance','emissions','inspection',
                'warranty','lease','service','other'
              )),
  notes       text,
  is_complete boolean default false,
  created_at  timestamptz default now()
);
```

### `vehicle_makes` and `vehicle_models` (read-only reference data)
```sql
create table vehicle_makes (
  id        serial primary key,
  make_name text unique not null,
  country   text
);

create table vehicle_models (
  id         serial primary key,
  make_id    integer references vehicle_makes(id),
  model_name text not null,
  year_start integer,
  year_end   integer   -- null if still in production
);
```

Populated via one-time NHTSA import script at project setup. See Part 18.

### `error_logs`
```sql
create table error_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id) on delete set null,
  session_id  text,
  error_type  text,    -- 'auth','upload','api','ui','payment','unknown'
  message     text,
  stack_trace text,
  route       text,
  metadata    jsonb,
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
  created_at  timestamptz default now()
);
```

Key events to track: `add_car`, `add_modification`, `add_service`, `add_detail`, `photo_uploaded`, `pdf_generated`, `upgrade_click`, `upgrade_completed`, `snapshot_viewed`, `public_profile_viewed`.

### Row-Level Security

```sql
alter table users                enable row level security;
alter table cars                 enable row level security;
alter table modifications        enable row level security;
alter table modification_photos  enable row level security;
alter table receipts             enable row level security;
alter table car_contacts         enable row level security;
alter table car_documents        enable row level security;
alter table car_reminders        enable row level security;
alter table error_logs           enable row level security;
alter table analytics_events     enable row level security;

create policy "users own their data"        on users for all using (auth.uid() = id);
create policy "users own their cars"        on cars for all using (auth.uid() = user_id);
create policy "public cars readable"        on cars for select using (is_public = true and deleted_at is null);
create policy "users own their mods"        on modifications for all using (
  car_id in (select id from cars where user_id = auth.uid()));
create policy "users own their photos"      on modification_photos for all using (
  modification_id in (select m.id from modifications m join cars c on c.id = m.car_id where c.user_id = auth.uid()));
create policy "users own their receipts"    on receipts for all using (
  modification_id in (select m.id from modifications m join cars c on c.id = m.car_id where c.user_id = auth.uid()));
create policy "users own their contacts"    on car_contacts for all using (
  car_id in (select id from cars where user_id = auth.uid()));
create policy "users own their documents"   on car_documents for all using (
  car_id in (select id from cars where user_id = auth.uid()));
create policy "users own their reminders"   on car_reminders for all using (
  car_id in (select id from cars where user_id = auth.uid()));
create policy "users own their error logs"  on error_logs for all using (auth.uid() = user_id);
create policy "users own their analytics"   on analytics_events for all using (auth.uid() = user_id);

-- vehicle reference tables are public read, no RLS needed
```

### Soft Delete (cars)

```sql
-- Archive
update cars set deleted_at = now() where id = $1 and user_id = auth.uid();

-- Restore (within 7 days)
update cars set deleted_at = null where id = $1 and user_id = auth.uid()
  and deleted_at > now() - interval '7 days';

-- Nightly purge (Supabase cron)
delete from cars where deleted_at is not null and deleted_at < now() - interval '7 days';
```

Deletion requires typing the car's nickname to confirm. Archived cars visible in Settings → Archived Cars.

### Error Tracking Strategy

- **Global React error boundary** — catches unhandled component crashes, writes to `error_logs`, optionally to Vercel logs
- **Try/catch on every Supabase call** — all reads and writes wrapped; failures logged with route and context
- **Upload failure tracking** — photo and receipt uploads log failures with file type, size, and route
- **Auth error logging** — login/signup/token refresh failures logged with error code
- **Vercel Analytics** — page views and web vitals (enabled on marketing page, carried into app)
- **Custom analytics events** — key user actions tracked in `analytics_events` for product decisions

---

## PART 13 — NAVIGATION RULES

1. The Home map (`/home`) is the hub. All five primary destinations are reached from here.
2. No persistent tab bar anywhere. Users travel between places, they don't toggle tabs.
3. Every sub-screen has a back chevron `<` top-left, returning to the immediate logical parent.
4. The avatar (top-left of Home header) opens **Profile** (`/profile`). Settings is inside Profile.
5. The car name (top-right of every header) is **informational only — never tappable.** Car switching happens through Home → My Cars.
6. Back navigation is linear. Example: Entry Detail → Timeline (not Entry Detail → Home).
7. `/builds/:username` is the **only non-authenticated route** — meaning anyone can view it without logging in. All other routes require a Supabase session; missing session redirects to `/login`.

---

## PART 14 — ONBOARDING FLOW

No tutorial slideshow. Onboarding uses contextual coachmarks in the real UI, driven by `localStorage` flags.

### Progress Flags
```js
localStorage.setItem('gd.onboarding.homeVisited',     'true');
localStorage.setItem('gd.onboarding.firstCarCreated', 'true');
localStorage.setItem('gd.onboarding.myCarsVisited',   'true');
```

Coachmarks only render if their flag is unset. Once set, never shown again.

### Flow

**Step 1 — Auth:** Landing → "START YOUR BUILD" → `/signup` → session created → `/home`

**Step 2 — Home first visit:**
HOME destination pulses with stronger amber halo. Speech bubble: *"Welcome to G-Dimension. Let's start by adding your car. Tap Home to begin."* Other destinations dimmed to ~60%.

**Step 3 — Empty My Cars:**
Dashed-border tile: *"Let's add your first car."* Tap → `/garage/cars/new`

**Step 4 — Add Car:**
Basics (required) → Story (skippable). No photo step during onboarding.

**Step 5 — Return to My Cars:**
Coachmark: *"This is your car. You can edit its details any time."*

**Step 6 — Empty Garage screen:**
Garage floor is lit (ambient light from below frame). Centered `+` icon. Quiet message: *"When you're ready, tap here to place your car in the garage."* Tappable → opens photo upload for `garage_photo_url`. No silhouette, no urgency.

---

## PART 15 — MONETIZATION

### Tier Model

| Feature | Free | Pro |
|---|---|---|
| Cars | 1 | Unlimited |
| Modification entries | 20 | Unlimited |
| Maintenance entries | Unlimited | Unlimited |
| Detail log entries | Unlimited | Unlimited |
| Photo uploads | Limited | Unlimited |
| Receipt uploads | Limited | Unlimited |
| Public profile | ✓ | ✓ |
| Build PDF export | ✗ | Unlimited |

**Rationale:** Maintenance and detailing are responsibilities, not premium features. Everyone should be able to track their oil changes regardless of tier. Modifications are the discretionary enthusiast additions — the 20-entry limit gives real value while creating a meaningful reason to upgrade.

**Pro pricing:** $7/month or $60/year
**PDF à la carte:** $15 one-time *(funnel to Pro — after purchase show: "For $7/mo you get unlimited PDFs plus everything else")*

### Platform & Payment Timeline
- **PWA (current):** No payments. Testing and preview environment only.
- **App Store launch:** Apple IAP via RevenueCat (iOS) + Google Play Billing via RevenueCat (Android)
- **Web (post-launch):** Stripe for web browser users

### Upgrade Prompts
- Appear naturally when a limit is hit. Never aggressive, never modal-blocking.
- Tone: *"You've documented 20 modifications. Ready to go unlimited?"*
- PDF discovery: one-time toast at ~10 entries (do not repeat)

### Build Investment (Running Total)
Accessible in the Snapshot screen at the bottom, below the fold. Label: "Build Investment." Small and quiet — not surfaced until the user scrolls. Only shown if at least one entry has a logged cost.

---

## PART 16 — TECH STACK

```
Frontend:           React 18 + Vite
Styling:            Tailwind CSS + inline styles
Routing:            React Router v6
State:              React state + Supabase realtime where appropriate
Backend:            Supabase (auth, database, file storage, edge functions)
Hosting:            Vercel (PWA, connected to GitHub)
Payments:           RevenueCat (native app launch) + Stripe (web, post-launch)
Background removal: Remove.bg API (primary) → rembg Python edge function (long-term)
```

**No component libraries.** Do not install shadcn, Radix, MUI, Chakra, or any UI toolkit. These are pre-built sets of buttons, inputs, and menus that come with their own visual style built in. G-Dimension's visual language is too specific for any of them. Every component is built from scratch. This is intentional and non-negotiable.

### Folder Structure
```
/src
  /components     Header, PillButton, ConcretePanel, DestinationNode, SkeuomorphicIconWrapper, etc.
  /pages          One file per route
  /hooks          useAuth, useCars, useActiveCar, useModifications, useReceipts, useReminders
  /lib            supabase.js, removebg.js  (stripe.js added at payment launch)
  /assets         Garage background, logo PNGs, icon PNGs
  /tokens         Design tokens as exported TS/JS constants
```

---

## PART 17 — INFRASTRUCTURE

| Service | Purpose | Provider | Login |
|---|---|---|---|
| Domain | gdimension.app | Namecheap | dscan007@gmail.com |
| Hosting | Vercel, connected to GitHub | Vercel | dscan007@gmail.com |
| Repository | g-dimension-app | GitHub | prokaiwa.english@gmail.com |
| Email forwarding | hi@gdimension.app → Gmail | ImprovMX | dscan007@gmail.com |
| Email sending / waitlist | Loops.so | Loops | dscan007@gmail.com |
| Analytics | Vercel Analytics | Vercel | Enabled |

**Loops Form ID:** `cmocyy0aj083u0izcdzfjo266`

Full credentials, DNS records, and recovery keys: private Notion document — "G-Dimension Infrastructure Map."

---

## PART 18 — MARKETING PAGE

**Status: COMPLETE. Do not rebuild.**

Single file `index.html` deployed at gdimension.app.

**Contents:** GT4 world map hero with perspective parallax · G logo mark embedded · Loops waitlist form via fetch API · Vercel Analytics + scroll/section tracking · Full SEO (OG tags, Twitter card, JSON-LD, favicon) · `og.jpg` added to repo root (1200×630px)

**OG image:** Confirmed working on iMessage. For Instagram: use Facebook's Sharing Debugger at `developers.facebook.com/tools/debug`, paste `gdimension.app`, click "Scrape Again." Instagram should update within a few hours.

**Confirmed OG tag format:**
```html
<meta property="og:type" content="website">
<meta property="og:site_name" content="G-Dimension">
<meta property="og:title" content="G-Dimension — Coming Soon">
<meta property="og:description" content="Your build has a story. Give it somewhere to live.">
<meta property="og:image" content="https://gdimension.app/og.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="https://gdimension.app">
```

---

## PART 19 — VEHICLE DATABASE

### Strategy

Use the **NHTSA (National Highway Traffic Safety Administration) free public API** — a US government database with comprehensive make/model/year data. Free, reliable, no license required.

**Approach:** One-time bulk pull into Supabase during project setup. The app queries its own database at runtime — no external API calls per user action.

**NHTSA endpoints:**
```
All makes:    https://vpic.nhtsa.dot.gov/api/vehicles/getallmakes?format=json
Models/make:  https://vpic.nhtsa.dot.gov/api/vehicles/getmodelsformake/{make}?format=json
```

Write a one-time Node.js import script at scaffold time (Build Order Step 4) to populate `vehicle_makes` and `vehicle_models`.

**Fallback:** For rare JDM-only or kit-car makes not in NHTSA, allow free-text entry. The auto-complete simply doesn't force a match.

---

## PART 20 — ASSET INVENTORY

### Logo Files — `src/assets/logo/`

| Filename | Use |
|---|---|
| `gdimensionGwhitebg.png` | Marketing, Instagram — approved for production |
| `gdimensionlight.png` | In-app, dark backgrounds |
| `gdimensiondark.png` | Marketing, press, light backgrounds |
| `g-dimension_words_light.png` | In-app wordmark on dark |
| `g-dimension_words_dark.png` | Marketing, documents |

### Home Map Icons — `src/assets/icons/home/`
Nano Banana renders, PNG, transparent backgrounds.
`home_garage.png` · `home_tuning.png` · `home_timeline.png` · `home_maintenance.png` · `home_photos.png` · `home_settings.png`

### Tuning Category Icons — `src/assets/icons/tuning/`
`tuning_engine.png` · `tuning_suspension.png` · `tuning_brakes.png` · `tuning_drivetrain.png` · `tuning_lighting.png` · `tuning_interior.png` · `tuning_exterior.png` · `tuning_wheels.png` · `tuning_intake.png`

**Missing (generate via same Nano Banana pipeline):**
`tuning_exhaust.png` · `tuning_cooling.png` · `tuning_fuelsystem.png` · `tuning_audio.png` · `tuning_safety.png` · `maintenance_detail.png` (sponge and bucket)

Use text-only tiles until generated.

### Backgrounds — `src/assets/backgrounds/`
`garage_hero.jpg` — cool blue-grey garage, rollup door, 784×1338

### Still Needed

| Asset | Notes |
|---|---|
| PWA icons (`icon-192.png`, `icon-512.png`) | Generate from G mark badge at scaffold time |
| Favicon | Generate from G mark badge |
| Manufacturer logos | `carlogos.org` CDN or packaged SVG subset |
| 5 missing tuning icons + detail icon | Nano Banana, same style prompt as existing set |

---

## PART 21 — BUILD ORDER

Complete one step fully before starting the next. Steps 1–8 produce a live-looking, demable app shell.

```
 1. Project init
    Vite + React 18 + React Router v6 + Tailwind
    Folder structure per Part 16
    Google Fonts import

 2. Design tokens
    All colors, font stacks, spacing, shadows, animations
    Exported as TS/JS constants in /src/tokens/
    Reference Parts 3–7

 3. Base components
    Header (both variants)
    ConcretePanelInput + ConcretePanelLabel
    DestinationNode (Home map — no cast shadow)
    SkeuomorphicIconWrapper (Garage grid — WITH 22.5° cast shadow)

 4. Supabase setup
    New Supabase project
    Run all schema migrations from Part 12
    Enable all RLS policies from Part 12
    Configure auth: email/password + Google + Apple OAuth
    Run NHTSA vehicle data import script (Part 19)

 5. Auth screens
    Landing (/) — marketing gate with "START YOUR BUILD" CTA
    Login (/login)
    Signup (/signup)

 6. Home map screen (/home)
    Port home_prototype_v4.html into React
    Five DestinationNodes at confirmed coordinates
    Full header — avatar (→ Profile) + car name
    Header cast shadow overlay
    Amber halo + pulse on HOME destination

 7. Garage hero screen (/garage)
    Port garage_prototype_v3.html into React
    garage_hero.jpg background
    Car compositing from cars.garage_photo_url
    Empty state: lit floor + plus icon + quiet message

 8. Garage dashboard (/garage sub-view)
    3×2 skeuomorphic icon grid
    22.5° cast shadow on icons

 9. My Cars carousel (/garage/cars)
    Swipeable 3/4 showcase
    Stats: Year, Color, HP, Torque, Mileage
    Choose + Edit actions
    Add a Car final card

10. Add Car form (/garage/cars/new)
    Basics → Story (skippable)
    No photo step in onboarding
    NHTSA auto-complete for Make/Model

11. Onboarding coachmarks
    localStorage-driven, per Part 14

12. Remaining destinations — prototype Tuning first (visually complex)
    Tuning category browser (/tuning)
    Maintenance overview (/maintenance) + Detailing sub-section
    Timeline scroll (/timeline)
    Photos masonry (/photos)

13. Entry flows
    Entry Detail (/entries/:entryId) — read-only
    Add Modification bottom sheet
    Add Service Record bottom sheet
    Add Detail Session (/maintenance/detail/new)
    Edit forms (Mod + Service)

14. Garage sub-screens
    Snapshot (/garage/snapshot)
    Documentation (/garage/documents)
    Contacts (/garage/contacts)
    Reminders (/garage/reminders)
    Build PDF (/garage/pdf)

15. Profile + Settings
    Profile (/profile)
    Settings (/settings)
    Archived Cars (/settings/archived)

16. Public Profile (/builds/:username)
    Non-auth route — read-only

17. Error logging
    Global React error boundary
    Try/catch wrappers on all Supabase calls
    Upload + auth failure tracking

18. Background removal pipeline
    Remove.bg API on garage + showcase photo upload

19. PDF generator
    Build Report layout + generation + download
    Snapshot share as PDF (Pro)

20. PWA manifest + service worker
    public/manifest.json (see Part 22)
    App icons generated from G mark badge
    Service worker registration in main.jsx

21. Payment integration
    NOT during PWA phase — implemented at App Store launch
    RevenueCat for iOS/Android IAP
    Stripe for web checkout
```

---

## PART 22 — PWA CONFIGURATION

```json
{
  "name": "G-Dimension",
  "short_name": "G-Dimension",
  "description": "Your build. Documented.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0a0a",
  "theme_color": "#c8661a",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

**What `theme_color` does:** On Android, when the PWA is installed to the home screen, this color fills the system status bar at the top of the screen when the app is active — making it feel native rather than like a browser tab. `#c8661a` (amber) means the brand accent color wraps the app at the OS level.

---

## PART 23 — DECISIONS LOG

**Home destination labeled "HOME" on map, "Garage" inside**
On the map you navigate to a place called Home. Inside, everything contextually calls it the Garage — because that's where your car lives. Two spatial layers of the same metaphor, mirroring GT4 exactly.

**No persistent tab bar**
GT4 navigation was spatial — you entered and exited places. Tab bars are a social-app convention that conflicts with the "you travel between rooms" philosophy.

**Car name in header is not tappable**
Car switching is a deliberate action (Home → My Cars → Choose), not a shortcut toggle. This is intentional.

**Avatar opens Profile, not Settings**
Profile is the identity layer. Settings is operational configuration and lives inside Profile.

**Maintenance and detail entries are unlimited for free users**
Tracking oil changes is a responsibility, not a premium feature. The 20-entry limit applies to modifications only.

**Detailing is a Maintenance sub-section, not a map destination**
Detailing is care, not repair. It belongs in Maintenance emotionally and practically. Adding a sixth map destination would clutter the spatial layout.

**PDF à la carte is $15**
High enough to feel deliberate. Positioned clearly as a funnel into Pro.

**No payments in PWA phase**
The PWA is a testing environment. Introducing payments before the native app creates platform complexity (App Store rules, Stripe vs Apple IAP) with limited upside.

**Garage photo is added post-onboarding**
Forcing a photo upload at signup creates friction at the highest-dropout moment. The empty garage state (lit floor + plus icon) is a natural, low-pressure invitation.

**Build Investment is in Snapshot, below the fold**
The running spend total exists for users who want it — but the app celebrates the build, not the liability. It's accessible without being confrontational.

**No component libraries**
These are pre-built UI kits with their own visual language baked in. G-Dimension's aesthetic is too specific. Every component is built from scratch.

**22.5° cast shadow on Garage dashboard only**
Each screen is its own visual world. The shadow language belongs to the Garage. Applying it everywhere flattens the spatial experience.

**"Choose" not "Get In"**
Functionally accurate and tonally neutral. GT4-faithful without being stiff.

**7-day soft delete on cars**
Prevents accidental permanent data loss without cluttering the main UI.

**Fixed map layout, not pannable**
Portrait phones make panning clumsy. Fixed layout with perspective tilt + parallax delivers place-feeling without the usability cost.

---

## PART 24 — OPEN ITEMS

Items that still need a design or content decision before implementation:

| Topic | What Needs Resolving |
|---|---|
| Tuning screen layout | Prototype first — category browser layout not yet designed |
| Timeline entry card design | What does a mod vs. service vs. detail card look like in the scroll? |
| Detail products field | Structured (product name + type dropdown) or free text? |
| Snapshot share flow | Screenshot only? PDF? Shareable link? |
| Public Profile content | What exactly shows on `/builds/:username`? One active car + its timeline? All public cars? |
| Manufacturer logo sourcing | `carlogos.org` CDN vs. bundled SVG subset — decide at scaffold time |
| Torque unit preference | lb-ft vs Nm setting in user preferences or per-car? |

---

*End of G-Dimension Master Architecture v2.1*
