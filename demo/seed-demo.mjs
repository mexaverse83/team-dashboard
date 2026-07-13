#!/usr/bin/env node
// Seeds a FRESH demo Supabase project with a believable synthetic household:
// Mario & Karla, Monterrey. ~6 months of history, budgets, subscriptions,
// MSIs, goals, crypto, a GBM fund, and their condo purchase ("Torre MIRA").
// No real data is used — everything is generated.
//
// Usage:
//   node demo/seed-demo.mjs --url https://XXXX.supabase.co --key SERVICE_ROLE_KEY [--fresh]
//
// --fresh wipes previously seeded rows first (safe: this must ONLY ever be
// pointed at the demo project).

const args = process.argv.slice(2)
const val = (flag) => { const i = args.indexOf(flag); return i > -1 ? args[i + 1] : null }
const URL_ = val('--url') || process.env.DEMO_SUPABASE_URL
const KEY = val('--key') || process.env.DEMO_SUPABASE_SERVICE_KEY
const FRESH = args.includes('--fresh')
if (!URL_ || !KEY) { console.error('Usage: node demo/seed-demo.mjs --url <supabase-url> --key <service-role-key> [--fresh]'); process.exit(1) }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }

async function insert(table, rows) {
  if (!rows.length) return []
  const out = []
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200)
    const res = await fetch(`${URL_}/rest/v1/${table}`, { method: 'POST', headers: H, body: JSON.stringify(batch) })
    if (!res.ok) throw new Error(`${table} insert ${res.status}: ${(await res.text()).slice(0, 300)}`)
    out.push(...await res.json())
  }
  console.log(`  ${table}: +${rows.length}`)
  return out
}

async function wipe(table) {
  const res = await fetch(`${URL_}/rest/v1/${table}?id=not.is.null`, { method: 'DELETE', headers: H })
  if (!res.ok && res.status !== 404) console.warn(`  wipe ${table}: ${res.status}`)
}

