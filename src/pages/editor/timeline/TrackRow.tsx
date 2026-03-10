import { useRef, useCallback, useState } from 'react'
import { useTimelineStore, type TimelineTrack } from '../../../stores/timelineStore'
import { useEditorStore } from '../../../stores/editorStore'
import { snapToGrid, generateSnapPoints, formatTime } from '../../../hooks/useDrag'
import TrackHeader from './TrackHeader'

interface TrackRowProps {
  track: TimelineTrack
}

export default function TrackRow({ track }: TrackRowProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const { zoom, scrollLeft, selectedClipIds, snapEnabled } = useTimelineStore()
  const { currentTime, duration, setCurrentTime } = useEditorStore()

  const selectClip = useTimelineStore((s) => s.selectClip)
  const toggleClipSelection = useTimelineStore((s) => s.toggleClipSelection)
  const showContextMenu = useTimelineStore((s) => s.showContextMenu)
  const markers = useTimelineStore((s) => s.markers)

  // Data from editor store based on track type
  const bRollItems = useEditorStore((s) => s.bRollItems)
  const captionTracks = useEditorStore((s) => s.captionTracks)
  const captions = useEditorStore((s) => s.captions)
  const waveformData = useEditorStore((s) => s.waveformData)
  const moveBRollItemTime = useEditorStore((s) => s.moveBRollItemTime)
  const trimBRollItem = useEditorStore((s) => s.trimBRollItem)
  const moveCaptionTime = useEditorStore((s) => s.moveCaptionTime)
  const trimCaption = useEditorStore((s) => s.trimCaption)
  const deletedRegions = useEditorStore((s) => s.deletedRegions)
  const backgroundMusic = useEditorStore((s) => s.backgroundMusic)
  const setBackgroundMusic = useEditorStore((s) => s.setBackgroundMusic)

  const pixelsPerSecond = zoom / 100 * 80
  const totalWidth = duration * pixelsPerSecond

  const playheadX = currentTime * pixelsPerSecond - scrollLeft

  // Collect all clip edges for snap points
  const getAllClipEdges = useCallback((): number[] => {
    const edges: number[] = []
    // B-Roll edges
    for (const item of bRollItems) {
      edges.push(item.startTime, item.startTime + item.duration)
    }
    // Caption edges
    for (const ct of captionTracks) {
      for (const c of ct.captions) {
        edges.push(c.startTime, c.endTime)
      }
    }
    for (const c of captions) {
      edges.push(c.startTime, c.endTime)
    }
    // Video segment edges
    const sorted = [...deletedRegions].sort((a, b) => a.startTime - b.startTime)
    let lastEnd = 0
    for (const region of sorted) {
      if (region.startTime > lastEnd) {
        edges.push(lastEnd, region.startTime)
      }
      lastEnd = region.endTime
    }
    if (lastEnd < duration) {
      edges.push(lastEnd, duration)
    }
    // Music
    if (backgroundMusic) {
      edges.push(backgroundMusic.startOffset || 0)
      edges.push((backgroundMusic.startOffset || 0) + backgroundMusic.duration)
    }
    return edges
  }, [bRollItems, captionTracks, captions, deletedRegions, duration, backgroundMusic])

  const getSnapPoints = useCallback(() => {
    return generateSnapPoints(
      duration,
      currentTime,
      getAllClipEdges(),
      markers.map((m) => m.time),
      5
    )
  }, [duration, currentTime, getAllClipEdges, markers])

  const getTimeFromX = useCallback((clientX: number) => {
    if (!trackRef.current || duration <= 0) return 0
    const rect = trackRef.current.getBoundingClientRect()
    const x = clientX - rect.left + scrollLeft
    return Math.max(0, Math.min(duration, x / pixelsPerSecond))
  }, [duration, pixelsPerSecond, scrollLeft])

  const handleTrackClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('track-bg')) {
      const time = getTimeFromX(e.clientX)
      setCurrentTime(time)
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    const time = getTimeFromX(e.clientX)
    showContextMenu(e.clientX, e.clientY, null, track.id, time)
  }

  // Render track content based on type
  const renderContent = () => {
    switch (track.type) {
      case 'video':
        return renderVideoTrack()
      case 'audio':
        return renderAudioTrack()
      case 'captions':
        return renderCaptionsTrack()
      case 'broll':
        return renderBRollTrack()
      case 'music':
        return renderMusicTrack()
      case 'text':
        return renderTextTrack()
      default:
        return null
    }
  }

  const renderVideoTrack = () => {
    if (duration <= 0) return null
    const segments: { start: number; end: number }[] = []
    let lastEnd = 0
    const sorted = [...deletedRegions].sort((a, b) => a.startTime - b.startTime)
    for (const region of sorted) {
      if (region.startTime > lastEnd) {
        segments.push({ start: lastEnd, end: region.startTime })
      }
      lastEnd = region.endTime
    }
    if (lastEnd < duration) {
      segments.push({ start: lastEnd, end: duration })
    }
    if (segments.length === 0) {
      segments.push({ start: 0, end: duration })
    }

    return segments.map((seg, i) => (
      <DraggableClipBlock
        key={`video-seg-${i}`}
        id={`video-seg-${i}`}
        startTime={seg.start}
        endTime={seg.end}
        color={track.color}
        label={`קליפ ${i + 1}`}
        trackLocked={track.locked}
        pixelsPerSecond={pixelsPerSecond}
        scrollLeft={scrollLeft}
        selected={selectedClipIds.includes(`video-seg-${i}`)}
        duration={duration}
        snapEnabled={snapEnabled}
        getSnapPoints={getSnapPoints}
        onClick={(e) => {
          if (e.shiftKey) selectClip(`video-seg-${i}`, true)
          else if (e.metaKey || e.ctrlKey) toggleClipSelection(`video-seg-${i}`)
          else selectClip(`video-seg-${i}`)
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          showContextMenu(e.clientX, e.clientY, `video-seg-${i}`, track.id, getTimeFromX(e.clientX))
        }}
        onMove={() => {}}
        onTrimStart={() => {}}
        onTrimEnd={() => {}}
      />
    ))
  }

  const renderAudioTrack = () => {
    if (duration <= 0) return null
    return (
      <div
        className="absolute top-0 h-full rounded overflow-hidden"
        style={{
          left: -scrollLeft,
          width: totalWidth,
        }}
      >
        {/* Waveform visualization */}
        <div className="w-full h-full relative" style={{ backgroundColor: `${track.color}15` }}>
          {waveformData && waveformData.length > 0 && (
            <WaveformDisplay data={waveformData} color={track.color} height={track.collapsed ? 24 : 40} />
          )}
          {!waveformData && (
            <div className="w-full h-full rounded" style={{ backgroundColor: `${track.color}30` }} />
          )}
        </div>
      </div>
    )
  }

  const renderCaptionsTrack = () => {
    const allCaptions = captionTracks.flatMap((ct) =>
      ct.isVisible ? ct.captions.map((c) => ({ ...c, trackId: ct.id, trackColor: '#FBBF24' })) : []
    )
    const capsToShow = allCaptions.length > 0
      ? allCaptions
      : captions.map((c) => ({ ...c, trackId: 'default', trackColor: '#FBBF24' }))

    return capsToShow.map((cap) => (
      <DraggableClipBlock
        key={cap.id}
        id={cap.id}
        startTime={cap.startTime}
        endTime={cap.endTime}
        color={track.color}
        label={cap.text?.slice(0, 20) || '...'}
        trackLocked={track.locked}
        pixelsPerSecond={pixelsPerSecond}
        scrollLeft={scrollLeft}
        selected={selectedClipIds.includes(cap.id)}
        duration={duration}
        snapEnabled={snapEnabled}
        getSnapPoints={getSnapPoints}
        onClick={(e) => {
          if (e.shiftKey) selectClip(cap.id, true)
          else if (e.metaKey || e.ctrlKey) toggleClipSelection(cap.id)
          else selectClip(cap.id)
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          showContextMenu(e.clientX, e.clientY, cap.id, track.id, getTimeFromX(e.clientX))
        }}
        onMove={(newStart) => {
          const capTrackId = 'trackId' in cap ? (cap as { trackId: string }).trackId : 'default'
          if (capTrackId !== 'default') {
            moveCaptionTime(capTrackId, cap.id, newStart)
          }
        }}
        onTrimStart={(newStart) => {
          const capTrackId = 'trackId' in cap ? (cap as { trackId: string }).trackId : 'default'
          if (capTrackId !== 'default') {
            trimCaption(capTrackId, cap.id, 'start', newStart)
          }
        }}
        onTrimEnd={(newEnd) => {
          const capTrackId = 'trackId' in cap ? (cap as { trackId: string }).trackId : 'default'
          if (capTrackId !== 'default') {
            trimCaption(capTrackId, cap.id, 'end', newEnd)
          }
        }}
        small
      />
    ))
  }

  const renderBRollTrack = () => {
    return bRollItems.map((item) => (
      <DraggableClipBlock
        key={item.id}
        id={item.id}
        startTime={item.startTime}
        endTime={item.startTime + item.duration}
        color={track.color}
        label={item.prompt?.slice(0, 15) || 'B-Roll'}
        trackLocked={track.locked}
        pixelsPerSecond={pixelsPerSecond}
        scrollLeft={scrollLeft}
        selected={selectedClipIds.includes(item.id)}
        duration={duration}
        snapEnabled={snapEnabled}
        getSnapPoints={getSnapPoints}
        onClick={(e) => {
          if (e.shiftKey) selectClip(item.id, true)
          else if (e.metaKey || e.ctrlKey) toggleClipSelection(item.id)
          else selectClip(item.id)
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          showContextMenu(e.clientX, e.clientY, item.id, track.id, getTimeFromX(e.clientX))
        }}
        onMove={(newStart) => moveBRollItemTime(item.id, newStart)}
        onTrimStart={(newStart) => trimBRollItem(item.id, 'start', newStart)}
        onTrimEnd={(newEnd) => trimBRollItem(item.id, 'end', newEnd)}
        hasThumb={!!item.imageUrl}
        thumbUrl={item.imageUrl}
      />
    ))
  }

  const renderMusicTrack = () => {
    const bgMusic = backgroundMusic
    if (!bgMusic?.blobUrl || duration <= 0) return null

    const musicStart = bgMusic.startOffset || 0
    const musicEnd = musicStart + bgMusic.duration

    return (
      <DraggableClipBlock
        id="music-bg"
        startTime={musicStart}
        endTime={musicEnd}
        color={track.color}
        label="🎵 מוזיקת רקע"
        trackLocked={track.locked}
        pixelsPerSecond={pixelsPerSecond}
        scrollLeft={scrollLeft}
        selected={selectedClipIds.includes('music-bg')}
        duration={duration}
        snapEnabled={snapEnabled}
        getSnapPoints={getSnapPoints}
        onClick={(e) => {
          if (e.shiftKey) selectClip('music-bg', true)
          else if (e.metaKey || e.ctrlKey) toggleClipSelection('music-bg')
          else selectClip('music-bg')
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          showContextMenu(e.clientX, e.clientY, 'music-bg', track.id, getTimeFromX(e.clientX))
        }}
        onMove={(newStart) => {
          if (bgMusic) {
            setBackgroundMusic({ ...bgMusic, startOffset: Math.max(0, newStart) })
          }
        }}
        onTrimStart={(newStart) => {
          if (bgMusic) {
            const origEnd = (bgMusic.startOffset || 0) + bgMusic.duration
            const clamped = Math.max(0, Math.min(newStart, origEnd - 0.1))
            setBackgroundMusic({
              ...bgMusic,
              startOffset: clamped,
              duration: origEnd - clamped,
            })
          }
        }}
        onTrimEnd={(newEnd) => {
          if (bgMusic) {
            const origStart = bgMusic.startOffset || 0
            const clamped = Math.max(origStart + 0.1, newEnd)
            setBackgroundMusic({
              ...bgMusic,
              duration: clamped - origStart,
            })
          }
        }}
      />
    )
  }

  const renderTextTrack = () => {
    return null
  }

  return (
    <div className={`flex transition-all ${track.collapsed ? 'h-6' : 'h-10'} ${!track.visible ? 'opacity-30' : ''}`}>
      <TrackHeader track={track} />
      <div
        ref={trackRef}
        className={`flex-1 relative overflow-hidden cursor-pointer ${
          track.locked ? 'cursor-not-allowed' : ''
        }`}
        style={{
          backgroundImage: track.locked
            ? 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.02) 4px, rgba(255,255,255,0.02) 8px)'
            : undefined,
          backgroundColor: `${track.color}08`,
        }}
        onClick={handleTrackClick}
        onContextMenu={handleContextMenu}
      >
        {/* Track background grid lines */}
        <div className="absolute inset-0 track-bg" />

        {/* Content */}
        {renderContent()}

        {/* Playhead line on this track */}
        {duration > 0 && playheadX >= 0 && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-[#FF6B8A]/60 z-20 pointer-events-none"
            style={{ left: playheadX }}
          />
        )}
      </div>
    </div>
  )
}

