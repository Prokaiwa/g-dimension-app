// "Download my data" — gathers every row the signed-in user owns across the
// build tables into one JSON file and triggers a browser download. A cheap
// "your data is yours" trust feature answering "what if the app goes away".
//
// Queries are scoped by EXPLICIT ownership (user_id / car_id / job_id), never
// by RLS alone: several tables (jobs, timeline_entries, diy_*) also carry a
// public-read policy for public cars, so a bare select('*') as the signed-in
// user would pull in *other* people's public rows. Scoping by the user's own
// car/job ids keeps the export strictly to their data.
//
// Photo/file fields are included as stored (public URLs, or private-bucket
// storage paths for receipts/documents) — the raw reference, not signed links.
import { supabase } from './supabase'

type Row = Record<string, unknown>

// Select all rows of `table` where `col` matches the given id(s). Fails soft:
// a missing table/column (schema drift, a migration not yet run) yields [] so
// one absent table can never break the whole export.
async function safeSelect(table: string, col: string, ids: string[] | string): Promise<Row[]> {
  if (Array.isArray(ids)) {
    if (ids.length === 0) return []
    const { data, error } = await supabase.from(table).select('*').in(col, ids)
    return error ? [] : ((data as Row[]) ?? [])
  }
  const { data, error } = await supabase.from(table).select('*').eq(col, ids)
  return error ? [] : ((data as Row[]) ?? [])
}

export async function buildAccountExport(): Promise<Record<string, unknown>> {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth?.user?.id
  if (!uid) throw new Error('Not signed in')

  // Roots: the profile row, then the user's cars → their jobs. Everything else
  // hangs off these ids.
  const profileRows = await safeSelect('users', 'id', uid)
  const cars = await safeSelect('cars', 'user_id', uid)
  const carIds = cars.map(c => c.id as string)
  const jobs = await safeSelect('jobs', 'car_id', carIds)
  const jobIds = jobs.map(j => j.id as string)

  const [
    carPrivate, jobSpecs, jobPhotos, jobLinks, sessions,
    timelineEntries, timelineEntryPhotos, timelineEntryLinks,
    reminders, documents, documentPhotos, receipts, contacts,
    diyGuides, diySteps, diyStepPhotos,
  ] = await Promise.all([
    safeSelect('car_private', 'user_id', uid),
    safeSelect('job_specs', 'job_id', jobIds),
    safeSelect('job_photos', 'car_id', carIds),
    safeSelect('job_links', 'job_id', jobIds),
    safeSelect('sessions', 'car_id', carIds),
    safeSelect('timeline_entries', 'car_id', carIds),
    safeSelect('timeline_entry_photos', 'car_id', carIds),
    safeSelect('timeline_entry_links', 'car_id', carIds),
    safeSelect('car_reminders', 'car_id', carIds),
    safeSelect('car_documents', 'car_id', carIds),
    safeSelect('car_document_photos', 'car_id', carIds),
    safeSelect('receipts', 'car_id', carIds),
    safeSelect('user_contacts', 'user_id', uid),
    safeSelect('diy_guides', 'car_id', carIds),
    safeSelect('diy_steps', 'car_id', carIds),
    safeSelect('diy_step_photos', 'car_id', carIds),
  ])

  return {
    _meta: {
      app: 'G-Dimension',
      exported_at: new Date().toISOString(),
      account_id: uid,
      note: 'Your complete G-Dimension data. Photo/file fields are storage URLs; receipt and document files live in private buckets and need a signed link from the app to open.',
      schema_version: 'export-1',
    },
    profile: profileRows[0] ?? null,
    cars,
    car_private: carPrivate,
    jobs,
    job_specs: jobSpecs,
    job_photos: jobPhotos,
    job_links: jobLinks,
    sessions,
    timeline_entries: timelineEntries,
    timeline_entry_photos: timelineEntryPhotos,
    timeline_entry_links: timelineEntryLinks,
    car_reminders: reminders,
    car_documents: documents,
    car_document_photos: documentPhotos,
    receipts,
    user_contacts: contacts,
    diy_guides: diyGuides,
    diy_steps: diySteps,
    diy_step_photos: diyStepPhotos,
  }
}

// Build the export and save it as gdimension-data-YYYY-MM-DD.json.
export async function downloadAccountExport(): Promise<void> {
  const data = await buildAccountExport()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `gdimension-data-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Give the click a beat before revoking so the download starts reliably.
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
