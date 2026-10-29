// Widget payloads for the harness (shape of buildWidgetPayload()).
// The first group has no `today` block: what an older API build (or a phone's
// cached payload) returns, so the widget's fallback stays covered. Numbers
// follow the Oct 28 review: everyday budgets $38,500, spent $43,986.
// The v3 group at the end carries `today` (the daily goal-safe plan).

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

// ── v3: payload.today, the daily goal-safe plan (src/lib/widget/today.ts) ──
// The `today` blocks below were produced by buildToday() from the Oct 29 2026
// live summary (and small variations of it), so the numbers follow the real
// definition: pool = income − WEST capacity target − spent before today −
// still committed outside the everyday categories; 20% of the cushion over
// the everyday budgets held back; spread over the days left.

export const NOW_TODAY = '2026-10-29T09:44:00-06:00'
export const NOW_GOOD_DAY = '2026-10-22T09:10:00-06:00'
export const NOW_LAST_DAY = '2026-10-31T10:00:00-06:00'

const LIVE_DAILY = [16420, 1356, 892, 65, 596, 2493, 1045, 934, 792, 375, 3115, 0, 233, 153, 1670, 1500, 1541, 1310, 464, 779, 740, 1633, 1006, 308, 2227, 211, 288, 1923, 0]

/** Oct 29: everyday budgets $5.6k over, but WEST is 105% of its month target. */
export const goalSafe = (() => {
  const d = clone(overBudget)
  d.updated_at = '2026-10-29T15:44:00.000Z'
  d.day = 29
  d.variable = { budget: 38500, spent: 44069, left: -5569, days_left: 3, through_label: 'Sat Oct 31', through_date: '2026-10-31', status: 'over' }
  d.top_over = { name: 'Other', pct: 339, over_by: 11961 }
  d.budget_pace[2] = { name: 'Groceries', spent: 12127, budget: 13000, pct: 93, left: 873 }
  d.daily_spend = [...LIVE_DAILY]
  d.west_month = { label: 'Oct', month: '2026-10', target: 84869, projected_savings: 89127, surplus_so_far: 89127, gap: 0, pct: 105, tone: 'good', stretch_target: 115790 }
  d.upcoming = [
    { date: '2026-11-01', label: 'Rent', amount: 47907, count: 8, kind: 'bill' },
    { date: '2026-11-03', label: 'Regalo Rochie', amount: 989, count: 1, kind: 'msi' },
    { date: '2026-11-10', label: 'Seguro sportage', amount: 758, count: 1, kind: 'msi' },
  ]
  d.milestones = { baby_months: 6, west_funded_pct: 92.9, west_months_to_delivery: 14 }
  d.today = {
    date: '2026-10-29',
    basis: 'goal',
    state: 'ok',
    allowance: 1880,
    spent: 0,
    left: 1880,
    days_left: 3,
    tomorrow: 2820,
    pool: 7050,
    reserve: 1410,
    room: 5640,
    committed: 332,
    usual: 931,
    goal: {
      label: 'WEST',
      basis: 'capacity',
      month: '2026-10',
      target: 84869,
      projected: 89127,
      pct: 105,
      buffer: 4258,
      plan_pct: 102,
      no_spend_pct: 108,
      stretch_target: 115790,
      stretch_pct: 77
    },
    streak: 0,
    yesterday: {
      date: '2026-10-28',
      spent: 1923,
      room: 1790,
      diff: -133
    },
    week: [
      {
        date: '2026-10-23',
        spent: 1006,
        room: 1160,
        ok: true
      },
      {
        date: '2026-10-24',
        spent: 308,
        room: 1200,
        ok: true
      },
      {
        date: '2026-10-25',
        spent: 2227,
        room: 1330,
        ok: false
      },
      {
        date: '2026-10-26',
        spent: 211,
        room: 1260,
        ok: true
      },
      {
        date: '2026-10-27',
        spent: 288,
        room: 1480,
        ok: true
      },
      {
        date: '2026-10-28',
        spent: 1923,
        room: 1790,
        ok: false
      },
      {
        date: '2026-10-29',
        spent: 0,
        room: 1880,
        ok: null,
        today: true
      }
    ],
    nudge: {
      kind: 'skip',
      category: 'Other',
      over_by: 11961,
      url: '/finance/budgets'
    },
    goals: [
      {
        kind: 'west_month',
        month: '2026-10',
        pct: 105,
        buffer: 4258,
        room: 5640,
        days_left: 3,
        url: '/finance/investments?tab=Real%20Estate'
      },
      {
        kind: 'year',
        year: 2026,
        pct: 62,
        covered_pct: 57,
        on_track: false,
        shortfall: 157201,
        monthly_extra: 52401,
        url: '/finance/goals'
      },
      {
        kind: 'west_home',
        pct: 92.9,
        months: 14,
        url: '/finance/investments?tab=Real%20Estate'
      },
      {
        kind: 'emergency',
        pct: 96,
        months: 5.8,
        url: '/finance'
      }
    ]
  }
  return d
})()

