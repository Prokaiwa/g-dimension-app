# G-Dimension: Database vs UX Decision Log

This document tracks decisions about what belongs in the database versus what stays in frontend code. Use it as a reference when building features so you don't have to re-derive these calls every time.

---

## The Core Principle

**Database = facts. UX = how facts are presented.**

If a user enters it, queries it, filters by it, exports it, or shares it → it's a fact, it goes in the database. If it's about appearance, flow, or behavior of the interface → it's UX, stays in code.

## The Four-Question Test

Before adding a column or table, ask:

1. **Will users ever search/filter/sort by this?** Yes → DB.
2. **Does it survive across users / sessions / devices?** Yes → DB.
3. **Does it have referential meaning?** (Two records need to agree on it) Yes → DB.
4. **Would removing it lose information?** Yes → DB.

If the answer to all four is "no" — it's UX.

---

## Decisions Log

### Decision 001 — Spec template "advanced" flag
**Date:** 026 design phase
**Decision:** `is_advanced` lives in the database (on `spec_templates`).
**Reasoning:** Same for everyone, controls form structure globally. Affects what fields render for every user, not just one.

### Decision 002 — "Advanced part type" classification
**Date:** 026 design phase
**Decision:** Stays UX-only. Handled via `part_types.display_order` (which already exists) — order common ones first, advanced ones last. Frontend can show first N by default with a "See more" reveal.
**Reasoning:** The advanced/beginner classification is a UI suggestion, not a fact about the part. A roll cage isn't "more advanced" than a coilover — just less common. Putting it in the DB commits us to a permanent classification we might want to revise. `display_order` does double duty: ordering AND advanced-detection.
**Watch for:** If we ever want to filter or analyze "% of builds with advanced parts" we'd need to add a real column. Defer until that need is real.

### Decision 003 — Brand fields per component (Engine Block Reinforcement)
**Date:** 026 design phase
**Decision:** Separate text fields per component (`main_stud_brand`, `sleeve_brand`, `girdle_brand`) rather than a single brand field or a sub-table.
**Reasoning:** Component brands genuinely differ (ARP makes studs, Darton makes sleeves). Sub-table would be over-engineering for a flat list of optional brand attributes.
**Pattern:** When a part_type has multiple distinct sub-components that each have their own optional brand/spec, give each its own field. Use the `reinforcement_type` multiselect to tell the frontend which brand fields to show.

### Decision 004 — User unit preferences
**Date:** Pre-026, established in earlier migrations
**Decision:** Lives in DB on `users` table (`distance_unit`, `power_unit`, `torque_unit`, `spring_rate_unit`, etc.)
**Reasoning:** Must sync across devices. User on phone should see same units as user on desktop. Affects every spec rendered everywhere.

### Decision 005 — Spec field ordering
**Date:** Pre-026
**Decision:** `display_order` on spec_templates (DB). Lower numbers render first.
**Reasoning:** Affects all users uniformly. The form structure shouldn't differ per user.

### Decision 006 — Spec value units (storage vs display)
**Date:** Pre-026
**Decision:** Always store in base unit (kg/mm, °C, mm, psi). Convert at display time using `unit_preference` on the template + the user's unit preference.
**Reasoning:** Switching display preference requires zero DB writes. Single source of truth for the actual value.

### Decision 007 — Form section collapsed/expanded state
**Decision:** UX only (localStorage if you want persistence, otherwise per-session).
**Reasoning:** Per-user, per-session preference. Pure cosmetic. No factual content lost if not persisted.

### Decision 008 — Selected tab / current view / scroll position
**Decision:** UX only.
**Reasoning:** Pure interface state. Doesn't survive into shareable content.

