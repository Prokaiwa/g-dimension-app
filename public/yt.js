// See yt.html. Reads ?v=<id>, accepts only a real 11-character YouTube id, and
// embeds that video. Anything else renders nothing.
//
// It also relays the player's state (1 playing, 2 paused, 0 ended) up to the
// app, so the app can bring its background music back when the video stops.
// YouTube reports state only to a page that subscribes with a "listening"
// message, and only when the embed is created with enablejsapi=1.
(function () {
  var id = new URLSearchParams(location.search).get('v') || ''
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return
  var YT = 'https://www.youtube.com'
  var f = document.createElement('iframe')
  f.src = YT + '/embed/' + id + '?playsinline=1&rel=0&enablejsapi=1&origin=' + encodeURIComponent(location.origin)
  f.title = 'YouTube video'
  f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen'
  f.allowFullscreen = true
  f.addEventListener('load', function () {
    f.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 'gdim', channel: 'widget' }), YT)
  })
  document.body.appendChild(f)

  var last = null
  window.addEventListener('message', function (e) {
    if (e.origin !== YT || typeof e.data !== 'string') return
    var d
    try { d = JSON.parse(e.data) } catch (err) { return }
    var s = null
    if (d.event === 'onStateChange' && typeof d.info === 'number') s = d.info
    else if (d.event === 'infoDelivery' && d.info && typeof d.info.playerState === 'number') s = d.info.playerState
    if (s === null || s === last) return
    last = s
    // Only a state number crosses, so any parent may hear it.
    window.parent.postMessage({ source: 'gdim-yt', state: s }, '*')
  })
})()
