import { describe, expect, it } from 'vitest'
import { nextWestMilestone, overdueWestActions } from '@/lib/west-milestones'
import { gbmCommissionMilestone } from '@/lib/server/west'

const today = '2026-10-29'
const milestones = [
  { date: '2026-04-30', label: 'Apartment sale proceeds land', status: 'done' },
  gbmCommissionMilestone('2026-04-30', 'done', 0.0125, 2_000_000),
  { date: '2026-10-29', label: '$5.2M paid', status: 'done' },
  { date: '2026-12-01', label: '$90K lump sum payment', status: 'pending' },
  { date: '2027-12-31', label: 'WEST delivery', status: 'target' },
]

describe('WEST milestones', () => {
  it('turns a past-dated, unconfirmed GBM commission into an action, not a pending event', () => {
    expect(milestones[1]).toMatchObject({ status: 'action', label: 'Confirm GBM commission 1.25% → 0.82% (~$9K/yr)' })
    expect(gbmCommissionMilestone('2027-01-31', 'pending', 0.0125, 2_000_000).status).toBe('pending')
  })

  it('picks the next milestone dated today or later, skipping past-dated items', () => {
    expect(nextWestMilestone(milestones, today)?.label).toBe('$90K lump sum payment')
    // A stale pending item (date passed) is never "next" either.
    const stale = [{ date: '2026-05-01', label: 'old', status: 'pending' }, ...milestones]
    expect(nextWestMilestone(stale, today)?.label).toBe('$90K lump sum payment')
    expect(overdueWestActions(stale, today).map(m => m.label)).toEqual(['old', 'Confirm GBM commission 1.25% → 0.82% (~$9K/yr)'])
  })
})
