# Featured — Magazine Section (Plan & Handoff)

**Status:** Cover + interior book BUILT (Cover → Photo Spreads → Story → Spec Sheet) with the fold-line page turn, folio dots, editorial engine captions/headlines. Cover framing (drag/pinch, migration 052), user-written feature story (052), brightness-based masthead auto-pick, and the double-truck centerfold hero are in. §2 of "Scrapped/updated decisions" below supersedes parts of §4.

**Scrapped/updated decisions (2026-06-12):**
1. **Auto-pulled Story spread is SCRAPPED.** Timeline prose (first-person diary voice) must never be auto-typeset into the magazine — wrong register. Instead `cars.featured_story` (migration 052) holds an optional **user-written magazine-voice article**; the book only gets a Story page when it's written (cover "Story ✎" chip → compose sheet).
2. **Cover framing shipped as §4.5 layer 1** (reposition + zoom, persisted as `cover_focus_x/y` + `cover_zoom`, NULL = unframed → legacy contain heuristics). Layer 2 (bbox seed) not done — bbox isn't persisted at upload yet. Layer 3 exists as the "No BG" cutout toggle.
3. **feDisplacementMap gutter warp SKIPPED** — feImage+displacement is unreliable on iOS Safari (the primary device). The binding depth shipped instead: fold-line page turn, spine gutter shading, and the **double-truck centerfold** (hero photos with aspect ≥ 1.9 go full-bleed with a center fold crease + "Full Spread" tag).
4. **Public Featured (on /builds/:username) DEFERRED** — `/builds/:username` itself is still an unbuilt stub; open product question: is the public profile a page *containing* the magazine, or IS the magazine the public profile? Migration 052 already exposes everything the public cover/story needs via `public_car_profiles`.
**Route:** `/featured` (replaced the old `/photos` stub on the Home map).
**Read this before touching:** `src/pages/FeaturedPage.tsx`, the Home "Featured" node in `HomePage.tsx`, or the car-photo upload pipeline (`carPhoto.ts` / `CarPhotoUpload.tsx`).

> Follow all `CLAUDE.md` + `MASTER_ARCHITECTURE.md` rules **except** where this doc grants Featured its own aesthetic (see "Aesthetic island"). Featured is a deliberate exception, like Parts Bin.

---

## 1. The idea

The Home screen's "Photos" node was a dead stub (`return <div>Photos — /photos</div>`). It's being replaced by **Featured**: each car becomes a **Speedhunters / tuner-mag-style magazine** the owner can swipe through. The fantasy is "my car got the feature" — pride/identity, the thing car people actually want. It reuses the car's existing data (specs, Build Sheet, Timeline, photos) as a *curated cover story*, distinct from Timeline (Timeline = chronological diary; Featured = the designed cover story).

**Name:** **Featured.** (In tuner-mag culture a "feature" is the showcased car.)
**Tagline:** **"Your Build. Featured."**

## 2. Aesthetic island (the one rule exception)

A magazine that obeys the minimalist app design system won't *feel* like a magazine. So Featured — and **only** `/featured` — is allowed to break the global rules, exactly like Parts Bin does (kraft paper / Caveat / Permanent Marker).

- **Fonts** (added to `index.html` + `src/tokens/index.ts`):
  - `FONT_MASTHEAD` = **Anton** — masthead "G-DIMENSION" + big cover headlines (italic-skewed for the Super Street lean).
  - `FONT_DECK` = **Oswald** — cover-lines, decks, kickers, spec labels.
  - Body reuses existing Hanken (tech/spec) + Cormorant (story prose). Permanent Marker / Caveat available for occasional script flourishes.
  - Paid upgrade path if ever wanted: Druk / Tungsten.
- **Color:** bolder magazine palette allowed here (the brand burgundy `COLOR_BRAND = #780E12`, accent `#c8661a`, plus near-white/black for covers). Don't propagate this freedom outside `/featured`.

## 3. Cover templates (built)

4 templates; the default is chosen **deterministically per car** (hash of car id) so every user's issue looks distinct but stable. User can swipe/tap/dots to flip through. Each cover **re-themes the would-be interior**:

| # | Template | Masthead | Interior theme |
|---|----------|----------|----------------|
| 1 | **Top Band** | white band, black "G-DIMENSION" + **G logo top-right** | white pages / black ink / orange pops |
| 2 | **Burgundy Brand** | white band, burgundy masthead + **G logo top-right** | cream pages / burgundy headers |
| 3 | **Knockout White** | white masthead over the photo (scrim) | black pages / white text / moody |
| 4 | **Ink Black** | black masthead over the photo (vignette to tame high-key) | high-key white pages / black ink |

**Furniture on the cover:** `VOL.x NO.y` + "Your Build. Featured." strip, "Since {purchase year}", a **vertical barcode bottom-left** (numbers run down its right side), "Feature Car" kicker, auto cover-lines from specs (e.g. `520 HP · TURBO · RWD`), folio, glossy sheen overlay.

**Cover photo:** defaults to the **Original** uploaded photo (full-bleed) and can toggle to the **No-BG cutout** (top-right "Photo ▸" chip). See §5 for the data behind this.

## 4. The "magazine feel" plan (NOT yet built)

Key insight: the magazine feel is ~80% **editorial layout + typography**, ~20% paper texture. Build the layout language first.

**Interior spreads (next):** Cover → **Spec** (maps 1:1 to Build Sheet groups power/chassis/exterior/interior — like a "TUNING MENU" box) → **Story** (Origin `cars.purchase_story` + standout Timeline entries, Cormorant body) → **Gallery**. Photo-first so it looks great with zero writing.

