'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Download, Smartphone } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { WIDGET_PREVIEW } from '@/widget/preview-images'

// "Phone widget" card for /finance/family (O3): download the Scriptable
// loader, install in three steps, and pick a parameter per widget.

const PHONES = [
  { value: '0', label: 'Bernardo' },
  { value: '1', label: 'Laura' },
] as const
type PhoneSlot = (typeof PHONES)[number]['value']

const PARAMETERS: Array<{ value: string; label: string }> = [
  { value: '(empty)', label: 'Left to spend, spend pace and WEST' },
  { value: 'coach', label: 'Medium: today’s Mona line instead of the chart' },
  { value: 'goals', label: 'Small: baby and WEST milestones' },
  { value: 'spend', label: 'Lock-screen circle: everyday budget gauge' },
  { value: 'quickadd', label: 'Lock screen: tap to add a transaction' },
  { value: 'lang=es', label: 'Spanish labels (combine, e.g. “coach lang=es”)' },
]

export function WidgetInstallCard({ className }: { className?: string }) {
  const [slot, setSlot] = useState<PhoneSlot>('0')
  const href = `/api/finance/widget-script?slot=${slot}`

  return (
    <Card className={className}>
      <CardHeader
        title={<span className="inline-flex items-center gap-2"><Smartphone className="h-4 w-4 text-fg-secondary" aria-hidden />Phone widget</span>}
        description="Home-screen and lock-screen widgets for iPhone, via the free Scriptable app. Numbers refresh about every 30 minutes and match this dashboard."
      />

      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-start">
        <figure className="flex flex-col gap-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2">
            <Image src={WIDGET_PREVIEW.light} alt="Medium widget, light appearance: $14,380 left to spend, on plan, WEST 104%" width={WIDGET_PREVIEW.width} height={WIDGET_PREVIEW.height} unoptimized className="h-auto w-full max-w-[364px] drop-shadow-sm" />
            <Image src={WIDGET_PREVIEW.dark} alt="The same widget in dark appearance" width={WIDGET_PREVIEW.width} height={WIDGET_PREVIEW.height} unoptimized className="h-auto w-full max-w-[364px]" />
          </div>
          <figcaption className="text-label text-fg-tertiary">Follows your iPhone’s light or dark appearance.</figcaption>
        </figure>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-label font-medium text-fg-secondary">Whose phone?</span>
            <Segmented options={PHONES.map(p => ({ value: p.value, label: p.label }))} value={slot} onChange={setSlot} ariaLabel="Whose phone" />
            <a href={href} download="Finance.js" className={buttonVariants({ variant: 'primary', size: 'md' })}>
              <Download className="h-4 w-4" aria-hidden />
              Download Finance.js
            </a>
            <p className="text-label text-fg-tertiary">Keep the file private: it carries this phone’s widget key.</p>
          </div>

          <ol className="flex flex-col gap-2 text-sm text-fg-secondary">
            <li><span className="font-semibold text-fg">1.</span> Install <span className="font-medium text-fg">Scriptable</span> from the App Store.</li>
            <li><span className="font-semibold text-fg">2.</span> Open the downloaded <span className="font-mono text-fg">Finance.js</span> on the iPhone and choose <span className="font-medium text-fg">Open in Scriptable</span>.</li>
            <li><span className="font-semibold text-fg">3.</span> Long-press the home or lock screen, add a <span className="font-medium text-fg">Scriptable</span> widget, tap it and pick <span className="font-medium text-fg">Finance</span> as the script.</li>
          </ol>

          <details className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
            <summary className="cursor-pointer select-none py-1 font-medium text-fg">Widget parameters</summary>
            <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 pb-1">
              {PARAMETERS.map(p => (
                <div key={p.value} className="contents">
                  <dt><code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-label text-fg">{p.value}</code></dt>
                  <dd className="text-fg-secondary">{p.label}</dd>
                </div>
              ))}
            </dl>
          </details>
        </div>
      </div>
    </Card>
  )
}

export default WidgetInstallCard
