# G-Dimension — Auth & Transactional Email Setup

**Status: Email/Password + Google OAuth are LIVE in production (confirmed working
end-to-end 2026-07-01).** Apple OAuth is NOT set up — deferred until an actual
App Store submission (native app scope only; not needed for the web PWA).

This file records the **actual configuration**, including the exact gotchas hit
setting it up, so a future session doesn't have to rediscover them. It replaces
an earlier draft that documented planned/aspirational settings rather than what
was actually built — if anything here looks inconsistent with the live
dashboards, trust the dashboards and fix this file, not the other way around.

---

## 1. Email / Password

**Supabase Dashboard → Authentication → Providers → Email**

| Setting | Value |
|---|---|
| Enable Email Provider | ON |
| Confirm Email | ON |
| Minimum Password Length | 8 (enforced client-side too, see `SignupPage.tsx`) |

Signup flow (`SignupPage.tsx`): `supabase.auth.signUp()` with
`emailRedirectTo: ${origin}/auth/callback`. On success the page shows a
"Check your email" screen (`confirmed` state) — it does **not** auto-navigate.
Clicking the emailed confirmation link lands the user on the public
`/auth/callback` route (`AuthCallbackPage.tsx`), which waits for supabase-js to
establish the session from the URL, then routes to `/welcome` (new account) or
`/home` (existing). This two-step redirect (never straight to a protected
route) is deliberate — it avoids a race where `ProtectedRoute`'s auth gate
evaluates before the session token has been parsed out of the URL.

### Custom SMTP — Resend

Supabase's built-in email sender has very low rate limits and poor
deliverability (generic shared sending domain) — not viable at any real signup
volume. Production sends go through **Resend** instead.

- **Resend account:** a **dedicated** account signed up under `hi@gdimension.app`
  — intentionally separate from the Resend account used by the other
  (prokaiwa) site, because Resend's free tier only allows **one verified
  domain per account** (a second domain requires the $20/mo Pro plan). Two
  free accounts costs nothing; one paid account would.