// ─── Draggable Clip Block (used for ALL clip types) ───
function DraggableClipBlock({ id, startTime, endTime, color, label, trackLocked, pixelsPerSecond, scrollLeft, selected, duration, snapEnabled, getSnapPoints, onClick, onContextMenu, onMove, onTrimStart, onTrimEnd, hasThumb, thumbUrl, small }: {
  id: string
  startTime: number
  endTime: number
  color: string
  label: string
  trackLocked: boolean
  pixelsPerSecond: number
  scrollLeft: number
  selected: boolean
  duration: number
  snapEnabled: boolean
  getSnapPoints: () => ReturnType<typeof generateSnapPoints>
  onClick: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
  onMove: (newStart: number) => void
  onTrimStart: (newStart: number) => void
  onTrimEnd: (newEnd: number) => void
  hasThumb?: boolean
  thumbUrl?: string
  small?: boolean
}) {
  const x = startTime * pixelsPerSecond - scrollLeft
  const w = (endTime - startTime) * pixelsPerSecond

  const [dragMode, setDragMode] = useState<'none' | 'move' | 'trim-start' | 'trim-end'>('none')
  const [tooltipTimes, setTooltipTimes] = useState<{ start: number; end: number } | null>(null)
  const [isSnapping, setIsSnapping] = useState(false)

  if (x + w < -50 || x > 3000) return null

  const handleMouseDown = (e: React.MouseEvent) => {
    if (trackLocked) return
    e.stopPropagation()
    e.preventDefault()

    const rect = e.currentTarget.getBoundingClientRect()
    const relX = e.clientX - rect.left
    const edgeZone = Math.min(8, rect.width * 0.12)

    let mode: 'move' | 'trim-start' | 'trim-end' = 'move'
    if (relX <= edgeZone) mode = 'trim-start'
    else if (relX >= rect.width - edgeZone) mode = 'trim-end'

    setDragMode(mode)

    const startClientX = e.clientX
    const origStart = startTime
    const origEnd = endTime
    const snapPoints = getSnapPoints()

    const handleMove = (moveE: MouseEvent) => {
      const deltaX = moveE.clientX - startClientX
      const deltaTime = deltaX / pixelsPerSecond
      const altPressed = moveE.altKey

      if (mode === 'move') {
        const rawTime = Math.max(0, origStart + deltaTime)
        const itemDuration = origEnd - origStart
        const clampedTime = Math.min(rawTime, duration - itemDuration)
        const { time: snappedTime, snapped } = snapEnabled
          ? snapToGrid(clampedTime, snapPoints, 0.15, altPressed)
          : { time: clampedTime, snapped: false }
        setIsSnapping(snapped)
        setTooltipTimes({ start: snappedTime, end: snappedTime + itemDuration })
        onMove(snappedTime)
      } else if (mode === 'trim-start') {
        const rawTime = Math.max(0, origStart + deltaTime)
        const clampedTime = Math.min(rawTime, origEnd - 0.1)
        const { time: snappedTime, snapped } = snapEnabled
          ? snapToGrid(clampedTime, snapPoints, 0.15, altPressed)
          : { time: clampedTime, snapped: false }
        setIsSnapping(snapped)
        setTooltipTimes({ start: snappedTime, end: origEnd })
        onTrimStart(snappedTime)
      } else if (mode === 'trim-end') {
        const rawTime = Math.min(duration, origEnd + deltaTime)
        const clampedTime = Math.max(rawTime, origStart + 0.1)
        const { time: snappedTime, snapped } = snapEnabled
          ? snapToGrid(clampedTime, snapPoints, 0.15, altPressed)
          : { time: clampedTime, snapped: false }
        setIsSnapping(snapped)
        setTooltipTimes({ start: origStart, end: snappedTime })
        onTrimEnd(snappedTime)
      }
    }

    const handleUp = () => {
      setDragMode('none')
      setTooltipTimes(null)
      setIsSnapping(false)
      document.body.style.cursor = ''
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
    document.body.style.cursor = mode === 'move' ? 'grabbing' : 'col-resize'
  }

  const isDragging = dragMode !== 'none'

  return (
    <div
      className={`absolute top-0.5 rounded group ${
        trackLocked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'
      } ${selected ? 'ring-1.5 ring-accent-purple shadow-lg shadow-accent-purple/20 z-10 scale-y-[1.05]' : 'hover:brightness-110'} ${
        isDragging ? 'opacity-80 shadow-xl z-50' : 'transition-shadow'
      }`}
      style={{
        left: x,
        width: Math.max(4, w),
        height: small ? 'calc(100% - 4px)' : 'calc(100% - 4px)',
        backgroundColor: `${color}40`,
        borderLeft: `2px solid ${color}80`,
      }}
      onClick={(e) => { if (!isDragging) { e.stopPropagation(); onClick(e) } }}
      onContextMenu={(e) => { e.stopPropagation(); onContextMenu(e) }}
      onMouseDown={handleMouseDown}
    >
      {/* Thumbnail preview */}
      {hasThumb && thumbUrl && w > 30 && (
        <img
          src={thumbUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover rounded opacity-40 pointer-events-none"
        />
      )}

      {/* TRIM START handle (left edge) */}
      {!trackLocked && (
        <div
          className={`absolute left-0 top-0 bottom-0 w-2 cursor-col-resize z-20 rounded-l transition-colors ${
            dragMode === 'trim-start' ? 'bg-yellow-400/50' : 'opacity-0 group-hover:opacity-100 hover:bg-yellow-400/30'
          }`}
          onMouseDown={(e) => {
            if (trackLocked) return
            e.stopPropagation()
            e.preventDefault()
            setDragMode('trim-start')

            const startClientX = e.clientX
            const origStart = startTime
            const origEnd = endTime
            const snapPoints = getSnapPoints()

            const handleMove = (moveE: MouseEvent) => {
              const deltaX = moveE.clientX - startClientX
              const deltaTime = deltaX / pixelsPerSecond
              const rawTime = Math.max(0, origStart + deltaTime)
              const clampedTime = Math.min(rawTime, origEnd - 0.1)
              const { time: snappedTime, snapped } = snapEnabled
                ? snapToGrid(clampedTime, snapPoints, 0.15, moveE.altKey)
                : { time: clampedTime, snapped: false }
              setIsSnapping(snapped)
              setTooltipTimes({ start: snappedTime, end: origEnd })
              onTrimStart(snappedTime)
            }

            const handleUp = () => {
              setDragMode('none')
              setTooltipTimes(null)
              setIsSnapping(false)
              document.body.style.cursor = ''
              document.removeEventListener('mousemove', handleMove)
              document.removeEventListener('mouseup', handleUp)
            }

            document.addEventListener('mousemove', handleMove)
            document.addEventListener('mouseup', handleUp)
            document.body.style.cursor = 'col-resize'
          }}
        >
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-white/60 rounded" />
        </div>
      )}

      {/* TRIM END handle (right edge) */}
      {!trackLocked && (
        <div
          className={`absolute right-0 top-0 bottom-0 w-2 cursor-col-resize z-20 rounded-r transition-colors ${
            dragMode === 'trim-end' ? 'bg-yellow-400/50' : 'opacity-0 group-hover:opacity-100 hover:bg-yellow-400/30'
          }`}
          onMouseDown={(e) => {
            if (trackLocked) return
            e.stopPropagation()
            e.preventDefault()
            setDragMode('trim-end')

            const startClientX = e.clientX
            const origStart = startTime
            const origEnd = endTime
            const snapPoints = getSnapPoints()

            const handleMove = (moveE: MouseEvent) => {
              const deltaX = moveE.clientX - startClientX
              const deltaTime = deltaX / pixelsPerSecond
              const rawTime = Math.min(duration, origEnd + deltaTime)
              const clampedTime = Math.max(rawTime, origStart + 0.1)
              const { time: snappedTime, snapped } = snapEnabled
                ? snapToGrid(clampedTime, snapPoints, 0.15, moveE.altKey)
                : { time: clampedTime, snapped: false }
              setIsSnapping(snapped)
              setTooltipTimes({ start: origStart, end: snappedTime })
              onTrimEnd(snappedTime)
            }

            const handleUp = () => {
              setDragMode('none')
              setTooltipTimes(null)
              setIsSnapping(false)
              document.body.style.cursor = ''
              document.removeEventListener('mousemove', handleMove)
              document.removeEventListener('mouseup', handleUp)
            }

            document.addEventListener('mousemove', handleMove)
            document.addEventListener('mouseup', handleUp)
            document.body.style.cursor = 'col-resize'
          }}
        >
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-white/60 rounded" />
        </div>
      )}

      {/* Clip label */}
      <span className={`${small ? 'text-[7px]' : 'text-[8px]'} text-white/70 truncate px-1.5 leading-none flex items-center h-full pointer-events-none relative z-5`}>
        {label}
      </span>

      {/* Time tooltip while dragging */}
      {isDragging && tooltipTimes && (
        <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-purple-600 text-white text-[10px] px-2 py-0.5 rounded whitespace-nowrap z-[60] pointer-events-none shadow-lg">
          {formatTime(tooltipTimes.start)} - {formatTime(tooltipTimes.end)}
        </div>
      )}

      {/* Snap indicator */}
      {isDragging && isSnapping && (
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-yellow-400 rounded-full z-[60] pointer-events-none animate-pulse" />
      )}

      {/* Hover edge indicators */}
      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-white/0 group-hover:bg-white/20 transition rounded-l pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-white/0 group-hover:bg-white/20 transition rounded-r pointer-events-none" />
    </div>
  )
}

// ─── Waveform Display ───
function WaveformDisplay({ data, color, height }: { data: number[]; color: string; height: number }) {
  const barCount = Math.min(data.length, 200)

  return (
    <svg width="100%" height={height} preserveAspectRatio="none" className="block">
      {Array.from({ length: barCount }).map((_, i) => {
        const x = (i / barCount) * 100
        const amplitude = data[Math.floor((i / barCount) * data.length)] || 0.1
        const barH = amplitude * height * 0.8
        const y = (height - barH) / 2
        return (
          <rect
            key={i}
            x={`${x}%`}
            y={y}
            width={`${Math.max(0.3, 100 / barCount - 0.2)}%`}
            height={barH}
            fill={color}
            opacity={0.4}
          />
        )
      })}
    </svg>
  )
}
