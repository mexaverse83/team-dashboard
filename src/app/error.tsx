'use client'

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
      <div className="text-6xl">💥</div>
      <h2 className="text-xl font-bold">Something went wrong</h2>
      <p className="text-sm text-[hsl(var(--text-secondary))] max-w-md text-center">
        {error.message || 'An unexpected error occurred'}
      </p>
      <button
        onClick={reset}
        className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
      >
        Try again
      </button>
    </div>
  )
}
