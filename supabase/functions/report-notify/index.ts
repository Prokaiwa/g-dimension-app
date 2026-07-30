// Supabase Edge Function: report-notify
//
// ⚠️ NOT DEPLOYED, BY DECISION (2026-07-30). Written, reviewed and kept, but
// switched off: the report QUEUE at /admin/reports is the system of record, and
// auto-hide (084) takes severe content down without anyone being notified at
// all. Email only changes how fast the admin notices the judgement-call
// reports, and is NOT required for App Store Guideline 1.2. The client no
// longer calls it — see the note in src/lib/moderation.ts — because invoking an
// undeployed function just fires a guaranteed 404 on every report.
//
// TO ENABLE: set RESEND_API_KEY as an Edge Function secret, deploy this file,
// and restore the fire-and-forget call in reportContent():
//
//   if (row?.id) {
//     supabase.functions.invoke('report-notify', { body: { reportId: row.id } })
//       .then(() => {}, () => {})
//   }
//
// Emails the operator when a content report is filed (migration 084, ADR-023).
// Deploy via the Supabase Dashboard (Edge Functions → Deploy a new function →
// paste this file) or `supabase functions deploy report-notify`.
//
// SECRET REQUIRED (the only manual setup):
//   Dashboard → Edge Functions → Manage secrets → RESEND_API_KEY
// Resend is already the transactional sender for this project — a dedicated
// account under hi@gdimension.app with the domain verified (see AUTH_SETUP.md),
// so there is no new service to sign up for.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THE CLIENT CALLS THIS *AFTER* THE INSERT, RATHER THAN THIS FUNCTION DOING
// THE INSERT:
//
// The report row is the evidence; the email is a convenience. Writing the row
// first, directly through RLS, means a report survives this function being
// cold, broken, or rate-limited by Resend. If the notification were the path to
// recording the report, an email outage would become silent data loss of
// exactly the thing App Store Guideline 1.2 requires you to keep.
//
// The obvious objection — a doctored client could skip the notify call — costs
// nothing that matters: the row still exists and still shows up in
// /admin/reports and in admin_report_queue(). Only the push is skipped, and the
// queue is the system of record either way.
//
// If guaranteed delivery is wanted later, replace the client call with a
// Database Webhook on INSERT to content_reports pointing at this same function.
// No change is needed here: the payload shape is the report id.
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY        = Deno.env.get('RESEND_API_KEY') ?? ''

const TO_ADDRESS   = 'hi@gdimension.app'
const FROM_ADDRESS = 'G-Dimension Reports <reports@gdimension.app>'
const APP_ORIGIN   = 'https://gdimension.app'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST')    return json({ error: 'method_not_allowed' }, 405)

  try {
    const { reportId } = await req.json().catch(() => ({ reportId: null }))
    if (!reportId) return json({ error: 'missing_report_id' }, 400)

    // Read the report with the service role. The caller supplies only an id, so
    // nothing about the email body is attacker-controlled beyond what they
    // already typed into their own report — and that is escaped below.
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/content_reports?id=eq.${encodeURIComponent(reportId)}` +
      `&select=id,created_at,reason,details,target_type,target_id,auto_hidden,` +
      `reporter:users!content_reports_reporter_id_fkey(username),` +
      `owner:users!content_reports_target_owner_id_fkey(username)`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
        },
      },
    )
    const rows = await res.json()
    const r = Array.isArray(rows) ? rows[0] : null
    if (!r) return json({ error: 'report_not_found' }, 404)

    // How many reports this target already has — the number that tells you at a
    // glance whether this is noise or a pattern, without opening the app.
    // Read the count from the Content-Range header rather than the row array:
    // PostgREST caps returned rows (max-rows), so `.length` would quietly
    // under-report a target with a lot of reports — which is exactly the case
    // where the number matters.
    const countRes = await fetch(
      `${SUPABASE_URL}/rest/v1/content_reports?select=id&target_type=eq.${encodeURIComponent(r.target_type)}` +
      `&target_id=eq.${encodeURIComponent(r.target_id)}`,
      {
        method: 'HEAD',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
          Prefer: 'count=exact',
        },
      },
    )
    // Content-Range looks like "0-24/137"; the part after the slash is the total.
    const total = Number(countRes.headers.get('content-range')?.split('/')[1]) || 1

    if (!RESEND_API_KEY) {
      // No key configured: the report is already safely recorded, so this is a
      // degraded notification, not a failure worth surfacing to the reporter.
      return json({ ok: true, emailed: false, reason: 'no_resend_key' })
    }

    const owner    = r.owner?.username    ?? 'unknown'
    const reporter = r.reporter?.username ?? 'unknown'
    const severe   = ['nudity', 'hate', 'violence', 'illegal'].includes(r.reason)

    const subject =
      `${severe ? '[HIDDEN] ' : ''}Report: ${r.reason} on @${owner}` +
      (total > 1 ? ` (${total} total)` : '')

    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px">
        <h2 style="margin:0 0 4px;font-size:17px">${esc(r.reason)} · ${esc(r.target_type)}</h2>
        <p style="margin:0 0 14px;color:#666;font-size:13px">
          ${r.auto_hidden
            ? 'Auto-hidden. The build is already off the public site.'
            : 'Queued for review. Nothing has been hidden.'}
        </p>
        <table style="font-size:13px;border-collapse:collapse">
          <tr><td style="padding:3px 12px 3px 0;color:#888">Owner</td><td>@${esc(owner)}</td></tr>
          <tr><td style="padding:3px 12px 3px 0;color:#888">Reported by</td><td>@${esc(reporter)}</td></tr>
          <tr><td style="padding:3px 12px 3px 0;color:#888">Reports on this</td><td>${total}</td></tr>
          <tr><td style="padding:3px 12px 3px 0;color:#888">When</td><td>${esc(String(r.created_at))}</td></tr>
        </table>
        ${r.details ? `<p style="margin:14px 0;padding:10px;background:#f5f5f5;font-size:13px">${esc(String(r.details))}</p>` : ''}
        <p style="margin:18px 0 0">
          <a href="${APP_ORIGIN}/admin/reports" style="background:#c8661a;color:#fff;padding:10px 16px;text-decoration:none;border-radius:8px;font-size:13px">Open the queue</a>
          &nbsp;&nbsp;
          <a href="${APP_ORIGIN}/builds/${encodeURIComponent(owner)}" style="color:#c8661a;font-size:13px">View the build</a>
        </p>
      </div>`

    const send = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM_ADDRESS, to: [TO_ADDRESS], subject, html }),
    })

    if (!send.ok) {
      return json({ ok: true, emailed: false, status: send.status })
    }
    return json({ ok: true, emailed: true })
  } catch (e) {
    // Never fail loudly: the report is recorded regardless, and the reporter
    // must not see an error for a notification problem they cannot act on.
    return json({ ok: true, emailed: false, error: String(e) })
  }
})
