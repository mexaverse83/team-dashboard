// Minimal typing for the parts of `web-push` the server uses (no @types package installed).
declare module 'web-push' {
  export interface PushSubscription {
    endpoint: string
    keys?: { p256dh: string; auth: string }
  }
  export interface SendResult { statusCode: number; body: string; headers: Record<string, string> }
  export class WebPushError extends Error {
    statusCode: number
    body: string
    endpoint: string
  }
  export function setVapidDetails(subject: string, publicKey: string, privateKey: string): void
  export function sendNotification(subscription: PushSubscription, payload?: string | Buffer | null, options?: { TTL?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high'; topic?: string }): Promise<SendResult>
  const webpush: {
    setVapidDetails: typeof setVapidDetails
    sendNotification: typeof sendNotification
  }
  export default webpush
}
