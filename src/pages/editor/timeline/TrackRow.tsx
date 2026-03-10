import { useRef, useCallback } from 'react'
import { useTimelineStore, type TimelineTrack } from '../../../stores/timelineStore'
import { useEditorStore } from '../../../stores/editorStore'
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
  const moveClip = useTimelineStore((s) => s.moveClip)
  const showContextMenu = useTimelineStore((s) => s.showContextMenu)

  // Data from editor store based on track type
  const bRollItems = useEditorStore((s) => s.bRollItems)
  const captionTracks = useEditorStore((s) => s.captionTracks)
  const captions = useEditorStore((s) => s.captions)
  const waveformData = useEditorStore((s) => s.waveformData)
  const moveBRollItemTime = useEditorStore((s) => s.moveBRollItemTime)
  const trimBRollItem = useEditorStore((s) => s.trimBRollItem)

  const pixelsPerSecond = zoom / 100 * 80
  const totalWidth = duration * pixelsPerSecond

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0
  const playheadX = currentTime * pixelsPerSecond - scrollLeft

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
    // Show a single video clip spanning the full duration minus deleted regions
    const deletedRegions = useEditorStore.getState().deletedRegions
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
      <ClipBlock
        key={`video-seg-${i}`}
        id={`video-seg-${i}`}
        startTime={seg.start}
        endTime={seg.end}
        color={track.color}
        label={`קליפ ${i + 1}`}
        trackLocked={track.locked}
        pixelsPerSecond={pixelsPerSecond}
        scrollLeft={scrollLeft}
        selected={false}
        onClick={() => {}}
        onContextMenu={(e) => {
          e.preventDefault()
          showContextMenu(e.clientX, e.clientY, `video-seg-${i}`, track.id, getTimeFromX(e.clientX))
        }}
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
    // Show captions from all visible caption tracks
    const allCaptions = captionTracks.flatMap((ct) =>
      ct.isVisible ? ct.captions.map((c) => ({ ...c, trackColor: '#FBBF24' })) : []
    )
    // Fallback to main captions
    const capsToShow = allCaptions.length > 0 ? allCaptions : captions.map((c) => ({ ...c, trackColor: '#FBBF24' }))

    return capsToShow.map((cap) => (
      <ClipBlock
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
        onClick={(e) => {
          if (e.shiftKey) selectClip(cap.id, true)
          else if (e.metaKey || e.ctrlKey) toggleClipSelection(cap.id)
          else selectClip(cap.id)
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          showContextMenu(e.clientX, e.clientY, cap.id, track.id, getTimeFromX(e.clientX))
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
    const bgMusic = useEditorStore.getState().backgroundMusic
    if (!bgMusic?.url || duration <= 0) return null
    return (
      <div
        className="absolute top-0 h-full rounded overflow-hidden"
        style={{
          left: (bgMusic.startOffset || 0) * pixelsPerSecond - scrollLeft,
          width: Math.min(duration - (bgMusic.startOffset || 0), duration) * pixelsPerSecond,
        }}
      >
        <div className="w-full h-full rounded" style={{ backgroundColor: `${track.color}30` }}>
          <div className="flex items-center h-full px-2">
            <span className="text-[8px] text-white/60 truncate">🎵 מוזיקת רקע</span>
          </div>
        </div>
      </div>
    )
  }

  const renderTextTrack = () => {
    // Placeholder for text overlays
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

// ─── Clip Block (static) ───
function ClipBlock({ id, startTime, endTime, color, label, trackLocked, pixelsPerSecond, scrollLeft, selected, onClick, onContextMenu, small }: {
  id: string
  startTime: number
  endTime: number
  color: string
  label: string
  trackLocked: boolean
  pixelsPerSecond: number
  scrollLeft: number
  selected: boolean
  onClick: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
  small?: boolean
}) {
  const x = startTime * pixelsPerSecond - scrollLeft
  const w = (endTime - startTime) * pixelsPerSecond

  if (x + w < 0 || x > 3000) return null // Off-screen culling

  return (
    <div
      className={`absolute top-0.5 rounded transition-shadow group ${
        trackLocked ? 'cursor-not-allowed' : 'cursor-pointer'
      } ${selected ? 'ring-1.5 ring-accent-purple shadow-lg shadow-accent-purple/20 z-10' : 'hover:brightness-110'}`}
      style={{
        left: x,
        width: Math.max(4, w),
        height: small ? 'calc(100% - 4px)' : 'calc(100% - 4px)',
        backgroundColor: `${color}40`,
        borderLeft: `2px solid ${color}80`,
      }}
      onClick={(e) => { e.stopPropagation(); onClick(e) }}
      onContextMenu={(e) => { e.stopPropagation(); onContextMenu(e) }}
    >
      <span className={`${small ? 'text-[7px]' : 'text-[9px]'} text-white/70 truncate px-1 leading-none flex items-center h-full pointer-events-none`}>
        {label}
      </span>
    </div>
  )
}

// ─── Draggable Clip Block ───
function DraggableClipBlock({ id, startTime, endTime, color, label, trackLocked, pixelsPerSecond, scrollLeft, selected, duration, snapEnabled, onClick, onContextMenu, onMove, onTrimStart, onTrimEnd, hasThumb, thumbUrl }: {
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
  onClick: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
  onMove: (newStart: number) => void
  onTrimStart: (newStart: number) => void
  onTrimEnd: (newEnd: number) => void
  hasThumb?: boolean
  thumbUrl?: string
}) {
  const x = startTime * pixelsPerSecond - scrollLeft
  const w = (endTime - startTime) * pixelsPerSecond

  if (x + w < 0 || x > 3000) return null

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

    const startClientX = e.clientX
    const origStart = startTime
    const origEnd = endTime

    const handleMove = (moveE: MouseEvent) => {
      const deltaX = moveE.clientX - startClientX
      const deltaTime = deltaX / pixelsPerSecond

      if (mode === 'move') {
        const newStart = Math.max(0, Math.min(duration - (origEnd - origStart), origStart + deltaTime))
        onMove(newStart)
      } else if (mode === 'trim-start') {
        const newStart = Math.max(0, Math.min(origEnd - 0.1, origStart + deltaTime))
        onTrimStart(newStart)
      } else if (mode === 'trim-end') {
        const newEnd = Math.max(origStart + 0.1, Math.min(duration, origEnd + deltaTime))
        onTrimEnd(newEnd)
      }
    }

    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }

  return (
    <div
      className={`absolute top-0.5 rounded transition-shadow group ${
        trackLocked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'
      } ${selected ? 'ring-1.5 ring-accent-purple shadow-lg shadow-accent-purple/20 z-10 scale-y-[1.05]' : 'hover:brightness-110'}`}
      style={{
        left: x,
        width: Math.max(4, w),
        height: 'calc(100% - 4px)',
        backgroundColor: `${color}40`,
        borderLeft: `2px solid ${color}80`,
      }}
      onClick={(e) => { e.stopPropagation(); onClick(e) }}
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

      {/* Trim handles */}
      {!trackLocked && (
        <>
          <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-white/20 rounded-r z-10 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-white/20 rounded-l z-10 opacity-0 group-hover:opacity-100 transition-opacity" />
        </>
      )}

      <span className="text-[8px] text-white/70 truncate px-1.5 leading-none flex items-center h-full pointer-events-none relative z-5">
        {label}
      </span>
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
