import { calendarDayKey, goalPaceTarget, isCryptoGoal, isGoalOverdue, monthlyNeeded, monthsRemaining, type CalendarDay } from '@/lib/finance-utils'

export interface GoalRow {
  id?: string
  name: string
  target_amount: number
  current_amount: number
  target_date?: string | null
  monthly_contribution?: number | null
  goal_type?: string | null
  crypto_symbol?: string | null
  owner?: string | null
  scope?: string | null
  created_at?: string | null
}

export interface SummaryGoal {
  id?: string
  name: string
  target: number
  current: number
  pct: number
  monthly_needed: number
  on_track: boolean
  target_date: string | null
  months_remaining: number
  overdue: boolean
  is_crypto: boolean
  unit: string
  owner: string | null
  scope: string | null
}

export interface GoalsBuild {
  active: SummaryGoal[]
  total_monthly_needed: number
  overdue_goals: Array<{ name: string; target_date: string; remaining: number }>
  /** Peso goals still open (not crypto, not overdue). */
  open_target: number
  open_saved: number
  open_remaining: number
  /** The nearest target year among open peso goals, or this year. */
  target_year: number
}

/**
 * Goals in one place. Crypto goals are measured in coins — their progress
 * comes from summed holdings when known — and never enter peso totals.
 * Goals past their date are 'overdue': out of the monthly need (or Jan 1
 * would ask for the whole unfinished 2026 balance in one month).
 */
export function buildGoals(goals: GoalRow[], asOf: CalendarDay, cryptoQty: Record<string, number> = {}): GoalsBuild {
  const active: SummaryGoal[] = goals.map(g => {
    const crypto = isCryptoGoal(g)
    const symbol = (g.crypto_symbol || '').toUpperCase()
    const current = crypto && symbol && cryptoQty[symbol] != null ? cryptoQty[symbol] : Number(g.current_amount || 0)
    const target = Number(g.target_amount || 0)
    const needed = monthlyNeeded({ ...g, current_amount: current }, asOf)
    const overdue = isGoalOverdue(g, asOf)
    return {
      id: g.id,
      name: g.name,
      target,
      current: crypto ? current : Math.round(current),
      pct: target > 0 ? Math.round((current / target) * 100) : 0,
      monthly_needed: needed,
      // Crypto pace is in coins (the Goals page's straight line from creation to
      // target date); monthly_needed stays 0 so coins never enter peso totals.
      on_track: crypto ? cryptoOnPace({ ...g, target_amount: target }, current, asOf) : (g.monthly_contribution || 0) >= needed,
      target_date: g.target_date ?? null,
      months_remaining: monthsRemaining(g.target_date, asOf),
      overdue,
      is_crypto: crypto,
      unit: crypto ? symbol || 'coin' : 'MXN',
      owner: g.owner ?? null,
      scope: g.scope ?? null,
    }
  })

  const peso = active.filter(g => !g.is_crypto)
  const open = peso.filter(g => !g.overdue)
  const today = calendarDayKey(asOf)
  const openYears = open
    .map(g => Number((g.target_date || '').slice(0, 4)))
    .filter(y => Number.isFinite(y) && y >= asOf.year)

  return {
    active,
    total_monthly_needed: open.reduce((s, g) => s + g.monthly_needed, 0),
    overdue_goals: peso
      .filter(g => g.overdue && g.target_date && g.target_date.slice(0, 10) < today)
      .map(g => ({ name: g.name, target_date: g.target_date as string, remaining: Math.max(0, Math.round(g.target - g.current)) }))
      .filter(g => g.remaining > 0),
    open_target: open.reduce((s, g) => s + g.target, 0),
    open_saved: open.reduce((s, g) => s + g.current, 0),
    open_remaining: open.reduce((s, g) => s + Math.max(0, g.target - g.current), 0),
    target_year: openYears.length > 0 ? Math.min(...openYears) : asOf.year,
  }
}

function cryptoOnPace(g: GoalRow, current: number, asOf: CalendarDay): boolean {
  const pace = goalPaceTarget(g, calendarDayKey(asOf))
  return pace == null || current >= pace * 0.95
}