/** Same day after a $640 lunch. */
export const spentToday = (() => {
  const d = clone(goalSafe)
  d.daily_spend[28] = 640
  d.variable = { ...d.variable, spent: 44709, left: -6209 }
  d.west_month = { ...d.west_month, projected_savings: 88487, surplus_so_far: 88487, pct: 104 }
  d.today = {
    date: '2026-10-29',
    basis: 'goal',
    state: 'ok',
    allowance: 1880,
    spent: 640,
    left: 1240,
    days_left: 3,
    tomorrow: 2560,
    pool: 7050,
    reserve: 1410,
    room: 5640,
    committed: 332,
    usual: 717,
    goal: {
      label: 'WEST',
      basis: 'capacity',
      month: '2026-10',
      target: 84869,
      projected: 88487,
      pct: 104,
      buffer: 3618,
      plan_pct: 102,
      no_spend_pct: 108,
      stretch_target: 115790,
      stretch_pct: 76
    },
    streak: 0,
    yesterday: {
      date: '2026-10-28',
      spent: 1923,
      room: 1790,
      diff: -133
    },
    week: [
      {
        date: '2026-10-23',
        spent: 1006,
        room: 1160,
        ok: true
      },
      {
        date: '2026-10-24',
        spent: 308,
        room: 1200,
        ok: true
      },
      {
        date: '2026-10-25',
        spent: 2227,
        room: 1330,
        ok: false
      },
      {
        date: '2026-10-26',
        spent: 211,
        room: 1260,
        ok: true
      },
      {
        date: '2026-10-27',
        spent: 288,
        room: 1480,
        ok: true
      },
      {
        date: '2026-10-28',
        spent: 1923,
        room: 1790,
        ok: false
      },
      {
        date: '2026-10-29',
        spent: 640,
        room: 1880,
        ok: null,
        today: true
      }
    ],
    nudge: {
      kind: 'skip',
      category: 'Other',
      over_by: 12601,
      url: '/finance/budgets'
    },
    goals: [
      {
        kind: 'west_month',
        month: '2026-10',
        pct: 104,
        buffer: 3618,
        room: 5000,
        days_left: 3,
        url: '/finance/investments?tab=Real%20Estate'
      },
      {
        kind: 'year',
        year: 2026,
        pct: 62,
        covered_pct: 57,
        on_track: false,
        shortfall: 157201,
        monthly_extra: 52401,
        url: '/finance/goals'
      },
      {
        kind: 'west_home',
        pct: 92.9,
        months: 14,
        url: '/finance/investments?tab=Real%20Estate'
      },
      {
        kind: 'emergency',
        pct: 96,
        months: 5.8,
        url: '/finance'
      }
    ]
  }
  return d
})()