**The page-binding / turn feel (next):** build in layers, **CSS/SVG only — explicitly NOT WebGL for v1**:
1. **Gutter** per page: soft inner shadow + slight `perspective` bend on the spine edge; alternate the side each page (cover flat → swipe → distortion on one edge → swipe → other edge), matching real magazine physics.
2. **Gutter image distortion:** SVG `feDisplacementMap` can genuinely warp the photo into the spine (performant, no shader engine).
3. **Page-turn:** CSS 3D `rotateY` around the spine + sheen sweep + deepening drop-shadow.
4. **Optional hero two-page spreads** with the dramatic gutter/warp down the *center* (full-bleed car across the gutter).
- True finger-tracked cylinder curl is the ONLY part needing WebGL — defer as a later "delight pass."

**Other next items:** photo-brightness auto-pick of masthead color (dark photo → white knockout, bright → black); smarter cover-line copy; exposing Featured on the public `/builds/:username`.

### 4.5 Cover-photo framing (THE big one — landscape/portrait/square/close/far)

A fixed vertical cover can't blind-crop arbitrary photos well (a center `object-fit: cover` slices the sides off a wide car; `contain` letterboxes). The robust solution is layered:

1. **Backbone — user reposition + zoom.** When the user sets their Featured cover, they pick a photo and **drag to reposition + pinch to zoom** inside the cover rectangle (like FB/IG cover crop). Store the framing on the car: `cover_focus_x`, `cover_focus_y` (object-position %) and `cover_zoom` (scale), or a crop rect. This handles EVERY shape/size/distance with zero guessing. This is the reliable answer — build it.
2. **Smart seed — auto-frame from the cutout's bounding box.** We already run background removal and `trimToBlob()` in `backgroundRemoval.ts` computes the car's silhouette bounding box (see CAR_PHOTO_HANDOFF.md §3). Use that bbox to auto-center/scale the car as the *default* framing, so most users never touch the controls. (Store the bbox on upload to avoid recomputing.)
3. **Always-safe fallback — cutout on a designed backdrop.** The background-removed car (cutout) can be scaled to fit ANY frame and placed on a magazine backdrop (gradient/studio/color). Guaranteed to show the whole car at any aspect — a great default for awkward source photos, and an editorial look in its own right.
4. **Aspect-aware defaults (interim).** Until 1–2 ship: portrait → full-bleed cover; landscape → fit-width upper band; square → cover. Reduces (not eliminates) the cut-off problem.

**Recommendation:** ship the cover-photo picker with reposition+zoom (layer 1), seeded by the cutout bbox (layer 2), with cutout-on-backdrop (layer 3) as the safe alternate. That's what makes Featured bulletproof across all user photos.

## 5. Original-photo persistence (built — migration 049)

Background removal is client-side and used to **discard the original**. We now keep it:
- **Migration `049_car_original_photo.sql`** — added `cars.original_photo_url` (nullable; applied to live DB 2026-06-07).
- **`carPhoto.ts` → `uploadCarOriginal()`** compresses the original to JPEG → `car-photos` bucket (`original-{ts}.jpg`).
- **`CarPhotoUpload.tsx`** now returns `(cutoutBlob, originalFile)`; add-car (`GarageCarsPage.saveCar`) and edit-car (`GarageCarsEditPage`) save the original **best-effort** (a separate update — can never block the normal car save).
- **Why:** full photo for the cover + lets background removal be re-run later (BiRefNet on-device — see `CAR_PHOTO_HANDOFF.md`) + never destroy source data.
- **Note:** existing cars have NO original until the photo is re-uploaded once. Featured reads it with a guarded query so it self-heals.

## 6. File map

```
src/pages/FeaturedPage.tsx        — the section (cover prototype). 4 templates, swipe, barcode, furniture, photo toggle.
src/pages/HomePage.tsx            — DESTINATIONS node 'featured' → /featured, icon import home_featured.png, "To Featured" map label
src/assets/icons/home/home_featured.png — Home map icon (renamed from home_feature.png)
src/tokens/index.ts               — FONT_MASTHEAD (Anton), FONT_DECK (Oswald) — Featured island fonts
index.html                        — Google Fonts: added Anton + Oswald
src/lib/carPhoto.ts               — uploadGaragePhoto (cutout) + uploadCarOriginal (original JPEG)
src/components/CarPhotoUpload.tsx  — onChange(blob, originalFile)
src/pages/GarageCarsPage.tsx       — add-car flow saves original (best-effort)
src/pages/GarageCarsEditPage.tsx   — edit-car flow saves original (best-effort)
supabase/migrations/049_car_original_photo.sql — cars.original_photo_url
```

## 7. How to run / preview

```
npm run dev -- --host      # Vite; open the Network URL on a phone (same Wi-Fi)
```
Go to `/home` and tap **Featured**, or open `/featured` directly. (Dev server auto-picks a free port; don't assume 5173.) Build check: `npm run build` (tsc + vite).

## 8. Open decisions (ask the user)

- One Featured per car, or multiple articles? (assumed: one, for now)
- Cover photo source long-term: original / dedicated cover upload / pick from existing shots.
- How far to push the binding effect for v1 vs the WebGL curl later.

## 9. Done so far / immediate next

- ✅ Cover prototype (4 templates), Home node rewire, fonts, barcode, original-photo persistence (migration 049 live).
- ⏭️ **Next session:** build the first **interior spread** (Cover → Spec, reusing Build Sheet data) and prototype the **gutter + 3D page-turn** between cover and spread.
