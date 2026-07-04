// VAPID public key for web push — public by design (it's sent to the browser
// on subscribe). The matching private key lives only in .env.local on the
// home machine, where scripts/send-push.mjs runs.
export const VAPID_PUBLIC_KEY = 'BO-sesgh9Zs6HGAQ6ZLAsK-NF1bRr_zB352Z7IXdWtc64xbc-3ZIjqjBojsKr3xzgWnx77yPeGCziSchSTkfgoU'
