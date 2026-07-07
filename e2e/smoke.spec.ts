// Smoke suite: catches the "whole app is broken" class of failure that unit
// tests can't see — boot crashes, router breakage, a dead public profile.
// No login, no writes. See docs/TESTING.md.
import { test, expect, type Page } from '@playwright/test'

// A real public build page (owner: the project author). If this profile ever
// goes private, point at any username visible in public_car_profiles.
const PUBLIC_BUILD_USERNAME = 'scantee'

/** Fail the test on any uncaught page exception. */
function trapPageErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))
  return errors
}

test('anon visit to / redirects to the login screen', async ({ page }) => {
  const errors = trapPageErrors(page)
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.locator('input[type="email"]')).toBeVisible()
  expect(errors).toEqual([])
})

test('/login renders the auth form', async ({ page }) => {
  const errors = trapPageErrors(page)
  await page.goto('/login')
  await expect(page.locator('input[type="email"]')).toBeVisible()
  await expect(page.locator('input[type="password"]')).toBeVisible()
  expect(errors).toEqual([])
})

test('/terms (public legal page) renders content', async ({ page }) => {
  const errors = trapPageErrors(page)
  await page.goto('/terms')
  await expect(page.locator('body')).toContainText(/terms/i)
  expect(errors).toEqual([])
})

test('unknown route does not crash the app', async ({ page }) => {
  const errors = trapPageErrors(page)
  await page.goto('/this-route-does-not-exist')
  // No 404 screen exists (unmatched routes render an empty tree) — the bar
  // here is: the bundle boots and nothing throws.
  await page.waitForLoadState('networkidle')
  expect(errors).toEqual([])
})

test('public build page loads real data from Supabase', async ({ page }) => {
  const errors = trapPageErrors(page)
  await page.goto(`/builds/${PUBLIC_BUILD_USERNAME}`)
  // The public profile must render something owned by this user — the handle
  // or one of their cars — proving router + Supabase anon read + RLS all work.
  await expect(page.locator('body')).toContainText(
    new RegExp(`${PUBLIC_BUILD_USERNAME}|MR-S|4Runner|86`, 'i'),
    { timeout: 15_000 }
  )
  expect(errors).toEqual([])
})
