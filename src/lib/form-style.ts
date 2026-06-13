/** Shared form input classes — one focus treatment everywhere.
 * Font is 16px on mobile (text-base) to stop iOS from auto-zooming the
 * viewport when a field gains focus; tightens to 14px on >=sm for desktop
 * density. py-2.5 keeps a comfortable touch height. */
export const inputCls = "w-full px-3 py-2.5 sm:py-2 rounded-lg bg-[hsl(var(--bg-elevated))] border border-[hsl(var(--border))] text-base sm:text-sm outline-none focus:border-emerald-500 transition-colors"
