// A YouTube video inside a 16:9 box, playing in place, with YouTube's own
// fullscreen button to enlarge it.
//
// On the web this embeds YouTube directly. The native app cannot: YouTube's
// player refuses to run without an HTTP Referer, and a page served from
// capacitor://localhost sends none, so a direct embed shows "Video player
// configuration error". Native frames https://gdimension.app/yt.html instead,
// a relay whose request to YouTube carries the site as its referrer (ADR-041).
// The relay only exists on the deployed site, so it is also what the web would
// load if it ever needed to, but the web has no reason to take the extra hop.
import { Capacitor } from '@capacitor/core'

const ALLOW = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen'

export default function YouTubeEmbed({ videoId, title, background }: { videoId: string; title: string; background: string }) {
  const src = Capacitor.isNativePlatform()
    ? `https://gdimension.app/yt.html?v=${encodeURIComponent(videoId)}`
    : `https://www.youtube.com/embed/${videoId}`
  return (
    <div style={{ width: '100%', aspectRatio: '16/9', background, overflow: 'hidden' }}>
      <iframe
        src={src}
        style={{ width: '100%', height: '100%', border: 'none' }}
        allow={ALLOW}
        allowFullScreen
        title={title}
      />
    </div>
  )
}
