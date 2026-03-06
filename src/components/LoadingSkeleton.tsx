export function CardSkeleton() {
  return (
    <div className="skeleton rounded-xl p-4">
      <div className="h-32 bg-white/[0.04] rounded-lg mb-3" />
      <div className="h-4 bg-white/[0.04] rounded w-3/4 mb-2" />
      <div className="h-3 bg-white/[0.04] rounded w-1/2" />
    </div>
  )
}

export function LineSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton h-4 rounded" style={{ width: `${70 + Math.random() * 30}%` }} />
      ))}
    </div>
  )
}

export function ProjectCardSkeleton() {
  return (
    <div className="skeleton rounded-2xl overflow-hidden">
      <div className="aspect-video bg-white/[0.04]" />
      <div className="p-4 space-y-2">
        <div className="h-4 bg-white/[0.04] rounded w-3/4" />
        <div className="flex items-center gap-2">
          <div className="h-3 bg-white/[0.04] rounded w-16" />
          <div className="h-3 bg-white/[0.04] rounded w-12" />
        </div>
      </div>
    </div>
  )
}

export function TranscriptLineSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="skeleton w-8 h-8 rounded-full" />
            <div className="skeleton h-3 w-20 rounded" />
            <div className="skeleton h-3 w-16 rounded" />
          </div>
          <div className="skeleton h-4 rounded w-full" />
          <div className="skeleton h-4 rounded w-4/5" />
        </div>
      ))}
    </div>
  )
}

export function TimelineTrackSkeleton() {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="skeleton w-20 h-8 rounded" />
          <div className="skeleton flex-1 h-8 rounded" />
        </div>
      ))}
    </div>
  )
}
