import { supabase } from './supabase'
import { normalizeUsername, USERNAME_MIN_LEN } from './userProfile'

// Car ownership transfer offers (migration 072, ADR-017). Offer → accept:
// the sender creates a pending row, the recipient accepts via the
// accept_car_transfer() RPC (the app's first supabase.rpc() call — the swap
// crosses RLS boundaries no client update may cross). Everything here is
// guarded in the carPrivate.ts style: never throws, and before migration 072
// runs every function degrades to "no offers" / a friendly failure.

export interface CarTransfer {
  id: string
  car_id: string
  from_user_id: string
  to_user_id: string
  status: 'pending' | 'accepted' | 'declined' | 'cancelled'
  created_at: string
  expires_at: string
}

// Joined display fields for the recipient's incoming-offer card.
export interface IncomingTransfer extends CarTransfer {
  car: {
    year: number | null
    nickname: string | null
    model: string | null
    variant: string | null
    garage_photo_url: string | null
  } | null
  sender: {
    username: string | null
    display_name: string | null
  } | null
}

export interface TransferResult {
  ok: boolean
  error?: string
}

const TRANSFER_COLS = 'id, car_id, from_user_id, to_user_id, status, created_at, expires_at'

// ── Pure helpers (unit-tested) ───────────────────────────────────────────────

// An offer only counts while pending AND unexpired. Expiry is enforced at
// read time here and again inside the accept RPC — there is no cron.
export function isOfferLive(
  offer: Pick<CarTransfer, 'status' | 'expires_at'>,
  now: Date = new Date(),
): boolean {
  if (offer.status !== 'pending') return false
  const exp = new Date(offer.expires_at)
  return !Number.isNaN(exp.getTime()) && exp.getTime() > now.getTime()
}

// Map raw Postgres/PostgREST failures onto copy a human can act on.
// 23505 = the partial unique index car_transfers_one_pending.
// 42P01 / PGRST202 = table/function missing — migration 072 not applied yet.
export function transferErrorMessage(code: string | null, fallback: string): string {
  switch (code) {
    case '23505':
      return 'A transfer is already pending for this car.'
    case '42P01':
    case 'PGRST202':
      return 'Transfers aren’t available yet — try again later.'
    default:
      return fallback
  }
}

// "2006 LS 430" / nickname-first display line for an offer card.
export function transferCarName(car: IncomingTransfer['car']): string {
  if (!car) return 'a car'
  const model = [car.year, car.model, car.variant].filter(Boolean).join(' ')
  if (car.nickname && model) return `${car.nickname} — ${model}`
  return car.nickname || model || 'a car'
}

// ── Sender ───────────────────────────────────────────────────────────────────

/**
 * Offer a car to another user by exact @handle. Resolves the handle, rejects
 * self-transfers, inserts the pending row (RLS re-verifies car ownership).
 */
export async function createTransferOffer(
  carId: string,
  rawUsername: string,
): Promise<TransferResult> {
  try {
    const username = normalizeUsername(rawUsername)
    if (username.length < USERNAME_MIN_LEN) {
      return { ok: false, error: 'Enter the recipient’s @username.' }
    }

    const { data: { session } } = await supabase.auth.getSession()
    const me = session?.user?.id
    if (!me) return { ok: false, error: 'Not signed in.' }

    const { data: recipient, error: lookupErr } = await supabase
      .from('users')
      .select('id, username')
      .eq('username', username)
      .maybeSingle()
    if (lookupErr) return { ok: false, error: transferErrorMessage(lookupErr.code, 'Couldn’t look up that username.') }
    if (!recipient) return { ok: false, error: `No user @${username} found.` }
    if (recipient.id === me) return { ok: false, error: 'You already own this car.' }

    const { error } = await supabase
      .from('car_transfers')
      .insert({ car_id: carId, from_user_id: me, to_user_id: recipient.id })
    if (error) return { ok: false, error: transferErrorMessage(error.code, error.message) }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Something went wrong sending the offer.' }
  }
}