- **Domain:** `gdimension.app`, verified via DNS records added in Namecheap →
  Advanced DNS:
  - `TXT` @ `resend._domainkey` — DKIM public key
  - `MX` @ `send` → `feedback-smtp.us-east-1.amazonses.com` (priority 10)
  - `TXT` @ `send` → `v=spf1 include:amazonses.com ~all`
  - Region: **US** (chosen for the audience — the app is US-facing — not the
    operator's own location).
- **API key:** scoped to **Sending access only**, restricted to the
  `gdimension.app` domain only (not "all domains") — least-privilege, so a
  leaked key can't send from the other site's domain or do anything but send
  mail.
- **Supabase SMTP settings** (Dashboard → Authentication → Settings → SMTP):
  | Field | Value |
  |---|---|
  | Sender email | `noreply@gdimension.app` |
  | Sender name | `G-Dimension` |
  | Host | `smtp.resend.com` |
  | Port | `465` |
  | Username | `resend` |
  | Password | the Resend API key (not committed anywhere — Resend dashboard is the source of truth) |
  | Minimum interval per user | `60` seconds (default — per-user resend cooldown, not touched) |
  | Hourly send cap | Supabase auto-raises this to 30/hour once custom SMTP is enabled (separate from Resend's own 100/day, 3,000/month free-tier caps). Adjustable later in the same settings page if signup volume ever grows enough to need it. |

### Email templates

The Confirm Signup template is branded (dark red header w/ G-mark logo, warm
cream body, dark footer) and lives as a **reference copy** at
`supabase/email-templates/confirm-signup.html` — **Supabase's dashboard is
still the actual source of truth**; this file is just so the HTML is
version-controlled and diffable. If you edit the template in Supabase, copy
the change back into this file too.

The header logo is `public/email-logo-g.png` (240×240, transparent background,
cropped from `src/assets/logo/gdimensionG.webp`) — referenced by its **absolute
public URL** `https://gdimension.app/email-logo-g.png`, since email clients
fetch images over the network and can't reach anything bundled in the app.

---

## 2. Google OAuth

**Fully configured and published to Production** (not stuck in Testing /
the 100-test-user cap). Branding is verified; data-access verification was
**not required** because the app only requests the default non-sensitive
scopes (`email`, `profile`, `openid`) — no video review, no manual security
audit.

### Google Cloud Console

- **OAuth consent screen** → Audience: **External** (Internal is
  Workspace-only and doesn't apply — there's no Google Workspace here, see
  below).
- **Support email:** a dedicated **Google Group**,
  `gdimension-support@googlegroups.com` — required because the personal Gmail
  signed into the Cloud Console (`prokaiwa.english@gmail.com`) was the *only*
  option Google's support-email dropdown otherwise offers, and `hi@gdimension.app`
  can't be selected directly since it's an **ImprovMX forwarding alias**, not a
  real Google Workspace mailbox (there is no Workspace for gdimension.app).
  The group is locked down (private / invite-only / members-only, per the
  privacy settings), owned by `prokaiwa.english@gmail.com`, with
  `hi@gdimension.app` added as a member so any stray mail sent to the group
  still reaches a real inbox. **To switch to a "real" branded
  `support@gdimension.app` later:** buying Google Workspace and flipping the
  consent-screen support-email dropdown to the new mailbox is a single-field
  change — no re-verification, no Supabase changes, no user impact.
- **Developer contact info:** `hi@gdimension.app` (this field is a plain email
  input, unlike Support email — no Google Account/Group required for it).
- **App domain:** home page `https://gdimension.app`, privacy policy
  `https://gdimension.app/privacy`, terms `https://gdimension.app/terms`,
  authorized domain `gdimension.app`.
- **App logo:** a proper square 512×512 crop (white background, per Google's
  upload requirement), saved at `src/assets/logo/gdimension-square-icon.png`.
  Uploading a logo is what triggers Google's **branding verification**
  requirement (separate from scope/data-access verification) — this was
  completed and is green ("Branding status: verified").
- **OAuth Client ID** (Credentials → Create Credentials → OAuth client ID):
  - Type: **Web application**
  - Authorized JavaScript origins: `https://gdimension.app`
  - Authorized redirect URI: `https://uxqoernfrtgclpneirvc.supabase.co/auth/v1/callback`
    — this is always **Supabase's own callback endpoint**, never the app's
    `/auth/callback` route directly. Supabase handles the token exchange, then
    forwards the browser to whatever `redirectTo` the app requested.
  - This client type stays correct even if the PWA is later wrapped for app
    stores (Capacitor, TWA, etc.) — those still open the same web-based
    redirect flow through `gdimension.app`. A *native* Google Sign-In SDK
    integration (bypassing Supabase's redirect flow entirely) would need an
    additional iOS/Android-type client — additive, not a replacement.

### Supabase settings (Providers → Google)

- Client ID / Client Secret: pasted from the Google Cloud credential above.
- **Skip nonce checks:** OFF (this is a native-SDK-only option; the app uses
  the standard web redirect flow, which handles nonces properly).
- **Allow users without an email:** OFF (Google always returns an email with
  the default scopes requested; no provider edge case to guard against).

`LoginPage.tsx` / `SignupPage.tsx`:
```ts
await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: { redirectTo: `${window.location.origin}/auth/callback` },
})
```

---

## 3. Site URL & Redirect URLs

**Supabase Dashboard → Authentication → URL Configuration**

| Setting | Value |
|---|---|
| Site URL | `https://gdimension.app` |
| Redirect URLs | `https://gdimension.app/**`, `https://gdimension.app/auth/callback`, `https://www.gdimension.app/**`, `http://localhost:5173/**`, `http://localhost:5173/auth/callback` |

**The `www` entry matters — don't remove it.** See the domain-canonicalization
gotcha below for why both host variants need to be listed even though `www`
now permanently redirects to the apex at the Vercel layer; belt-and-suspenders
against any future edge case that reaches Supabase's auth server before that
redirect fires.

---

## 4. Domain canonicalization — a real incident, read before touching `vercel.json` or Vercel Domains

**What broke:** Vercel had both `gdimension.app` and `www.gdimension.app`
attached to the project, with **`www` marked as Production** and the apex
307-redirecting to it. Every canonical/SEO reference already in this codebase
(`sitemap.xml`, `index.html`'s `<link rel="canonical">` + OG tags,
`legalMeta.ts`, `marketing.html`) hardcodes the **bare apex domain** — so this
was backwards relative to what the rest of the app assumes.

**Symptom:** a user who ended up on `www.gdimension.app` (browsers commonly
auto-prepend `www` when a bare domain is typed, or an old bookmark had it) and
then went through Google OAuth or an email-confirmation link got a
`redirectTo`/`emailRedirectTo` of `https://www.gdimension.app/auth/callback`.
At the time, Supabase's Redirect URL allowlist only had apex-only entries, so
the `www` origin didn't match anything, and the browser ended up stranded at
`https://www.gdimension.app/#access_token=...` — the **root** of `www`, never
reaching `/auth/callback`. The app's `RootRedirect` component then bounced
that bare root out to the static marketing page via `window.location.replace('/')`,
silently dropping the token. Net effect: signup/login appeared to "just go
back to the landing page" instead of into the app.

**The fix that was applied (in this order):**
1. **Vercel Dashboard → Project → Settings → Domains** — reassigned which
   domain is Production: `gdimension.app` is now Production, and
   `www.gdimension.app` is a **308 permanent redirect** to `gdimension.app`.
   This matches every other canonical assumption already in the codebase.
2. Added `https://www.gdimension.app/**` to Supabase's Redirect URL allowlist
   too, as a safety net.

**A wrong fix that was tried and reverted:** adding a `www`→apex redirect rule
directly inside `vercel.json` (matching on the `Host` header). This caused an
**infinite redirect loop** (`ERR_TOO_MANY_REDIRECTS`, whole site down) because
it fought against Vercel's own domain-level redirect running in the *opposite*
direction at the time (`apex → www`). Two redirects pointing at each other in
opposite directions = an infinite bounce.

**Rule going forward: domain canonicalization lives in exactly one place — the
Vercel Domains dashboard — never duplicated as a host-matching rule in
`vercel.json`.** If `www` ever needs adjusting again, change it at the Vercel
Domains level only.

---

## 5. Apple OAuth (NOT set up — future, App Store only)

Deferred until an actual native app / App Store submission. Apple Sign In is
mandatory for any iOS app offering third-party social login, but the current
G-Dimension surface is a web PWA, so this isn't blocking anything today.
When it's time:

1. `developer.apple.com` → Certificates, Identifiers & Profiles
2. Register an App ID with **Sign In with Apple** enabled
3. Create a **Services ID**, configure it with the primary App ID, the
   `gdimension.app` domain, and a return URL of
   `https://uxqoernfrtgclpneirvc.supabase.co/auth/v1/callback`
4. Create a Sign In with Apple key, download the `.p8` file
5. Supabase → Authentication → Providers → Apple: Service ID, Team ID, Key ID,
   and the `.p8` key contents

---

## 6. `public.users` ↔ `auth.users` sync

Unchanged from the original build — handled by the `on_auth_user_created`
trigger on `auth.users` calling `handle_new_user()` (see `001_users.sql`,
hardened against username collisions by migrations `038` and `042`). Every new
`auth.users` row (email signup, Google OAuth, or otherwise) gets a matching
`public.users` row automatically — no app code involved.

New users start with `users.username_set = false` and are routed through
`/welcome` (`WelcomePage.tsx`) to claim a real handle before ever reaching
`/home` — see the `useAuthGate` / `ProtectedRoute` / `WelcomeRoute` logic in
`src/App.tsx` for the actual gating implementation (not reproduced here to
avoid this doc drifting out of sync with the real code again).

---

## 7. Client setup (`src/lib/supabase.ts`)

```ts
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)
```

`.env.local` (not committed): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
The service role key is never used in the frontend — only in server-side
import scripts.

---

## 8. Checklist

- [x] Email/Password provider enabled, confirm email ON
- [x] Custom SMTP (Resend) connected, branded template live
- [x] Google OAuth configured, published to Production, branding verified
- [x] Site URL + Redirect URLs set (apex **and** www, plus localhost)
- [x] Domain canonicalization fixed at the Vercel Domains level
- [x] `handle_new_user` trigger verified working (real signups create
      `public.users` rows, land on `/welcome`, claim a handle, reach `/home`)
- [ ] Apple OAuth (deferred — App Store submission only)
- [ ] RLS policies re-verified for the auth surface specifically (general RLS
      is covered elsewhere; not re-audited as part of this auth setup pass)
