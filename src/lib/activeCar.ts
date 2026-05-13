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
 * Called once after sign-in. Reads active_car_id from the user's profile
 * and seeds localStorage so the current browser knows which car is active.
 * If the server has no preference yet, keeps whatever is in localStorage.
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
  }
}