### Decision 009 — Donor part handling
**Date:** 026 design phase (Drivetrain review)
**Decision:** Donor swaps (e.g., R34 6MT into R32, K-swap, LS-swap) use the existing `jobs.is_donor_part`, `jobs.donor_make/model/year/part`, and `jobs.fabrication_*` fields. No separate "OEM parts" or "donor parts" section. The job IS the swap; donor fields capture origin.
**Reasoning:** A donor swap is just a job whose part came from a different vehicle. Adding a separate section would create two paths for the same concept. The existing fields were designed for this purpose in migration 024.
**Frontend implication:** When `is_donor_part = true`, spec form labels should adapt. Example: a `transmission_type = "OEM"` selection on a donor swap should display as "OEM (donor car)" so it reads correctly. The stored value is the same; only presentation changes.

### Decision 010 — Swap reason capture
**Date:** 026 design phase (Drivetrain review)
**Decision:** Add `swap_reason` multiselect to Transmission spec template. Covers Stronger/More Torque, More Gears, Better Ratios, Sequential Conversion, Original Failed, AWD Conversion, Other.
**Reasoning:** Swap reasons are valuable community data — future fitment features can show "X people swapped to Y for reason Z." Optional field, low cost, unlocks future features.
**Pattern:** When a part_type commonly involves a *choice with reasons* (vs. just a part replacement), capture the reason as a multiselect. Don't do this for routine wear items (brake pads don't need a "why did you replace them" field).

### Decision 011 — Track-specific alignment reference data
**Date:** 026 design phase (Suspension review)
**Decision:** Don't add track-specific fields (`track_name`, etc.) to Alignment templates. Use the existing `alignment_type` enum (which has "Track / Race" as a value) plus the free-form `notes` field on jobs.
**Reasoning:** Track-specific reference data is a real future community feature, but we don't have enough usage data to design it properly yet. Premature schema commitment would lock us into the wrong shape. Wait for real user patterns to emerge post-launch, then design a proper `track_setups` concept.
**When to revisit:** When user behavior shows people consistently logging track-specific configurations and wanting to share/reference them.

### Decision 012 — Per-car "configurations" / setups
**Date:** 026 design phase (Suspension review)
**Decision:** Don't build a multi-configuration system in v1. A car has one current state. Track-vs-street differences are captured via `modification_goals` tags on individual jobs.
**Reasoning:** Real architectural feature, not a schema tweak. Deserves dedicated design with user feedback. Three approaches considered:
  - A: Tags only (chosen — zero schema cost)
  - B: Per-part_type setup_type enums (rejected — only partial coverage)
  - C: Full configurations table (deferred — needs real usage data first)
**Watch for:** Users requesting "Track Setup" / "Street Setup" / "Drift Setup" toggles. Pattern emergence triggers Option C design.

### Decision 013 — Active suspension (magnetic ride)
**Date:** 026 design phase (Suspension review)
**Decision:** Not a dedicated part_type. Users wanting to log it use Custom/Other.
**Reasoning:** Active suspension is OEM tech that enthusiasts typically remove rather than add. Edge case; doesn't justify a part_type.