/** Same day after $2,600: past today's room, WEST still on target. */
export const overToday = (() => {
  const d = clone(goalSafe)
  d.daily_spend[28] = 2600
  d.variable = { ...d.variable, spent: 46669, left: -8169 }
  d.west_month = { ...d.west_month, projected_savings: 86527, surplus_so_far: 86527, pct: 102 }
  d.today = {
    date: '2026-10-29',
    basis: 'goal',
    state: 'over',
    allowance: 1880,
    spent: 2600,
    left: -720,
    days_left: 3,
    tomorrow: 1780,
    pool: 7050,
    reserve: 1410,
    room: 5640,
    committed: 332,
    usual: 64,
    goal: {
      label: 'WEST',
      basis: 'capacity',
      month: '2026-10',
      target: 84869,
      projected: 86527,
      pct: 102,
      buffer: 1658,
      plan_pct: 102,
      no_spend_pct: 105,
      stretch_target: 115790,
      stretch_pct: 75
    },
    streak: 0,
    yesterday: {
      date: '2026-10-28',
      spent: 1923,
      room: 1790,
      diff: -133
    },
    week: [
      {
        date: '2026-10-23',
        spent: 1006,
        room: 1160,
        ok: true
      },
      {
        date: '2026-10-24',
        spent: 308,
        room: 1200,
        ok: true
      },
      {
        date: '2026-10-25',
        spent: 2227,
        room: 1330,
        ok: false
      },
      {
        date: '2026-10-26',
        spent: 211,
        room: 1260,
        ok: true
      },
      {
        date: '2026-10-27',
        spent: 288,
        room: 1480,
        ok: true
      },
      {
        date: '2026-10-28',
        spent: 1923,
        room: 1790,
        ok: false
      },
      {
        date: '2026-10-29',
        spent: 2600,
        room: 1880,
        ok: null,
        today: true
      }
    ],
    nudge: {
      kind: 'skip',
      category: 'Other',
      over_by: 14561,
      url: '/finance/budgets'
    },
    goals: [
      {
        kind: 'west_month',
        month: '2026-10',
        pct: 102,
        buffer: 1658,
        room: 3560,
        days_left: 2,
        url: '/finance/investments?tab=Real%20Estate'
      },
      {
        kind: 'year',
        year: 2026,
        pct: 62,
        covered_pct: 57,
        on_track: false,
        shortfall: 157201,
        monthly_extra: 52401,
        url: '/finance/goals'
      },
      {
        kind: 'west_home',
        pct: 92.9,
        months: 14,
        url: '/finance/investments?tab=Real%20Estate'
      },
      {
        kind: 'emergency',
        pct: 96,
        months: 5.8,
        url: '/finance'
      }
    ]
  }
  return d
})()

/** Even a no-spend day leaves WEST short: today's job is to save. */
export const goalRisk = (() => {
  const d = clone(goalSafe)
  d.west_month = { ...d.west_month, projected_savings: 80000, surplus_so_far: 80000, gap: 4869, pct: 94, tone: 'warn' }
  d.today = {
    date: '2026-10-29',
    basis: 'goal',
    state: 'risk',
    allowance: 0,
    spent: 0,
    left: 0,
    days_left: 3,
    tomorrow: 0,
    pool: -1750,
    reserve: 0,
    room: -1750,
    committed: 332,
    usual: 931,
    goal: {
      label: 'WEST',
      basis: 'capacity',
      month: '2026-10',
      target: 84869,
      projected: 80000,
      pct: 94,
      buffer: -4869,
      plan_pct: 100,
      no_spend_pct: 98,
      stretch_target: 115790,
      stretch_pct: 69
    },
    streak: 0,
    yesterday: {
      date: '2026-10-28',
      spent: 1923,
      room: 40,
      diff: -1883
    },
    week: [
      {
        date: '2026-10-23',
        spent: 1006,
        room: 460,
        ok: false
      },
      {
        date: '2026-10-24',
        spent: 308,
        room: 400,
        ok: true
      },
      {
        date: '2026-10-25',
        spent: 2227,
        room: 410,
        ok: false
      },
      {
        date: '2026-10-26',
        spent: 211,
        room: 110,
        ok: false
      },
      {
        date: '2026-10-27',
        spent: 288,
        room: 90,
        ok: false
      },
      {
        date: '2026-10-28',
        spent: 1923,
        room: 40,
        ok: false
      },
      {
        date: '2026-10-29',
        spent: 0,
        room: 0,
        ok: null,
        today: true
      }
    ],
    nudge: {
      kind: 'due',
      label: 'Rent',
      count: 8,
      amount: 47907,
      date: '2026-11-01',
      days: 3,
      url: '/finance/subscriptions'
    },
    goals: [
      {
        kind: 'west_month',
        month: '2026-10',
        pct: 94,
        buffer: -4869,
        room: 0,
        days_left: 3,
        url: '/finance/investments?tab=Real%20Estate'
      },
      {
        kind: 'year',
        year: 2026,
        pct: 62,
        covered_pct: 57,
        on_track: false,
        shortfall: 157201,
        monthly_extra: 52401,
        url: '/finance/goals'
      },
      {
        kind: 'west_home',
        pct: 92.9,
        months: 14,
        url: '/finance/investments?tab=Real%20Estate'
      },
      {
        kind: 'emergency',
        pct: 96,
        months: 5.8,
        url: '/finance'
      }
    ]
  }
  return d
})()

