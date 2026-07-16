// ============================================================
// G-Dimension Design Tokens
// Source of truth: MASTER_ARCHITECTURE.md Parts 3–8
// ============================================================

// ------------------------------------------------------------
// PART 3 — COLOR TOKENS
// ------------------------------------------------------------

// Brand — maroon burgundy, badge + primary brand color
export const COLOR_BRAND        = '#780E12';
export const COLOR_BRAND_LIGHT  = '#8e1016'; // lighter variant
export const COLOR_BRAND_DARK   = '#4a0a0c'; // darker variant

// Accent — the ONLY warm color in the UI.
// Used sparingly: stat values, active states, focal highlights,
// warm lighting, CTA actions, notification dots.
export const COLOR_ACCENT       = '#c8661a'; // burnt orange — primary accent
export const COLOR_ACCENT_DIM   = '#8a4810'; // hover / pressed states
export const COLOR_ACCENT_TEXT  = '#fff5dc'; // cream text on amber backgrounds

// Header
export const COLOR_HEADER_BLACK = '#111111'; // dark center of the header bar
export const COLOR_HEADER_WARM  = '#f0e4c8'; // username, back buttons, secondary header text
export const COLOR_HEADER_TITLE = '#ffffff'; // main header title text (pure white permitted here)

// Burgundy — header wedge shapes (left, mid, right gradient)
export const COLOR_BURGUNDY_L   = '#6e281e';
export const COLOR_BURGUNDY_M   = '#4a1410';
export const COLOR_BURGUNDY_R   = '#2a0a06';

// Dark UI
export const COLOR_CAVITY_BG    = '#050507'; // garage interior darkness
export const GRADIENT_APP_BG    = 'radial-gradient(ellipse at center, #202224 0%, #050505 100%)';

// Panel — concrete inputs and stat panels
export const COLOR_PANEL_LIGHT    = '#e6e6e8';
export const COLOR_PANEL_MID      = '#d8d8da';
export const COLOR_PANEL_DARK     = '#c4c4c6';
export const COLOR_PANEL_LINE     = '#6a6a6c'; // bottom border on panel inputs
export const GRADIENT_PANEL       = 'linear-gradient(180deg, #e6e6e8 0%, #d8d8da 45%, #c4c4c6 100%)';
export const COLOR_PANEL_TEXT     = '#2a2a2c'; // dark text on light concrete panels

// Cool World — Home map surface, GT4 blue filter
export const COLOR_WORLD_HORIZON  = '#d4dce2';
export const COLOR_WORLD_MID      = '#a8b2ba';
export const COLOR_WORLD_LOW      = '#6a737a';
export const COLOR_WORLD_FLOOR    = '#3a4248';

// Text — never pure white in body; cap at #f5f5f5
export const COLOR_TEXT_PRIMARY   = '#f5f5f5';
export const COLOR_TEXT_SECONDARY = '#8a8a8c';
export const COLOR_TEXT_MUTED     = '#3f3f46';
export const COLOR_TEXT_BLACK     = '#000000'; // dark text on concrete panels

// Status / validation — inline feedback (username availability, form errors)
export const COLOR_SUCCESS        = '#7bbf6a'; // valid / available / OK green
export const COLOR_ERROR          = '#d27a5e'; // invalid / taken / error salmon

// ------------------------------------------------------------
// PART 4 — TYPOGRAPHY
// ------------------------------------------------------------

// UI font — used for all labels, buttons, nav, body, forms
export const FONT_UI    = "'Hanken Grotesk', 'Helvetica Neue', Helvetica, Arial, sans-serif";

// Display font — used sparingly for chapter/hero moments only
// (Home title watermark, screen headings like "Hiroshi's Garage", hero taglines)
export const FONT_TITLE = "'Cormorant Garamond', 'Garamond', serif";

// Parts Bin only — handwritten aesthetic
export const FONT_HANDWRITTEN = "'Caveat', cursive";           // part names, body text
export const FONT_STAMP       = "'Permanent Marker', cursive"; // headers, stamps

// Featured (magazine) island ONLY — its own aesthetic, like Parts Bin.
// Tuner-mag type: heavy condensed masthead + condensed deck. Not used elsewhere.
export const FONT_MASTHEAD = "'Anton', 'Hanken Grotesk', sans-serif";  // G-DIMENSION masthead + big cover headlines
export const FONT_DECK     = "'Oswald', 'Hanken Grotesk', sans-serif"; // cover-lines, decks, kickers, spec labels

// Google Fonts import string (add to index.html <head>)
// @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@1,500;1,600&family=Hanken+Grotesk:wght@400;500;600;700;800;900&family=Caveat:wght@400;500;600;700&family=Permanent+Marker&display=swap');

