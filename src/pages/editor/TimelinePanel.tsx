import { useRef, useEffect, useState, useCallback } from 'react'
import { ZoomIn, ZoomOut, Volume2, VolumeX, Lock, Unlock, Eye, EyeOff, Scissors, Trash2 } from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'
import { useUIStore } from '../../stores/uiStore'

export default function TimelinePanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { currentTime, duration, setCurrentTime, mediaFile, waveformData, setWaveformData, deletedRegions, bRollItems, rangeStart, rangeEnd, splitAtPlayhead, muteTimeRange, removeTimeRange, selectedBRollId, setSelectedBRollId, chapters } = useEditorStore()
  const trackStates = useEditorStore((s) => s.trackStates)
  const toggleTrackMute = useEditorStore((s) => s.toggleTrackMute)
  const toggleTrackLock = useEditorStore((s) => s.toggleTrackLock)
  const toggleTrackVisibility = useEditorStore((s) => s.toggleTrackVisibility)
  const { addToast } = useUIStore()
  const [zoom, setZoom] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const [selectionStart, setSelectionStart] = useState<number | null>(null)
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null)
  const waveformRef = useRef<number[]>([])

  // Generate real waveform from audio file
  useEffect(() => {
    if (!mediaFile) {
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

        const max = Math.max(...data, 0.01)
        const normalized = data.map((v) => v / max)
        waveformRef.current = normalized
        setWaveformData(normalized)
        audioCtx.close()
      } catch {
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
        ctx.fillStyle = 'rgba(239, 68, 68, 0.6)'
        ctx.fillRect(x1, 0, 1.5, h)
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

    // Chapter markers
    if (duration > 0 && chapters.length > 0) {
      for (const ch of chapters) {
        const cx = (ch.startTime / duration) * w
        ctx.fillStyle = 'rgba(250, 204, 21, 0.8)'
        ctx.beginPath()
        ctx.moveTo(cx - 5, 0)
        ctx.lineTo(cx + 5, 0)
        ctx.lineTo(cx, 8)
        ctx.closePath()
        ctx.fill()
        // Small vertical line
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.4)'
        ctx.lineWidth = 1
        ctx.setLineDash([2, 3])
        ctx.beginPath()
        ctx.moveTo(cx, 8)
        ctx.lineTo(cx, h)
        ctx.stroke()
        ctx.setLineDash([])
      }
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
  }, [currentTime, duration, zoom, waveformData, deletedRegions, rangeStart, rangeEnd, chapters])

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

  type TrackKey = 'video' | 'audio' | 'captions' | 'broll'

  const tracks: { key: TrackKey; icon: string; label: string; color: string; trackColor: string; fillColor: string }[] = [
    { key: 'video', icon: '🎥', label: 'וידאו', color: 'bg-accent-blue', trackColor: 'bg-accent-blue/20', fillColor: 'bg-accent-blue/40' },
    { key: 'audio', icon: '🎵', label: 'אודיו', color: 'bg-success', trackColor: 'bg-success/20', fillColor: 'bg-success/40' },
    { key: 'captions', icon: '💬', label: 'כתוביות', color: 'bg-warning', trackColor: 'bg-warning/20', fillColor: 'bg-warning/40' },
  ]

  if (bRollItems.length > 0) {
    tracks.push({ key: 'broll', icon: '🖼️', label: 'B-Roll', color: 'bg-pink-500', trackColor: 'bg-pink-500/20', fillColor: 'bg-pink-500/40' })
  }

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0

  const getTimeFromX = (clientX: number) => {
    const canvas = canvasRef.current
    if (!canvas || duration <= 0) return 0
    const rect = canvas.getBoundingClientRect()
    return Math.max(0, Math.min(duration, ((clientX - rect.left) / rect.width) * duration))
  }

  const handleSelectionStart = (e: React.MouseEvent) => {
    if (e.shiftKey) {
      setSelectionStart(getTimeFromX(e.clientX))
      setSelectionEnd(null)
    }
  }

  const handleSelectionMove = (e: React.MouseEvent) => {
    if (selectionStart !== null && e.buttons === 1) {
      setSelectionEnd(getTimeFromX(e.clientX))
    }
  }

  const handleSplit = () => {
    splitAtPlayhead()
    addToast(`פוצל ב-${Math.floor(currentTime / 60)}:${Math.floor(currentTime % 60).toString().padStart(2, '0')}`, 'info')
  }

  const handleMuteSelection = () => {
    if (selectionStart !== null && selectionEnd !== null) {
      const s = Math.min(selectionStart, selectionEnd)
      const e = Math.max(selectionStart, selectionEnd)
      muteTimeRange(s, e)
      addToast(`הושתק ${(e - s).toFixed(1)} שניות`, 'info')
      setSelectionStart(null); setSelectionEnd(null)
    }
  }

  const handleDeleteSelection = () => {
    if (selectionStart !== null && selectionEnd !== null) {
      const s = Math.min(selectionStart, selectionEnd)
      const e = Math.max(selectionStart, selectionEnd)
      removeTimeRange(s, e)
      addToast(`נמחק ${(e - s).toFixed(1)} שניות`, 'info')
      setSelectionStart(null); setSelectionEnd(null)
    }
  }

  const handleTrackItemClick = (trackKey: TrackKey) => {
    if (trackStates[trackKey].locked) {
      addToast('הטראק נעול. לחץ על המנעול לביטול נעילה', 'warning')
    }
  }

  return (
    <div className="bg-bg-deepest rounded-xl border border-white/[0.06] overflow-hidden h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-6 text-[10px] text-text-muted font-mono overflow-x-auto">
          {timeMarkers.map((marker, i) => (
            <span key={i} className="shrink-0">{marker}</span>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0 mr-2">
          <button onClick={handleSplit} className="p-1 hover:bg-white/[0.06] rounded transition-colors text-text-muted hover:text-accent-purple" title="פצל בנקודה הנוכחית">
            <Scissors size={12} />
          </button>
          {selectionStart !== null && selectionEnd !== null && (
            <>
              <button onClick={handleMuteSelection} className="p-1 hover:bg-white/[0.06] rounded transition-colors text-text-muted hover:text-yellow-400" title="השתק בחירה">
                <VolumeX size={12} />
              </button>
              <button onClick={handleDeleteSelection} className="p-1 hover:bg-white/[0.06] rounded transition-colors text-text-muted hover:text-red-400" title="מחק בחירה">
                <Trash2 size={12} />
              </button>
            </>
          )}
          <div className="w-px h-4 bg-white/[0.06]" />
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

      <div className="relative flex-1 min-h-[60px]"
        onMouseDown={handleSelectionStart} onMouseMove={handleSelectionMove}>
        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-pointer"
          onClick={handleCanvasClick}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
        {/* Selection overlay */}
        {selectionStart !== null && selectionEnd !== null && duration > 0 && (
          <div className="absolute top-0 bottom-0 bg-accent-purple/10 border-x border-accent-purple/40 pointer-events-none"
            style={{
              left: `${(Math.min(selectionStart, selectionEnd) / duration) * 100}%`,
              width: `${(Math.abs(selectionEnd - selectionStart) / duration) * 100}%`,
            }} />
        )}
        {/* Chapter marker click targets */}
        {duration > 0 && chapters.map((ch, i) => (
          <div
            key={`ch-${i}`}
            className="absolute top-0 w-3 h-3 cursor-pointer group z-10"
            style={{ left: `calc(${(ch.startTime / duration) * 100}% - 6px)` }}
            onClick={(e) => { e.stopPropagation(); setCurrentTime(ch.startTime) }}
            title={ch.title}
          >
            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-yellow-500/90 rounded text-[9px] text-black font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              {ch.title}
            </div>
          </div>
        ))}
      </div>

      <div className="px-2 py-2 space-y-1 border-t border-white/[0.06] shrink-0">
        {tracks.map((track) => {
          const state = trackStates[track.key]
          const isMuted = state.muted
          const isLocked = state.locked
          const isVisible = state.visible

          return (
            <div
              key={track.label}
              className={`flex items-center gap-2 transition-opacity ${isMuted ? 'opacity-40' : ''}`}
              onClick={() => handleTrackItemClick(track.key)}
            >
              <div className="flex items-center gap-1.5 w-28 shrink-0">
                <span className="text-xs">{track.icon}</span>
                <span className="text-[11px] text-text-secondary">{track.label}</span>
                <div className="flex items-center gap-0.5 mr-auto">
                  {/* Mute button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleTrackMute(track.key) }}
                    className={`p-0.5 rounded transition-colors ${isMuted ? 'text-red-400 hover:text-red-300' : 'text-text-muted hover:text-text-primary hover:bg-white/[0.06]'}`}
                    title={isMuted ? 'בטל השתקה' : 'השתק'}
                  >
                    {isMuted ? <VolumeX size={11} /> : <Volume2 size={11} />}
                  </button>
                  {/* Lock button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleTrackLock(track.key) }}
                    className={`p-0.5 rounded transition-colors ${isLocked ? 'text-yellow-400 hover:text-yellow-300' : 'text-text-muted hover:text-text-primary hover:bg-white/[0.06]'}`}
                    title={isLocked ? 'בטל נעילה' : 'נעל טראק'}
                  >
                    {isLocked ? <Lock size={11} /> : <Unlock size={11} />}
                  </button>
                  {/* Visibility button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleTrackVisibility(track.key) }}
                    className={`p-0.5 rounded transition-colors ${!isVisible ? 'text-gray-500 hover:text-gray-400' : 'text-text-muted hover:text-text-primary hover:bg-white/[0.06]'}`}
                    title={isVisible ? 'הסתר' : 'הצג'}
                  >
                    {isVisible ? <Eye size={11} /> : <EyeOff size={11} />}
                  </button>
                </div>
              </div>
              <div className={`flex-1 h-5 ${track.trackColor} rounded relative overflow-hidden ${isLocked ? 'cursor-not-allowed' : ''} ${!isVisible ? 'border border-dashed border-white/[0.12] opacity-20' : ''}`}
                style={isLocked ? { backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.03) 4px, rgba(255,255,255,0.03) 8px)' } : undefined}
              >
                {track.key === 'broll' ? (
                  bRollItems.map((item) => (
                    <div key={item.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (!isLocked) {
                          setSelectedBRollId(item.id)
                        } else {
                          addToast('הטראק נעול. לחץ על המנעול לביטול נעילה', 'warning')
                        }
                      }}
                      className={`absolute top-0 h-full rounded cursor-pointer transition-colors ${selectedBRollId === item.id ? 'bg-pink-500/60 ring-1 ring-pink-400' : 'bg-pink-500/40 hover:bg-pink-500/50'} ${isLocked ? 'cursor-not-allowed' : ''}`}
                      style={{
                        left: duration > 0 ? `${(item.startTime / duration) * 100}%` : '0%',
                        width: duration > 0 ? `${(item.duration / duration) * 100}%` : '0%',
                      }}
                      title={item.prompt || 'B-Roll'}>
                      <span className="text-[7px] text-white truncate px-0.5 leading-5">{item.prompt?.slice(0, 15) || 'B-Roll'}</span>
                    </div>
                  ))
                ) : (
                  <div className={`h-full ${track.fillColor} rounded`} style={{ width: `${Math.min(progressPct + 15, 100)}%` }} />
                )}
                {/* Playhead on track */}
                {duration > 0 && (
                  <div className="absolute top-0 bottom-0 w-px bg-pink-400/60 pointer-events-none" style={{ left: `${progressPct}%` }} />
                )}
              </div>
            </div>
          )
        })}
      </div>
      {/* Selection info */}
      {selectionStart !== null && selectionEnd !== null && (
        <div className="px-3 py-1 border-t border-white/[0.06] text-[10px] text-text-muted flex items-center gap-3">
          <span>בחירה: {Math.floor(Math.min(selectionStart, selectionEnd) / 60)}:{Math.floor(Math.min(selectionStart, selectionEnd) % 60).toString().padStart(2, '0')} - {Math.floor(Math.max(selectionStart, selectionEnd) / 60)}:{Math.floor(Math.max(selectionStart, selectionEnd) % 60).toString().padStart(2, '0')}</span>
          <span>({Math.abs(selectionEnd - selectionStart).toFixed(1)} שניות)</span>
          <button onClick={() => { setSelectionStart(null); setSelectionEnd(null) }} className="text-text-muted hover:text-text-primary">נקה</button>
        </div>
      )}
    </div>
  )
}