// Deterministic RNG so re-runs produce the same world
let seed = 20260712
function rnd() { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const pick = (arr) => arr[Math.floor(rnd() * arr.length)]
const between = (a, b) => Math.round(a + rnd() * (b - a))

const OWNERS = ['Mario', 'Karla']
const iso = (d) => d.toISOString().slice(0, 10)
const today = new Date()
const monthsBack = 6

const CATEGORIES = [
  { name: 'Rent/Mortgage', icon: '🏠', color: '#8B5CF6', sort_order: 1, billing_cycle: 'monthly' },
  { name: 'Groceries', icon: '🛒', color: '#22C55E', sort_order: 2, billing_cycle: 'monthly' },
  { name: 'Dining Out', icon: '🍽️', color: '#F97316', sort_order: 3, billing_cycle: 'monthly' },
  { name: 'Transport', icon: '🚗', color: '#3B82F6', sort_order: 4, billing_cycle: 'monthly' },
  { name: 'Utilities', icon: '📡', color: '#06B6D4', sort_order: 5, billing_cycle: 'monthly' },
  { name: 'Electricity', icon: '⚡', color: '#EAB308', sort_order: 6, billing_cycle: 'bimonthly' },
  { name: 'Subscriptions', icon: '📱', color: '#EC4899', sort_order: 7, billing_cycle: 'monthly' },
  { name: 'Entertainment', icon: '🎬', color: '#A855F7', sort_order: 8, billing_cycle: 'monthly' },
  { name: 'Shopping', icon: '🛍️', color: '#F43F5E', sort_order: 9, billing_cycle: 'monthly' },
  { name: 'Health', icon: '💊', color: '#14B8A6', sort_order: 10, billing_cycle: 'monthly' },
  { name: 'Maintenance', icon: '🔧', color: '#64748B', sort_order: 11, billing_cycle: 'monthly' },
  { name: 'Other', icon: '📦', color: '#6B7280', sort_order: 12, billing_cycle: 'monthly' },
]

const BUDGETS = {
  'Rent/Mortgage': 30000, Groceries: 9500, 'Dining Out': 8000, Transport: 4200,
  Utilities: 1800, Electricity: 2600, Subscriptions: 1400, Entertainment: 2500,
  Shopping: 3500, Health: 2200, Maintenance: 1800, Other: 2500,
}

const MERCHANTS = {
  Groceries: ['HEB', 'Soriana', 'Costco', 'Walmart', 'Mercado San Juan'],
  'Dining Out': ['La Nacional', 'Tacos El Güero', 'Sushi Roll', 'Café Belmonte', 'El Rey del Cabrito', 'Rappi'],
  Transport: ['Uber', 'Gasolinera Pemex', 'OXXO Gas', 'Didi'],
  Entertainment: ['Cinépolis', 'Spotify Live', 'Boletia', 'Steam'],
  Shopping: ['Amazon MX', 'Liverpool', 'Zara', 'MercadoLibre'],
  Health: ['Farmacia Guadalajara', 'Farmacias del Ahorro', 'Dr. Consulta'],
  Maintenance: ['Home Depot', 'Ferretería Central', 'Plomero'],
  Other: ['OXXO', 'Papelería', 'Regalos Katy'],
}

async function main() {
  console.log(`🌱 Seeding Mario & Karla demo → ${URL_}`)

  const tables = ['finance_wolff_chat', 'finance_insights_cache', 'finance_transactions', 'finance_budgets',
    'finance_recurring', 'finance_installments', 'finance_debts', 'finance_emergency_fund', 'finance_goals',
    'finance_income_sources', 'finance_recurring_income', 'finance_crypto_holdings', 'finance_fixed_income',
    'finance_real_estate_targets', 'finance_categories']
  if (FRESH) { console.log('  wiping…'); for (const t of tables) await wipe(t) }

  // 1. Categories
  const cats = await insert('finance_categories', CATEGORIES.map(c => ({ ...c, type: 'expense', is_default: true })))
  const catId = Object.fromEntries(cats.map(c => [c.name, c.id]))

  // 2. Budgets — one row per month per category
  const budgetRows = []
  for (let m = monthsBack; m >= 0; m--) {
    const d = new Date(today.getFullYear(), today.getMonth() - m, 1)
    for (const [name, amount] of Object.entries(BUDGETS)) {
      budgetRows.push({ category_id: catId[name], month: iso(d), amount })
    }
  }
  await insert('finance_budgets', budgetRows)

  // 3. Income setup
  await insert('finance_recurring_income', [
    { name: 'Mario Salary', amount: 92000, owner: 'mario', category: 'salary', recurrence: 'monthly', day_of_month: 1, active: true },
    { name: 'Karla Salary', amount: 58000, owner: 'karla', category: 'salary', recurrence: 'monthly', day_of_month: 1, active: true },
  ])
  await insert('finance_income_sources', [
    { name: 'Karla aguinaldo', type: 'bonus', amount: 29000, frequency: 'yearly', is_active: true },
    { name: 'Freelance diseño', type: 'freelance', amount: 4500, frequency: 'monthly', is_active: true },
  ])

  // 4. Subscriptions / recurring charges
  await insert('finance_recurring', [
    { name: 'Renta Depto', merchant: 'Rent', amount: 21500, frequency: 'monthly', category_id: catId['Rent/Mortgage'], is_active: true, owner: 'Mario', next_due_date: iso(new Date(today.getFullYear(), today.getMonth() + 1, 1)) },
    { name: 'Torre MIRA', merchant: 'MIRA', amount: 8500, frequency: 'monthly', category_id: catId['Rent/Mortgage'], is_active: true, owner: 'Mario', next_due_date: iso(new Date(today.getFullYear(), today.getMonth() + 1, 1)) },
    { name: 'Internet Totalplay', merchant: 'Totalplay', amount: 650, frequency: 'monthly', category_id: catId['Utilities'], is_active: true, owner: 'Mario' },
    { name: 'Celular Mario', merchant: 'Telcel', amount: 480, frequency: 'monthly', category_id: catId['Utilities'], is_active: true, owner: 'Mario' },
    { name: 'Celular Karla', merchant: 'AT&T', amount: 450, frequency: 'monthly', category_id: catId['Utilities'], is_active: true, owner: 'Karla' },
    { name: 'Netflix', merchant: 'Netflix', amount: 299, frequency: 'monthly', category_id: catId['Subscriptions'], is_active: true, owner: 'Karla' },
    { name: 'Spotify Duo', merchant: 'Spotify', amount: 219, frequency: 'monthly', category_id: catId['Subscriptions'], is_active: true, owner: 'Mario' },
    { name: 'iCloud', merchant: 'Apple', amount: 179, frequency: 'monthly', category_id: catId['Subscriptions'], is_active: true, owner: 'Karla' },
    { name: 'Gym Smartfit x2', merchant: 'Smartfit', amount: 658, frequency: 'monthly', category_id: catId['Subscriptions'], is_active: true, owner: 'Mario' },
  ])

  // 5. MSIs + a credit card
  await insert('finance_installments', [
    { name: 'MacBook Air', merchant: 'Apple', total_amount: 28999, installment_amount: 2417, installment_count: 12, payments_made: 8, start_date: iso(new Date(today.getFullYear(), today.getMonth() - 8, 12)), end_date: iso(new Date(today.getFullYear(), today.getMonth() + 4, 12)), is_active: true, owner: 'Mario' },
    { name: 'Refrigerador', merchant: 'Liverpool', total_amount: 18600, installment_amount: 1550, installment_count: 12, payments_made: 10, start_date: iso(new Date(today.getFullYear(), today.getMonth() - 10, 5)), end_date: iso(new Date(today.getFullYear(), today.getMonth() + 2, 5)), is_active: true, owner: 'Karla' },
  ])
  await insert('finance_debts', [
    { name: 'TDC Banorte', balance: 26400, interest_rate: 36.5, minimum_payment: 1900, is_active: true, owner: 'Mario' },
  ])

  // 6. Emergency fund + goals
  await insert('finance_emergency_fund', [
    { target_amount: 180000, current_amount: 132000, risk_score: 3 },
  ])
  await insert('finance_goals', [
    { name: 'Viaje a Japón 2027', target_amount: 120000, current_amount: 38000, monthly_contribution: 6000, target_date: '2027-04-01', goal_type: 'savings', is_completed: false },
    { name: 'Fondo Torre MIRA', target_amount: 300000, current_amount: 96000, monthly_contribution: 15000, target_date: '2027-06-01', goal_type: 'savings', is_completed: false },
  ])

  // 7. Investments: GBM-style fund + a little crypto
  await insert('finance_fixed_income', [
    { instrument_type: 'debt_fund', name: 'GBM - Deuda Plus', institution: 'GBM', principal: 610000, annual_rate: 0.101, commission_rate: 0.0125, is_liquid: true, owner: 'Mario', tier: 1, notes: 'Demo fund' },
  ])
  await insert('finance_crypto_holdings', [
    { symbol: 'BTC', name: 'Bitcoin', quantity: 0.031, avg_cost_basis_usd: 53000, owner: 'Mario' },
    { symbol: 'ETH', name: 'Ethereum', quantity: 0.62, avg_cost_basis_usd: 2400, owner: 'Karla' },
  ])

  // 8. Their condo purchase — Torre MIRA
  await insert('finance_real_estate_targets', [
    {
      name: 'Torre MIRA 12-B', target_amount: 4850000, delivery_date: '2027-06-30',
      amount_paid: 690000, monthly_payment: 8500, monthly_payment_end: '2027-03-31',
      laura_infonavit_mxn: 260000, investment_annual_return: 0.10,
      appreciation_rate_annual: 0.11, current_market_value: 5150000, is_active: true,
      purchase_date: '2025-09-15',
    },
  ])

  // 9. Six months of transactions
  const txs = []
  for (let m = monthsBack; m >= 0; m--) {
    const first = new Date(today.getFullYear(), today.getMonth() - m, 1)
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
    const lastDay = m === 0 ? today.getDate() : daysInMonth
    const day = (d) => iso(new Date(first.getFullYear(), first.getMonth(), d))

    // Income on the 1st
    txs.push({ type: 'income', amount: 92000, amount_mxn: 92000, currency: 'MXN', merchant: 'Nómina Mario', description: 'Salario', transaction_date: day(1), owner: 'Mario', is_recurring: true })
    txs.push({ type: 'income', amount: 58000, amount_mxn: 58000, currency: 'MXN', merchant: 'Nómina Karla', description: 'Salario', transaction_date: day(1), owner: 'Karla', is_recurring: true })
    txs.push({ type: 'income', amount: 4500, amount_mxn: 4500, currency: 'MXN', merchant: 'Freelance', description: 'Diseño freelance', transaction_date: day(between(10, 20)), owner: 'Karla' })

    // Fixed charges day 1-5
    txs.push({ type: 'expense', amount: 21500, amount_mxn: 21500, currency: 'MXN', category_id: catId['Rent/Mortgage'], merchant: 'Rent', description: 'Renta depto', transaction_date: day(1), owner: 'Mario', is_recurring: true })
    txs.push({ type: 'expense', amount: 8500, amount_mxn: 8500, currency: 'MXN', category_id: catId['Rent/Mortgage'], merchant: 'MIRA', description: 'Mensualidad Torre MIRA', transaction_date: day(1), owner: 'Mario', is_recurring: true })
    for (const [mer, amt, dd] of [['Totalplay', 650, 2], ['Telcel', 480, 3], ['AT&T', 450, 3], ['Netflix', 299, 4], ['Spotify', 219, 5], ['Apple', 179, 8], ['Smartfit', 658, 2]]) {
      if (dd <= lastDay) txs.push({ type: 'expense', amount: amt, amount_mxn: amt, currency: 'MXN', category_id: catId[['Totalplay', 'Telcel', 'AT&T'].includes(mer) ? 'Utilities' : 'Subscriptions'], merchant: mer, description: 'Auto: recurring', transaction_date: day(dd), owner: pick(OWNERS), is_recurring: true })
    }
    // Electricity every other month
    if (first.getMonth() % 2 === 0 && 9 <= lastDay) {
      txs.push({ type: 'expense', amount: between(1900, 3400), amount_mxn: between(1900, 3400), currency: 'MXN', category_id: catId['Electricity'], merchant: 'CFE', description: 'Luz bimestral', transaction_date: day(9), owner: 'Mario', is_recurring: true })
    }
    // MSI charges
    if (12 <= lastDay) txs.push({ type: 'expense', amount: 2417, amount_mxn: 2417, currency: 'MXN', category_id: catId['Shopping'], merchant: 'Apple', description: 'MSI MacBook 12x', transaction_date: day(12), owner: 'Mario', is_recurring: true })
    if (5 <= lastDay) txs.push({ type: 'expense', amount: 1550, amount_mxn: 1550, currency: 'MXN', category_id: catId['Shopping'], merchant: 'Liverpool', description: 'MSI Refri 12x', transaction_date: day(5), owner: 'Karla', is_recurring: true })

    // Variable spending through the month
    for (let d = 2; d <= lastDay; d++) {
      if (rnd() < 0.55) txs.push({ type: 'expense', amount: 0, amount_mxn: between(280, 1450), currency: 'MXN', category_id: catId['Groceries'], merchant: pick(MERCHANTS.Groceries), transaction_date: day(d), owner: pick(OWNERS) })
      if (rnd() < 0.38) txs.push({ type: 'expense', amount: 0, amount_mxn: between(180, 1900), currency: 'MXN', category_id: catId['Dining Out'], merchant: pick(MERCHANTS['Dining Out']), transaction_date: day(d), owner: pick(OWNERS) })
      if (rnd() < 0.3) txs.push({ type: 'expense', amount: 0, amount_mxn: between(90, 620), currency: 'MXN', category_id: catId['Transport'], merchant: pick(MERCHANTS.Transport), transaction_date: day(d), owner: pick(OWNERS) })
      if (rnd() < 0.1) txs.push({ type: 'expense', amount: 0, amount_mxn: between(250, 2400), currency: 'MXN', category_id: catId['Shopping'], merchant: pick(MERCHANTS.Shopping), transaction_date: day(d), owner: pick(OWNERS) })
      if (rnd() < 0.09) txs.push({ type: 'expense', amount: 0, amount_mxn: between(150, 1200), currency: 'MXN', category_id: catId['Entertainment'], merchant: pick(MERCHANTS.Entertainment), transaction_date: day(d), owner: pick(OWNERS) })
      if (rnd() < 0.07) txs.push({ type: 'expense', amount: 0, amount_mxn: between(120, 900), currency: 'MXN', category_id: catId['Health'], merchant: pick(MERCHANTS.Health), transaction_date: day(d), owner: pick(OWNERS) })
      if (rnd() < 0.05) txs.push({ type: 'expense', amount: 0, amount_mxn: between(150, 1600), currency: 'MXN', category_id: catId['Maintenance'], merchant: pick(MERCHANTS.Maintenance), transaction_date: day(d), owner: 'Mario' })
      if (rnd() < 0.06) txs.push({ type: 'expense', amount: 0, amount_mxn: between(80, 700), currency: 'MXN', category_id: catId['Other'], merchant: pick(MERCHANTS.Other), transaction_date: day(d), owner: pick(OWNERS) })
    }
  }
  for (const t of txs) if (!t.amount) t.amount = t.amount_mxn
  await insert('finance_transactions', txs)

  // 10. A pre-written Wolff brief so Insights/widget/overview populate
  const now = new Date()
  await insert('finance_insights_cache', [{
    insights_json: [
      { type: 'forecast', icon: '📈', title: 'On pace to save $38,400 this month', detail: 'Projected savings clear the Torre MIRA monthly target with about $6,100 of margin. Dining Out is the swing category.', priority: 'high', category: 'PROJECTION' },
      { type: 'recommendation', icon: '🍽️', title: 'Cap Dining Out at $1,850 this week', detail: 'Dining is pacing 18% above budget. One cooked weekend keeps July aligned.', priority: 'high', category: 'WEEK' },
      { type: 'alert', icon: '🌮', title: 'Weekend verdict: one dinner out, not two', detail: 'The weekly envelope has $3,900 left across controllable categories.', priority: 'medium', category: 'WEEK' },
      { type: 'saving', icon: '🛒', title: 'Groceries best save: batch the Costco run', detail: 'Two combined trips instead of four saves roughly $600 in impulse adds.', priority: 'medium', category: 'WEEK' },
      { type: 'recommendation', icon: '🏗️', title: 'Move $15,000 to the MIRA fund', detail: 'This month\'s surplus already covers the transfer — move it before the weekend.', priority: 'high', category: 'WEST' },
      { type: 'forecast', icon: '🏢', title: 'Torre MIRA is 82% funded for delivery', detail: 'At the current savings pace the condo is fully funded two months before the June 2027 delivery.', priority: 'high', category: 'WEST' },
      { type: 'recommendation', icon: '🐺', title: 'Hold $1,900 for the Banorte payment', detail: 'Card minimum lands on the 28th.', priority: 'high', category: 'WIDGET' },
      { type: 'win', icon: '🏆', title: 'Transport is 22% under budget', detail: 'Carpooling three days a week is visibly paying off.', priority: 'low' },
      { type: 'alert', icon: '📉', title: 'ETH is 12% below cost basis', detail: 'Within normal volatility; no action needed at this size.', priority: 'low' },
    ],
    generated_at: now.toISOString(),
    period_month: `${now.toISOString().slice(0, 7)}-01`,
    expires_at: new Date(now.getTime() + 365 * 86400000).toISOString(),
  }])

  console.log('✅ Mario & Karla are alive. Point the demo deployment at this project and open /finance.')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
