// TTL (seconds) for private-bucket signed URLs (receipts, car-documents).
//
// These used to be 300s, which expired mid-session: a Documents sheet or a
// mod detail page left open for >5 minutes showed broken images with no
// refresh path (the URLs are only re-signed on page load). One hour
// comfortably outlives any realistic browsing session while keeping the
// links short-lived; every view still re-signs on mount.
export const SIGNED_URL_TTL = 3600
