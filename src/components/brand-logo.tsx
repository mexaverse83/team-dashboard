import { cn } from '@/lib/utils'

export function BrandLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={cn('block shrink-0', className)}
    >
      <rect x="2" y="2" width="60" height="60" rx="17" fill="#123F35" />
      <rect x="2.75" y="2.75" width="58.5" height="58.5" rx="16.25" stroke="#F5EEDC" strokeOpacity=".16" strokeWidth="1.5" />
      <path d="M12 11L25 17L32 10L39 17L52 11L48 37L40 47L32 55L24 47L16 37L12 11Z" fill="#F5EEDC" />
      <path d="M15.8 15.5L24.6 20L19.4 31.2L15.8 15.5Z" fill="#D9CDAF" />
      <path d="M48.2 15.5L39.4 20L44.6 31.2L48.2 15.5Z" fill="#D9CDAF" />
      <path d="M19 30L28.2 24L25.4 35L18.5 36.8L19 30Z" fill="#12352D" />
      <path d="M45 30L35.8 24L38.6 35L45.5 36.8L45 30Z" fill="#12352D" />
      <path d="M26 42L32 38L38 42L32 49L26 42Z" fill="#12352D" />
      <path d="M20.5 34.5L27.5 29L33 32.5L43.5 22" stroke="#D8AC56" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M38.5 22H43.5V27" stroke="#F1D28A" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
