// See yt.html. Reads ?v=<id>, accepts only a real 11-character YouTube id, and
// embeds that video. Anything else renders nothing.
(function () {
  var id = new URLSearchParams(location.search).get('v') || ''
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return
  var f = document.createElement('iframe')
  f.src = 'https://www.youtube.com/embed/' + id + '?playsinline=1&rel=0'
  f.title = 'YouTube video'
  f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen'
  f.allowFullscreen = true
  document.body.appendChild(f)
})()
