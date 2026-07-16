# Car Photo & Background Removal — Handoff

**Status:** Background removal is DONE and works well. The car's **shadow + reflection**
presentation in the carousel is NOT reliable yet and needs a proper rebuild.

This document is the single source of truth for continuing this feature in a fresh
Claude Code session. Sections: (1) architecture decision, (2) what's built,
(3) the open problem, (4) a ready-to-use prompt for the next session.

---

## 1. Architecture decision (durable — please fold into MASTER_ARCHITECTURE.md)

Car-photo background removal runs **100% client-side in the browser** — no API,
no server, no recurring cost, **$0 at any scale**.

### Why client-side (server and API were considered and rejected)

- **Per-image API** (remove.bg, BRIA API, etc.): cost scales with usage. At ~2M
  users this is ~$700k–1.8M/yr for one feature. Rejected.
- **Server** (managed or self-hosted): a recurring cost + an external dependency
  + a cold-start UX problem on cheap/idle hosting. Self-hosting hardware (e.g. a
  Mac Mini at home) is operationally fragile (home uptime/ISP/security).
  Rejected for this feature.
- **Client-side / on-device**: free at any scale, private (photo never leaves
  the device), no cold start, and no vendor that can meter or revoke us. Usage
  is tiny and infrequent (only when a user adds a car or updates an exterior
  photo), so the user's own device handling it a handful of times is ideal.

### Two-phase model plan

- **Now (PWA phase):** `briaai/RMBG-1.4` via Transformers.js, in-browser on the
  WASM backend. RMBG-1.4 is light enough to run in a browser tab. Its license is
  **non-commercial** — acceptable **only while G-Dimension is a free, pre-revenue
  PWA**.
- **Future (native app):** bundle **BiRefNet** (MIT licensed — free, commercial
  use included, permanently ours) and run it **on-device** via a native ML
  runtime. BiRefNet is higher quality but too heavy for a browser tab (it runs
  out of WASM memory, and WebGPU hits per-shader storage-buffer limits on common
  GPUs) — a native app runs it on-device with no such limit. The background-
  removal integration is rebuilt natively at that point anyway, so today's
  RMBG-1.4 choice locks in nothing.

### HARD RULES

- **Do NOT enable the paid Pro tier while G-Dimension is still a PWA on
  RMBG-1.4.** RMBG-1.4 is non-commercial-licensed. Correct sequence: keep the
  PWA free → go native → swap to bundled BiRefNet → *then* launch Pro. Make
  "go native" and "launch Pro" the same milestone.
- **Never** use a paid per-image API for this.
- **Never** add a server dependency for this.

