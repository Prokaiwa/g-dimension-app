import { supabase } from './supabase'

// Owner-only sensitive car fields, split out of `cars` into `car_private`
// (migration 061) so the public-read RLS policy on `cars` can never expose them.
export interface CarPrivate {
  vin: string | null
  license_plate: string | null
  purchase_price: number | null
  purchase_currency: string | null
  mileage_at_purchase: number | null
  purchase_dealer: string | null
}

const PRIVATE_COLS =
  'vin, license_plate, purchase_price, purchase_currency, mileage_at_purchase, purchase_dealer'

const EMPTY: CarPrivate = {
  vin: null,
  license_plate: null,
  purchase_price: null,
  purchase_currency: null,
  mileage_at_purchase: null,
  purchase_dealer: null,
}

/**
 * Reads the owner-only private fields for a car. Guarded: if the table doesn't
 * exist yet (migration 061 not applied) or there's no row, returns nulls so
 * callers never crash during the migration window. RLS already scopes the row
 * to the owner.
 */
export async function getCarPrivate(carId: string): Promise<CarPrivate> {
  try {
    const { data, error } = await supabase
      .from('car_private')
      .select(PRIVATE_COLS)
      .eq('car_id', carId)
      .maybeSingle()
    if (error || !data) return { ...EMPTY }
    return data as unknown as CarPrivate
  } catch {
    return { ...EMPTY }
  }
}

/**
 * Upserts the private fields for a car. Best-effort and guarded so a
 * pre-migration state can never block the main car save (mirrors the
 * uploadCarOriginal pattern). Returns true on success.
 */
export async function upsertCarPrivate(
  carId: string,
  userId: string,
  fields: Partial<CarPrivate>,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('car_private')
      .upsert({ car_id: carId, user_id: userId, ...fields }, { onConflict: 'car_id' })
    return !error
  } catch {
    return false
  }
}
