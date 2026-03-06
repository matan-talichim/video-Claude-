import { useRef, useEffect, useState } from 'react'
import { ZoomIn, ZoomOut, Volume2, Lock } from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'

export default function TimelinePanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { currentTime, duration, setCurrentTime } = useEditorStore()
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * 2
    canvas.height = rect.height * 2
    ctx.scale(2, 2)

    const w = rect.width
    const h = rect.height

    ctx.clearRect(0, 0, w, h)

    // Draw waveform with gradient (purple→blue)
    const barCount = Math.floor(w / 3)
    for (let i = 0; i < barCount; i++) {
      const x = i * 3
      const amplitude = 0.2 + Math.random() * 0.6
      const barH = amplitude * (h * 0.6)
      const y = (h * 0.3) + (h * 0.3 - barH / 2)

      const gradient = ctx.createLinearGradient(x, y, x, y + barH)
      gradient.addColorStop(0, 'rgba(124, 92, 255, 0.6)')
      gradient.addColorStop(1, 'rgba(92, 138, 255, 0.3)')
      ctx.fillStyle = gradient
      ctx.fillRect(x, y, 2, barH)
    }

    // Draw playhead
    const playheadX = (currentTime / duration) * w

    // Playhead line
    ctx.strokeStyle = '#FF6B8A'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(playheadX, 0)
    ctx.lineTo(playheadX, h)
    ctx.stroke()

    // Playhead triangle
    ctx.fillStyle = '#FF6B8A'
    ctx.beginPath()
    ctx.moveTo(playheadX - 5, 0)
    ctx.lineTo(playheadX + 5, 0)
    ctx.lineTo(playheadX, 7)
    ctx.closePath()
    ctx.fill()
  }, [currentTime, duration, zoom])

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    setCurrentTime(ratio * duration)
  }

  const timeMarkers = []
  const step = 30
  for (let t = 0; t <= duration; t += step) {
    const m = Math.floor(t / 60)
    const s = t % 60
    timeMarkers.push(`${m}:${s.toString().padStart(2, '0')}`)
  }

  const tracks = [
    { icon: '🎥', label: 'וידאו', color: 'bg-accent-blue', trackColor: 'bg-accent-blue/20', fillColor: 'bg-accent-blue/40' },
    { icon: '🎵', label: 'אודיו', color: 'bg-success', trackColor: 'bg-success/20', fillColor: 'bg-success/40' },
    { icon: '💬', label: 'כתוביות', color: 'bg-warning', trackColor: 'bg-warning/20', fillColor: 'bg-warning/40' },
  ]

  return (
    <div className="bg-bg-deepest rounded-xl border border-white/[0.06] overflow-hidden h-full flex flex-col">
      {/* Time ruler */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-6 text-[10px] text-text-muted font-mono overflow-x-auto">
          {timeMarkers.map((marker, i) => (
            <span key={i} className="shrink-0">{marker}</span>
          ))}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 mr-2">
          <button onClick={() => setZoom(Math.max(0.5, zoom - 0.25))} className="p-1 hover:bg-white/[0.06] rounded transition-colors text-text-muted hover:text-text-primary">
            <ZoomOut size={13} />
          </button>
          <div className="w-16 h-1 bg-white/[0.06] rounded-full overflow-hidden">
            <div className="h-full bg-accent-purple/50 rounded-full" style={{ width: `${((zoom - 0.5) / 2.5) * 100}%` }} />
          </div>
          <button onClick={() => setZoom(Math.min(3, zoom + 0.25))} className="p-1 hover:bg-white/[0.06] rounded transition-colors text-text-muted hover:text-text-primary">
            <ZoomIn size={13} />
          </button>
          <span className="text-[10px] text-text-muted font-mono w-7 text-center">{Math.round(zoom * 100)}%</span>
        </div>
      </div>

      {/* Waveform canvas */}
      <canvas
        ref={canvasRef}
        className="w-full flex-1 cursor-pointer min-h-[60px]"
        onClick={handleCanvasClick}
      />

      {/* Tracks */}
      <div className="px-2 py-2 space-y-1 border-t border-white/[0.06] shrink-0">
        {tracks.map((track) => (
          <div key={track.label} className="flex items-center gap-2">
            {/* Track header */}
            <div className="flex items-center gap-1.5 w-24 shrink-0">
              <span className="text-xs">{track.icon}</span>
              <span className="text-[11px] text-text-secondary">{track.label}</span>
              <div className="flex items-center gap-0.5 mr-auto">
                <button className="p-0.5 hover:bg-white/[0.06] rounded transition-colors text-text-muted hover:text-text-primary">
                  <Volume2 size={10} />
                </button>
                <button className="p-0.5 hover:bg-white/[0.06] rounded transition-colors text-text-muted hover:text-text-primary">
                  <Lock size={10} />
                </button>
              </div>
            </div>
            {/* Track content */}
            <div className={`flex-1 h-5 ${track.trackColor} rounded relative overflow-hidden`}>
              <div className={`h-full ${track.fillColor} rounded`} style={{ width: '85%' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
