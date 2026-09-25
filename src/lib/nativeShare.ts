// Handing a file to the phone in the native app.
//
// The web's two ways of producing a file both fail inside the Capacitor shell:
// an <a download> (and jsPDF's doc.save(), which is one) has no downloads folder
// to land in, so nothing happens, and WebKit's navigator.share is not reliably
// exposed in an app's WebView. On native the file is written to the app's cache
// and handed to the system share sheet, which previews it and offers Save to
// Files, AirDrop, Mail and the rest. On the web every function here reports
// 'unsupported' so the caller keeps its existing behaviour.
//
// Plugins are imported dynamically so the web bundle never pulls them in.
import { Capacitor } from '@capacitor/core'

export type NativeShareOutcome = 'shared' | 'cancelled' | 'unsupported'

export async function shareFileNative(blob: Blob, filename: string, title: string): Promise<NativeShareOutcome> {
  if (!Capacitor.isNativePlatform()) return 'unsupported'
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ])
  const { uri } = await Filesystem.writeFile({
    path: filename,
    data: await blobToBase64(blob),
    directory: Directory.Cache,
  })
  try {
    await Share.share({ title, files: [uri] })
    return 'shared'
  } catch (e) {
    if (isCancel(e)) return 'cancelled'
    throw e
  }
}

export async function shareLinkNative(opts: { url: string; title?: string; text?: string }): Promise<NativeShareOutcome> {
  if (!Capacitor.isNativePlatform()) return 'unsupported'
  const { Share } = await import('@capacitor/share')
  try {
    await Share.share({ url: opts.url, title: opts.title, text: opts.text })
    return 'shared'
  } catch (e) {
    if (isCancel(e)) return 'cancelled'
    throw e
  }
}

// The Share plugin rejects with "Share canceled" when the sheet is dismissed.
function isCancel(e: unknown): boolean {
  return /cancel/i.test((e as { message?: string } | null)?.message ?? '')
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result)
      resolve(dataUrl.slice(dataUrl.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
