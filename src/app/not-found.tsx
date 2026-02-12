import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
      <div className="text-6xl">🛸</div>
      <h2 className="text-xl font-bold">Lost in Space</h2>
      <p className="text-sm text-[hsl(var(--text-secondary))]">
        This route doesn&apos;t exist in our star system.
      </p>
      <Link
        href="/"
        className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
      >
        Return to Base
      </Link>
    </div>
  )
}
