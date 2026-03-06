import { useRef, useEffect, useState } from 'react'
import { ZoomIn, ZoomOut } from 'lucide-react'
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

    // Draw waveform
    const barCount = Math.floor(w / 3)
    for (let i = 0; i < barCount; i++) {
      const x = i * 3
      const amplitude = 0.2 + Math.random() * 0.6
      const barH = amplitude * (h * 0.6)
      const y = (h * 0.3) + (h * 0.3 - barH / 2)

      const gradient = ctx.createLinearGradient(x, y, x, y + barH)
      gradient.addColorStop(0, '#6366f1')
      gradient.addColorStop(1, '#3b82f6')
      ctx.fillStyle = gradient
      ctx.fillRect(x, y, 2, barH)
    }

    // Draw playhead
    const playheadX = (currentTime / duration) * w
    ctx.strokeStyle = '#E94560'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(playheadX, 0)
    ctx.lineTo(playheadX, h)
    ctx.stroke()
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

  return (
    <div className="bg-[#16213E] rounded-xl border border-white/5 overflow-hidden h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-4 text-xs text-white/40 overflow-x-auto">
          {timeMarkers.map((marker, i) => (
            <span key={i} className="shrink-0">{marker}</span>
          ))}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setZoom(Math.max(0.5, zoom - 0.25))} className="p-1 hover:bg-white/10 rounded transition-colors">
            <ZoomOut size={14} />
          </button>
          <span className="text-[10px] text-white/40 w-8 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(Math.min(3, zoom + 0.25))} className="p-1 hover:bg-white/10 rounded transition-colors">
            <ZoomIn size={14} />
          </button>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        className="w-full h-20 cursor-pointer"
        onClick={handleCanvasClick}
      />

      <div className="px-3 py-2 space-y-1.5 border-t border-white/10 shrink-0">
        {[
          { emoji: '🎥', label: 'וידאו', color: 'bg-blue-500' },
          { emoji: '🎵', label: 'אודיו', color: 'bg-green-500' },
          { emoji: '💬', label: 'כתוביות', color: 'bg-yellow-500' },
        ].map((track) => (
          <div key={track.label} className="flex items-center gap-2">
            <span className="text-xs w-20 flex items-center gap-1 text-white/50">
              <span>{track.emoji}</span> {track.label}
            </span>
            <div className={`flex-1 h-4 ${track.color}/30 rounded relative overflow-hidden`}>
              <div className={`h-full ${track.color}/60 rounded`} style={{ width: '85%' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
