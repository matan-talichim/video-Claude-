import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { ZoomIn, ZoomOut, Volume2, VolumeX, Lock, Unlock, Eye, EyeOff, Scissors, Trash2 } from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'
// CaptionTrack type used via store
import { useUIStore } from '../../stores/uiStore'
import { formatTime, snapToGrid, generateSnapPoints, type SnapPoint } from '../../hooks/useDrag'

type DragTarget = {
  type: 'broll'
  id: string
  dragMode: 'move' | 'trim-start' | 'trim-end'
  startX: number
  origStart: number
  origDuration: number
} | {
  type: 'caption'
  trackId: string
  captionId: string
  dragMode: 'move' | 'trim-start' | 'trim-end'
  startX: number
  origStart: number
  origEnd: number
} | {
  type: 'playhead'
  startX: number
} | null

export default function TimelinePanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const trackContainerRef = useRef<HTMLDivElement>(null)
  const { currentTime, duration, setCurrentTime, mediaFile, waveformData, setWaveformData, deletedRegions, bRollItems, rangeStart, rangeEnd, splitAtPlayhead, muteTimeRange, removeTimeRange, selectedBRollId, setSelectedBRollId, chapters } = useEditorStore()
  const moveBRollItemTime = useEditorStore((s) => s.moveBRollItemTime)
  const trimBRollItem = useEditorStore((s) => s.trimBRollItem)
  const moveCaptionTime = useEditorStore((s) => s.moveCaptionTime)
  const trimCaption = useEditorStore((s) => s.trimCaption)
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

  // Drag state
  const [dragTarget, setDragTarget] = useState<DragTarget>(null)
  const [dragTooltip, setDragTooltip] = useState<{ x: number; text: string } | null>(null)
  const [snapLine, setSnapLine] = useState<number | null>(null)
  const [droppingFromSidebar, setDroppingFromSidebar] = useState(false)

  // Compute snap points
  const snapPoints = useMemo<SnapPoint[]>(() => {
    if (duration <= 0) return []
    const clipEdges: number[] = []
    for (const item of bRollItems) {
      clipEdges.push(item.startTime, item.startTime + item.duration)
    }
    const chapterTimes = chapters.map((c) => c.startTime)
    return generateSnapPoints(duration, currentTime, clipEdges, chapterTimes)
  }, [duration, currentTime, bRollItems, chapters])

  // Get track container width for pixel-to-time conversion
  const getTrackWidth = useCallback(() => {
    return trackContainerRef.current?.getBoundingClientRect().width || 400
  }, [])

  const getTimeFromTrackX = useCallback((clientX: number) => {
    const container = trackContainerRef.current
    if (!container || duration <= 0) return 0
    const rect = container.getBoundingClientRect()
    return Math.max(0, Math.min(duration, ((clientX - rect.left) / rect.width) * duration))
  }, [duration])

  const getPixelsPerSecond = useCallback(() => {
    if (duration <= 0) return 1
    return getTrackWidth() / duration
  }, [duration, getTrackWidth])

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

  const captionTracks = useEditorStore((s) => s.captionTracks)
  const setActiveCaptionTrack = useEditorStore((s) => s.setActiveCaptionTrack)
  const removeCaptionTrack = useEditorStore((s) => s.removeCaptionTrack)
  const hideAllCaptionTracks = useEditorStore((s) => s.hideAllCaptionTracks)

  type TrackKey = 'video' | 'audio' | 'captions' | 'broll'

  const tracks: { key: TrackKey; icon: string; label: string; color: string; trackColor: string; fillColor: string }[] = [
    { key: 'video', icon: '🎥', label: 'וידאו', color: 'bg-accent-blue', trackColor: 'bg-accent-blue/20', fillColor: 'bg-accent-blue/40' },
    { key: 'audio', icon: '🎵', label: 'אודיו', color: 'bg-success', trackColor: 'bg-success/20', fillColor: 'bg-success/40' },
  ]

  if (captionTracks.length === 0) {
    tracks.push({ key: 'captions', icon: '💬', label: 'כתוביות', color: 'bg-warning', trackColor: 'bg-warning/20', fillColor: 'bg-warning/40' })
  }

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

  // ─── Track Item Drag Handlers ───
  const handleItemDragStart = useCallback((
    e: React.MouseEvent,
    target: DragTarget
  ) => {
    e.stopPropagation()
    e.preventDefault()
    setDragTarget(target)

    const handleMove = (moveE: MouseEvent) => {
      if (!target) return
      const time = getTimeFromTrackX(moveE.clientX)
      const pps = getPixelsPerSecond()

      if (target.type === 'broll') {
        const deltaX = moveE.clientX - target.startX
        const deltaTime = deltaX / pps

        if (target.dragMode === 'move') {
          const rawTime = Math.max(0, target.origStart + deltaTime)
          const { time: snapped, snapped: isSnapped } = snapToGrid(rawTime, snapPoints, 0.15, moveE.altKey)
          setSnapLine(isSnapped ? snapped : null)
          setDragTooltip({ x: moveE.clientX, text: `${formatTime(snapped)} - ${formatTime(snapped + target.origDuration)}` })
          moveBRollItemTime(target.id, snapped)
        } else if (target.dragMode === 'trim-start') {
          const rawTime = Math.max(0, target.origStart + deltaTime)
          const endTime = target.origStart + target.origDuration
          const clampedTime = Math.min(rawTime, endTime - 0.1)
          const { time: snapped, snapped: isSnapped } = snapToGrid(clampedTime, snapPoints, 0.15, moveE.altKey)
          setSnapLine(isSnapped ? snapped : null)
          setDragTooltip({ x: moveE.clientX, text: formatTime(snapped) })
          trimBRollItem(target.id, 'start', snapped)
        } else if (target.dragMode === 'trim-end') {
          const endTime = target.origStart + target.origDuration + deltaTime
          const clampedTime = Math.max(target.origStart + 0.1, Math.min(endTime, duration))
          const { time: snapped, snapped: isSnapped } = snapToGrid(clampedTime, snapPoints, 0.15, moveE.altKey)
          setSnapLine(isSnapped ? snapped : null)
          setDragTooltip({ x: moveE.clientX, text: formatTime(snapped) })
          trimBRollItem(target.id, 'end', snapped)
        }
      } else if (target.type === 'caption') {
        const deltaX = moveE.clientX - target.startX
        const deltaTime = deltaX / pps

        if (target.dragMode === 'move') {
          const rawTime = Math.max(0, target.origStart + deltaTime)
          const capDuration = target.origEnd - target.origStart
          const { time: snapped, snapped: isSnapped } = snapToGrid(rawTime, snapPoints, 0.15, moveE.altKey)
          setSnapLine(isSnapped ? snapped : null)
          setDragTooltip({ x: moveE.clientX, text: `${formatTime(snapped)} - ${formatTime(snapped + capDuration)}` })
          moveCaptionTime(target.trackId, target.captionId, snapped)
        } else if (target.dragMode === 'trim-start') {
          const rawTime = Math.max(0, target.origStart + deltaTime)
          const clamped = Math.min(rawTime, target.origEnd - 0.1)
          const { time: snapped, snapped: isSnapped } = snapToGrid(clamped, snapPoints, 0.15, moveE.altKey)
          setSnapLine(isSnapped ? snapped : null)
          setDragTooltip({ x: moveE.clientX, text: formatTime(snapped) })
          trimCaption(target.trackId, target.captionId, 'start', snapped)
        } else if (target.dragMode === 'trim-end') {
          const rawTime = Math.min(duration, target.origEnd + deltaTime)
          const clamped = Math.max(rawTime, target.origStart + 0.1)
          const { time: snapped, snapped: isSnapped } = snapToGrid(clamped, snapPoints, 0.15, moveE.altKey)
          setSnapLine(isSnapped ? snapped : null)
          setDragTooltip({ x: moveE.clientX, text: formatTime(snapped) })
          trimCaption(target.trackId, target.captionId, 'end', snapped)
        }
      } else if (target.type === 'playhead') {
        setCurrentTime(time)
        setDragTooltip({ x: moveE.clientX, text: formatTime(time) })
      }
    }

    const handleUp = () => {
      setDragTarget(null)
      setDragTooltip(null)
      setSnapLine(null)
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }, [getTimeFromTrackX, getPixelsPerSecond, snapPoints, duration, moveBRollItemTime, trimBRollItem, moveCaptionTime, trimCaption, setCurrentTime])

  // ─── Drop from sidebar/B-Roll panel ───
  const handleTrackDragOver = useCallback((e: React.DragEvent) => {
    const data = e.dataTransfer.types
    if (data.includes('application/x-media-item') || data.includes('application/x-broll-item')) {
      e.preventDefault()
      setDroppingFromSidebar(true)
    }
  }, [])

  const handleTrackDragLeave = useCallback(() => {
    setDroppingFromSidebar(false)
  }, [])

  const handleTrackDrop = useCallback((e: React.DragEvent) => {
    setDroppingFromSidebar(false)
    const brollData = e.dataTransfer.getData('application/x-broll-item')
    if (brollData) {
      try {
        const item = JSON.parse(brollData)
        const dropTime = getTimeFromTrackX(e.clientX)
        const addBRollItem = useEditorStore.getState().addBRollItem
        addBRollItem({
          id: `broll-${Date.now()}`,
          imageUrl: item.imageUrl,
          startTime: dropTime,
          duration: item.duration || 3,
          source: item.source || 'upload',
          prompt: item.prompt,
        })
        addToast('B-Roll נוסף לציר הזמן', 'success')
      } catch { /* ignore */ }
    }
  }, [getTimeFromTrackX, addToast])

  // Keyboard Escape to cancel drag
  useEffect(() => {
    if (!dragTarget) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDragTarget(null)
        setDragTooltip(null)
        setSnapLine(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [dragTarget])

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

      {/* Track area with drag support */}
      <div
        ref={trackContainerRef}
        className={`px-2 py-2 space-y-1 border-t border-white/[0.06] shrink-0 relative ${droppingFromSidebar ? 'ring-2 ring-accent-purple/40 ring-dashed' : ''}`}
        onDragOver={handleTrackDragOver}
        onDragLeave={handleTrackDragLeave}
        onDrop={handleTrackDrop}
      >
        {/* Snap line indicator */}
        {snapLine !== null && duration > 0 && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-yellow-400/80 z-50 pointer-events-none"
            style={{ left: `${(snapLine / duration) * 100}%` }}
          />
        )}

        {/* Drag tooltip */}
        {dragTooltip && (
          <div
            className="fixed z-[100] bg-accent-purple text-white text-[10px] px-2 py-0.5 rounded font-mono pointer-events-none whitespace-nowrap"
            style={{ left: dragTooltip.x, top: (trackContainerRef.current?.getBoundingClientRect().top || 0) - 24 }}
          >
            {dragTooltip.text}
          </div>
        )}

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
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleTrackMute(track.key) }}
                    className={`p-0.5 rounded transition-colors ${isMuted ? 'text-red-400 hover:text-red-300' : 'text-text-muted hover:text-text-primary hover:bg-white/[0.06]'}`}
                    title={isMuted ? 'בטל השתקה' : 'השתק'}
                  >
                    {isMuted ? <VolumeX size={11} /> : <Volume2 size={11} />}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleTrackLock(track.key) }}
                    className={`p-0.5 rounded transition-colors ${isLocked ? 'text-yellow-400 hover:text-yellow-300' : 'text-text-muted hover:text-text-primary hover:bg-white/[0.06]'}`}
                    title={isLocked ? 'בטל נעילה' : 'נעל טראק'}
                  >
                    {isLocked ? <Lock size={11} /> : <Unlock size={11} />}
                  </button>
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
                  bRollItems.map((item) => {
                    const isItemDragging = dragTarget?.type === 'broll' && dragTarget.id === item.id
                    return (
                      <div key={item.id}
                        className={`absolute top-0 h-full rounded transition-shadow group ${
                          selectedBRollId === item.id ? 'bg-pink-500/60 ring-1 ring-pink-400' : 'bg-pink-500/40 hover:bg-pink-500/50'
                        } ${isLocked ? 'cursor-not-allowed' : 'cursor-grab'} ${
                          isItemDragging ? 'cursor-grabbing shadow-lg shadow-pink-500/30 z-50 scale-y-[1.1]' : ''
                        }`}
                        style={{
                          left: duration > 0 ? `${(item.startTime / duration) * 100}%` : '0%',
                          width: duration > 0 ? `${(item.duration / duration) * 100}%` : '0%',
                        }}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (!isLocked) setSelectedBRollId(item.id)
                          else addToast('הטראק נעול. לחץ על המנעול לביטול נעילה', 'warning')
                        }}
                        onMouseDown={(e) => {
                          if (isLocked) return
                          // Check if near edges for trimming
                          const rect = (e.target as HTMLElement).closest('.group')?.getBoundingClientRect()
                          if (!rect) return
                          const relX = e.clientX - rect.left
                          const edgeZone = Math.min(8, rect.width * 0.15)

                          if (relX <= edgeZone) {
                            handleItemDragStart(e, { type: 'broll', id: item.id, dragMode: 'trim-start', startX: e.clientX, origStart: item.startTime, origDuration: item.duration })
                          } else if (relX >= rect.width - edgeZone) {
                            handleItemDragStart(e, { type: 'broll', id: item.id, dragMode: 'trim-end', startX: e.clientX, origStart: item.startTime, origDuration: item.duration })
                          } else {
                            handleItemDragStart(e, { type: 'broll', id: item.id, dragMode: 'move', startX: e.clientX, origStart: item.startTime, origDuration: item.duration })
                          }
                        }}
                        title={item.prompt || 'B-Roll'}
                      >
                        {/* Trim handles */}
                        {!isLocked && (
                          <>
                            <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-pink-300/50 rounded-r z-10 opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-pink-300/50 rounded-l z-10 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </>
                        )}
                        <span className="text-[7px] text-white truncate px-1.5 leading-5 pointer-events-none">{item.prompt?.slice(0, 15) || 'B-Roll'}</span>
                      </div>
                    )
                  })
                ) : (
                  <div className={`h-full ${track.fillColor} rounded`} style={{ width: `${Math.min(progressPct + 15, 100)}%` }} />
                )}
                {/* Playhead on track */}
                {duration > 0 && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-pink-400/60 z-20 cursor-col-resize"
                    style={{ left: `${progressPct}%` }}
                    onMouseDown={(e) => {
                      e.stopPropagation()
                      handleItemDragStart(e, { type: 'playhead', startX: e.clientX })
                    }}
                  />
                )}
              </div>
            </div>
          )
        })}

        {/* Per-language caption tracks */}
        {captionTracks.map((cTrack) => (
          <div
            key={cTrack.id}
            className={`flex items-center gap-2 transition-opacity ${!cTrack.isVisible ? 'opacity-40' : ''}`}
          >
            <div className="flex items-center gap-1.5 w-28 shrink-0">
              <span className="text-xs">💬</span>
              <span className="text-[11px] text-text-secondary truncate">{cTrack.flag} {cTrack.languageName}</span>
              <div className="flex items-center gap-0.5 mr-auto">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (cTrack.isVisible) {
                      hideAllCaptionTracks()
                    } else {
                      setActiveCaptionTrack(cTrack.id)
                    }
                  }}
                  className={`p-0.5 rounded transition-colors ${cTrack.isVisible ? 'text-yellow-400 hover:text-yellow-300' : 'text-text-muted hover:text-text-primary hover:bg-white/[0.06]'}`}
                  title={cTrack.isVisible ? 'הסתר' : 'הצג על הסרטון'}
                >
                  {cTrack.isVisible ? <Eye size={11} /> : <EyeOff size={11} />}
                </button>
                {!cTrack.isSource && (
                  <button
                    onClick={(e) => { e.stopPropagation(); removeCaptionTrack(cTrack.id) }}
                    className="p-0.5 rounded transition-colors text-text-muted hover:text-red-400 hover:bg-white/[0.06]"
                    title="מחק שפה"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            </div>
            <div className={`flex-1 h-5 rounded relative overflow-hidden ${cTrack.isVisible ? 'bg-warning/20' : 'bg-white/[0.04]'}`}>
              {/* Caption blocks - draggable */}
              {duration > 0 && cTrack.captions.map((cap) => {
                const isCaptionDragging = dragTarget?.type === 'caption' && dragTarget.captionId === cap.id
                return (
                  <div
                    key={cap.id}
                    className={`absolute top-0 h-full rounded transition-shadow group cursor-grab ${
                      cTrack.isVisible
                        ? 'bg-warning/50 hover:bg-warning/60'
                        : 'bg-gray-500/30'
                    } ${isCaptionDragging ? 'cursor-grabbing shadow-lg shadow-yellow-500/20 z-50 scale-y-[1.1]' : ''}`}
                    style={{
                      left: `${(cap.startTime / duration) * 100}%`,
                      width: `${Math.max(0.5, ((cap.endTime - cap.startTime) / duration) * 100)}%`,
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation()
                      const rect = (e.target as HTMLElement).closest('.group')?.getBoundingClientRect()
                      if (!rect) return
                      const relX = e.clientX - rect.left
                      const edgeZone = Math.min(8, rect.width * 0.15)

                      if (relX <= edgeZone) {
                        handleItemDragStart(e, { type: 'caption', trackId: cTrack.id, captionId: cap.id, dragMode: 'trim-start', startX: e.clientX, origStart: cap.startTime, origEnd: cap.endTime })
                      } else if (relX >= rect.width - edgeZone) {
                        handleItemDragStart(e, { type: 'caption', trackId: cTrack.id, captionId: cap.id, dragMode: 'trim-end', startX: e.clientX, origStart: cap.startTime, origEnd: cap.endTime })
                      } else {
                        handleItemDragStart(e, { type: 'caption', trackId: cTrack.id, captionId: cap.id, dragMode: 'move', startX: e.clientX, origStart: cap.startTime, origEnd: cap.endTime })
                      }
                    }}
                  >
                    {/* Trim handles */}
                    <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-yellow-300/40 rounded-r z-10 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-yellow-300/40 rounded-l z-10 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <span className="text-[6px] text-white/60 truncate px-0.5 leading-5 pointer-events-none">{cap.text?.slice(0, 10)}</span>
                  </div>
                )
              })}
              {/* Playhead on track */}
              {duration > 0 && (
                <div className="absolute top-0 bottom-0 w-px bg-pink-400/60 pointer-events-none" style={{ left: `${progressPct}%` }} />
              )}
            </div>
          </div>
        ))}

        {/* Drop zone indicator */}
        {droppingFromSidebar && (
          <div className="absolute inset-0 border-2 border-dashed border-accent-purple/40 rounded-lg bg-accent-purple/5 flex items-center justify-center pointer-events-none z-30">
            <span className="text-accent-purple text-xs font-medium">שחרר כאן להוספה לציר הזמן</span>
          </div>
        )}
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
