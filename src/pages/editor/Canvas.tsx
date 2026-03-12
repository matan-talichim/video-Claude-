import { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'
import { useTimelineStore } from '../../stores/timelineStore'
import { getDeletedRegionEnd } from '../../services/videoEditor'
import type { SelectedCanvasItem } from '../../stores/editorStore'

interface CanvasProps {
  selectedItem: SelectedCanvasItem | null
  onSelect: (item: SelectedCanvasItem | null) => void
}

import type { CaptionStyle, Caption } from '../../stores/editorStore'

const allSpeeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4]

// Animated caption overlay - supports karaoke, pop, typewriter, glow, bounce, wordByWord
function AnimatedCaptionOverlay({ caption, style, currentTime }: {
  caption: Caption
  style: CaptionStyle
  currentTime: number
}) {
  const animation = style.animation || 'none'
  const positionClass = style.position === 'top' ? 'top-[10%]' : style.position === 'center' ? 'top-1/2 -translate-y-1/2' : 'bottom-[10%]'
  const isWordAnimation = ['karaoke', 'pop', 'typewriter', 'glow', 'bounce', 'wordByWord'].includes(animation)

  // For word-level animations, split text and compute which word is active
  const words = caption.text.split(' ').filter(w => w.trim())
  const captionDuration = caption.endTime - caption.startTime
  const elapsed = currentTime - caption.startTime

  // If word-level timing exists on the caption, use it; otherwise distribute evenly
  const wordTimings = caption.words && caption.words.length > 0
    ? caption.words
    : words.map((w, i) => ({
        text: w,
        start: caption.startTime + (i * captionDuration / words.length),
        end: caption.startTime + ((i + 1) * captionDuration / words.length),
      }))

  const activeWordIndex = wordTimings.findIndex(
    w => currentTime >= w.start && currentTime < w.end
  )
  const effectiveActiveIdx = activeWordIndex >= 0 ? activeWordIndex : Math.floor(elapsed / (captionDuration / Math.max(words.length, 1)))

  const baseFontStyle: React.CSSProperties = {
    fontFamily: style.fontFamily || 'Heebo',
    fontWeight: style.bold ? 'bold' : 'normal',
    fontStyle: style.italic ? 'italic' : 'normal',
    direction: 'rtl',
  }

  // Static animations (non-word-level)
  if (!isWordAnimation) {
    let animClass = ''
    if (animation === 'fade') animClass = 'animate-caption-fade'
    else if (animation === 'slideUp') animClass = 'animate-caption-slide-up'
    else if (animation === 'zoom') animClass = 'animate-caption-zoom'

    return (
      <div className={`absolute ${positionClass} left-4 right-4 text-center pointer-events-none z-30 ${animClass}`}>
        <span
          style={{
            ...baseFontStyle,
            fontSize: `${style.fontSize}px`,
            color: style.textColor,
            backgroundColor: `${style.bgColor}${Math.round(style.bgOpacity * 255).toString(16).padStart(2, '0')}`,
            padding: '4px 12px',
            borderRadius: '4px',
          }}
        >
          {caption.text}
        </span>
      </div>
    )
  }

  // Word-level animated rendering
  return (
    <div className={`absolute ${positionClass} left-4 right-4 text-center pointer-events-none z-30 flex flex-wrap justify-center gap-1`} dir="rtl">
      {words.map((word, i) => {
        const isActive = i === effectiveActiveIdx
        const isPast = i < effectiveActiveIdx
        const isFuture = i > effectiveActiveIdx

        let wordClasses = 'inline-block transition-all duration-200 px-0.5 '
        const wordStyle: React.CSSProperties = {
          ...baseFontStyle,
          fontSize: `${style.fontSize}px`,
        }

        switch (animation) {
          case 'karaoke':
            if (isActive) {
              wordClasses += 'scale-110'
              wordStyle.color = '#FFFF00'
              wordStyle.filter = 'drop-shadow(0 0 10px rgba(255,255,0,0.8))'
            } else if (isPast) {
              wordStyle.color = style.textColor
              wordStyle.opacity = 0.9
            } else {
              wordStyle.color = style.textColor
              wordStyle.opacity = 0.5
            }
            break

          case 'pop':
            if (isFuture) {
              wordStyle.transform = 'scale(0)'
              wordStyle.opacity = 0
            } else if (isActive) {
              wordClasses += 'animate-caption-word-pop'
              wordStyle.color = style.textColor
            } else {
              wordStyle.color = style.textColor
            }
            break

          case 'typewriter':
            if (isFuture) {
              wordStyle.opacity = 0
            } else {
              wordStyle.color = '#4ADE80'
              wordStyle.fontFamily = 'monospace'
              if (isActive) wordClasses += 'border-r-2 border-green-400 animate-pulse'
            }
            break

          case 'glow':
            if (isActive) {
              wordClasses += 'scale-105'
              wordStyle.color = '#C084FC'
              wordStyle.filter = 'drop-shadow(0 0 15px rgba(168,85,247,1))'
            } else {
              wordStyle.color = style.textColor
            }
            break

          case 'wordByWord':
            if (isFuture) {
              wordStyle.opacity = 0
            } else if (isActive) {
              wordClasses += 'animate-caption-minimal-slide'
              wordStyle.color = style.textColor
            } else {
              wordStyle.color = style.textColor
            }
            break

          case 'bounce':
            if (isFuture) {
              wordStyle.transform = 'translateY(50px)'
              wordStyle.opacity = 0
            } else if (isActive) {
              wordClasses += 'animate-caption-word-bounce'
              wordStyle.color = style.textColor
            } else {
              wordStyle.color = style.textColor
            }
            break
        }

        return (
          <span key={i} className={wordClasses} style={wordStyle}>
            <span
              style={{
                backgroundColor: style.bgOpacity > 0 ? `${style.bgColor}${Math.round(style.bgOpacity * 255).toString(16).padStart(2, '0')}` : 'transparent',
                padding: '2px 4px',
                borderRadius: '3px',
              }}
            >
              {word}
            </span>
          </span>
        )
      })}
    </div>
  )
}

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) s = 0
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0')
  const sec = Math.floor(s % 60).toString().padStart(2, '0')
  if (h > 0) return `${h}:${m}:${sec}`
  return `${m}:${sec}`
}