/** Oct 22, a good day: $640 spent of $1,790, a 4-day streak, WEST 112%. */
export const goodDay = (() => {
  const d = clone(goalSafe)
  d.updated_at = '2026-10-22T15:10:00.000Z'
  d.day = 22
  d.variable = { budget: 38500, spent: 21700, left: 16800, days_left: 10, through_label: 'Sat Oct 31', through_date: '2026-10-31', status: 'ok' }
  d.status = 'ok'
  d.top_over = null
  d.budget_pace = [
    { name: 'Groceries', spent: 8900, budget: 13000, pct: 68, left: 4100 },
    { name: 'Transport', spent: 3600, budget: 5500, pct: 65, left: 1900 },
    { name: 'Other', spent: 3100, budget: 5000, pct: 62, left: 1900 },
    { name: 'Dining Out', spent: 6100, budget: 15000, pct: 41, left: 8900 },
  ]
  d.daily_spend = [...scaleTo(LIVE_DAILY.slice(0, 15), 14726), 1500, 1541, 1310, 464, 779, 740, 640]
  d.west_month = { ...d.west_month, projected_savings: 95468, surplus_so_far: 95468, pct: 112 }
  d.upcoming = d.upcoming.slice(0, 2)
  d.today = {
    date: '2026-10-22',
    basis: 'goal',
    state: 'ok',
    allowance: 2280,
    spent: 640,
    left: 1640,
    days_left: 10,
    tomorrow: 2470,
    pool: 24239,
    reserve: 1360,
    room: 22879,
    committed: 332,
    usual: 1300,
    goal: {
      label: 'WEST',
      basis: 'capacity',
      month: '2026-10',
      target: 84869,
      projected: 95468,
      pct: 112,
      buffer: 10599,
      plan_pct: 102,
      no_spend_pct: 128,
      stretch_target: 115790,
      stretch_pct: 82
    },
    streak: 10,
    yesterday: {
      date: '2026-10-21',
      spent: 740,
      room: 2140,
      diff: 1400
    },
    week: [
      {
        date: '2026-10-16',
        spent: 1500,
        room: 1820,
        ok: true
      },
      {
        date: '2026-10-17',
        spent: 1541,
        room: 1840,
        ok: true
      },
      {
        date: '2026-10-18',
        spent: 1310,
        room: 1860,
        ok: true
      },
      {
        date: '2026-10-19',
        spent: 464,
        room: 1910,
        ok: true
      },
      {
        date: '2026-10-20',
        spent: 779,
        room: 2030,
        ok: true
      },
      {
        date: '2026-10-21',
        spent: 740,
        room: 2140,
        ok: true
      },
      {
        date: '2026-10-22',
        spent: 640,
        room: 2280,
        ok: null,
        today: true
      }
    ],
    nudge: {
      kind: 'fits',
      category: 'Dining Out',
      left: 8900,
      url: '/finance/budgets'
    },
    goals: [
      {
        kind: 'west_month',
        month: '2026-10',
        pct: 112,
        buffer: 10599,
        room: 22879,
        days_left: 10,
        url: '/finance/investments?tab=Real%20Estate'
      },
      {
        kind: 'year',
        year: 2026,
        pct: 62,
        covered_pct: 57,
        on_track: false,
        shortfall: 157201,
        monthly_extra: 52401,
        url: '/finance/goals'
      },
      {
        kind: 'west_home',
        pct: 92.9,
        months: 14,
        url: '/finance/investments?tab=Real%20Estate'
      },
      {
        kind: 'emergency',
        pct: 96,
        months: 5.8,
        url: '/finance'
      }
    ]
  }
  return d
})()