> Note: `supabase/migrations/004_cars.sql` comments `garage_photo_url` as
> "Background-removed via Remove.bg pipeline" — that is **outdated**. It is
> RMBG-1.4 client-side now. (Migrations are immutable history; don't edit it,
> just know it's stale.)

---

## 2. What's built and working

### Files

- **`src/lib/backgroundRemoval.ts`** — client-side background removal.
  - Model: `briaai/RMBG-1.4`, loaded via the low-level `AutoModel` +
    `AutoProcessor` API of `@huggingface/transformers` with
    `config: { model_type: 'custom' }` (the high-level `pipeline()` API cannot
    auto-detect RMBG-1.4 — it reports an unsupported model type). Device: WASM.
    dtype: `q8` with an `fp32` fallback.
  - Flow (`removeCarBackground`): `loadEngine()` → `decodeToCanvas()` (uses
    `createImageBitmap`; HEIC/HEIF is decoded via the `heic-to` library, loaded
    on demand) → run the model → mask → `applyMask()` (mask becomes the alpha
    channel) → `trimToBlob()` (wipes faint matte residue, crops transparent
    margins, caps the long edge at 1200px, outputs a transparent **WebP** via
    `encodeCutout()` — **PNG** on browsers that can't encode WebP).
  - Exports: `removeCarBackground`, `prewarmBackgroundRemoval`,
    `subscribeModelState`, `getModelStatus`, `getModelProgress`.
- **`src/lib/carPhoto.ts`** — `uploadGaragePhoto(userId, carId, blob)` uploads
  the cutout to the `car-photos` bucket (extension/contentType follow
  `blob.type` — `.webp` or `.png`), returns the public URL.
- **`src/components/CarPhotoUpload.tsx`** — the upload UI: a `<label>`-wrapped
  hidden file input, a branded "Preparing your garage" model-download screen,
  and a processing state. Hands the processed Blob back via `onChange`.
- **`src/pages/GarageCarsPage.tsx`** — the My Cars carousel. Contains the inline
  Add Car flow and the inline Details modal (both embed `CarPhotoUpload`).
  `saveCar` / `saveDetails` upload the blob and set `cars.garage_photo_url`.
  The **`CarStage`** component renders car + shadow + reflection.

### Data & deps

- Cutout stored as a transparent **WebP** (PNG fallback) in the `car-photos`
  bucket (PUBLIC); URL saved to `cars.garage_photo_url`.
  Path: `{userId}/{carId}/garage-{ts}.webp` (or `.png`). Cars uploaded before
  2026-07 are full-res (1600px) PNGs until re-uploaded.
- WebP/PNG, not JPEG: a background-removed cutout needs an alpha channel. This
  is the one deliberate exception to the project's "always JPEG" photo rule.
- Dependencies added: `@huggingface/transformers`, `heic-to`.
- Deleted the orphaned, unrouted `src/pages/GarageCarsNewPage.tsx`.

### Works today

Photo upload via the Add Car flow; HEIC photos; RMBG-1.4 background removal
(quality is good); residue cleanup + trim; PNG upload; carousel shows
`garage_photo_url` (falling back to the Silvia placeholder).

### Known issues / watch-outs

- **Details-modal photo update** — the user reported updating the photo via the
  car Details modal "looks pretty much the same" / may not take effect. Verify
  the `saveDetails` photo path (`detailsPhotoBlob` → `uploadGaragePhoto` →
  `update garage_photo_url`) actually runs and persists.
- **PWA service worker** can serve a stale build after a deploy — if a change
  "doesn't take," test in an incognito window or clear site data.
- The shadow + reflection — see section 3.

### Branch / deploy

- Branch: `claude/add-car-image-upload-3XHcJ`, merged to `main`.
- Deploy: push to `main`; Vercel auto-deploys. Test on an iPhone.

---

## 3. The open problem — shadow & reflection

`CarStage` in `GarageCarsPage.tsx` renders, beneath the car cutout:
- a **reflection** via CSS `-webkit-box-reflect` (a straight vertical flip), and
- a **shadow** as blackened, vertically-squashed copies of the cutout.

Both mirror/squash the car across a **horizontal line**. That treats the car as
a flat 2D object. It is only correct for a perfectly side-on photo.

Real car photos are 3D cars shot in perspective — almost always a **3/4 view**.
The car sits on a **ground plane that recedes into the image**: the front wheels
are low, the rear wheels are higher. Consequently a horizontal flip/squash:
- connects at the front (the lowest point), but
- leaves a visible **gap at the rear wheel**, and
- looks like a 2D cardboard cutout being mirrored — not a car on a floor.

**Requirement:** the shadow and reflection must look planted and connected along
the car's whole contact line, **reliably, for any uploaded angle** (3/4 from
either side, near-side-on, front-on…). The user's words: "extremely reliable."

### Candidate approaches for the next session

- **A. Estimate the ground line from the silhouette.** The cutout's bottom edge
  (lowest opaque pixel per column) traces the car's underside; the front and
  rear tire contacts are its local low points. Fit a line through them — that is
  the ground contact line, slanted for a 3/4 view. Render the reflection/shadow
  transformed onto that slanted line (reflection across an arbitrary line ≈ flip
  + shear/rotate). Degrades correctly: a side-on shot → horizontal line → normal
  flip. Best computed at processing time (full pixel access in
  `backgroundRemoval.ts`; `trimToBlob` already does bounding-box silhouette
  analysis to extend). Store the line geometry (two points / an angle) — e.g. a
  new small column on `cars` — for the carousel to render with.
- **B. Per-column reflection** across each column's local contact y. Accurate to
  the silhouette but can look wobbly; doesn't handle a hidden far wheel.
- **C. Manual anchor at upload.** After background removal, let the user drag a
  ground line / two contact points on the cutout. Bulletproof (zero guessing);
  costs one extra step in the upload flow.
- **D. Bake it at processing time.** Do the analysis and composite the shadow +
  reflection onto the stored PNG during processing (canvas, full pixel access).
  The carousel then displays a finished image — no fragile CSS. Most robust to
  render; baked-in (re-process to retune).

**Recommendation:** compute the ground contact line from the silhouette at
processing time (A), then either bake the shadow+reflection (D) or store the
line geometry and render with it. Keep C (manual) as the fallback if
auto-estimation proves unreliable. Whatever is chosen must degrade gracefully
for non-3/4 angles.

---

## 4. Prompt for the next Claude Code session

> The car carousel in G-Dimension (a React + Vite + Supabase PWA) shows an
> uploaded car photo with its background removed. **The background removal is
> done and works well — do not change the model or removal logic in
> `src/lib/backgroundRemoval.ts`.**
>
> The problem is the **drop shadow and reflection** rendered under the car by
> the `CarStage` component in `src/pages/GarageCarsPage.tsx`. They are currently
> a flat vertical flip/squash of the cutout (`-webkit-box-reflect` + blackened,
> squashed `<img>` layers), which treats the car as a flat 2D object. Car photos
> are 3D cars shot in perspective — almost always a 3/4 view — so the car sits
> on a ground plane that recedes into the image (front wheels low, rear wheels
> higher). A flat horizontal flip/squash connects at the front but leaves a
> visible gap at the rear wheel and looks unnatural.
>
> Make the shadow and reflection look **planted and connected along the car's
> whole contact line, reliably, for any uploaded photo angle.**
>
> First read `CAR_PHOTO_HANDOFF.md` (this file) — section 3 has the full problem
> analysis and four candidate approaches with a recommendation. The background-
> removal pipeline produces a clean transparent PNG cutout; `trimToBlob()` in
> `backgroundRemoval.ts` already does bounding-box silhouette analysis you can
> extend to extract the bottom contour / ground line.
>
> Also verify the Details-modal photo-update path noted in section 2.
>
> Follow the project conventions in `CLAUDE.md` and `MASTER_ARCHITECTURE.md`:
> no component libraries, inline styles, design tokens from `src/tokens`,
> `border-radius: 0` on architectural elements, etc. Deploy by pushing to `main`
> (Vercel auto-deploys). Test on an iPhone.
