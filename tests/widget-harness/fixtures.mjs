// v2 widget payloads for the harness (shape of buildWidgetPayload()).
// Numbers follow the Oct 28 review: everyday budgets $38,500, spent $43,986.

const clone = o => JSON.parse(JSON.stringify(o))
/** Rescale a daily series so it sums exactly to `total` (the hero's variable.spent). */
export function scaleTo(series, total) {
  const sum = series.reduce((s, v) => s + v, 0) || 1
  const out = series.map(v => Math.round((v * total) / sum))
  out[out.length - 1] += total - out.reduce((s, v) => s + v, 0)
  return out
}

export const NOW_WEEKDAY = '2026-10-28T09:15:00-06:00'
export const NOW_WEEKEND = '2026-10-31T17:00:00-06:00'
export const NOW_DAY_ONE = '2026-11-01T08:10:00-06:00'

export const overBudget = {
  v: 2,
  updated_at: '2026-10-28T15:15:00.000Z',
  month: '2026-10',
  day: 28,
  days_in_month: 31,
  safe_to_spend_day: 0,
  variable: { budget: 38500, spent: 43986, left: -5486, days_left: 4, through_label: 'Sat Oct 31', through_date: '2026-10-31', status: 'over' },
  status: 'over',
  top_over: { name: 'Other', pct: 339, over_by: 11961 },
  budget_pace: [
    { name: 'Other', spent: 16961, budget: 5000, pct: 339, left: -11961 },
    { name: 'Transport', spent: 5767, budget: 5500, pct: 105, left: -267 },
    { name: 'Groceries', spent: 12044, budget: 13000, pct: 93, left: 956 },
    { name: 'Dining Out', spent: 9214, budget: 15000, pct: 61, left: 5786 },
  ],
  daily_spend: [926, 1071, 641, 1969, 1270, 1447, 752, 613, 562, 462, 1282, 7133, 2390, 1041, 2139, 2063, 545, 896, 1537, 5454, 1193, 1013, 2094, 790, 2195, 647, 982, 879],
  daily_budget_pace: 1242,
  west_month: { label: 'Oct', month: '2026-10', target: 152583, projected_savings: 83536, surplus_so_far: 83536, gap: 69047, pct: 55, tone: 'warn' },
  upcoming: [
    { date: '2026-11-01', label: 'Rent', amount: 47938, count: 7, kind: 'bill' },
    { date: '2026-11-10', label: 'Seguro Sportage', amount: 758, count: 1, kind: 'msi' },
    { date: '2026-11-15', label: 'Gym', amount: 1290, count: 1, kind: 'bill' },
  ],
  milestones: { baby_months: 6, west_funded_pct: 87.1, west_months_to_delivery: 14 },
  coach: { title: 'Pause Other — $12k over', url: '/finance/ask?prompt=How%20do%20we%20get%20Other%20back%20on%20budget%3F', question: 'How do we get Other back on budget?', rule: 'over-budget', tone: 'negative' },
  coach_es: { title: 'Pausa Other — $12k arriba', url: '/finance/ask?prompt=%C2%BFC%C3%B3mo%20regresamos%20Other%3F', question: '¿Cómo regresamos Other al presupuesto?' },
  brief: { fresh: false, generated_at: '2026-09-04T13:30:53Z', title: null, detail: null },
  // Legacy v1 text that must never reach the v2 widget when the brief is stale.
  wolff: { top: null, weekend: null, directive: { icon: '', title: 'Pause Other — $12k over', detail: '' } },
}

export const underBudget = (() => {
  const d = clone(overBudget)
  d.variable = { budget: 38500, spent: 24120, left: 14380, days_left: 4, through_label: 'Sat Oct 31', through_date: '2026-10-31', status: 'ok' }
  d.status = 'ok'
  d.top_over = null
  d.budget_pace = [
    { name: 'Groceries', spent: 11200, budget: 13000, pct: 86, left: 1800 },
    { name: 'Transport', spent: 3900, budget: 5500, pct: 71, left: 1600 },
    { name: 'Dining Out', spent: 6400, budget: 15000, pct: 43, left: 8600 },
    { name: 'Other', spent: 2620, budget: 5000, pct: 52, left: 2380 },
  ]
  d.daily_spend = scaleTo(d.daily_spend, d.variable.spent)
  d.west_month = { ...d.west_month, projected_savings: 158200, surplus_so_far: 158200, gap: 0, pct: 104, tone: 'good' }
  d.coach = { title: 'Within budget — $3,595/day thru Sat Oct 31', url: '/finance/ask?prompt=Can%20we%20spend%20a%20little%20extra%20this%20weekend%3F', question: 'Can we spend a little extra this weekend?', rule: 'on-plan', tone: 'positive' }
  d.coach_es = { title: 'En presupuesto — $3,595/día hasta sáb 31 oct', url: '/finance/ask?prompt=%C2%BFPodemos%20gastar%20un%20poco%20extra%20este%20fin%3F', question: '¿Podemos gastar un poco extra este fin?' }
  return d
})()