/**
 * The sender's live (pending + unexpired) offer on a car, if any — drives the
 * "Transfer pending → @handle" state on the Edit Car page. Guarded: returns
 * null pre-migration or on any error.
 */
export async function getPendingOfferForCar(
  carId: string,
): Promise<(CarTransfer & { recipient_username: string | null }) | null> {
  try {
    const { data, error } = await supabase
      .from('car_transfers')
      .select(`${TRANSFER_COLS}, to_user:users!car_transfers_to_user_id_fkey (username)`)
      .eq('car_id', carId)
      .eq('status', 'pending')
      .maybeSingle()
    if (error || !data) return null
    const row = data as unknown as CarTransfer & { to_user: { username: string | null } | null }
    if (!isOfferLive(row)) return null
    return { ...row, recipient_username: row.to_user?.username ?? null }
  } catch {
    return null
  }
}

export async function cancelTransfer(transferId: string): Promise<TransferResult> {
  try {
    const { error } = await supabase
      .from('car_transfers')
      .update({ status: 'cancelled', responded_at: new Date().toISOString() })
      .eq('id', transferId)
    if (error) return { ok: false, error: transferErrorMessage(error.code, error.message) }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Couldn’t cancel the offer.' }
  }
}

// ── Recipient ────────────────────────────────────────────────────────────────

/**
 * Pending, unexpired offers addressed to the signed-in user, with the car
 * identity + sender handle joined for the Garage offer card. Guarded: empty
 * array pre-migration or on any error.
 */
export async function getIncomingOffers(): Promise<IncomingTransfer[]> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const me = session?.user?.id
    if (!me) return []

    const { data, error } = await supabase
      .from('car_transfers')
      .select(`${TRANSFER_COLS},
        car:cars (year, nickname, model, variant, garage_photo_url),
        sender:users!car_transfers_from_user_id_fkey (username, display_name)`)
      .eq('to_user_id', me)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    if (error || !data) return []
    return (data as unknown as IncomingTransfer[]).filter((t) => isOfferLive(t))
  } catch {
    return []
  }
}

// The provenance line shown to a car's current owner: who they got it from,
// if it was ever transferred to them.
export interface TransferSource {
  fromUsername: string | null
  fromDisplayName: string | null
  respondedAt: string
}

/**
 * The most recent accepted transfer INTO the signed-in user for this car, if
 * any — "Transferred from @handle" on the new owner's side. Scoped to
 * to_user_id = me so a car that's since moved on again doesn't surface a
 * stale/unrelated row. Guarded: null pre-migration, not signed in, or on any
 * error (including "never transferred," the common case).
 */
export async function getTransferSource(carId: string): Promise<TransferSource | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const me = session?.user?.id
    if (!me) return null

    const { data, error } = await supabase
      .from('car_transfers')
      .select(`responded_at, sender:users!car_transfers_from_user_id_fkey (username, display_name)`)
      .eq('car_id', carId)
      .eq('to_user_id', me)
      .eq('status', 'accepted')
      .order('responded_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error || !data) return null
    const row = data as unknown as {
      responded_at: string
      sender: { username: string | null; display_name: string | null } | null
    }
    if (!row.responded_at) return null
    return {
      fromUsername: row.sender?.username ?? null,
      fromDisplayName: row.sender?.display_name ?? null,
      respondedAt: row.responded_at,
    }
  } catch {
    return null
  }
}

/**
 * Accept an offer — the app's first supabase.rpc() call. The SECURITY DEFINER
 * function re-validates everything and swaps cars.user_id + car_private.user_id,
 * wipes the seller's private financials, and clears the old owner's active car
 * in one transaction.
 */
export async function acceptTransfer(transferId: string): Promise<TransferResult> {
  try {
    const { error } = await supabase.rpc('accept_car_transfer', { p_transfer_id: transferId })
    if (error) return { ok: false, error: transferErrorMessage(error.code, error.message) }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Couldn’t accept the transfer.' }
  }
}

