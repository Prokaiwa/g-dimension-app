// External links in the native app open in the in-app browser sheet
// (SFSafariViewController on iOS, Custom Tabs on Android), which keeps the
// person in G-Dimension and still offers its own "open in Safari" button.
//
// Installed once at boot rather than at each call site: links open from a dozen
// places, as window.open(url, '_blank') buttons and target="_blank" anchors, and
// every one of them should behave the same. On the web this installs nothing,
// so new-tab links keep working exactly as before.
//
// Only http(s) is taken over. mailto:, tel: and the rest are left to the OS, and
// a same-origin path is resolved against the public site, since inside the app
// it would otherwise point back at the bundled shell.
import { Capacitor } from '@capacitor/core'

const SITE_ORIGIN = 'https://gdimension.app'

export function installNativeLinks(): void {
  if (!Capacitor.isNativePlatform()) return

  const nativeOpen = window.open.bind(window)
  window.open = ((url?: string | URL, target?: string, features?: string) => {
    const href = url == null ? '' : String(url)
    const external = toExternal(href)
    if (!external) return nativeOpen(url, target, features)
    void openInApp(external)
    return null
  }) as typeof window.open

  document.addEventListener('click', e => {
    const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
    if (!a || a.target !== '_blank') return
    const external = toExternal(a.getAttribute('href') ?? '')
    if (!external) return
    e.preventDefault()
    void openInApp(external)
  }, { capture: true })
}

function toExternal(href: string): string | null {
  if (/^https?:\/\//i.test(href)) return href
  if (href.startsWith('/') && !href.startsWith('//')) return SITE_ORIGIN + href
  return null
}

async function openInApp(url: string): Promise<void> {
  const { Browser } = await import('@capacitor/browser')
  await Browser.open({ url, presentationStyle: 'popover' })
}
