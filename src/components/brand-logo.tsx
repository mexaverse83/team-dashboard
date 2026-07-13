import { cn } from '@/lib/utils'

function ImageBadge({ src, className }: { src: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('block shrink-0 rounded-full bg-cover bg-center shadow-[0_0_0_1px_rgba(255,255,255,0.1)]', className)}
      style={{ backgroundImage: `url(${src})` }}
    />
  )
}

export function BrandLogo({ className }: { className?: string }) {
  return <ImageBadge src="/brand/household-logo.png" className={className} />
}

export function WolffAvatar({ className }: { className?: string }) {
  return <ImageBadge src="/brand/wolff-avatar.png" className={className} />
}