export async function declineTransfer(transferId: string): Promise<TransferResult> {
  try {
    const { error } = await supabase
      .from('car_transfers')
      .update({ status: 'declined', responded_at: new Date().toISOString() })
      .eq('id', transferId)
    if (error) return { ok: false, error: transferErrorMessage(error.code, error.message) }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Couldn’t decline the transfer.' }
  }
}

// ── Sold "ghost" cars (migration 074, ADR-019) ───────────────────────────────
// A car the signed-in user transferred away persists as a read-only keepsake:
// a frozen identity snapshot + a link to the new owner's build. Backed by the
// car_ghosts table (owner-only RLS). All guarded — empty/no-op pre-migration.

export interface SoldCar {
  id: string
  car_id: string | null
  sold_at: string
  buyer_username: string | null
  buyer_display_name: string | null
  snapshot_year: number | null
  snapshot_make: string | null
  snapshot_model: string | null
  snapshot_variant: string | null
  snapshot_trim: string | null
  snapshot_nickname: string | null
  snapshot_color: string | null
  snapshot_photo_url: string | null
}

const GHOST_COLS =
  'id, car_id, sold_at, snapshot_year, snapshot_make, snapshot_model, snapshot_variant, ' +
  'snapshot_trim, snapshot_nickname, snapshot_color, snapshot_photo_url, ' +
  'buyer:users!car_ghosts_buyer_id_fkey (username, display_name)'

// Nickname-first display line for a ghost, from its frozen snapshot.
export function soldCarName(g: Pick<SoldCar,
  'snapshot_year' | 'snapshot_make' | 'snapshot_model' | 'snapshot_variant' | 'snapshot_nickname'
>): string {
  const model = [g.snapshot_year, g.snapshot_model, g.snapshot_variant].filter(Boolean).join(' ')
  if (g.snapshot_nickname && model) return `${g.snapshot_nickname} — ${model}`
  return g.snapshot_nickname || model || 'a car'
}

type GhostRow = Omit<SoldCar, 'buyer_username' | 'buyer_display_name'> & {
  buyer: { username: string | null; display_name: string | null } | null
}

function mapGhost(row: GhostRow): SoldCar {
  const { buyer, ...rest } = row
  return { ...rest, buyer_username: buyer?.username ?? null, buyer_display_name: buyer?.display_name ?? null }
}

async function fetchGhosts(archived: boolean): Promise<SoldCar[]> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const me = session?.user?.id
    if (!me) return []
    let q = supabase
      .from('car_ghosts')
      .select(GHOST_COLS)
      .eq('seller_id', me)
      .order('sold_at', { ascending: false })
    q = archived ? q.not('archived_at', 'is', null) : q.is('archived_at', null)
    const { data, error } = await q
    if (error || !data) return []
    return (data as unknown as GhostRow[]).map(mapGhost)
  } catch {
    return []
  }
}

// Active (non-archived) sold cars for the seller's garage carousel.
export function getSoldCars(): Promise<SoldCar[]> {
  return fetchGhosts(false)
}

// Archived sold cars for the Archived Cars screen.
export function getArchivedSoldCars(): Promise<SoldCar[]> {
  return fetchGhosts(true)
}

export async function archiveSoldCar(ghostId: string): Promise<TransferResult> {
  try {
    const { error } = await supabase
      .from('car_ghosts')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', ghostId)
    if (error) return { ok: false, error: transferErrorMessage(error.code, error.message) }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Couldn’t archive.' }
  }
}

export async function unarchiveSoldCar(ghostId: string): Promise<TransferResult> {
  try {
    const { error } = await supabase
      .from('car_ghosts')
      .update({ archived_at: null })
      .eq('id', ghostId)
    if (error) return { ok: false, error: transferErrorMessage(error.code, error.message) }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Couldn’t restore.' }
  }
}
