import { useState, useRef, useEffect, useCallback } from 'react'
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Maximize, Subtitles, Music, Film } from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'
import type { CaptionStyle, BRollItem } from '../../stores/editorStore'
import { getDeletedRegionEnd } from '../../services/videoEditor'

const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2]

export default function VideoPanel() {
  const {
    currentTime, duration, isPlaying, volume, playbackSpeed,
    mediaBlobUrl, mediaType, showCaptions, transcript,
    togglePlay, setPlaybackSpeed, setVolume, setCurrentTime,
    setDuration, setIsPlaying, setShowCaptions,
  } = useEditorStore()

  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number>(0)
  const [showControls, setShowControls] = useState(false)
  const [showVolume, setShowVolume] = useState(false)
  const [speedIdx, setSpeedIdx] = useState(speeds.indexOf(playbackSpeed) >= 0 ? speeds.indexOf(playbackSpeed) : 2)

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0')
    const sec = Math.floor(s % 60).toString().padStart(2, '0')
    return `${m}:${sec}`
  }

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
    if (el) el.volume = volume / 100
  }, [volume, mediaType])

  const deletedRegions = useEditorStore((s) => s.deletedRegions)
  const skipFadeRef = useRef<HTMLDivElement>(null)

  const handleTimeUpdate = useCallback(() => {
    const el = mediaType === 'video' ? videoRef.current : audioRef.current
    if (!el) return
    const ct = el.currentTime
    const skipTo = getDeletedRegionEnd(ct, deletedRegions)
    if (skipTo !== null) {
      if (skipFadeRef.current) {
        skipFadeRef.current.style.opacity = '1'
        setTimeout(() => { if (skipFadeRef.current) skipFadeRef.current.style.opacity = '0' }, 100)
      }
      el.currentTime = skipTo + 0.05
      setCurrentTime(skipTo + 0.05)
    } else {
      setCurrentTime(ct)
    }
  }, [mediaType, setCurrentTime, deletedRegions])

  const handleLoadedMetadata = useCallback(() => {
    const el = mediaType === 'video' ? videoRef.current : audioRef.current
    if (el && el.duration && isFinite(el.duration)) setDuration(el.duration)
  }, [mediaType, setDuration])

  const handleEnded = useCallback(() => { setIsPlaying(false) }, [setIsPlaying])

  useEffect(() => {
    const el = mediaType === 'video' ? videoRef.current : audioRef.current
    if (el && Math.abs(el.currentTime - currentTime) > 0.5) el.currentTime = currentTime
  }, [currentTime, mediaType])

  useEffect(() => {
    if (mediaType !== 'audio' || !mediaBlobUrl || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const draw = () => {
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * 2; canvas.height = rect.height * 2
      ctx.scale(2, 2)
      const w = rect.width; const h = rect.height
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = 'rgba(26, 26, 46, 1)'; ctx.fillRect(0, 0, w, h)
      const barCount = Math.floor(w / 4)
      const progressRatio = duration > 0 ? currentTime / duration : 0
      for (let i = 0; i < barCount; i++) {
        const x = i * 4
        const seed = Math.sin(i * 0.3) * 0.5 + Math.cos(i * 0.7) * 0.3 + 0.5
        const amplitude = 0.1 + seed * 0.7; const barH = amplitude * (h * 0.7); const y = (h - barH) / 2
        if (i / barCount <= progressRatio) {
          const gradient = ctx.createLinearGradient(x, y, x, y + barH)
          gradient.addColorStop(0, 'rgba(124, 92, 255, 0.9)'); gradient.addColorStop(1, 'rgba(92, 138, 255, 0.7)')
          ctx.fillStyle = gradient
        } else { ctx.fillStyle = 'rgba(255, 255, 255, 0.1)' }
        ctx.fillRect(x, y, 2.5, barH)
      }
      animFrameRef.current = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [mediaType, mediaBlobUrl, currentTime, duration])

  const bRollItems = useEditorStore((s) => s.bRollItems)
  const selectedBRollId = useEditorStore((s) => s.selectedBRollId)
  const setSelectedBRollId = useEditorStore((s) => s.setSelectedBRollId)


  const activeBRollItems = bRollItems
    .filter(b => currentTime >= b.startTime && currentTime < b.startTime + b.duration)
    .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))

  const handleSpeedCycle = () => {
    const nextIdx = (speedIdx + 1) % speeds.length
    setSpeedIdx(nextIdx); setPlaybackSpeed(speeds[nextIdx])
  }

  const handleProgressClick = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    const newTime = ratio * duration
    setCurrentTime(newTime)
    const el = mediaType === 'video' ? videoRef.current : audioRef.current
    if (el) el.currentTime = newTime
  }

  const handlePlayToggle = () => { togglePlay() }

  const handleSkip = (delta: number) => {
    const newTime = Math.max(0, Math.min(duration, currentTime + delta))
    setCurrentTime(newTime)
    const el = mediaType === 'video' ? videoRef.current : audioRef.current
    if (el) el.currentTime = newTime
  }

  const handleFullscreen = () => { videoRef.current?.requestFullscreen?.() }

  const { captions, captionStyle } = useEditorStore()

  const currentCaption = showCaptions ? (() => {
    const cap = captions.find(c => currentTime >= c.startTime - 0.1 && currentTime < c.endTime + 0.1)
    if (cap) return { text: cap.text, words: cap.words, style: cap.style, startTime: cap.startTime, endTime: cap.endTime }
    const words = transcript.flatMap(s => s.words).filter(w => currentTime >= w.start - 0.3 && currentTime < w.end + 0.3)
    if (words.length === 0) return null
    return { text: words.map(w => w.text).join(' '), words: words.map(w => ({ text: w.text, start: w.start, end: w.end })), style: captionStyle, startTime: words[0].start, endTime: words[words.length - 1].end }
  })() : null

  const hasMedia = !!mediaBlobUrl

  return (
    <div className="flex flex-col h-full bg-bg-deepest rounded-xl border border-white/[0.06] overflow-hidden"
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => { setShowControls(false); setShowVolume(false) }}>
      <div className="flex-1 bg-bg-deepest flex items-center justify-center relative overflow-hidden">
        {hasMedia && mediaType === 'video' && (
          <video ref={videoRef} src={mediaBlobUrl!} className="w-full h-full object-contain"
            onTimeUpdate={handleTimeUpdate} onLoadedMetadata={handleLoadedMetadata} onEnded={handleEnded} playsInline />
        )}
        {hasMedia && mediaType === 'audio' && (
          <>
            <audio ref={audioRef} src={mediaBlobUrl!} onTimeUpdate={handleTimeUpdate} onLoadedMetadata={handleLoadedMetadata} onEnded={handleEnded} />
            <div className="w-full h-full flex flex-col items-center justify-center">
              <Music size={48} className="text-accent-purple mb-4 opacity-50" />
              <canvas ref={canvasRef} className="w-full h-32" />
            </div>
          </>
        )}

        {/* B-Roll overlays */}
        {activeBRollItems.map((broll) => (
          <BRollOverlay key={broll.id} item={broll} currentTime={currentTime}
            isSelected={selectedBRollId === broll.id} onSelect={() => setSelectedBRollId(broll.id)} />
        ))}

        <div ref={skipFadeRef} className="absolute inset-0 bg-black pointer-events-none z-30 transition-opacity duration-100" style={{ opacity: 0 }} />

        {!hasMedia && (
          <div className="w-full h-full bg-gradient-to-br from-bg-panel to-bg-deepest rounded-lg flex flex-col items-center justify-center">
            <Film size={48} className="text-text-muted opacity-20 mb-3" />
            <div className="text-text-muted text-sm">אין מדיה טעונה</div>
            <div className="text-text-muted text-xs mt-1">העלה קובץ וידאו או אודיו להתחלה</div>
          </div>
        )}

        {showCaptions && currentCaption && (
          <CaptionOverlay caption={currentCaption} style={currentCaption.style || captionStyle} currentTime={currentTime} />
        )}

        <button onClick={handlePlayToggle}
          className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 z-20 ${showControls || !isPlaying ? 'opacity-100' : 'opacity-0'}`}>
          <div className="w-16 h-16 rounded-full glass flex items-center justify-center hover:scale-110 transition-transform shadow-2xl">
            {isPlaying ? <Pause size={26} className="text-white" /> : <Play size={26} className="text-white mr-[-2px]" />}
          </div>
        </button>

        <div className={`absolute bottom-0 left-0 right-0 transition-all duration-200 z-40 ${showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
          <div className="mx-3 mb-3 glass rounded-xl p-2 space-y-2">
            <div className="h-1 bg-white/[0.08] rounded-full overflow-hidden cursor-pointer group hover:h-1.5 transition-all" onClick={handleProgressClick}>
              <div className="h-full bg-accent-purple rounded-full relative transition-all" style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%' }}>
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => handleSkip(-5)} className="p-1 hover:bg-white/[0.08] rounded transition-colors text-text-secondary hover:text-text-primary"><SkipBack size={14} /></button>
              <button onClick={handlePlayToggle} className="p-1.5 hover:bg-white/[0.08] rounded transition-colors text-text-primary">{isPlaying ? <Pause size={16} /> : <Play size={16} />}</button>
              <button onClick={() => handleSkip(5)} className="p-1 hover:bg-white/[0.08] rounded transition-colors text-text-secondary hover:text-text-primary"><SkipForward size={14} /></button>
              <span className="text-xs text-text-muted font-mono px-1">{formatTime(currentTime)} / {formatTime(duration)}</span>
              <div className="flex-1" />
              <button onClick={handleSpeedCycle} className="px-2 py-0.5 rounded-full bg-white/[0.06] text-[11px] text-text-secondary hover:text-text-primary hover:bg-white/[0.1] transition-colors font-mono">{speeds[speedIdx]}x</button>
              <div className="relative flex items-center" onMouseEnter={() => setShowVolume(true)} onMouseLeave={() => setShowVolume(false)}>
                <button onClick={() => setVolume(volume > 0 ? 0 : 80)} className="p-1 hover:bg-white/[0.08] rounded transition-colors text-text-secondary hover:text-text-primary">
                  {volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
                <div className={`overflow-hidden transition-all duration-200 ${showVolume ? 'w-16 opacity-100 mr-1' : 'w-0 opacity-0'}`}>
                  <input type="range" min="0" max="100" value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="w-full h-1 accent-accent-purple" />
                </div>
              </div>
              <button onClick={() => setShowCaptions(!showCaptions)} className={`p-1 hover:bg-white/[0.08] rounded transition-colors ${showCaptions ? 'text-accent-purple' : 'text-text-secondary hover:text-text-primary'}`}><Subtitles size={14} /></button>
              <button onClick={handleFullscreen} className="p-1 hover:bg-white/[0.08] rounded transition-colors text-text-secondary hover:text-text-primary"><Maximize size={14} /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function BRollOverlay({ item, currentTime, isSelected, onSelect }: {
  item: BRollItem; currentTime: number; isSelected: boolean; onSelect: () => void
}) {
  const elapsed = currentTime - item.startTime
  const remaining = (item.startTime + item.duration) - currentTime
  const animDur = item.animationDuration || 0.5
  const delay = item.animationDelay || 0

  let animOpacity = item.opacity / 100
  let animTransform = ''

  // Entrance animation
  if (elapsed - delay < animDur && elapsed >= delay && item.entranceAnimation !== 'none') {
    const p = Math.max(0, (elapsed - delay) / animDur)
    switch (item.entranceAnimation) {
      case 'fadeIn': animOpacity = p * (item.opacity / 100); break
      case 'slideRight': animTransform = `translateX(${(1 - p) * 100}%)`; break
      case 'slideLeft': animTransform = `translateX(${-(1 - p) * 100}%)`; break
      case 'slideUp': animTransform = `translateY(${(1 - p) * 100}%)`; break
      case 'slideDown': animTransform = `translateY(${-(1 - p) * 100}%)`; break
      case 'zoomIn': animTransform = `scale(${0.3 + p * 0.7})`; animOpacity = p * (item.opacity / 100); break
      case 'rotate': animTransform = `rotate(${(1 - p) * 360}deg)`; animOpacity = p * (item.opacity / 100); break
      case 'bounce': { const bp = p < 0.6 ? p / 0.6 : 1 - ((p - 0.6) / 0.4) * 0.2 + 0.2; animTransform = `translateY(${(1 - bp) * 50}px)`; break }
    }
  }
  // Exit animation
  else if (remaining < animDur && item.exitAnimation !== 'none') {
    const p = remaining / animDur
    switch (item.exitAnimation) {
      case 'fadeOut': animOpacity = p * (item.opacity / 100); break
      case 'slideRight': animTransform = `translateX(${(1 - p) * 100}%)`; break
      case 'slideLeft': animTransform = `translateX(${-(1 - p) * 100}%)`; break
      case 'slideUp': animTransform = `translateY(${-(1 - p) * 100}%)`; break
      case 'slideDown': animTransform = `translateY(${(1 - p) * 100}%)`; break
      case 'zoomOut': animTransform = `scale(${0.3 + p * 0.7})`; animOpacity = p * (item.opacity / 100); break
    }
  }
  // Staying animation
  else if (item.stayingAnimation && item.stayingAnimation !== 'none') {
    const speedMap = { slow: 0.5, medium: 1, fast: 2 }
    const speed = speedMap[item.stayingSpeed || 'medium'] || 1
    const t = elapsed * speed
    switch (item.stayingAnimation) {
      case 'gentleFloat': animTransform = `translateY(${Math.sin(t * 2) * 3}px)`; break
      case 'pulse': { const s = 1 + Math.sin(t * 3) * 0.03; animTransform = `scale(${s})`; break }
      case 'hover': animTransform = `translateY(${Math.sin(t * 1.5) * 5}px)`; break
      case 'slowRotate': animTransform = `rotate(${t * 10}deg)`; break
      case 'blink': animOpacity = (item.opacity / 100) * (0.6 + Math.sin(t * 4) * 0.4); break
    }
  }

  // Base transform (rotation + flip)
  const baseTransforms: string[] = []
  if (item.rotation) baseTransforms.push(`rotate(${item.rotation}deg)`)
  if (item.flipH) baseTransforms.push('scaleX(-1)')
  if (item.flipV) baseTransforms.push('scaleY(-1)')
  if (animTransform) baseTransforms.push(animTransform)

  let posStyle: React.CSSProperties = {}
  switch (item.displayMode) {
    case 'fullscreen': posStyle = { position: 'absolute', inset: 0 }; break
    case 'pip': case 'pipSmall': posStyle = { position: 'absolute', right: '5%', bottom: '5%', width: '20%', height: '20%' }; break
    case 'pipMedium': posStyle = { position: 'absolute', right: '5%', bottom: '5%', width: '35%', height: '35%' }; break
    case 'halfLeft': posStyle = { position: 'absolute', left: 0, top: 0, width: '50%', height: '100%' }; break
    case 'halfRight': posStyle = { position: 'absolute', right: 0, top: 0, width: '50%', height: '100%' }; break
    case 'halfTop': posStyle = { position: 'absolute', left: 0, top: 0, width: '100%', height: '50%' }; break
    case 'halfBottom': posStyle = { position: 'absolute', left: 0, bottom: 0, width: '100%', height: '50%' }; break
    case 'topRight': posStyle = { position: 'absolute', right: '3%', top: '3%', width: '25%', height: '25%' }; break
    case 'topLeft': posStyle = { position: 'absolute', left: '3%', top: '3%', width: '25%', height: '25%' }; break
    case 'bottomRight': posStyle = { position: 'absolute', right: '3%', bottom: '3%', width: '25%', height: '25%' }; break
    case 'bottomLeft': posStyle = { position: 'absolute', left: '3%', bottom: '3%', width: '25%', height: '25%' }; break
    default: posStyle = { position: 'absolute', left: `${item.x}%`, top: `${item.y}%`, width: `${item.width}%`, height: `${item.height}%` }
  }

  // Filters
  const filterParts: string[] = []
  if (item.brightness !== undefined && item.brightness !== 100) filterParts.push(`brightness(${item.brightness}%)`)
  if (item.contrast !== undefined && item.contrast !== 100) filterParts.push(`contrast(${item.contrast}%)`)
  if (item.saturation !== undefined && item.saturation !== 100) filterParts.push(`saturate(${item.saturation}%)`)
  if (item.blur && item.blur > 0) filterParts.push(`blur(${item.blur}px)`)
  if (item.grayscale) filterParts.push('grayscale(100%)')
  if (item.sepia) filterParts.push('sepia(100%)')

  const imgStyle: React.CSSProperties = {
    width: '100%', height: '100%',
    objectFit: item.objectFit || 'cover',
    borderRadius: `${item.borderRadius || 0}px`,
    filter: filterParts.length > 0 ? filterParts.join(' ') : undefined,
    mixBlendMode: item.blendMode !== 'normal' ? item.blendMode as any : undefined,
    ...(item.borderEnabled ? { border: `${item.borderWidth}px solid ${item.borderColor}` } : {}),
    ...(item.shadowEnabled ? { boxShadow: `${item.shadowX || 0}px ${item.shadowY || 4}px ${item.shadowBlur || 10}px ${item.shadowColor || 'rgba(0,0,0,0.5)'}` } : {}),
  }

  return (
    <div style={{ ...posStyle, zIndex: (item.zIndex || 1) + 10, opacity: animOpacity, transform: baseTransforms.join(' ') || undefined, cursor: 'pointer', transition: 'opacity 0.05s' }}
      onClick={(e) => { e.stopPropagation(); onSelect() }}
      className={isSelected ? 'ring-2 ring-accent-purple ring-offset-1' : ''}>
      {item.blurBackground && <div className="absolute inset-0 backdrop-blur-md bg-black/30 z-[-1]" style={{ borderRadius: `${item.borderRadius || 0}px` }} />}
      <img src={item.imageUrl} alt="B-Roll" style={imgStyle} draggable={false} />
      {isSelected && (
        <>
          <div className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-accent-purple rounded-sm cursor-nw-resize" />
          <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-accent-purple rounded-sm cursor-ne-resize" />
          <div className="absolute -bottom-1 -left-1 w-2.5 h-2.5 bg-accent-purple rounded-sm cursor-sw-resize" />
          <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-accent-purple rounded-sm cursor-se-resize" />
          <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-4 bg-accent-purple/70 rounded-sm cursor-w-resize" />
          <div className="absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-4 bg-accent-purple/70 rounded-sm cursor-e-resize" />
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-4 h-2 bg-accent-purple/70 rounded-sm cursor-n-resize" />
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-2 bg-accent-purple/70 rounded-sm cursor-s-resize" />
        </>
      )}
    </div>
  )
}

function CaptionOverlay({ caption, style, currentTime }: {
  caption: { text: string; words?: { text: string; start: number; end: number }[]; startTime?: number; endTime?: number }
  style: CaptionStyle; currentTime: number
}) {
  const posClass = style.position === 'top' ? 'top-4' : style.position === 'center' ? 'top-1/2 -translate-y-1/2' : 'bottom-16'
  const alignClass = style.alignment === 'right' ? 'text-right' : style.alignment === 'left' ? 'text-left' : 'text-center'

  const bgRgba = (() => {
    const hex = style.bgColor || '#000000'
    const r = parseInt(hex.slice(1, 3), 16); const g = parseInt(hex.slice(3, 5), 16); const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r},${g},${b},${style.bgOpacity})`
  })()

  const textStyle: React.CSSProperties = {
    color: style.textColor, fontSize: `${style.fontSize}px`, fontFamily: style.fontFamily || 'Heebo',
    fontWeight: style.bold ? 'bold' : 'normal', fontStyle: style.italic ? 'italic' : 'normal',
    textShadow: style.outline ? `1px 1px 2px ${style.outlineColor}, -1px -1px 2px ${style.outlineColor}, 1px -1px 2px ${style.outlineColor}, -1px 1px 2px ${style.outlineColor}` : undefined,
  }

  const captionStart = caption.startTime ?? (caption.words?.[0]?.start ?? currentTime)
  const captionEnd = caption.endTime ?? (caption.words?.[caption.words!.length - 1]?.end ?? currentTime)
  const captionDuration = captionEnd - captionStart
  const elapsed = currentTime - captionStart

  // Modern - word by word with colored highlight
  if (style.preset === 'modern' || (style.animation === 'wordByWord' && style.preset !== 'karaoke')) {
    if (caption.words && caption.words.length > 0) {
      return (
        <div className={`absolute ${posClass} left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg max-w-[80%] z-20 animate-caption-fade`} style={{ backgroundColor: bgRgba }} dir="rtl">
          <p className={alignClass} style={{ ...textStyle }}>
            {caption.words.map((w, i) => {
              const isActive = currentTime >= w.start - 0.05 && currentTime < w.end + 0.1
              const isPast = currentTime >= w.end + 0.1
              return (
                <span key={i} style={{
                  backgroundColor: isActive ? '#7C5CFF' : isPast ? 'rgba(124,92,255,0.3)' : 'transparent',
                  color: 'white', padding: '2px 4px', borderRadius: '4px',
                  transition: 'background-color 0.1s', display: 'inline',
                }}>{w.text}{' '}</span>
              )
            })}
          </p>
        </div>
      )
    }
  }

  // Karaoke - current word lights up
  if (style.preset === 'karaoke') {
    if (caption.words && caption.words.length > 0) {
      return (
        <div className={`absolute ${posClass} left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg max-w-[80%] z-20`} style={{ backgroundColor: bgRgba }} dir="rtl">
          <p className={alignClass}>
            {caption.words.map((w, i) => {
              const isActive = currentTime >= w.start - 0.05 && currentTime < w.end + 0.1
              return (
                <span key={i} style={{
                  ...textStyle, color: isActive ? '#FFFFFF' : '#666666',
                  textShadow: isActive ? '0 0 10px rgba(124,92,255,0.8), 0 0 20px rgba(124,92,255,0.4)' : 'none',
                  transform: isActive ? 'scale(1.1)' : 'scale(1)',
                  transition: 'all 0.15s ease', display: 'inline-block',
                }}>{w.text}{' '}</span>
              )
            })}
          </p>
        </div>
      )
    }
  }

  // Typewriter - character by character
  if (style.animation === 'typewriter') {
    const charsToShow = captionDuration > 0 ? Math.floor(elapsed / captionDuration * caption.text.length) : caption.text.length
    return (
      <div className={`absolute ${posClass} left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg max-w-[80%] z-20`} style={{ backgroundColor: bgRgba }} dir="rtl">
        <p className={alignClass} style={textStyle}>
          {caption.text.substring(0, Math.max(0, charsToShow))}
          <span className="animate-blink-cursor">|</span>
        </p>
      </div>
    )
  }

  // Bounce - words bounce in staggered
  if (style.animation === 'bounce') {
    if (caption.words && caption.words.length > 0) {
      return (
        <div className={`absolute ${posClass} left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg max-w-[80%] z-20`} style={{ backgroundColor: bgRgba }} dir="rtl">
          <p className={alignClass}>
            {caption.words.map((w, i) => {
              const wordDelay = i * 0.1
              const wordElapsed = elapsed - wordDelay
              let transform = 'translateY(30px)'; let opacity = 0
              if (wordElapsed > 0) {
                const p = Math.min(wordElapsed / 0.4, 1)
                if (p < 0.6) { transform = `translateY(${30 * (1 - p / 0.6)}px)`; opacity = p / 0.6 }
                else if (p < 0.8) { transform = `translateY(${-5 * ((p - 0.6) / 0.2)}px)`; opacity = 1 }
                else { transform = `translateY(${-5 * (1 - (p - 0.8) / 0.2)}px)`; opacity = 1 }
              }
              return (
                <span key={i} style={{ ...textStyle, display: 'inline-block', transform, opacity }}>{w.text}{' '}</span>
              )
            })}
          </p>
        </div>
      )
    }
  }

  // Minimal / slideUp
  if (style.preset === 'minimal' || style.animation === 'slideUp') {
    return (
      <div className={`absolute ${posClass} left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg max-w-[80%] z-20 animate-caption-slide-up`} style={{ backgroundColor: bgRgba }} dir="rtl">
        <p className={alignClass} style={{ ...textStyle, fontSize: `${Math.max(style.fontSize - 4, 12)}px` }}>{caption.text}</p>
      </div>
    )
  }

  // Zoom
  if (style.animation === 'zoom') {
    return (
      <div className={`absolute ${posClass} left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg max-w-[80%] z-20 animate-caption-zoom`} style={{ backgroundColor: bgRgba }} dir="rtl">
        <p className={alignClass} style={textStyle}>{caption.text}</p>
      </div>
    )
  }

  // Classic (default) - fade
  const animClass = style.animation === 'fade' ? 'animate-caption-fade' : ''
  return (
    <div className={`absolute ${posClass} left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg max-w-[80%] z-20 ${animClass}`} style={{ backgroundColor: bgRgba }} dir="rtl">
      <p className={alignClass} style={textStyle}>{caption.text}</p>
    </div>
  )
}
