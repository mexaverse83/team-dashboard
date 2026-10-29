// The live (deterministic) brief computed in-process from the summary engine —
// shared by /insights, /push/daily and /reminders so none of them self-fetch.
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildSummary } from '@/lib/server/summary'
import { buildDeterministicBrief, type BriefSummary, type DeterministicBrief } from '@/lib/deterministic-brief'
import type { SummaryResponse } from '@/lib/summary/types'
import { isInsightUsable } from '@/lib/insight-freshness'
import type { PushMessage } from './push'

export type BriefLanguage = 'en' | 'es'

/** Mona's language (NU-2): FINANCE_LOCALE=en|es, Spanish by default to match today's coach voice. */
export function financeLocale(env: NodeJS.ProcessEnv = process.env): BriefLanguage {
  return (env.FINANCE_LOCALE || 'es').toLowerCase().startsWith('en') ? 'en' : 'es'
}

export async function loadLiveBrief(supabase: SupabaseClient, now: Date = new Date()): Promise<{ summary: SummaryResponse; brief: DeterministicBrief }> {
  const summary = await buildSummary(supabase, { months: 3, now })
  const brief = buildDeterministicBrief(summary as unknown as BriefSummary, { now, lang: financeLocale() })
  return { summary, brief }
}

export interface CachedBriefRow {
  insights_json?: Array<{ title?: string; detail?: string; category?: string | null; priority?: string }> | null
  generated_at?: string | null
  period_month?: string | null
}

export async function latestCachedBrief(supabase: SupabaseClient): Promise<CachedBriefRow | null> {
  const { data, error } = await supabase
    .from('finance_insights_cache')
    .select('insights_json, generated_at, period_month')
    .order('generated_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(`insights cache: ${error.message}`)
  return (data?.[0] as CachedBriefRow | undefined) ?? null
}

/** The LLM's WIDGET directive, only while it is still today's (insight-freshness). */
export function freshLlmDirective(row: CachedBriefRow | null, now: Date = new Date()): { title: string; detail?: string } | null {
  if (!row || !isInsightUsable(row.generated_at, { now, category: 'WIDGET', periodMonth: row.period_month })) return null
  const item = (row.insights_json || []).find(i => String(i.category || '').toUpperCase() === 'WIDGET' && i.title)
  return item ? { title: String(item.title), detail: item.detail ? String(item.detail) : undefined } : null
}

/** The morning push: today's directive (the LLM title only while fresh) plus the week and household lines. */
export function dailyPushMessage(brief: DeterministicBrief, llmTitle?: string | null): PushMessage {
  return {
    title: llmTitle || brief.directive.title,
    body: [brief.week.title, brief.household.title].filter(Boolean).join(' · '),
    url: brief.directive.url || '/finance',
  }
}
