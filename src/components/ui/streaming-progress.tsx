'use client'

interface Step {
  label: string
  status: 'done' | 'active' | 'pending'
}

interface StreamingProgressProps {
  steps: Step[]
  color?: string
  className?: string
}

export function StreamingProgress({ steps, color = 'hsl(217, 91%, 60%)', className = '' }: StreamingProgressProps) {
  return (
    <div className={`flex items-center gap-0 w-full ${className}`}>
      {steps.map((step, i) => {
        const isDone = step.status === 'done'
        const isActive = step.status === 'active'

        return (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            {/* Circle */}
            <div className="flex flex-col items-center gap-1">
              <div
                className={`h-3 w-3 rounded-full border-2 transition-all duration-300 ${
                  isDone
                    ? 'border-transparent scale-100'
                    : isActive
                      ? 'border-transparent scale-110 animate-pulse'
                      : 'border-[hsl(var(--border))] bg-transparent'
                }`}
                style={isDone || isActive ? { backgroundColor: color, borderColor: color } : undefined}
              />
              <span className={`text-[10px] whitespace-nowrap ${
                isDone || isActive ? 'text-[hsl(var(--text-primary))]' : 'text-[hsl(var(--text-tertiary))]'
              }`}>
                {step.label}
              </span>
            </div>

            {/* Connecting line */}
            {i < steps.length - 1 && (
              <div className="flex-1 h-0.5 mx-1 rounded-full overflow-hidden bg-[hsl(var(--border))]">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: isDone ? '100%' : isActive ? '50%' : '0%',
                    backgroundColor: color,
                  }}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