// ------------------------------------------------------------
// PART 5 — SPACING & SIZING SCALE
// ------------------------------------------------------------

export const SPACE_HAIRLINE = 2;   // hairline border, tight padding
export const SPACE_XS       = 4;   // sub-element margin
export const SPACE_SM_ICON  = 6;   // icon-to-label gap (small)
export const SPACE_SM       = 8;   // standard gap
export const SPACE_CARD     = 10;  // card inner padding
export const SPACE_HEADER_X = 12;  // header horizontal padding
export const SPACE_MD       = 16;  // screen edge padding (standard)
export const SPACE_ICON_LG  = 18;  // row gap in icon grids
export const SPACE_ICON_LBL = 22;  // icon-to-label spacing (large contexts)
export const SPACE_LG       = 24;  // section spacing
export const SPACE_XL       = 32;  // major visual separation
export const SPACE_TAP      = 44;  // minimum tappable / header height

// Phone canvas — all screens sized to iPhone 14/15 Pro
export const CANVAS_W = 390;
export const CANVAS_H = 844;

// Icon wrapper sizes
export const ICON_WRAPPER_STANDARD = 86; // standard destination node
export const ICON_WRAPPER_FOCAL    = 120; // HOME destination on Home map
export const ICON_WRAPPER_GRID     = 56;  // Garage dashboard grid icons (base)
export const ICON_WRAPPER_GRID_H   = 44;  // cast shadow height reference

// ------------------------------------------------------------
// PART 6 — SHADOWS
// ------------------------------------------------------------

// Standard drop shadow on skeuomorphic icons
export const SHADOW_ICON_STANDARD = 'drop-shadow(0 5px 8px rgba(0, 0, 0, 0.55))';

// Heavier drop shadow for focal/featured elements
export const SHADOW_ICON_FOCAL    = 'drop-shadow(0 6px 10px rgba(0, 0, 0, 0.55))';

// Amber glow — focal HOME destination radial halo on Home map
export const SHADOW_AMBER_HALO    = 'radial-gradient(circle at center, rgba(200, 102, 26, 0.12) 0%, transparent 65%)';

// Phone container shadow (prototypes / marketing mockup)
export const SHADOW_PHONE         = '0 50px 100px -10px rgba(0, 0, 0, 0.85), 0 0 0 1px #2a2a2c';

// Ground shadow under icon (soft ellipse blur)
export const SHADOW_GROUND        = 'radial-gradient(ellipse at center, rgba(0, 0, 0, 0.55) 0%, transparent 70%)';

// Skeuomorphic cast shadow — Garage dashboard grid ONLY (not Home map)
// 22.5° rotation + skewX + blur + 0.42 opacity = real cast shadow. Values are non-negotiable.
export const CAST_SHADOW_ROTATE_ODD  = 'translate(-50%, -50%) rotate(22.5deg) skewX(-14deg)';
export const CAST_SHADOW_ROTATE_EVEN = 'translate(-50%, -50%) rotate(-22.5deg) skewX(14deg)';
export const CAST_SHADOW_OPACITY     = 0.42;
export const CAST_SHADOW_BLUR        = '1.4px';

// Header cast shadow gradient (Home map only)
export const GRADIENT_HEADER_SHADOW =
  'linear-gradient(180deg, rgba(0,0,0,0.60) 0%, rgba(0,0,0,0.38) 35%, rgba(0,0,0,0.18) 65%, rgba(0,0,0,0.05) 85%, transparent 100%)';

// ------------------------------------------------------------
// PART 7 — ANIMATION TOKENS
// ------------------------------------------------------------

// Standard transition
export const TRANSITION_STANDARD = '200ms ease-out';

// Entry/settle — bouncy deceleration (use in cubic-bezier())
export const EASING_SETTLE = 'cubic-bezier(0.22, 1, 0.36, 1)';

// Press feedback scale values
export const SCALE_PRESS_DEFAULT = 0.95; // most interactive elements
export const SCALE_PRESS_EMPHASIS = 0.92; // emphasis press (heavier tap)
export const SCALE_PRESS_SUBTLE   = 0.97; // subtle press

// Stagger delay formula for grid reveals: 80 + index * 60 ms
export const STAGGER_BASE_MS  = 80;
export const STAGGER_STEP_MS  = 60;

// Keyframe definitions (reference names for CSS / styled usage)
// doorSettle:   translateY(-16px) opacity:0 → translateY(0) opacity:1
// carAppear:    opacity:0 → opacity:1
// iconFadeIn:   opacity:0 translateY(6px) → opacity:1 translateY(0)
// pulse:        opacity 1→0.4→1
// garagePulse:  HOME focal halo: opacity 0.5 scale(1) → opacity 1 scale(1.06)

