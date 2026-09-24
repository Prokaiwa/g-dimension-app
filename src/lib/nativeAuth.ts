// Sign-in plumbing that differs between the website and the native app.
//
// On the web nothing changes: Google OAuth redirects the tab to Google and back
// to `${origin}/auth/callback`, exactly as documented in AUTH_SETUP.md.
//
// In the Capacitor app that same flow is broken twice over:
//   1. Google refuses OAuth inside an embedded WKWebView (403
//      disallowed_useragent), which is what the app's UI runs in.
//   2. `window.location.origin` is `capacitor://localhost`, which is not an
//      allowlisted redirect, and a link to it means nothing outside the app.
// So on native, Google opens in the system browser sheet (SFSafariViewController,
// which Google allows), Supabase redirects to the custom scheme
// `app.gdimension.mobile://auth/callback`, iOS hands that URL back to the app,
// and we lift the session out of it. Same Supabase user, same data.
//
// Sign in with Apple is iOS-only: App Store Guideline 4.8 requires it once an
// app offers Google login. It uses the native Apple sheet and
// signInWithIdToken, so it needs no Services ID or client secret, only the
// Apple provider enabled in Supabase with the bundle id as its client id.
//
// Plugins are imported dynamically so the web bundle never pulls them in.
import { Capacitor } from '@capacitor/core'
import { supabase } from './supabase'

export const APP_BUNDLE_ID = 'app.gdimension.mobile'
export const NATIVE_AUTH_CALLBACK = `${APP_BUNDLE_ID}://auth/callback`
const SITE_ORIGIN = 'https://gdimension.app'

/**
 * Origin for links that leave the app: email confirmation and password reset.
 * Those open in the phone's mail client and browser, so on native they must
 * point at the real site, not `capacitor://localhost`.
 */
export function authRedirectOrigin(): string {
  return Capacitor.isNativePlatform() ? SITE_ORIGIN : window.location.origin
}

/** Sign in with Apple is offered only in the iOS app (Guideline 4.8). */
export function canSignInWithApple(): boolean {
  return Capacitor.getPlatform() === 'ios'
}

export async function signInWithGoogle(): Promise<{ error: string | null }> {
  if (!Capacitor.isNativePlatform()) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    return { error: error?.message ?? null }
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: NATIVE_AUTH_CALLBACK, skipBrowserRedirect: true },
  })
  if (error || !data.url) return { error: error?.message ?? 'Could not start Google sign-in.' }
  const { Browser } = await import('@capacitor/browser')
  await Browser.open({ url: data.url, presentationStyle: 'popover' })
  // The session arrives later through the appUrlOpen listener.
  return { error: null }
}

export async function signInWithApple(): Promise<{ error: string | null; cancelled?: boolean }> {
  try {
    const { AppleSignIn, SignInScope } = await import('@capawesome/capacitor-apple-sign-in')
    // Apple signs the SHA-256 of the nonce into the id token; Supabase is given
    // the raw value and checks the hash, so a stolen token can't be replayed.
    const rawNonce = randomNonce()
    const result = await AppleSignIn.signIn({
      scopes: [SignInScope.Email, SignInScope.FullName],
      nonce: await sha256Hex(rawNonce),
    })
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: result.idToken,
      nonce: rawNonce,
    })
    return { error: error?.message ?? null }
  } catch (e) {
    const code = (e as { code?: string } | null)?.code
    if (code === 'SIGN_IN_CANCELED') return { error: null, cancelled: true }
    return { error: e instanceof Error ? e.message : 'Apple sign-in failed.' }
  }
}

export type AuthCallbackParams =
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'code'; code: string }
  | { kind: 'error'; message: string }
  | null

/**
 * Pull the auth result out of a deep link. Supabase's implicit flow puts the
 * tokens in the fragment; PKCE puts a `code` in the query; failures come back as
 * `error_description` in either. Returns null for any URL that isn't ours.
 */
export function parseAuthCallbackUrl(url: string): AuthCallbackParams {
  if (!url.startsWith(NATIVE_AUTH_CALLBACK)) return null
  const rest = url.slice(NATIVE_AUTH_CALLBACK.length)
  const hashAt = rest.indexOf('#')
  const queryPart = hashAt === -1 ? rest : rest.slice(0, hashAt)
  const hashPart = hashAt === -1 ? '' : rest.slice(hashAt + 1)
  const query = new URLSearchParams(queryPart.startsWith('?') ? queryPart.slice(1) : '')
  const hash = new URLSearchParams(hashPart)
  const get = (k: string) => hash.get(k) ?? query.get(k)

  const err = get('error_description') ?? get('error')
  if (err) return { kind: 'error', message: err }
  const accessToken = get('access_token')
  const refreshToken = get('refresh_token')
  if (accessToken && refreshToken) return { kind: 'tokens', accessToken, refreshToken }
  const code = get('code')
  if (code) return { kind: 'code', code }
  return { kind: 'error', message: 'Sign-in returned no session.' }
}

/**
 * Listen for the OAuth deep link and turn it into a session. `onSignedIn` runs
 * after the session is set, so the caller can route to /auth/callback, which
 * already decides between /welcome and /home. Returns an unsubscribe. No-op on
 * the web.
 */
export function listenForNativeAuthRedirect(onSignedIn: () => void, onError: (message: string) => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {}
  let remove: (() => void) | null = null
  let cancelled = false

  void (async () => {
    const [{ App }, { Browser }] = await Promise.all([import('@capacitor/app'), import('@capacitor/browser')])
    const handle = await App.addListener('appUrlOpen', async ({ url }) => {
      const parsed = parseAuthCallbackUrl(url)
      if (!parsed) return
      await Browser.close().catch(() => {})
      const { error } =
        parsed.kind === 'tokens'
          ? await supabase.auth.setSession({ access_token: parsed.accessToken, refresh_token: parsed.refreshToken })
          : parsed.kind === 'code'
            ? await supabase.auth.exchangeCodeForSession(parsed.code)
            : { error: { message: parsed.message } }
      if (error) onError(error.message)
      else onSignedIn()
    })
    if (cancelled) handle.remove()
    else remove = () => handle.remove()
  })()

  return () => {
    cancelled = true
    remove?.()
  }
}

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}
