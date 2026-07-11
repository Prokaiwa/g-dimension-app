// Supabase Edge Function: delete-account
//
// Permanently deletes the CALLING user's account and everything tied to it.
// Deploy via the Supabase Dashboard (Edge Functions → Deploy a new function →
// paste this file) or `supabase functions deploy delete-account` if you have
// the CLI. SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are
// auto-injected by Supabase — no manual env var setup needed.
//
// Why this can't be done from the client: deleting the auth.users row (which
// every other table cascades from — see AUTH_SETUP.md / the "on delete
// cascade" chain starting at public.users.id) requires the Admin API, which
// requires the service_role key. That key must never reach the browser, so
// this has to run server-side.
//
// What it deletes:
//   1. Every storage object under `{userId}/` in all 6 buckets (avatars,
//      car-photos, job-photos, timeline-photos, receipts, car-documents).
//      Every upload path in this app starts with the uploader's user id, so
//      this is a complete, generic cleanup — storage rows are NOT covered by
//      Postgres cascade deletes, only DB rows are.
//      EXCEPTION (ADR-017): in the car-scoped buckets, `{userId}/{carId}/`
//      folders whose car row now belongs to a DIFFERENT user are skipped —
//      transferred cars keep their photo files under the original uploader's
//      prefix, and those files belong to the car, not the departing account.
//   2. The auth.users row via supabase.auth.admin.deleteUser(), which
//      cascades public.users → cars → jobs/sessions/timeline_entries/
//      receipts/car_documents/user_contacts/diy_guides/etc. — every FK in
//      the schema referencing users/cars is "on delete cascade" or
//      "on delete set null", so this is safe and leaves no orphaned rows.
//
// Security: the caller's identity is derived from their own JWT (verified via
// a plain anon-key client), never from a client-supplied user id — a user can
// only ever delete their own account.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const STORAGE_BUCKETS = [
  'avatars', 'car-photos', 'job-photos', 'timeline-photos', 'receipts', 'car-documents',
]

// Buckets whose paths are `{userId}/{carId}/…` — the first-level folder names
// are car ids, so a transferred car's folder can be identified and skipped.
// avatars is `{userId}/…` (genuinely user-owned) and always purges fully.
const CAR_SCOPED_BUCKETS = new Set([
  'car-photos', 'job-photos', 'timeline-photos', 'receipts', 'car-documents',
])

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

// Supabase Storage has no real folders — list() returns child entries one
// level at a time, where a "folder" entry has id: null. Recurse into those
// until every real file under the prefix is collected, then remove them all.
// deno-lint-ignore no-explicit-any
async function deleteFolderRecursive(admin: any, bucket: string, prefix: string) {
  const { data: entries } = await admin.storage.from(bucket).list(prefix, { limit: 1000 })
  if (!entries || entries.length === 0) return

  const filePaths: string[] = []
  for (const entry of entries) {
    const fullPath = `${prefix}/${entry.name}`
    if (entry.id === null) {
      await deleteFolderRecursive(admin, bucket, fullPath)
    } else {
      filePaths.push(fullPath)
    }
  }
  if (filePaths.length > 0) {
    await admin.storage.from(bucket).remove(filePaths)
  }
}

// Top-level purge of `{userId}/` in a car-scoped bucket. Skips `{carId}/`
// folders whose car still exists but belongs to a DIFFERENT user — that car
// was transferred (ADR-017) and its files must survive this account's
// deletion. Cars still owned by the caller are deleted moments later by the
// auth cascade, so their folders purge as before.
// deno-lint-ignore no-explicit-any
async function deleteCarBucketFolder(admin: any, bucket: string, uid: string) {
  const { data: entries } = await admin.storage.from(bucket).list(uid, { limit: 1000 })
  if (!entries || entries.length === 0) return

  const folders: string[] = []
  const loosePaths: string[] = []
  for (const entry of entries) {
    if (entry.id === null) folders.push(entry.name)
    else loosePaths.push(`${uid}/${entry.name}`)
  }

  const carIdFolders = folders.filter((name) => UUID_RE.test(name))
  const transferred = new Set<string>()
  if (carIdFolders.length > 0) {
    const { data: rows } = await admin.from('cars').select('id, user_id').in('id', carIdFolders)
    for (const row of rows ?? []) {
      if (row.user_id !== uid) transferred.add(row.id)
    }
  }

  for (const folder of folders) {
    if (transferred.has(folder)) continue
    await deleteFolderRecursive(admin, bucket, `${uid}/${folder}`)
  }
  if (loosePaths.length > 0) {
    await admin.storage.from(bucket).remove(loosePaths)
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing authorization' }, 401)

  // Verify the caller via their own JWT — this is the ONLY source of truth
  // for which account gets deleted.
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authErr } = await callerClient.auth.getUser()
  if (authErr || !user) return json({ error: 'Invalid session' }, 401)

  const uid = user.id
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE)

  try {
    for (const bucket of STORAGE_BUCKETS) {
      if (CAR_SCOPED_BUCKETS.has(bucket)) {
        await deleteCarBucketFolder(admin, bucket, uid)
      } else {
        await deleteFolderRecursive(admin, bucket, uid)
      }
    }

    const { error: delErr } = await admin.auth.admin.deleteUser(uid)
    if (delErr) return json({ error: delErr.message }, 500)

    return json({ ok: true })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
