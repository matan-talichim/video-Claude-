import { useState, useRef, useEffect, useCallback } from 'react'
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Maximize, Subtitles, Music } from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'

const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2]

export default function VideoPanel() {
  const {
    currentTime, duration, isPlaying, volume, playbackSpeed,
    mediaBlobUrl, mediaType, isDemo, showCaptions, transcript,
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

  // Sync playback state to media element
  useEffect(() => {
    const el = mediaType === 'video' ? videoRef.current : audioRef.current
    if (!el) return
    if (isPlaying) {
      el.play().catch(() => {})
    } else {
      el.pause()
    }
  }, [isPlaying, mediaType, mediaBlobUrl])

  // Sync playback speed
  useEffect(() => {
    const el = mediaType === 'video' ? videoRef.current : audioRef.current
    if (el) el.playbackRate = playbackSpeed
  }, [playbackSpeed, mediaType])

  // Sync volume
  useEffect(() => {
    const el = mediaType === 'video' ? videoRef.current : audioRef.current
    if (el) el.volume = volume / 100
  }, [volume, mediaType])

  // Time update from media element
  const handleTimeUpdate = useCallback(() => {
    const el = mediaType === 'video' ? videoRef.current : audioRef.current
    if (el) {
      setCurrentTime(el.currentTime)
    }
  }, [mediaType, setCurrentTime])

  // Duration loaded
  const handleLoadedMetadata = useCallback(() => {
    const el = mediaType === 'video' ? videoRef.current : audioRef.current
    if (el && el.duration && isFinite(el.duration)) {
      setDuration(el.duration)
    }
  }, [mediaType, setDuration])

  // Media ended
  const handleEnded = useCallback(() => {
    setIsPlaying(false)
  }, [setIsPlaying])

  // Seek from external (clicking transcript/timeline)
  useEffect(() => {
    const el = mediaType === 'video' ? videoRef.current : audioRef.current
    if (el && Math.abs(el.currentTime - currentTime) > 0.5) {
      el.currentTime = currentTime
    }
  }, [currentTime, mediaType])

  // Audio waveform visualization for audio files
  useEffect(() => {
    if (mediaType !== 'audio' || !mediaBlobUrl || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * 2
      canvas.height = rect.height * 2
      ctx.scale(2, 2)
      const w = rect.width
      const h = rect.height

      ctx.clearRect(0, 0, w, h)

      // Background
      ctx.fillStyle = 'rgba(26, 26, 46, 1)'
      ctx.fillRect(0, 0, w, h)

      // Draw waveform bars
      const barCount = Math.floor(w / 4)
      const progressRatio = duration > 0 ? currentTime / duration : 0

      for (let i = 0; i < barCount; i++) {
        const x = i * 4
        const seed = Math.sin(i * 0.3) * 0.5 + Math.cos(i * 0.7) * 0.3 + 0.5
        const amplitude = 0.1 + seed * 0.7
        const barH = amplitude * (h * 0.7)
        const y = (h - barH) / 2
        const ratio = i / barCount

        if (ratio <= progressRatio) {
          const gradient = ctx.createLinearGradient(x, y, x, y + barH)
          gradient.addColorStop(0, 'rgba(124, 92, 255, 0.9)')
          gradient.addColorStop(1, 'rgba(92, 138, 255, 0.7)')
          ctx.fillStyle = gradient
        } else {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'
        }
        ctx.fillRect(x, y, 2.5, barH)
      }

      animFrameRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [mediaType, mediaBlobUrl, currentTime, duration])

  const handleSpeedCycle = () => {
    const nextIdx = (speedIdx + 1) % speeds.length
    setSpeedIdx(nextIdx)
    setPlaybackSpeed(speeds[nextIdx])
  }

  const handleProgressClick = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    const newTime = ratio * duration
    setCurrentTime(newTime)
    const el = mediaType === 'video' ? videoRef.current : audioRef.current
    if (el) el.currentTime = newTime
  }

  const handlePlayToggle = () => {
    togglePlay()
  }

  const handleSkip = (delta: number) => {
    const newTime = Math.max(0, Math.min(duration, currentTime + delta))
    setCurrentTime(newTime)
    const el = mediaType === 'video' ? videoRef.current : audioRef.current
    if (el) el.currentTime = newTime
  }

  const handleFullscreen = () => {
    if (videoRef.current) {
      videoRef.current.requestFullscreen?.()
    }
  }

  // Find current caption text
  const captionText = showCaptions ? transcript.flatMap(s => s.words)
    .filter(w => currentTime >= w.start - 0.3 && currentTime < w.end + 0.3)
    .map(w => w.text).join(' ') : ''

  const hasMedia = !!mediaBlobUrl

  return (
    <div
      className="flex flex-col h-full bg-bg-deepest rounded-xl border border-white/[0.06] overflow-hidden"
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => { setShowControls(false); setShowVolume(false) }}
    >
      {/* Video/Audio area */}
      <div className="flex-1 bg-bg-deepest flex items-center justify-center relative overflow-hidden">
        {/* Real video element */}
        {hasMedia && mediaType === 'video' && (
          <video
            ref={videoRef}
            src={mediaBlobUrl!}
            className="w-full h-full object-contain"
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={handleEnded}
            playsInline
          />
        )}

        {/* Real audio element (hidden) + waveform canvas */}
        {hasMedia && mediaType === 'audio' && (
          <>
            <audio
              ref={audioRef}
              src={mediaBlobUrl!}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={handleEnded}
            />
            <div className="w-full h-full flex flex-col items-center justify-center">
              <Music size={48} className="text-accent-purple mb-4 opacity-50" />
              <canvas ref={canvasRef} className="w-full h-32" />
            </div>
          </>
        )}

        {/* Demo/No media placeholder */}
        {!hasMedia && (
          <div className="w-full h-full bg-gradient-to-br from-bg-panel to-bg-deepest rounded-lg flex flex-col items-center justify-center">
            {isDemo ? (
              <>
                <div className="text-4xl mb-2 opacity-30">🎬</div>
                <div className="text-text-muted text-sm">פרויקט דמו</div>
              </>
            ) : (
              <>
                <div className="text-text-muted text-sm">אין מדיה טעונה</div>
                <div className="text-text-muted text-xs mt-1">חבר API ליצירת קריינות</div>
              </>
            )}
          </div>
        )}

        {/* Captions overlay */}
        {showCaptions && captionText && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/70 rounded-lg max-w-[80%]">
            <p className="text-white text-sm text-center" dir="rtl">{captionText}</p>
          </div>
        )}

        {/* Center play button overlay */}
        <button
          onClick={handlePlayToggle}
          className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${showControls || !isPlaying ? 'opacity-100' : 'opacity-0'}`}
        >
          <div className="w-16 h-16 rounded-full glass flex items-center justify-center hover:scale-110 transition-transform shadow-2xl">
            {isPlaying ? (
              <Pause size={26} className="text-white" />
            ) : (
              <Play size={26} className="text-white mr-[-2px]" />
            )}
          </div>
        </button>

        {/* Glass controls at bottom */}
        <div className={`absolute bottom-0 left-0 right-0 transition-all duration-200 ${showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
          <div className="mx-3 mb-3 glass rounded-xl p-2 space-y-2">
            {/* Progress bar */}
            <div
              className="h-1 bg-white/[0.08] rounded-full overflow-hidden cursor-pointer group hover:h-1.5 transition-all"
              onClick={handleProgressClick}
            >
              <div
                className="h-full bg-accent-purple rounded-full relative transition-all"
                style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%' }}
              >
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>

            {/* Controls row */}
            <div className="flex items-center gap-2">
              <button onClick={() => handleSkip(-5)} className="p-1 hover:bg-white/[0.08] rounded transition-colors text-text-secondary hover:text-text-primary">
                <SkipBack size={14} />
              </button>
              <button onClick={handlePlayToggle} className="p-1.5 hover:bg-white/[0.08] rounded transition-colors text-text-primary">
                {isPlaying ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <button onClick={() => handleSkip(5)} className="p-1 hover:bg-white/[0.08] rounded transition-colors text-text-secondary hover:text-text-primary">
                <SkipForward size={14} />
              </button>

              <span className="text-xs text-text-muted font-mono px-1">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>

              <div className="flex-1" />

              <button
                onClick={handleSpeedCycle}
                className="px-2 py-0.5 rounded-full bg-white/[0.06] text-[11px] text-text-secondary hover:text-text-primary hover:bg-white/[0.1] transition-colors font-mono"
              >
                {speeds[speedIdx]}x
              </button>

              <div className="relative flex items-center" onMouseEnter={() => setShowVolume(true)} onMouseLeave={() => setShowVolume(false)}>
                <button
                  onClick={() => setVolume(volume > 0 ? 0 : 80)}
                  className="p-1 hover:bg-white/[0.08] rounded transition-colors text-text-secondary hover:text-text-primary"
                >
                  {volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
                <div className={`overflow-hidden transition-all duration-200 ${showVolume ? 'w-16 opacity-100 mr-1' : 'w-0 opacity-0'}`}>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="w-full h-1 accent-accent-purple"
                  />
                </div>
              </div>

              <button
                onClick={() => setShowCaptions(!showCaptions)}
                className={`p-1 hover:bg-white/[0.08] rounded transition-colors ${showCaptions ? 'text-accent-purple' : 'text-text-secondary hover:text-text-primary'}`}
              >
                <Subtitles size={14} />
              </button>

              <button
                onClick={handleFullscreen}
                className="p-1 hover:bg-white/[0.08] rounded transition-colors text-text-secondary hover:text-text-primary"
              >
                <Maximize size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
