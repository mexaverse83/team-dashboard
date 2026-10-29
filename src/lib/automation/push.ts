// Server-side web push (AUTO-08, MOB-04). The VAPID private key comes from the
// environment (VAPID_PRIVATE_KEY in Vercel); without it every send is a
// reported no-op, never an error that breaks the calling job.
import type { SupabaseClient } from '@supabase/supabase-js'
import webpush, { type PushSubscription } from 'web-push'
import { VAPID_PUBLIC_KEY } from '@/lib/push-config'
import { ownersEqual } from '@/lib/owners'

export interface PushMessage {
  title: string
  body: string
  url?: string
}

export interface PushResult {
  sent: number
  failed: number
  pruned: number
  targeted: number
  /** Why nothing was attempted, when nothing was. */
  skipped?: 'no-vapid-key' | 'no-subscriptions'
  errors?: string[]
}

export function pushConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.VAPID_PRIVATE_KEY)
}

let configuredWith: string | null = null
function configure(env: NodeJS.ProcessEnv) {
  const key = env.VAPID_PRIVATE_KEY as string
  if (configuredWith === key) return
  webpush.setVapidDetails(env.VAPID_SUBJECT || 'mailto:bernardo.garza@nexaminds.ai', VAPID_PUBLIC_KEY, key)
  configuredWith = key
}

interface SubscriptionRow { endpoint: string; subscription: PushSubscription; owner?: string | null }

/**
 * Sends to every subscribed device, or only to `owner`'s devices (devices
 * with no owner recorded receive everything). Expired endpoints (404/410)
 * are deleted so the device re-subscribes.
 */
export async function sendPush(
  supabase: SupabaseClient,
  message: PushMessage,
  { owner = null, env = process.env }: { owner?: string | null; env?: NodeJS.ProcessEnv } = {},
): Promise<PushResult> {
  if (!pushConfigured(env)) return { sent: 0, failed: 0, pruned: 0, targeted: 0, skipped: 'no-vapid-key' }

  const { data, error } = await supabase.from('finance_push_subscriptions').select('endpoint, subscription, owner')
  if (error) throw new Error(`push subscriptions: ${error.message}`)
  const rows = ((data || []) as SubscriptionRow[]).filter(row => !owner || !row.owner || ownersEqual(row.owner, owner))
  if (rows.length === 0) return { sent: 0, failed: 0, pruned: 0, targeted: 0, skipped: 'no-subscriptions' }

  configure(env)
  const payload = JSON.stringify({ title: message.title, body: message.body, url: message.url || '/finance' })
  const result: PushResult = { sent: 0, failed: 0, pruned: 0, targeted: rows.length }
  const errors: string[] = []
  for (const row of rows) {
    try {
      await webpush.sendNotification(row.subscription, payload, { TTL: 12 * 60 * 60 })
      result.sent++
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) {
        await supabase.from('finance_push_subscriptions').delete().eq('endpoint', row.endpoint)
        result.pruned++
      } else {
        result.failed++
        errors.push(String(status || (err as Error).message))
      }
    }
  }
  if (errors.length) result.errors = errors.slice(0, 5)
  return result
}

/** Whether there is anyone to push to (cheap check before claiming reminder keys). */
export async function hasPushAudience(supabase: SupabaseClient, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  if (!pushConfigured(env)) return false
  const { count, error } = await supabase.from('finance_push_subscriptions').select('endpoint', { count: 'exact', head: true })
  return !error && (count ?? 0) > 0
}
