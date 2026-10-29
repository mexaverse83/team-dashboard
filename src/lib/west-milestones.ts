// WEST milestone helpers shared by the Daily Brief and the WEST tracker.
//
// Statuses: 'done', 'pending' (future event), 'action' (its date has passed
// but the household still has to do something, e.g. confirm the GBM
// commission) and 'target' (delivery). A past-dated item is never "next".

export interface WestMilestone { date: string; label: string; status: string }

/** The next upcoming milestone (pending or target, dated today or later). */
export function nextWestMilestone<M extends WestMilestone>(milestones: readonly M[], today: string): M | undefined {
  return milestones.find(m => (m.status === 'pending' || m.status === 'target') && m.date >= today)
}

/** Items whose date has passed but still need the household: shown as overdue actions. */
export function overdueWestActions<M extends WestMilestone>(milestones: readonly M[], today: string): M[] {
  return milestones.filter(m => m.status === 'action' || (m.status === 'pending' && m.date < today))
}
