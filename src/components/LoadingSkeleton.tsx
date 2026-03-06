export function CardSkeleton() {
  return (
    <div className="bg-[#16213E] rounded-xl p-4 animate-pulse">
      <div className="h-32 bg-white/5 rounded-lg mb-3" />
      <div className="h-4 bg-white/5 rounded w-3/4 mb-2" />
      <div className="h-3 bg-white/5 rounded w-1/2" />
    </div>
  )
}

export function LineSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-4 bg-white/5 rounded" style={{ width: `${70 + Math.random() * 30}%` }} />
      ))}
    </div>
  )
}
