import { useRef, useCallback } from 'react'
import { useTimelineStore } from '../../../stores/timelineStore'
import { useEditorStore } from '../../../stores/editorStore'

const HEADER_WIDTH = 140

export default function TimeRuler() {
  const rulerRef = useRef<HTMLDivElement>(null)
  const { zoom, scrollLeft, markers } = useTimelineStore()
  const { currentTime, duration, setCurrentTime } = useEditorStore()
  const addMarker = useTimelineStore((s) => s.addMarker)
  const removeMarker = useTimelineStore((s) => s.removeMarker)

  const pixelsPerSecond = zoom / 100 * 80 // base: 80px per second at 100% zoom
  const totalWidth = duration * pixelsPerSecond

  const getTimeFromX = useCallback((clientX: number) => {
    if (!rulerRef.current || duration <= 0) return 0
    const rect = rulerRef.current.getBoundingClientRect()
    const x = clientX - rect.left + scrollLeft
    return Math.max(0, Math.min(duration, x / pixelsPerSecond))
  }, [duration, pixelsPerSecond, scrollLeft])

  const handleRulerClick = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains('ruler-area')) return
    const time = getTimeFromX(e.clientX)
    setCurrentTime(time)
  }

  // Compute tick marks
  const getTickInterval = () => {
    const pps = pixelsPerSecond
    if (pps > 300) return { major: 1, minor: 0.25 }
    if (pps > 150) return { major: 5, minor: 1 }
    if (pps > 60) return { major: 10, minor: 5 }
    if (pps > 30) return { major: 30, minor: 10 }
    return { major: 60, minor: 30 }
  }

  const { major, minor } = getTickInterval()

  const formatRulerTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    if (m > 0) return `${m}:${s.toString().padStart(2, '0')}`
    return `0:${s.toString().padStart(2, '0')}`
  }

  const ticks: { time: number; isMajor: boolean }[] = []
  for (let t = 0; t <= duration; t += minor) {
    ticks.push({ time: t, isMajor: t % major < 0.01 || Math.abs(t % major - major) < 0.01 })
  }

  const playheadX = currentTime * pixelsPerSecond - scrollLeft

  return (
    <div className="relative h-7 border-b border-white/[0.06] bg-bg-deepest shrink-0 flex">
      {/* Header spacer */}
      <div className="shrink-0 border-l border-white/[0.06] bg-bg-panel" style={{ width: HEADER_WIDTH }} />

      {/* Ruler area */}
      <div
        ref={rulerRef}
        className="flex-1 relative overflow-hidden cursor-pointer ruler-area"
        onClick={handleRulerClick}
      >
        {/* Ticks */}
        {ticks.map(({ time, isMajor }) => {
          const x = time * pixelsPerSecond - scrollLeft
          if (x < -20 || x > (rulerRef.current?.clientWidth || 2000) + 20) return null
          return (
            <div key={time} className="absolute top-0 pointer-events-none" style={{ left: x }}>
              <div className={`w-px ${isMajor ? 'h-4 bg-white/20' : 'h-2 bg-white/10'}`} />
              {isMajor && (
                <span className="absolute top-3 -translate-x-1/2 text-[9px] text-text-muted font-mono whitespace-nowrap">
                  {formatRulerTime(time)}
                </span>
              )}
            </div>
          )
        })}

        {/* Markers */}
        {markers.map((marker) => {
          const x = marker.time * pixelsPerSecond - scrollLeft
          return (
            <div
              key={marker.id}
              className="absolute top-0 cursor-pointer group z-10"
              style={{ left: x - 5 }}
              onClick={(e) => { e.stopPropagation(); setCurrentTime(marker.time) }}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                removeMarker(marker.id)
              }}
            >
              <div
                className="w-0 h-0 border-l-[5px] border-r-[5px] border-t-[7px] border-l-transparent border-r-transparent"
                style={{ borderTopColor: marker.color }}
              />
              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded text-[9px] text-white font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg"
                style={{ backgroundColor: marker.color }}
              >
                {marker.label}
              </div>
            </div>
          )
        })}

        {/* Playhead triangle */}
        {duration > 0 && playheadX >= 0 && (
          <div
            className="absolute top-0 z-20 cursor-col-resize"
            style={{ left: playheadX - 6 }}
            onMouseDown={(e) => {
              e.stopPropagation()
              const handleMove = (moveE: MouseEvent) => {
                const time = getTimeFromX(moveE.clientX)
                setCurrentTime(time)
              }
              const handleUp = () => {
                document.removeEventListener('mousemove', handleMove)
                document.removeEventListener('mouseup', handleUp)
              }
              document.addEventListener('mousemove', handleMove)
              document.addEventListener('mouseup', handleUp)
            }}
          >
            <svg width="12" height="10" viewBox="0 0 12 10">
              <polygon points="0,0 12,0 6,10" fill="#FF6B8A" />
            </svg>
          </div>
        )}

        {/* Double-click to add marker */}
        <div
          className="absolute inset-0 ruler-area"
          onDoubleClick={(e) => {
            e.stopPropagation()
            const time = getTimeFromX(e.clientX)
            addMarker(time)
          }}
        />
      </div>
    </div>
  )
}
