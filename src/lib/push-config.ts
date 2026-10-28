// VAPID public key for web push — public by design (it's sent to the browser
// on subscribe). The matching private key is VAPID_PRIVATE_KEY: in Vercel for
// /api/finance/push/* (src/lib/automation/push.ts), and in .env.local for
// scripts/send-push.mjs as a fallback sender.
export const VAPID_PUBLIC_KEY = 'BO-sesgh9Zs6HGAQ6ZLAsK-NF1bRr_zB352Z7IXdWtc64xbc-3ZIjqjBojsKr3xzgWnx77yPeGCziSchSTkfgoU'