### Decision 014 — Track sessions feature (deferred)
**Date:** 026 design phase (Suspension review)
**Decision:** Defer. Don't build now. Use existing `alignment_type = 'Track / Race'` and `modification_goals = ['track']` tags as the v1 capture mechanism.
**Reasoning:** Track sessions are their own concept (not a part_type). Building them properly requires:
  - A `track_sessions` table — event-level (date, location, weather, car_id)
  - A `track_runs` or `lap_times` table — timed runs within a session
  - A `session_setup` snapshot — alignment / tire pressure / settings *for this session*
  - Photo/video attachments
  - Possible integration with timing apps (Harry's LapTimer, Track Addict, RaceChrono)
This deserves its own UX-first design pass, not a schema-first commit. Pre-launch, we'd be guessing about what data matters most. Better to ship parts/Build Sheet first, watch real usage, then design with feedback.

**Rough future schema sketch (do not build yet):**
```
track_sessions
  id, car_id, user_id
  session_date, track_name, location
  weather_conditions, ambient_temp_c
  notes, photos[]

track_runs
  id, session_id
  run_number, lap_time_ms, best_sector_times[]
  fuel_used, tire_temps[], notes

session_setups (snapshot of relevant spec_values used during the session)
  id, session_id
  alignment_camber_f, alignment_camber_r, alignment_toe_f, alignment_toe_r
  tire_pressure_fl, tire_pressure_fr, tire_pressure_rl, tire_pressure_rr
  sway_setting_f, sway_setting_r, damper_clicks_f, damper_clicks_r
  ... (driven by what users actually log)
```

**When to build:** When 3+ of these are true:
  1. Users repeatedly request track session tracking
  2. We see patterns of users using `notes` fields to capture session data inconsistently
  3. The community fitment / reference feature is being designed (track setups are the highest-value data for that feature)
  4. We have real timing-app integrations in scope

**What captures it for now:**
- Alignment job with `alignment_type = 'Track / Race'`
- Job `modification_goals = ['track']` tag
- Free-form notes field on the job
- Photos attached via `job_photos`

**Owner reminder:** This is a high-value future feature for the community / reference angle of the product. Don't let it get forgotten. Revisit during phase 2 planning post-launch.

### Decision 015 — Conditional fields via discriminator pattern
**Date:** 026 design phase (Wheels & Tires review)
**Decision:** When a part_type has variants that share most fields but differ in a few (e.g., square wheel setups vs staggered), use a single discriminator field (`fitment_setup`) plus optional `_rear` variants of the differing fields. Don't split into separate part_types and don't force the user to create multiple jobs.
**Reasoning:** One Wheels job per car matches how enthusiasts think about wheels — they buy a *set*, not individual corners. The discriminator tells the frontend which conditional fields to render. The schema stays clean (NULL = "not staggered for this dimension") and queryability is preserved.
**Pattern application:**
  - Wheels: `fitment_setup` controls visibility of `diameter_rear_in`, `width_rear_in`, `offset_rear_mm`
  - Tires: `fitment_setup` controls visibility of `width_rear_mm`, `aspect_ratio_rear`, `rim_diameter_rear_in`
**When to apply:** Any part_type where (a) "front and rear differ" is a common variant, AND (b) the variant differs in only 1-3 dimensions. If 5+ dimensions differ, split into two part_types instead.
**Frontend implication:** Form must be reactive to discriminator changes — show/hide rear fields dynamically. When discriminator switches from Staggered → Square, prompt before clearing populated rear values.
**Queryability note:** "Show me everyone running 295mm tires" requires checking both `width_mm = 295` and `width_rear_mm = 295`. Trivial in SQL, just non-obvious. Document this for future analytics work.

### Decision 016 — TPMS not a dedicated part_type
**Date:** 026 design phase (Wheels & Tires review)
**Decision:** TPMS sensors are not a part_type. Users wanting to log them use Custom/Other.
**Reasoning:** Most enthusiasts ignore TPMS, run with the warning permanently on, or use generic delete modules. Edge case.

### Decision 017 — Tire PSI not captured at the spec level
**Date:** 026 design phase (Wheels & Tires review)
**Decision:** Tire PSI is NOT a spec_template field on tires. Users wanting to log current pressures use the job's notes field for v1.
**Reasoning:** PSI is a setup configuration, not a property of the tire. The same tire runs at very different pressures depending on use case (32 street / 28 track / 8 mudding). Storing it on the tire job would force users to either overwrite history (lose prior values) or create duplicate tire jobs every pressure change.
**Where it actually belongs:** The future track sessions feature (Decision 014). Each session captures the tire pressures used at that event. That's the right home for both historical reference and community fitment data.
**Watch for:** Users asking "where do I log tire pressure?" — the answer is either "in the notes for now" or "wait for track sessions feature."

### Decision 018 — Labor cost separation
**Date:** 026 design phase (Wheels & Tires review)
**Decision:** Add `labor_cost`, `parts_cost`, and `installed_by` fields to `jobs`. Existing `cost` becomes the total. Price aggregator filters on `parts_cost` only.
**Reasoning:** A user who installed a coilover themselves spent $1200 on parts. A user who paid a shop spent $1200 on parts + $400 labor = $1600 total. If we aggregate raw `cost`, the average becomes meaningless — buyers shopping for parts get bad data. Separating parts cost from labor preserves both data points.
**Implementation:** Migration 026 will add the three new columns. Existing `cost` column stays for now (treat as `total_cost` going forward). The Build Sheet shows total cost; the price aggregator queries parts_cost only.
**Frontend implication:** Job form needs an "Installed by yourself or a shop?" toggle. When "Shop," labor_cost field appears. When "DIY," labor_cost stays NULL.

### Decision 019 — Placeholder hints
**Date:** 026 design phase (Forced Induction review)
**Decision:** Add `placeholder` text column to `spec_templates` AND add `notes_placeholder` text column to `part_types`. Both nullable. NULL means "frontend renders no placeholder."
**Reasoning:** Different from `help_text`. Help text answers "what goes here?" Placeholder shows an example value inside an empty input. Both are useful, both deserve their own home in the schema. Adding both now is cheap; adding later requires updating every form.
**Use case examples:**
  - Tires part_type → notes_placeholder: "e.g., 32 psi cold street, 28 psi cold track, 8 psi sand"
  - target_boost spec → placeholder: "20"
  - bolt_pattern spec → placeholder: "5x114.3"
**When to populate:** Only where it adds genuine value. Not every field needs a placeholder — many spec_templates already have obvious defaults. Populate where ambiguity is likely.

### Decision 020 — Brand and Model as separate fields
**Date:** 026 design phase (Forced Induction review)
**Decision:** Replace single `brand_text` with two separate fields globally across spec_templates: `brand` and `model_text`.
**Reasoning:** Brand and model serve different purposes. Brand is the manufacturer ("Garrett") — searchable, filterable, useful for "show me all builds running Garrett turbos" community queries. Model is the specific product ("G35-900") — useful for exact match lookups and price aggregator binding. Combining them as one field loses queryability. Example: "Greddy RS" vs "Greddy TS" BOVs are different products with different specs; "Garrett GT2860R" vs "Garrett GTX3582R" are wildly different turbos.
**Why `model_text` not `model`:** Defensive naming. `model` is conceptually reserved for vehicle models. Using `model_text` keeps it clearly a free-form spec field.
**Apply to:** Every part_type where brand/model matters (most of them). Per-part_type decision on whether each is required vs optional (see Decision 021 — answer is almost never required).
**Pattern:**
  - brand → manufacturer ("Garrett", "Bridgestone", "Brembo")
  - model_text → specific product ("G35-900", "Potenza RE-71RS", "GT4 8-Pot")
**Frontend implication:** Brand can become a typeahead with autocomplete from existing entries. Model is free-text. Future analytics: aggregate "average cost of Garrett turbos" or drill down to "average cost of Garrett G35-900 specifically."

### Decision 021 — Required fields principle (CRITICAL)
**Date:** 026 design phase (Exhaust/Cooling/Fuel review, refined Electrical/Audio/Lighting review)
**Decision:** A spec_template field is `required = true` if and only if it is a **true discriminator** — meaning, the field's value changes which OTHER fields the form should render or whether they apply at all.

**Brand is always optional.** Use NULL for unknown/unbranded parts. Do not introduce sentinel string values like "Unbranded" or "Unknown" — NULL has cleaner database semantics for aggregations, distinct counts, and filters.

**Reasoning:** Required fields are a form-completion barrier. Many real users buy parts off Facebook Marketplace, eBay, friends, or junkyards with no documentation. They might know "it's a catback" and nothing else. Forcing them to enter a brand or even a design type kills the app for casual users. Even fields that seem foundational (bolt pattern, fluid type, capacity) might not be known by the user. Trust users to fill in what they know; let them save and improve later.

**The two-question test for required:**
1. Does this field's value change which OTHER fields the form renders? (true discriminator)
2. Without this field, does the form become structurally ambiguous?

If both are no → optional.

**True discriminators (stay required):**
  - `pad_position` (Brake Pads) — Front/Rear/Both
  - `fitment_setup` (Wheels, Tires) — controls _rear field visibility
  - `arm_position` (Control Arms) — multiselect controls scope
  - `cat_setup` (Downpipe) — Catted/Catless changes which fields apply
  - `component` (multi-purpose templates) — when one template covers multiple parts
  - Sub-component multiselects on kits (kit_components, etc.) — drives which sub-brand fields render

**Not discriminators (now optional):**
  - All brand and model fields
  - All construction / material / type *labels* that don't gate other fields
  - All sizes (diameter, width, length, capacity)
  - All performance numbers (boost, power, flow)
  - All chemical/compatibility fields the user might not know off-hand (fluid type, coolant type)
  - All advanced fields (always optional by definition)

**On unknown brands:** Leave NULL. Pattern: `WHERE brand IS NOT NULL` filters to known brands. Avoid string sentinels.

**Going forward:** When drafting any new spec_template, default to optional. Only require if the field genuinely controls form structure. The bar is extremely high.

**Frontend implication:** Forms can encourage completion with hints ("Don't know? Skip this — you can add it later"). Forms cannot block on it. Job saves with whatever the user provided. This means a user can log "I have a catback" with literally no other detail, save, and have a valid Build Sheet entry.

### Decision 022 — ECU placement and harness placement
**Date:** 026 design phase (Electrical review)
**Decision:**
  - **ECU / Engine Management** stays in **Engine** category. Most build threads / forums categorize it as an engine concern, not electrical.
  - **Wiring Harness** stays as a single part_type in **Electrical** category, with `harness_scope` capturing the variant (Engine Harness / Body Harness / Full Vehicle Rewire / Engine + Body / Standalone Harness).
**Reasoning:**
  - ECU is a consumer of electrical power, not part of the electrical system. It's an engine tuning concern.
  - Wiring is fundamentally electrical work, regardless of whether it's the engine bay or body. Splitting into separate part_types would duplicate the same form with cosmetic relabels.
**Cross-reference:** When an engine swap includes a harness, the harness can be referenced via `jobs.donor_part = "engine + harness"` on the engine job. Or it can be logged as a separate Wiring Harness job with appropriate scope. Both are valid.

### Decision 023 — Modification vs. Maintenance categorization
**Date:** 026 design phase (Paint & Wrap review)
**Decision:** Ceramic Coating is NOT a `Paint & Wrap` part_type. It's a maintenance task — logged as a job with `type = 'maintenance'`, not `type = 'modification'`. It does not get spec_templates in 026.
**Reasoning:** Ceramic coating is recurring surface care, not a permanent body modification. A user might re-apply it every few months (spray) or every few years (pro grade). That recurrence pattern matches maintenance (oil changes, brake fluid flushes), not modifications (paint, PPF, vinyl wrap which are one-time or rare events).
**Pattern test for future categorization questions:** "Is this a one-time decision the user makes about their build, or is it recurring care?" One-time → modification (and gets a part_type). Recurring → maintenance (lives in `jobs` with `type='maintenance'`, no part_type required).
**Examples:**
  - Modification (gets part_type): paint job, vinyl wrap, PPF, ceramic *brake* coating (header coating done once)
  - Maintenance (no part_type needed): oil change, brake bleed, ceramic *paint* coating, tire rotation, alignment service (when not modifying alignment goals)
**Future:** When the maintenance side of the schema gets formalized (likely post-launch when patterns emerge), add maintenance templates with their own structure. For now, free-form `notes` field is sufficient.
**Impact:** Paint & Wrap drops from 5 to 4 part_types. Ceramic Coating section removed from 026 plans.

### Decision 024 — Image upload pipeline
**Date:** 026 design phase (image handling discussion)
**Decision:** Image processing happens at the **frontend layer**, not in the database. Schema does not need changes for image handling — the existing `job_photos.photo_url` and storage buckets are sufficient.

**Upload pipeline (frontend responsibility):**
1. User selects image (any format — JPEG, PNG, HEIC, HEIF, WebP)
2. Browser converts HEIC/HEIF → JPEG/WebP using `browser-image-compression` library
3. Resize to max 2400px on longest side
4. Compress to ~85% quality
5. **Strip EXIF metadata** (critical for privacy — phones embed GPS coordinates by default; without stripping, public Build Sheet photos would dox user's home address)
6. Output WebP if browser supports, else JPEG fallback
7. Upload to Supabase Storage in appropriate bucket

**Thumbnails:** Use Supabase Storage's built-in transform API on read (`?width=300&height=300&resize=cover`). No separate thumbnail storage needed for v1.

**Why this approach:**
  - Frontend handles 80% of compression work — server stays simple
  - HEIC/HEIF support is non-portable across browsers (Safari only, not Chrome/Firefox), so we convert to web-standard formats
  - 5MB iPhone photo → 400-800KB after pipeline. Typical user (~10 cars × 20 photos × 600KB) = ~120MB
  - EXIF stripping protects user privacy by default, no opt-in required

**Storage bucket recap (already in schema):**
  - `car-photos` — public, 10MB limit, accepts JPEG/PNG/WebP/HEIC/HEIF
  - `job-photos` — public, 20MB limit, accepts JPEG/PNG/WebP/HEIC/HEIF
  - `receipts` — **private**, 20MB limit, accepts images + PDF (financial data, RLS-protected)

**Why HEIC/HEIF allowed in storage but not served:** Defense in depth. If the frontend conversion fails or is bypassed, the upload still succeeds (rather than rejecting the user's photo). The conversion just happens on the next access. But the standard path is "frontend converts, web format is what gets stored."

**Library recommendation:** `browser-image-compression` (npm). Free, well-maintained, handles HEIC, EXIF stripping, resize, format conversion. Single dependency.

**Future considerations (defer until needed):**
  - Multi-size pre-generated storage (thumbnail/medium/full) — only if Supabase transform API costs become significant
  - Server-side processing via Edge Function — only if frontend processing fails on large uploads
  - CDN caching layer — only when traffic justifies it

**Frontend reminder:** When building the upload flow, the order is **strip EXIF FIRST**, then resize, then compress, then upload. Doing it out of order can leak metadata.

---

## Quick Reference Table

| Concern | DB or UX? | Why |
|---|---|---|
| Brand text on a spec | DB | Searchable, factual |
| Whether to animate transitions | UX | Pure visual |
| Spec is "advanced" | DB | Global, controls structure |
| Spec section collapsed by default | UX | Cosmetic |
| Part type is "common" vs "rare" | UX (via display_order) | Soft suggestion |
| User's unit preference | DB | Syncs across devices |
| Color theme | DB (if cross-device) / UX (if local) | Depends on requirement |
| Build Sheet category order | DB | Global hierarchy |
| Filter/sort options on lists | UX usually | Just affects what user sees |
| What modification_goals tags exist | UX (predefined list) or DB (if user-defined) | Depends |
| Whether a job is "installed" vs "planned" | DB | Factual state |

---

## Pattern Library

### Pattern: "Should I add a column for this UI behavior?"
Try first: CSS, frontend logic, existing column. If those don't work, then a new column.

### Pattern: "Should I add a new table for this concept?"
Try first: a JSONB column, a text array, an existing relationship. New tables are a high-cost commit.

### Pattern: "Should I add a flag for this user preference?"
If sync-across-devices matters: DB on users table. If session-only: localStorage.

### Pattern: "Should this be a select with predefined options or free text?"
If you want to filter/aggregate by it: select with options. If it's identifying details (brand names, part numbers): free text.