export const tightBudget = (() => {
  const d = clone(underBudget)
  d.variable = { ...d.variable, spent: 36100, left: 2400, status: 'tight' }
  d.status = 'tight'
  d.daily_spend = scaleTo(d.daily_spend, d.variable.spent)
  d.coach = { ...d.coach, title: 'Within budget — $600/day thru Sat Oct 31' }
  d.coach_es = { ...d.coach_es, title: 'En presupuesto — $600/día hasta sáb 31 oct' }
  d.west_month = { ...overBudget.west_month, projected_savings: 131000, surplus_so_far: 131000, gap: 21583, pct: 86, tone: 'warn' }
  return d
})()

export const freshBrief = (() => {
  const d = clone(overBudget)
  d.brief = { fresh: true, generated_at: '2026-10-28T13:30:00Z', title: 'Hold Other spending through month end', detail: 'Other is 339% of budget.' }
  return d
})()

export const weekend = (() => {
  const d = clone(overBudget)
  d.updated_at = '2026-10-31T23:00:00.000Z'
  d.day = 31
  d.daily_spend = [...d.daily_spend, 1210, 860, 1405]
  const spent = d.daily_spend.reduce((s, v) => s + v, 0)
  d.variable = { ...d.variable, spent, left: d.variable.budget - spent, days_left: 1 }
  return d
})()

export const dayOne = (() => {
  const d = clone(underBudget)
  d.updated_at = '2026-11-01T14:10:00.000Z'
  d.month = '2026-11'
  d.day = 1
  d.days_in_month = 30
  d.variable = { budget: 38500, spent: 0, left: 38500, days_left: 30, through_label: 'Mon Nov 30', through_date: '2026-11-30', status: 'ok' }
  d.status = 'ok'
  d.top_over = null
  d.budget_pace = d.budget_pace.map(b => ({ ...b, spent: 0, pct: 0, left: b.budget }))
  d.daily_spend = [0]
  d.daily_budget_pace = 1283
  d.coach = { ...d.coach, title: 'Within budget — $1,283/day thru Mon Nov 30' }
  d.coach_es = { ...d.coach_es, title: 'En presupuesto — $1,283/día hasta lun 30 nov' }
  d.west_month = { label: 'Nov', month: '2026-11', target: 140000, projected_savings: 0, surplus_so_far: 0, gap: 140000, pct: 0, tone: 'warn' }
  d.upcoming = [{ date: '2026-11-01', label: 'Rent', amount: 47938, count: 7, kind: 'bill' }]
  return d
})()

/** Cached on the phone two days ago (offline stamp must carry the weekday). */
export const cachedTwoDaysAgo = (() => {
  const d = clone(overBudget)
  d.updated_at = '2026-10-26T15:15:00.000Z'
  return d
})()

/** Cached last month: the hero must not read as this month's room. */
export const cachedLastMonth = (() => {
  const d = clone(underBudget)
  d.updated_at = '2026-09-30T23:40:00.000Z'
  d.month = '2026-09'
  d.days_in_month = 30
  d.day = 30
  d.variable = { ...d.variable, through_label: 'Wed Sep 30', through_date: '2026-09-30', days_left: 1 }
  d.west_month = { ...d.west_month, label: 'Sep', month: '2026-09' }
  return d
})()

/** A v1 payload (no `v`): what an older API build would return. */
export const legacyV1 = {
  updated_at: '2026-10-28T15:15:00.000Z',
  month: '2026-10',
  day: 28,
  days_in_month: 31,
  safe_to_spend_day: 0,
  budget_pace: overBudget.budget_pace.map(({ left: _left, ...b }) => b),
  west_month: { target: 152583, projected_savings: 83536, gap: 69047, pct: 55 },
  wolff: { top: { title: 'Sep 5–6: sí cabe una cena', detail: '' }, weekend: null, directive: null },
}
