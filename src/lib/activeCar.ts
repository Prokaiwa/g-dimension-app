import { supabase } from './supabase'

const KEY = 'gdim_chosen_car_id'

/**
 * Select a car as active. Writes to localStorage immediately (instant UI
 * response) and persists to users.active_car_id so every device syncs.
 */
export async function setActiveCar(carId: string): Promise<void> {
  localStorage.setItem(KEY, carId)

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return

  const { error } = await supabase
    .from('users')
    .update({ active_car_id: carId })
    .eq('id', session.user.id)

  if (error) console.error('setActiveCar failed:', error.message)
}

/**
 * Returns the active car ID. Checks localStorage first (instant), then falls
 * back to users.active_car_id in Supabase and seeds localStorage for next
 * time. Use this in pages instead of reading localStorage directly so the
 * app works on any device regardless of whether the sync has run yet.
 */
export async function getActiveCarId(): Promise<string | null> {
  const cached = localStorage.getItem(KEY)
  if (cached) return cached

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  const { data } = await supabase
    .from('users')
    .select('active_car_id')
    .eq('id', session.user.id)
    .single()

  if (data?.active_car_id) {
    localStorage.setItem(KEY, data.active_car_id)
    return data.active_car_id
  }

  return null
}

/**
 * Clears the locally-cached active car id. Call on sign-out so a different
 * account signing in on the same browser never inherits the previous user's
 * selection (localStorage is not namespaced per user).
 */
export function clearActiveCar(): void {
  localStorage.removeItem(KEY)
}

/**
 * Called once after sign-in. The SERVER is the source of truth here: the
 * localStorage cache is not namespaced per user, so a value left by a previous
 * account on this browser must not be trusted. If the server has an
 * active_car_id we seed localStorage with it; if it doesn't, we CLEAR the cache
 * (otherwise a stale cross-account id could leak another user's car into the
 * header views, which fetch by getActiveCarId()).
 */
export async function syncActiveCarFromServer(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return

  const { data } = await supabase
    .from('users')
    .select('active_car_id')
    .eq('id', session.user.id)
    .single()

  if (data?.active_car_id) {
    localStorage.setItem(KEY, data.active_car_id)
  } else {
    localStorage.removeItem(KEY)
  }
}
