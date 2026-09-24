import { describe, expect, it } from 'vitest'
import { NATIVE_AUTH_CALLBACK, parseAuthCallbackUrl } from './nativeAuth'

describe('parseAuthCallbackUrl', () => {
  it('ignores URLs that are not the auth callback', () => {
    expect(parseAuthCallbackUrl('https://gdimension.app/auth/callback#access_token=a&refresh_token=b')).toBeNull()
    expect(parseAuthCallbackUrl('app.gdimension.mobile://c/123')).toBeNull()
  })

  it('reads implicit-flow tokens from the fragment', () => {
    const url = `${NATIVE_AUTH_CALLBACK}#access_token=AT&expires_in=3600&refresh_token=RT&token_type=bearer`
    expect(parseAuthCallbackUrl(url)).toEqual({ kind: 'tokens', accessToken: 'AT', refreshToken: 'RT' })
  })

  it('reads a PKCE code from the query', () => {
    expect(parseAuthCallbackUrl(`${NATIVE_AUTH_CALLBACK}?code=abc123`)).toEqual({ kind: 'code', code: 'abc123' })
  })

  it('surfaces a provider error from either half of the URL', () => {
    expect(parseAuthCallbackUrl(`${NATIVE_AUTH_CALLBACK}?error=access_denied&error_description=User+cancelled`))
      .toEqual({ kind: 'error', message: 'User cancelled' })
    expect(parseAuthCallbackUrl(`${NATIVE_AUTH_CALLBACK}#error=server_error`))
      .toEqual({ kind: 'error', message: 'server_error' })
  })

  it('treats a callback with nothing usable as an error, not a silent no-op', () => {
    expect(parseAuthCallbackUrl(NATIVE_AUTH_CALLBACK)).toEqual({ kind: 'error', message: 'Sign-in returned no session.' })
  })
})