/** Oct 31, the month's last day: Rent + 7 tomorrow. */
export const lastDay = (() => {
  const d = clone(goalSafe)
  d.updated_at = '2026-10-31T16:00:00.000Z'
  d.day = 31
  d.daily_spend = [...LIVE_DAILY, 600, 0]
  d.variable = { ...d.variable, spent: 44669, left: -6169, days_left: 1 }
  d.west_month = { ...d.west_month, projected_savings: 88827, surplus_so_far: 88827, pct: 105 }
  d.today = {
    date: '2026-10-31',
    basis: 'goal',
    state: 'ok',
    allowance: 5160,
    spent: 0,
    left: 5160,
    days_left: 1,
    tomorrow: null,
    pool: 6450,
    reserve: 1290,
    room: 5160,
    committed: 332,
    usual: 2192,
    goal: {
      label: 'WEST',
      basis: 'capacity',
      month: '2026-10',
      target: 84869,
      projected: 88827,
      pct: 105,
      buffer: 3958,
      plan_pct: 102,
      no_spend_pct: 108,
      stretch_target: 115790,
      stretch_pct: 77
    },
    streak: 2,
    yesterday: {
      date: '2026-10-30',
      spent: 600,
      room: 2880,
      diff: 2280
    },
    week: [
      {
        date: '2026-10-25',
        spent: 2227,
        room: 1480,
        ok: false
      },
      {
        date: '2026-10-26',
        spent: 211,
        room: 1360,
        ok: true
      },
      {
        date: '2026-10-27',
        spent: 288,
        room: 1590,
        ok: true
      },
      {
        date: '2026-10-28',
        spent: 1923,
        room: 1920,
        ok: false
      },
      {
        date: '2026-10-29',
        spent: 0,
        room: 1920,
        ok: true
      },
      {
        date: '2026-10-30',
        spent: 600,
        room: 2880,
        ok: true
      },
      {
        date: '2026-10-31',
        spent: 0,
        room: 5160,
        ok: null,
        today: true
      }
    ],
    nudge: {
      kind: 'due',
      label: 'Rent',
      count: 8,
      amount: 47907,
      date: '2026-11-01',
      days: 1,
      url: '/finance/subscriptions'
    },
    goals: [
      {
        kind: 'west_month',
        month: '2026-10',
        pct: 105,
        buffer: 3958,
        room: 5160,
        days_left: 1,
        url: '/finance/investments?tab=Real%20Estate'
      },
      {
        kind: 'year',
        year: 2026,
        pct: 62,
        covered_pct: 57,
        on_track: false,
        shortfall: 157201,
        monthly_extra: 52401,
        url: '/finance/goals'
      },
      {
        kind: 'west_home',
        pct: 92.9,
        months: 14,
        url: '/finance/investments?tab=Real%20Estate'
      },
      {
        kind: 'emergency',
        pct: 96,
        months: 5.8,
        url: '/finance'
      }
    ]
  }
  return d
})()

