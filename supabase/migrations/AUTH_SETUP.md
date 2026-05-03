# G-DIMENSION — Supabase Auth Configuration

## Overview

G-Dimension uses Supabase Auth with three providers:
1. Email/Password (primary)
2. Google OAuth
3. Apple OAuth (required for App Store launch)

The `auth.users` table is managed entirely by Supabase. Our `public.users` table
is created automatically via a `BEFORE INSERT` trigger on `auth.users` (see
`001_users.sql`). The user never sees two separate "auth user" and "profile" 
concepts — it's seamless.

---

## 1. Email / Password

**Supabase Dashboard → Authentication → Providers → Email**

| Setting | Value |
|---|---|
| Enable Email Provider | ON |
| Confirm Email | ON (strongly recommended — no disposable accounts) |
| Secure Email Change | ON |
| Minimum Password Length | 8 |
| Passwordless / Magic Link | OFF (for now — add in future if needed) |

**Email templates** (Dashboard → Auth → Email Templates):

Customize the Confirm Signup and Reset Password emails to match the G-Dimension brand:
- Subject: `Confirm your G-Dimension account`
- From name: `G-Dimension`
- From email: `hi@gdimension.app` (ImprovMX forwards to your inbox)

---

## 2. Google OAuth

**Supabase Dashboard → Authentication → Providers → Google**

### Google Cloud Console Setup
1. Go to `console.cloud.google.com`
2. Create project: `G-Dimension`
3. Enable: `Google+ API` and `Google Identity`
4. OAuth Consent Screen:
   - App name: `G-Dimension`
   - User support email: `hi@gdimension.app`
   - Authorized domains: `gdimension.app`, `supabase.co`
   - Scopes: `email`, `profile`, `openid`
5. Create OAuth 2.0 Client ID:
   - Application type: Web application
   - Authorized redirect URIs:
     ```
     https://<your-supabase-project>.supabase.co/auth/v1/callback
     ```

### Supabase Settings
- Client ID: (from Google Cloud Console)
- Client Secret: (from Google Cloud Console)
- Enable: ON

### Redirect URL after login
```
https://gdimension.app/home
```

---

## 3. Apple OAuth (required for App Store)

**Supabase Dashboard → Authentication → Providers → Apple**

Apple Sign In is mandatory for any iOS app that offers third-party social login.
Even though payments are deferred, Apple Sign In must be ready for App Store review.

### Apple Developer Console Setup
1. Go to `developer.apple.com`
2. Certificates, Identifiers & Profiles → Identifiers
3. Register App ID: `app.gdimension.app`
   - Enable: Sign In with Apple
4. Create Services ID: `app.gdimension.service`
   - Description: `G-Dimension`
   - Identifier: `app.gdimension.service`
   - Configure Sign In with Apple:
     - Primary App ID: `app.gdimension.app`
     - Domains: `gdimension.app`
     - Return URLs:
       ```
       https://<your-supabase-project>.supabase.co/auth/v1/callback
       ```
5. Create Key with Sign In with Apple capability → download `.p8` file

### Supabase Settings
- Service ID: `app.gdimension.service`
- Apple Team ID: (from developer.apple.com Account page)
- Key ID: (from the key created above)
- Private Key: (contents of the `.p8` file)

---

## 4. Redirect URLs

### Configure in Supabase Dashboard → Auth → URL Configuration

**Site URL:**
```
https://gdimension.app
```

**Additional Redirect URLs (all must be explicitly listed):**
```
https://gdimension.app/home
https://gdimension.app/auth/callback
http://localhost:5173/home
http://localhost:5173/auth/callback
```

The `localhost` entries are for local development with Vite.

### PWA Auth Flow
Since this is a PWA (no custom URL scheme), OAuth redirects use the web flow:
1. User taps "Continue with Google"
2. Redirect to Google OAuth page
3. Google redirects to Supabase callback
4. Supabase redirects to `https://gdimension.app/auth/callback`
5. App reads the session from URL hash/params and stores it
6. Redirect to `/home`

### Native App Auth Flow (future)
When the native app launches, the redirect scheme will be:
```
gdimension://auth/callback
```
This must be added to both the Supabase redirect URL allowlist and the
Google/Apple OAuth console configurations at that time.

---

## 5. `public.users` ↔ `auth.users` Sync

The sync is handled by the trigger in `001_users.sql`:

```sql
-- Fires on every new auth.users row (signup, OAuth, magic link)
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

### What `handle_new_user()` does:
1. Inserts a `public.users` row with the same `id` as `auth.users`
2. Sets `email` from `auth.users.email`
3. Sets `username` to a sanitized version of the email prefix (editable post-signup)
4. Sets `display_name` from OAuth metadata if available (`full_name` or `name`)
5. Uses `ON CONFLICT (id) DO NOTHING` so re-triggering is safe

### Post-Signup Username Setup
Because default usernames are email-derived (e.g. `johnsmith94` from `johnsmith94@gmail.com`),
users should be prompted to set a real username on first login. Implement this as:
- A bottom sheet on first `/home` visit if `username` matches email-pattern regex
- Store completion in `localStorage.setItem('gd.onboarding.usernameSet', 'true')`

### Email vs OAuth Account Merging
Supabase does NOT auto-merge accounts with the same email across providers.
A user who signs up with email then tries Google OAuth with the same email
will get a separate account (or an error, depending on settings).

**Recommendation:** Enable "Link accounts" in Supabase when available, OR
use email-based identity as the canonical anchor and require users to set
a password to link accounts. Decision needed before launch.

---

## 6. Session Configuration

**Dashboard → Auth → Sessions**

| Setting | Value | Reason |
|---|---|---|
| JWT Expiry | 3600s (1 hour) | Standard — refreshed automatically by Supabase client |
| Refresh Token Rotation | ON | Security best practice |
| Refresh Token Reuse Interval | 10 seconds | Small window for race conditions |
| Inactivity Timeout | OFF | Car journal apps are used infrequently — don't force re-login after a month away |

---

## 7. Client Setup (`src/lib/supabase.js`)

```javascript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Auto-refresh tokens in the background
    autoRefreshToken: true,
    // Persist session across page reloads (localStorage)
    persistSession: true,
    // Detect session from URL hash (for OAuth redirects)
    detectSessionInUrl: true,
  }
})
```

**Environment variables (`.env.local` — never commit):**
```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-public-key>
```

The service role key (`SUPABASE_SERVICE_ROLE_KEY`) is ONLY used in:
- NHTSA import scripts (Node.js server-side)
- Admin Edge Functions
- Never in the React frontend

---

## 8. Auth Route Guard

All routes except `/`, `/login`, `/signup`, and `/builds/:username` require
authentication. Implement as a `<ProtectedRoute>` wrapper:

```jsx
// src/components/ProtectedRoute.jsx
import { useAuth } from '../hooks/useAuth'
import { Navigate } from 'react-router-dom'

export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  return children
}
```

`/builds/:username` is explicitly public (Part 18: "the only non-authenticated route").

---

## 9. Checklist Before Launch

- [ ] Email confirmation enabled
- [ ] Google OAuth client ID and secret set
- [ ] Apple OAuth key configured
- [ ] Site URL set to `https://gdimension.app`
- [ ] All redirect URLs whitelisted
- [ ] Email templates branded
- [ ] `handle_new_user` trigger tested (create user → check public.users row)
- [ ] RLS policies verified: logged-out user can read public car, cannot read receipts
- [ ] Service role key NOT in any frontend code
- [ ] Anon key restrictions confirmed (RLS is the guard, not key scoping)
