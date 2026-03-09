import { useRef, useEffect, useState, useCallback } from 'react'
import { ZoomIn, ZoomOut, Volume2, Lock } from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'

export default function TimelinePanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { currentTime, duration, setCurrentTime, mediaFile, waveformData, setWaveformData, deletedRegions, bRollItems, rangeStart, rangeEnd } = useEditorStore()
  const [zoom, setZoom] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const waveformRef = useRef<number[]>([])

  // Generate real waveform from audio file
  useEffect(() => {
    if (!mediaFile) {
      // No media file - show empty timeline
      waveformRef.current = []
      setWaveformData(null)
      return
    }

    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer
        const audioCtx = new AudioContext()
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
        const channelData = audioBuffer.getChannelData(0)

        // Downsample to ~500 points
        const samples = 500
        const blockSize = Math.floor(channelData.length / samples)
        const data: number[] = []
        for (let i = 0; i < samples; i++) {
          let sum = 0
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(channelData[i * blockSize + j])
          }
          data.push(sum / blockSize)
        }

        // Normalize
        const max = Math.max(...data, 0.01)
        const normalized = data.map((v) => v / max)
        waveformRef.current = normalized
        setWaveformData(normalized)
        audioCtx.close()
      } catch {
        // Failed to decode - leave empty
        waveformRef.current = []
        setWaveformData(null)
      }
    }

    reader.readAsArrayBuffer(mediaFile)
  }, [mediaFile, setWaveformData])

  // Draw waveform
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

    const data = waveformRef.current.length > 0 ? waveformRef.current : (waveformData || [])
    const barCount = Math.min(data.length, Math.floor(w / 3))
    const playedRatio = duration > 0 ? currentTime / duration : 0

    for (let i = 0; i < barCount; i++) {
      const x = (i / barCount) * w
      const amplitude = data[Math.floor((i / barCount) * data.length)] || 0.2
      const barH = amplitude * (h * 0.6)
      const y = (h * 0.3) + (h * 0.3 - barH / 2)
      const ratio = i / barCount

      if (ratio <= playedRatio) {
        const gradient = ctx.createLinearGradient(x, y, x, y + barH)
        gradient.addColorStop(0, 'rgba(124, 92, 255, 0.8)')
        gradient.addColorStop(1, 'rgba(92, 138, 255, 0.5)')
        ctx.fillStyle = gradient
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)'
      }
      ctx.fillRect(x, y, 2, barH)
    }

    // Draw deleted regions as red overlay
    if (duration > 0) {
      for (const region of deletedRegions) {
        const x1 = (region.startTime / duration) * w
        const x2 = (region.endTime / duration) * w
        ctx.fillStyle = 'rgba(239, 68, 68, 0.25)'
        ctx.fillRect(x1, 0, x2 - x1, h)
        // Scissors icon marker at start of deleted region
        ctx.fillStyle = 'rgba(239, 68, 68, 0.6)'
        ctx.fillRect(x1, 0, 1.5, h)
        // Small triangle marker
        ctx.beginPath()
        ctx.moveTo(x1 - 4, 0)
        ctx.lineTo(x1 + 4, 0)
        ctx.lineTo(x1, 6)
        ctx.closePath()
        ctx.fill()
      }
    }

    // Draw range selection
    if (duration > 0 && rangeStart !== null && rangeEnd !== null) {
      const rs = Math.min(rangeStart, rangeEnd)
      const re = Math.max(rangeStart, rangeEnd)
      const rx1 = (rs / duration) * w
      const rx2 = (re / duration) * w
      ctx.fillStyle = 'rgba(124, 92, 255, 0.15)'
      ctx.fillRect(rx1, 0, rx2 - rx1, h)
      ctx.strokeStyle = 'rgba(124, 92, 255, 0.6)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 2])
      ctx.beginPath()
      ctx.moveTo(rx1, 0); ctx.lineTo(rx1, h)
      ctx.moveTo(rx2, 0); ctx.lineTo(rx2, h)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Playhead
    const playheadX = playedRatio * w
    ctx.strokeStyle = '#FF6B8A'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(playheadX, 0)
    ctx.lineTo(playheadX, h)
    ctx.stroke()

    ctx.fillStyle = '#FF6B8A'
    ctx.beginPath()
    ctx.moveTo(playheadX - 5, 0)
    ctx.lineTo(playheadX + 5, 0)
    ctx.lineTo(playheadX, 7)
    ctx.closePath()
    ctx.fill()
  }, [currentTime, duration, zoom, waveformData, deletedRegions, rangeStart, rangeEnd])

  const seekFromCanvas = useCallback((clientX: number) => {
    const canvas = canvasRef.current
    if (!canvas || duration <= 0) return
    const rect = canvas.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    setCurrentTime(ratio * duration)
  }, [duration, setCurrentTime])

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    seekFromCanvas(e.clientX)
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true)
    seekFromCanvas(e.clientX)
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging) seekFromCanvas(e.clientX)
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const timeMarkers = []
  const step = Math.max(30, Math.floor(duration / 6))
  for (let t = 0; t <= duration; t += step) {
    const m = Math.floor(t / 60)
    const s = Math.floor(t % 60)
    timeMarkers.push(`${m}:${s.toString().padStart(2, '0')}`)
  }
  if (timeMarkers.length === 0) {
    timeMarkers.push('0:00')
  }

  const tracks = [
    { icon: '🎥', label: 'וידאו', color: 'bg-accent-blue', trackColor: 'bg-accent-blue/20', fillColor: 'bg-accent-blue/40' },
    { icon: '🎵', label: 'אודיו', color: 'bg-success', trackColor: 'bg-success/20', fillColor: 'bg-success/40' },
    { icon: '💬', label: 'כתוביות', color: 'bg-warning', trackColor: 'bg-warning/20', fillColor: 'bg-warning/40' },
  ]

  if (bRollItems.length > 0) {
    tracks.push({ icon: '🖼️', label: 'B-Roll', color: 'bg-pink-500', trackColor: 'bg-pink-500/20', fillColor: 'bg-pink-500/40' })
  }

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="bg-bg-deepest rounded-xl border border-white/[0.06] overflow-hidden h-full flex flex-col">
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

      <canvas
        ref={canvasRef}
        className="w-full flex-1 cursor-pointer min-h-[60px]"
        onClick={handleCanvasClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />

      <div className="px-2 py-2 space-y-1 border-t border-white/[0.06] shrink-0">
        {tracks.map((track) => (
          <div key={track.label} className="flex items-center gap-2">
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
            <div className={`flex-1 h-5 ${track.trackColor} rounded relative overflow-hidden`}>
              <div className={`h-full ${track.fillColor} rounded`} style={{ width: `${Math.min(progressPct + 15, 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