/** Nov 1, 08:10, on the goal path: the processor posted rent and MSI at 06:05; nothing spent yet, an empty week. */
export const NOW_DAY_ONE_TODAY = '2026-11-01T08:10:00-06:00'
export const dayOneToday = (() => {
  const d = clone(dayOne)
  d.west_month = { label: 'Nov', month: '2026-11', target: 84869, projected_savings: 94140, surplus_so_far: 94140, gap: 0, pct: 111, tone: 'good', stretch_target: 115790 }
  d.upcoming = [
    { date: '2026-11-03', label: 'Regalo Rochie', amount: 989, count: 1, kind: 'msi' },
    { date: '2026-11-10', label: 'Seguro sportage', amount: 758, count: 1, kind: 'msi' },
  ]
  d.today = {
    date: '2026-11-01',
    basis: 'goal',
    state: 'ok',
    allowance: 2060,
    spent: 0,
    left: 2060,
    days_left: 30,
    tomorrow: 2130,
    pool: 67771,
    reserve: 5854,
    room: 61917,
    committed: 6319,
    usual: 1950,
    goal: {
      label: 'WEST',
      basis: 'capacity',
      month: '2026-11',
      target: 84869,
      projected: 94140,
      pct: 111,
      buffer: 9271,
      plan_pct: 107,
      no_spend_pct: 180,
      stretch_target: 115790,
      stretch_pct: 81
    },
    streak: 0,
    yesterday: null,
    week: [
      {
        date: '2026-11-01',
        spent: 0,
        room: 2060,
        ok: null,
        today: true
      }
    ],
    nudge: {
      kind: 'fits',
      category: 'Dining Out',
      left: 15000,
      url: '/finance/budgets'
    },
    goals: [
      {
        kind: 'west_month',
        month: '2026-11',
        pct: 111,
        buffer: 9271,
        room: 61917,
        days_left: 30,
        url: '/finance/investments?tab=Real%20Estate'
      },
      {
        kind: 'year',
        year: 2026,
        pct: 62,
        covered_pct: 57,
        on_track: false,
        shortfall: 157201,
        monthly_extra: 52401,
        url: '/finance/goals'
      },
      {
        kind: 'west_home',
        pct: 92.9,
        months: 14,
        url: '/finance/investments?tab=Real%20Estate'
      },
      {
        kind: 'emergency',
        pct: 96,
        months: 5.8,
        url: '/finance'
      }
    ]
  }
  return d
})()

/** Oct 29 with the forecast short of target (97%): following today's room still gets WEST there. */
export const goalShort = (() => {
  const d = clone(goalSafe)
  d.top_over = null
  d.west_month = { ...d.west_month, projected_savings: 82369, surplus_so_far: 82369, gap: 2500, pct: 97, tone: 'warn' }
  d.today = {
    date: '2026-10-29',
    basis: 'goal',
    state: 'ok',
    allowance: 2350,
    spent: 0,
    left: 2350,
    days_left: 3,
    tomorrow: 3520,
    pool: 7050,
    reserve: 0,
    room: 7050,
    committed: 332,
    usual: 931,
    goal: {
      label: 'WEST',
      basis: 'capacity',
      month: '2026-10',
      target: 84869,
      projected: 82369,
      pct: 97,
      buffer: -2500,
      plan_pct: 100,
      no_spend_pct: 108,
      stretch_target: 115790,
      stretch_pct: 71
    },
    streak: 3,
    yesterday: {
      date: '2026-10-28',
      spent: 1923,
      room: 2240,
      diff: 317
    },
    week: [
      {
        date: '2026-10-23',
        spent: 1006,
        room: 1440,
        ok: true
      },
      {
        date: '2026-10-24',
        spent: 308,
        room: 1500,
        ok: true
      },
      {
        date: '2026-10-25',
        spent: 2227,
        room: 1670,
        ok: false
      },
      {
        date: '2026-10-26',
        spent: 211,
        room: 1570,
        ok: true
      },
      {
        date: '2026-10-27',
        spent: 288,
        room: 1850,
        ok: true
      },
      {
        date: '2026-10-28',
        spent: 1923,
        room: 2240,
        ok: true
      },
      {
        date: '2026-10-29',
        spent: 0,
        room: 2350,
        ok: null,
        today: true
      }
    ],
    nudge: {
      kind: 'easy',
      category: 'Groceries',
      left: 873,
      days: 3,
      url: '/finance/budgets'
    },
    goals: [
      {
        kind: 'west_month',
        month: '2026-10',
        pct: 97,
        buffer: -2500,
        room: 7050,
        days_left: 3,
        url: '/finance/investments?tab=Real%20Estate'
      },
      {
        kind: 'year',
        year: 2026,
        pct: 62,
        covered_pct: 57,
        on_track: false,
        shortfall: 157201,
        monthly_extra: 52401,
        url: '/finance/goals'
      },
      {
        kind: 'west_home',
        pct: 92.9,
        months: 14,
        url: '/finance/investments?tab=Real%20Estate'
      },
      {
        kind: 'emergency',
        pct: 96,
        months: 5.8,
        url: '/finance'
      }
    ]
  }
  return d
})()
