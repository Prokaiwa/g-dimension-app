import { supabase } from './supabase'

// DIY guide authorship credit (migration 073, ADR-018). Returns the ORIGINAL
// author's @handle for a guide — but ONLY when that author is someone OTHER
// than the car's current owner, i.e. the guide was written before a car
// transfer (migration 072). Returns null for the common untransferred case,
// so the credit line stays invisible unless it's actually meaningful.
//
// Guarded in the carPrivate/carTransfers style: never throws, and before
// migration 073 is applied (the `created_by` column / FK don't exist yet) the
// query errors and this simply returns null — the guide still renders.
export async function getDiyAuthorHandle(
  guideId: string,
  currentOwnerId: string | null,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('diy_guides')
      .select('created_by, creator:users!diy_guides_created_by_fkey (username)')
      .eq('id', guideId)
      .maybeSingle()
    if (error || !data) return null
    const row = data as unknown as {
      created_by: string | null
      creator: { username: string | null } | null
    }
    if (!row.created_by) return null
    // Same person still owns it → no transfer happened → nothing to credit.
    if (currentOwnerId && row.created_by === currentOwnerId) return null
    return row.creator?.username ?? null
  } catch {
    return null
  }
}
