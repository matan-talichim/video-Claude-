import { useState } from 'react'
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Maximize, Subtitles } from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'

const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2]

export default function VideoPanel() {
  const { currentTime, duration, isPlaying, volume, togglePlay, setPlaybackSpeed, setVolume, setCurrentTime } = useEditorStore()
  const [showControls, setShowControls] = useState(false)
  const [showVolume, setShowVolume] = useState(false)
  const [speedIdx, setSpeedIdx] = useState(2)

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0')
    const sec = Math.floor(s % 60).toString().padStart(2, '0')
    return `${m}:${sec}`
  }

  const handleSpeedCycle = () => {
    const nextIdx = (speedIdx + 1) % speeds.length
    setSpeedIdx(nextIdx)
    setPlaybackSpeed(speeds[nextIdx])
  }

  return (
    <div
      className="flex flex-col h-full bg-bg-deepest rounded-xl border border-white/[0.06] overflow-hidden"
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => { setShowControls(false); setShowVolume(false) }}
    >
      {/* Video area */}
      <div className="flex-1 bg-bg-deepest flex items-center justify-center relative">
        <div className="w-full h-full bg-gradient-to-br from-bg-panel to-bg-deepest rounded-lg flex items-center justify-center">
          <div className="text-text-muted text-sm">תצוגה מקדימה</div>
        </div>

        {/* Center play button */}
        <button
          onClick={togglePlay}
          className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${showControls ? 'opacity-100' : 'opacity-0'}`}
        >
          <div className="w-16 h-16 rounded-full glass flex items-center justify-center hover:scale-110 transition-transform shadow-2xl">
            {isPlaying ? (
              <Pause size={26} className="text-white animate-morph" />
            ) : (
              <Play size={26} className="text-white mr-[-2px] animate-morph" />
            )}
          </div>
        </button>

        {/* Glass controls overlay at bottom */}
        <div className={`absolute bottom-0 left-0 right-0 transition-all duration-200 ${showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
          <div className="mx-3 mb-3 glass rounded-xl p-2 space-y-2">
            {/* Progress bar */}
            <div
              className="h-1 bg-white/[0.08] rounded-full overflow-hidden cursor-pointer group hover:h-1.5 transition-all"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                const ratio = (e.clientX - rect.left) / rect.width
                setCurrentTime(ratio * duration)
              }}
            >
              <div
                className="h-full bg-accent-purple rounded-full relative transition-all"
                style={{ width: `${(currentTime / duration) * 100}%` }}
              >
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>

            {/* Controls row */}
            <div className="flex items-center gap-2">
              <button onClick={() => setCurrentTime(Math.max(0, currentTime - 5))} className="p-1 hover:bg-white/[0.08] rounded transition-colors text-text-secondary hover:text-text-primary">
                <SkipBack size={14} />
              </button>
              <button onClick={togglePlay} className="p-1.5 hover:bg-white/[0.08] rounded transition-colors text-text-primary">
                {isPlaying ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <button onClick={() => setCurrentTime(Math.min(duration, currentTime + 5))} className="p-1 hover:bg-white/[0.08] rounded transition-colors text-text-secondary hover:text-text-primary">
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

              <button className="p-1 hover:bg-white/[0.08] rounded transition-colors text-text-secondary hover:text-text-primary">
                <Subtitles size={14} />
              </button>

              <button className="p-1 hover:bg-white/[0.08] rounded transition-colors text-text-secondary hover:text-text-primary">
                <Maximize size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
