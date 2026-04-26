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

// ------------------------------------------------------------
// PART 4 — TYPOGRAPHY
// ------------------------------------------------------------

// UI font — used for all labels, buttons, nav, body, forms
export const FONT_UI    = "'Hanken Grotesk', 'Helvetica Neue', Helvetica, Arial, sans-serif";

// Display font — used sparingly for chapter/hero moments only
// (Home title watermark, screen headings like "Hiroshi's Garage", hero taglines)
export const FONT_TITLE = "'Cormorant Garamond', 'Garamond', serif";

// Google Fonts import string (add to index.html <head>)
// @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@1,500;1,600&family=Hanken+Grotesk:wght@400;500;600;700;800;900&display=swap');

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

// Stagger delay formula for grid reveals: 400 + index * 70 ms
export const STAGGER_BASE_MS  = 400;
export const STAGGER_STEP_MS  = 70;

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
export const MAP_NODE_HOME        = { left: 195, top: 220 };
export const MAP_NODE_TUNING      = { left: 295, top: 405 };
export const MAP_NODE_TIMELINE    = { left: 95,  top: 405 };
export const MAP_NODE_MAINTENANCE = { left: 270, top: 625 };
export const MAP_NODE_PHOTOS      = { left: 120, top: 625 };
