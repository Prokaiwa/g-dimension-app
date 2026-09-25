// A YouTube video inside a 16:9 box, playing in place, with YouTube's own
// fullscreen button to enlarge it.
//
// On the web this embeds YouTube directly. The native app cannot: YouTube's
// player refuses to run without an HTTP Referer, and a page served from
// capacitor://localhost sends none, so a direct embed shows "Video player
// configuration error". Native frames https://gdimension.app/yt.html instead,
// a relay whose request to YouTube carries the site as its referrer (ADR-041).
//
// The relay also reports the player's state. iOS pauses the background music
// when a video starts but nothing restarts it, so native resumes the music when
// the video pauses or ends, and when the page is left mid-video.
import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { startMusic, stopMusic } from '../lib/music'

const ALLOW = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen'
const RELAY_ORIGIN = 'https://gdimension.app'
// YouTube player states. Buffering (3) happens mid-play, so it must not count
// as stopped; only paused and ended bring the music back.
const YT_PLAYING = 1
const YT_STOPPED = new Set([0, 2]) // ended, paused

export default function YouTubeEmbed({ videoId, title, background }: { videoId: string; title: string; background: string }) {
  const native = Capacitor.isNativePlatform()

  useEffect(() => {
    if (!native) return
    let playing = false
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== RELAY_ORIGIN) return
      const d = e.data as { source?: string; state?: number } | null
      if (d?.source !== 'gdim-yt' || typeof d.state !== 'number') return
      if (d.state === YT_PLAYING) { playing = true; stopMusic() }
      else if (playing && YT_STOPPED.has(d.state)) { playing = false; void startMusic() }
    }
    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('message', onMessage)
      if (playing) void startMusic()
    }
  }, [native])

  const src = native
    ? `${RELAY_ORIGIN}/yt.html?v=${encodeURIComponent(videoId)}`
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
