// A YouTube video inside a 16:9 box.
//
// On the web this is the ordinary embedded player. In the native app it cannot
// be: YouTube's player refuses to run without an HTTP Referer, and a page served
// from capacitor://localhost sends none, so every embed shows "Video player
// configuration error". Native gets the video's thumbnail with a play button
// instead, which opens the video in the in-app browser sheet.
import { Capacitor } from '@capacitor/core'

export default function YouTubeEmbed({ videoId, title, background }: { videoId: string; title: string; background: string }) {
  if (!Capacitor.isNativePlatform()) {
    return (
      <div style={{ width: '100%', aspectRatio: '16/9', background, overflow: 'hidden' }}>
        <iframe
          src={`https://www.youtube.com/embed/${videoId}`}
          style={{ width: '100%', height: '100%', border: 'none' }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title={title}
        />
      </div>
    )
  }

  async function play() {
    const { Browser } = await import('@capacitor/browser')
    await Browser.open({ url: `https://www.youtube.com/watch?v=${videoId}`, presentationStyle: 'popover' })
  }

  return (
    <button
      type="button"
      onClick={play}
      aria-label={`Play ${title}`}
      style={{
        position: 'relative', display: 'block', width: '100%', aspectRatio: '16/9', padding: 0,
        border: 'none', cursor: 'pointer', background, overflow: 'hidden',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <img
        src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
        alt=""
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
      <span
        style={{
          position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
          width: 68, height: 48, borderRadius: 12, background: 'rgba(0,0,0,0.72)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 5v14l11-7z" fill="#f5f5f5" />
        </svg>
      </span>
    </button>
  )
}