// ------------------------------------------------------------
// PART 8 — BORDER & SHAPE RULES
// ------------------------------------------------------------

// NO border-radius on architectural elements.
// Headers, stat panels, input fields, nav cards, concrete panels — all sharp (0).
export const RADIUS_NONE         = 0;

// Permitted radius contexts only:
export const RADIUS_PILL         = '9999px'; // full pill — use height/2 in practice
export const RADIUS_BUTTON       = 10;       // rounded-rectangle buttons — the PREFERRED button shape (anti-app). Pills are legacy/sparingly used.
export const RADIUS_BOTTOM_SHEET = 12;       // bottom sheet top corners
export const RADIUS_AVATAR       = '50%';    // avatars
export const RADIUS_DOT          = '50%';    // notification dots
export const RADIUS_BADGE        = 2;        // tiny accent badges

// Focal HOME destination underline accent (Part 9)
export const FOCAL_UNDERLINE_W   = 22; // px wide
export const FOCAL_UNDERLINE_H   = 2;  // px tall

// Header wedge SVG paths (390×44 canvas — Part 9)
export const HEADER_WEDGE_LEFT  = 'M 0 0 L 180 0 L 200 44 L 0 44 Z';
export const HEADER_WEDGE_RIGHT = 'M 390 0 L 230 0 L 210 44 L 390 44 Z';
export const HEADER_HEIGHT      = 44;

// Home map destination coordinates (center-anchored via translate(-50%,-50%)) — Part 10
// The ROAD_* bezier endpoints in HomePage.tsx must terminate EXACTLY at these
// centers — the map SVG stretches non-uniformly, so any offset becomes a
// visible road break on tall screens.
export const MAP_NODE_HOME        = { left: 195, top: 220 };
export const MAP_NODE_TUNING      = { left: 295, top: 428 };
export const MAP_NODE_TIMELINE    = { left: 95,  top: 428 };
export const MAP_NODE_MAINTENANCE = { left: 270, top: 625 };
export const MAP_NODE_PHOTOS      = { left: 120, top: 625 };

// Timeline card border-radius — the ONE exception to RADIUS_NONE rule (Part 8)
export const RADIUS_TIMELINE_CARD = 4;

// ------------------------------------------------------------
// PARTS BIN COLOR TOKENS — cardboard / kraft paper palette
// ------------------------------------------------------------

export const COLOR_CARDBOARD_BG     = '#c4a26a'; // kraft tan base
export const COLOR_CARDBOARD_DARK   = '#c9a96e'; // slightly lighter kraft (section areas)
export const COLOR_CARDBOARD_INK    = '#1a1008'; // near-black warm — primary text
export const COLOR_CARDBOARD_INK2   = '#3d2810'; // secondary ink — muted text
export const COLOR_CARDBOARD_STAMP  = '#8b3a0a'; // dark amber — stamp/accent color

// ------------------------------------------------------------
// PART 3 ADDENDUM — TIMELINE COLOR TOKENS
// ------------------------------------------------------------
// Timeline is the only light destination — warm parchment palette.

export const COLOR_TIMELINE_BG       = '#f5f2ee'; // warm off-white page background
export const COLOR_TIMELINE_CARD     = '#faf8f5'; // cards lift slightly off the bg
export const COLOR_TIMELINE_TEXT     = '#1a1814'; // near-black warm — primary text
export const COLOR_TIMELINE_MUTED    = '#8a8278'; // secondary text, dates
export const COLOR_TIMELINE_YEAR     = '#c8b89a'; // warm sand — year marker text
export const COLOR_TIMELINE_RULE     = '#e0d8ce'; // year divider lines
export const COLOR_TIMELINE_CHEVRON  = '#c8a050'; // amber-gold — back navigation

// Timeline card accent stripes (3px left border by entry type)
export const COLOR_TIMELINE_MOD      = '#c8c4bc'; // warm stone grey — modification entries
export const COLOR_TIMELINE_SERVICE  = '#d4b86a'; // soft warm gold — maintenance/service entries
export const COLOR_TIMELINE_DETAIL   = '#8ab0c8'; // muted cool blue — detailing entries
export const COLOR_TIMELINE_NOTE     = COLOR_BRAND; // brand burgundy — free-form personal entries ("Entry")

// Detailing (Car Wash) aesthetic — dark UI on a light-blue page; pairs with COLOR_TIMELINE_DETAIL
export const COLOR_DETAIL_BG      = '#f4f8fb';          // light blue page background
export const COLOR_DETAIL_INK     = '#111827';          // near-black slate — primary text
export const COLOR_DETAIL_INK_DIM = 'rgba(0,0,0,0.40)'; // muted secondary text
export const COLOR_DETAIL_RULE    = 'rgba(0,0,0,0.07)'; // hairline dividers
