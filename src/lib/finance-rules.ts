// Auto-categorization rules engine — applied client-side before transaction insert
// Mirrors finance_rules table.

export interface FinanceRule {
  id: string
  merchant_pattern: string
  match_mode: 'contains' | 'exact' | 'starts_with'
  amount_min: number | null
  amount_max: number | null
  owner: string | null
  category_id: string | null
  tags: string[]
  priority: number
  is_active: boolean
  learned: boolean
  match_count: number
  last_matched_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface TransactionInput {
  merchant?: string | null
  amount_mxn: number
  owner?: string | null
}

export interface RuleApplication {
  category_id: string
  tags: string[]
  rule_id: string
}

function matchesMerchant(rule: FinanceRule, merchant: string): boolean {
  if (!merchant) return false
  const m = merchant.toLowerCase().trim()
  const p = rule.merchant_pattern.toLowerCase().trim()
  if (!p) return false
  switch (rule.match_mode) {
    case 'exact': return m === p
    case 'starts_with': return m.startsWith(p)
    case 'contains':
    default: return m.includes(p)
  }
}

/**
 * Returns the highest-priority matching rule's action, or null.
 */
export function applyRules(rules: FinanceRule[], input: TransactionInput): RuleApplication | null {
  if (!input.merchant) return null
  const sorted = rules
    .filter(r => r.is_active)
    .sort((a, b) => a.priority - b.priority)
  for (const r of sorted) {
    if (!matchesMerchant(r, input.merchant)) continue
    if (r.amount_min != null && input.amount_mxn < r.amount_min) continue
    if (r.amount_max != null && input.amount_mxn > r.amount_max) continue
    if (r.owner && input.owner && r.owner !== input.owner) continue
    if (!r.category_id) continue
    return { category_id: r.category_id, tags: r.tags || [], rule_id: r.id }
  }
  return null
}

/**
 * Detect potential duplicates: same merchant, same amount within $1, within +/- 3 days.
 */
export interface DuplicateMatch {
  id: string
  date: string
  merchant: string | null
  amount_mxn: number
  similarity: 'exact' | 'likely'
}

export function detectDuplicates(
  candidate: { transaction_date: string; merchant?: string | null; amount_mxn: number },
  existing: Array<{ id: string; transaction_date: string; merchant?: string | null; amount_mxn: number }>,
): DuplicateMatch[] {
  if (!candidate.merchant) return []
  const candDate = new Date(candidate.transaction_date)
  const matches: DuplicateMatch[] = []
  for (const tx of existing) {
    if (!tx.merchant) continue
    if (tx.merchant.toLowerCase() !== candidate.merchant.toLowerCase()) continue
    const txDate = new Date(tx.transaction_date)
    const dayDiff = Math.abs((txDate.getTime() - candDate.getTime()) / (24 * 60 * 60 * 1000))
    if (dayDiff > 3) continue
    const amountDiff = Math.abs(tx.amount_mxn - candidate.amount_mxn)
    if (amountDiff > 1) continue
    matches.push({
      id: tx.id,
      date: tx.transaction_date,
      merchant: tx.merchant,
      amount_mxn: tx.amount_mxn,
      similarity: dayDiff === 0 && amountDiff < 0.01 ? 'exact' : 'likely',
    })
  }
  return matches
}

/**
 * Learn rules from transaction history.
 * For each merchant with >= minOccurrences transactions where >= confidenceThreshold
 * fraction share the same category, propose a rule.
 */
export interface LearnedRuleProposal {
  merchant_pattern: string
  match_mode: 'contains'
  category_id: string
  occurrences: number
  confidence: number
  example_amounts: number[]
}

export function learnRulesFromHistory(
  transactions: Array<{ merchant: string | null; category_id: string | null; amount_mxn: number; type?: string }>,
  options: { minOccurrences?: number; confidenceThreshold?: number } = {},
): LearnedRuleProposal[] {
  const minOccurrences = options.minOccurrences ?? 3
  const confidenceThreshold = options.confidenceThreshold ?? 0.8

  // Group by merchant
  const byMerchant: Record<string, Array<{ category_id: string | null; amount_mxn: number }>> = {}
  for (const t of transactions) {
    if (!t.merchant) continue
    if (t.type && t.type !== 'expense') continue
    if (!t.category_id) continue
    const key = t.merchant.toLowerCase().trim()
    if (!byMerchant[key]) byMerchant[key] = []
    byMerchant[key].push({ category_id: t.category_id, amount_mxn: t.amount_mxn })
  }

  const proposals: LearnedRuleProposal[] = []
  for (const [merchant, txs] of Object.entries(byMerchant)) {
    if (txs.length < minOccurrences) continue
    // Find dominant category
    const counts: Record<string, number> = {}
    for (const t of txs) {
      if (!t.category_id) continue
      counts[t.category_id] = (counts[t.category_id] || 0) + 1
    }
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    if (!top) continue
    const [topCat, topCount] = top
    const confidence = topCount / txs.length
    if (confidence < confidenceThreshold) continue
    proposals.push({
      merchant_pattern: merchant,
      match_mode: 'contains',
      category_id: topCat,
      occurrences: txs.length,
      confidence: Math.round(confidence * 100) / 100,
      example_amounts: txs.slice(0, 3).map(t => t.amount_mxn),
    })
  }
  return proposals.sort((a, b) => b.occurrences - a.occurrences)
}

/**
 * Anomaly detection: flag transactions whose amount is >2σ above the merchant's
 * historical mean (and at least 1.5x the mean to avoid noise on small variances).
 */
export interface AnomalyMatch {
  merchant: string
  amount_mxn: number
  mean: number
  std: number
  z_score: number
  history_count: number
}

export function detectAnomalies(
  transactions: Array<{ merchant: string | null; amount_mxn: number; transaction_date: string; type?: string }>,
  options: { sinceDate?: string; minHistory?: number } = {},
): AnomalyMatch[] {
  const minHistory = options.minHistory ?? 4
  const since = options.sinceDate
    ? new Date(options.sinceDate)
    : (() => { const d = new Date(); d.setDate(d.getDate() - 7); return d })()

  // Group history by merchant
  const byMerchant: Record<string, Array<{ amount_mxn: number; date: Date; merchant: string }>> = {}
  for (const t of transactions) {
    if (!t.merchant) continue
    if (t.type && t.type !== 'expense') continue
    const key = t.merchant.toLowerCase().trim()
    if (!byMerchant[key]) byMerchant[key] = []
    byMerchant[key].push({ amount_mxn: t.amount_mxn, date: new Date(t.transaction_date), merchant: t.merchant })
  }

  const anomalies: AnomalyMatch[] = []
  for (const list of Object.values(byMerchant)) {
    if (list.length < minHistory + 1) continue
    // Recent transactions to evaluate
    const recent = list.filter(t => t.date >= since)
    if (recent.length === 0) continue
    // Build baseline from older transactions only (avoid evaluating against itself)
    const baseline = list.filter(t => t.date < since)
    if (baseline.length < minHistory) continue
    const mean = baseline.reduce((s, x) => s + x.amount_mxn, 0) / baseline.length
    const variance = baseline.reduce((s, x) => s + (x.amount_mxn - mean) ** 2, 0) / baseline.length
    const std = Math.sqrt(variance)
    if (std <= 0) continue
    for (const r of recent) {
      const z = (r.amount_mxn - mean) / std
      if (z > 2 && r.amount_mxn > mean * 1.5) {
        anomalies.push({
          merchant: r.merchant,
          amount_mxn: r.amount_mxn,
          mean: Math.round(mean),
          std: Math.round(std),
          z_score: Math.round(z * 10) / 10,
          history_count: baseline.length,
        })
      }
    }
  }
  return anomalies
}