export default function Canvas({ selectedItem, onSelect }: CanvasProps) {
  const projectSize = useEditorStore((s) => s.projectSize)
  const showSafeZones = useEditorStore((s) => s.showSafeZones)
  const bgColor = useEditorStore((s) => s.bgColor)
  const mediaBlobUrl = useEditorStore((s) => s.mediaBlobUrl)
  const mediaType = useEditorStore((s) => s.mediaType)
  const currentTime = useEditorStore((s) => s.currentTime)
  const duration = useEditorStore((s) => s.duration)
  const isPlaying = useEditorStore((s) => s.isPlaying)
  const volume = useEditorStore((s) => s.volume)
  const playbackSpeed = useEditorStore((s) => s.playbackSpeed)
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime)
  const setDuration = useEditorStore((s) => s.setDuration)
  const setIsPlaying = useEditorStore((s) => s.setIsPlaying)
  const togglePlay = useEditorStore((s) => s.togglePlay)
  const setPlaybackSpeed = useEditorStore((s) => s.setPlaybackSpeed)
  const setVolume = useEditorStore((s) => s.setVolume)
  const deletedRegions = useEditorStore((s) => s.deletedRegions)
  const showCaptions = useEditorStore((s) => s.showCaptions)
  const captions = useEditorStore((s) => s.captions)
  const captionStyle = useEditorStore((s) => s.captionStyle)
  const bRollItems = useEditorStore((s) => s.bRollItems)
  const textOverlays = useEditorStore((s) => s.textOverlays)
  const shapes = useEditorStore((s) => s.shapes)
  const editorEffects = useEditorStore((s) => s.editorEffects)
  const timelineTracks = useTimelineStore((s) => s.tracks)

  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const trackStates = {
    video: timelineTracks.find((t) => t.type === 'video') || { visible: true, muted: false },
    broll: timelineTracks.find((t) => t.type === 'broll') || { visible: true },
    captions: timelineTracks.find((t) => t.type === 'captions') || { visible: true },
  }

  // Video/audio sync
  useEffect(() => {
    const el = mediaType === 'video' ? videoRef.current : audioRef.current
    if (!el) return
    if (isPlaying) { el.play().catch(() => {}) } else { el.pause() }
  }, [isPlaying, mediaType, mediaBlobUrl])

  useEffect(() => {
    const el = mediaType === 'video' ? videoRef.current : audioRef.current
    if (el) el.playbackRate = playbackSpeed
  }, [playbackSpeed, mediaType])

  useEffect(() => {
    const el = mediaType === 'video' ? videoRef.current : audioRef.current
    if (el) el.volume = (trackStates.video.muted ? 0 : volume) / 100
  }, [volume, mediaType, trackStates.video.muted])

  const handleTimeUpdate = useCallback(() => {
    const el = mediaType === 'video' ? videoRef.current : audioRef.current
    if (!el) return
    const ct = el.currentTime
    const skipTo = getDeletedRegionEnd(ct, deletedRegions)
    if (skipTo !== null) {
      el.currentTime = skipTo + 0.05
      return
    }
    setCurrentTime(ct)
  }, [mediaType, deletedRegions, setCurrentTime])

  const handleLoadedMetadata = useCallback(() => {
    const el = mediaType === 'video' ? videoRef.current : audioRef.current
    if (el) setDuration(el.duration)
  }, [mediaType, setDuration])

  const handleEnded = useCallback(() => {
    setIsPlaying(false)
  }, [setIsPlaying])

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const fraction = (e.clientX - rect.left) / rect.width
    const time = fraction * duration
    const el = mediaType === 'video' ? videoRef.current : audioRef.current
    if (el) {
      el.currentTime = time
      setCurrentTime(time)
    }
  }

  // Auto-hide controls
  const resetControlsTimer = useCallback(() => {
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current)
    if (isPlaying) {
      controlsTimerRef.current = setTimeout(() => { /* could hide controls */ }, 3000)
    }
  }, [isPlaying])

  // Active overlays at current time
  const activeBRoll = useMemo(() =>
    bRollItems.filter((b) => currentTime >= b.startTime && currentTime < b.startTime + b.duration && trackStates.broll.visible),
    [bRollItems, currentTime, trackStates.broll.visible]
  )
  const activeTexts = useMemo(() =>
    textOverlays.filter((t) => currentTime >= t.startTime && currentTime < t.endTime),
    [textOverlays, currentTime]
  )
  const activeShapes = useMemo(() =>
    shapes.filter((s) => currentTime >= s.startTime && currentTime < s.endTime),
    [shapes, currentTime]
  )

  // Current caption
  const currentCaption = useMemo(() => {
    if (!showCaptions || !trackStates.captions.visible) return null
    return captions.find((c) => currentTime >= c.startTime && currentTime < c.endTime) || null
  }, [captions, currentTime, showCaptions, trackStates.captions.visible])

  // Video filter
  const videoFilter = (editorEffects as Record<string, string>)?.videoFilter || 'none'

  return (
    <div className="flex-1 flex flex-col bg-[#0A0A0F]">
      {/* Canvas area */}
      <div
        className="flex-1 flex items-center justify-center p-4 relative"
        onMouseMove={resetControlsTimer}
        onClick={(e) => {
          if (e.target === e.currentTarget) onSelect(null)
        }}
      >
        <div
          className="relative rounded-lg overflow-hidden shadow-2xl"
          style={{
            aspectRatio: `${projectSize.width}/${projectSize.height}`,
            maxHeight: '100%',
            maxWidth: '100%',
            backgroundColor: bgColor === 'transparent' ? 'transparent' : bgColor,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onSelect(null)
          }}
        >
          {/* Video layer */}
          {mediaType === 'video' && mediaBlobUrl && (
            <video
              ref={videoRef}
              src={mediaBlobUrl}
              className="absolute inset-0 w-full h-full object-contain"
              style={{ filter: videoFilter !== 'none' ? videoFilter : undefined, display: trackStates.video.visible ? 'block' : 'none' }}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={handleEnded}
              playsInline
            />
          )}
          {mediaType === 'audio' && mediaBlobUrl && (
            <audio
              ref={audioRef}
              src={mediaBlobUrl}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={handleEnded}
            />
          )}

          {/* Audio waveform display placeholder */}
          {mediaType === 'audio' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <span className="text-6xl">🎵</span>
                <p className="text-gray-400 text-sm mt-2">אודיו</p>
              </div>
            </div>
          )}

          {/* B-Roll overlays */}
          {activeBRoll.map((item) => (
            <CanvasItem
              key={item.id}
              item={item}
              type="broll"
              selected={selectedItem?.id === item.id}
              onSelect={onSelect}
            >
              {item.mediaType === 'video' ? (
                <video src={item.imageUrl} className="w-full h-full object-cover" autoPlay muted loop />
              ) : (
                <img src={item.imageUrl} className="w-full h-full object-cover" alt="" />
              )}
            </CanvasItem>
          ))}

          {/* Text overlays */}
          {activeTexts.map((text) => (
            <CanvasItem
              key={text.id}
              item={text}
              type="text"
              selected={selectedItem?.id === text.id}
              onSelect={onSelect}
            >
              <div
                style={{
                  fontFamily: text.fontFamily,
                  fontSize: `${text.fontSize}px`,
                  fontWeight: text.fontWeight,
                  fontStyle: text.fontStyle,
                  color: text.color,
                  backgroundColor: text.backgroundOpacity > 0 ? text.backgroundColor : 'transparent',
                  textAlign: text.textAlign,
                  lineHeight: text.lineHeight,
                  letterSpacing: `${text.letterSpacing}px`,
                  padding: '4px 8px',
                  direction: 'rtl',
                }}
              >
                {text.text}
              </div>
            </CanvasItem>
          ))}

          {/* Shapes */}
          {activeShapes.map((shape) => (
            <CanvasItem
              key={shape.id}
              item={shape}
              type="shape"
              selected={selectedItem?.id === shape.id}
              onSelect={onSelect}
            >
              <div
                className="w-full h-full"
                style={{
                  backgroundColor: shape.fill,
                  opacity: shape.fillOpacity,
                  border: `${shape.strokeWidth}px solid ${shape.stroke}`,
                  borderRadius: shape.type === 'circle' ? '50%' : `${shape.cornerRadius}px`,
                }}
              />
            </CanvasItem>
          ))}

          {/* Captions - with animated word-by-word support */}
          {currentCaption && (
            <AnimatedCaptionOverlay
              caption={currentCaption}
              style={captionStyle}
              currentTime={currentTime}
            />
          )}

          {/* אזור בטוח overlay */}
          {showSafeZones && (
            <div className="absolute inset-0 pointer-events-none z-40">
              <div className="absolute top-[15%] left-[5%] right-[5%] bottom-[25%] border border-yellow-500/30 rounded" />
              <span className="absolute top-[13%] right-[5%] text-yellow-500/50 text-[8px]">אזור בטוח</span>
            </div>
          )}

          {/* Click to play overlay when no media */}
          {!mediaBlobUrl && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <p className="text-gray-400 text-sm">העלה מדיה כדי להתחיל</p>
            </div>
          )}
        </div>
      </div>

      {/* Playback controls */}
      <div className="shrink-0 px-4 pb-2" dir="rtl">
        {/* Progress bar */}
        <div
          className="h-1.5 bg-white/10 rounded-full cursor-pointer mb-2 relative group"
          onClick={handleSeek}
        >
          <div
            className="h-full bg-purple-500 rounded-full relative"
            style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%' }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition" />
          </div>
        </div>

        {/* Controls row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => {
              const el = mediaType === 'video' ? videoRef.current : audioRef.current
              if (el) { el.currentTime = Math.max(0, el.currentTime - 5); setCurrentTime(el.currentTime); }
            }} className="text-gray-400 hover:text-white">
              <SkipBack size={16} />
            </button>

            <button onClick={togglePlay} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white">
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            </button>

            <button onClick={() => {
              const el = mediaType === 'video' ? videoRef.current : audioRef.current
              if (el) { el.currentTime = Math.min(duration, el.currentTime + 5); setCurrentTime(el.currentTime); }
            }} className="text-gray-400 hover:text-white">
              <SkipForward size={16} />
            </button>

            <span className="text-xs text-gray-400 ml-2">{formatTime(currentTime)} / {formatTime(duration)}</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Volume */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setVolume(volume > 0 ? 0 : 80)}
                className="text-gray-400 hover:text-white"
              >
                {volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => setVolume(+e.target.value)}
                className="w-16"
              />
            </div>

            {/* Speed */}
            <div className="relative">
              <button
                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                className="text-xs text-gray-400 hover:text-white px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10"
              >
                {playbackSpeed}x
              </button>
              {showSpeedMenu && (
                <div className="absolute bottom-full mb-1 left-0 bg-[#1A1A28] border border-white/10 rounded-lg shadow-xl z-50 py-1">
                  {allSpeeds.map((s) => (
                    <button
                      key={s}
                      onClick={() => { setPlaybackSpeed(s); setShowSpeedMenu(false); }}
                      className={`block w-full px-3 py-1 text-xs text-right ${playbackSpeed === s ? 'text-purple-400' : 'text-gray-300 hover:bg-white/5'}`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// CanvasItem - draggable, selectable wrapper for items on the canvas
function CanvasItem({
  item,
  type,
  selected,
  onSelect,
  children,
}: {
  item: { id: string; x: number; y: number; width: number; height: number; rotation?: number; opacity?: number }
  type: SelectedCanvasItem['type']
  selected: boolean
  onSelect: (item: SelectedCanvasItem | null) => void
  children: React.ReactNode
}) {
  return (
    <div
      className={`absolute cursor-move ${selected ? 'ring-2 ring-purple-500' : ''}`}
      style={{
        left: `${item.x}%`,
        top: `${item.y}%`,
        width: `${item.width}%`,
        height: item.height ? `${item.height}%` : 'auto',
        transform: `rotate(${item.rotation || 0}deg)`,
        opacity: item.opacity !== undefined ? (typeof item.opacity === 'number' && item.opacity <= 1 ? item.opacity : (item.opacity || 100) / 100) : 1,
        zIndex: 10,
      }}
      onMouseDown={(e) => {
        e.stopPropagation()
        onSelect({ id: item.id, type })
      }}
    >
      {children}

      {/* Resize handles */}
      {selected && (
        <>
          {['nw', 'ne', 'se', 'sw'].map((pos) => {
            const posStyles: Record<string, React.CSSProperties> = {
              nw: { top: -4, right: -4 },
              ne: { top: -4, left: -4 },
              se: { bottom: -4, left: -4 },
              sw: { bottom: -4, right: -4 },
            }
            return (
              <div
                key={pos}
                className="absolute w-2 h-2 bg-white border border-purple-500 rounded-full z-50"
                style={posStyles[pos]}
              />
            )
          })}
          {/* Rotation handle */}
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-3 h-3 bg-purple-500 rounded-full cursor-alias z-50" />
        </>
      )}
    </div>
  )
}
