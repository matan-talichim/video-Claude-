import { Play, Pause, SkipBack, SkipForward, Volume2, Maximize } from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'

const speeds = [0.5, 1, 1.5, 2]

export default function VideoPanel() {
  const { currentTime, duration, isPlaying, playbackSpeed, volume, togglePlay, setPlaybackSpeed, setVolume, setCurrentTime } = useEditorStore()

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0')
    const sec = Math.floor(s % 60).toString().padStart(2, '0')
    return `${m}:${sec}`
  }

  return (
    <div className="flex flex-col h-full bg-[#16213E] rounded-xl border border-white/5 overflow-hidden">
      <div className="flex-1 bg-gradient-to-br from-[#0F3460]/60 to-[#1A1A2E] flex items-center justify-center relative">
        <button
          onClick={togglePlay}
          className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 hover:scale-110 transition-all"
        >
          {isPlaying ? <Pause size={28} fill="white" /> : <Play size={28} fill="white" className="mr-[-2px]" />}
        </button>
      </div>

      <div className="p-3 border-t border-white/10 space-y-2 shrink-0">
        <div className="h-1 bg-white/10 rounded-full overflow-hidden cursor-pointer" onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const ratio = (e.clientX - rect.left) / rect.width
          setCurrentTime(ratio * duration)
        }}>
          <div className="h-full bg-[#E94560] rounded-full" style={{ width: `${(currentTime / duration) * 100}%` }} />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentTime(Math.max(0, currentTime - 5))} className="p-1.5 hover:bg-white/10 rounded transition-colors">
              <SkipBack size={14} />
            </button>
            <button onClick={togglePlay} className="p-1.5 hover:bg-white/10 rounded transition-colors">
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button onClick={() => setCurrentTime(Math.min(duration, currentTime + 5))} className="p-1.5 hover:bg-white/10 rounded transition-colors">
              <SkipForward size={14} />
            </button>
          </div>

          <span className="text-xs text-white/50 font-mono">{formatTime(currentTime)} / {formatTime(duration)}</span>

          <div className="flex items-center gap-1">
            {speeds.map((s) => (
              <button
                key={s}
                onClick={() => setPlaybackSpeed(s)}
                className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                  playbackSpeed === s ? 'bg-[#0F3460] text-white' : 'text-white/40 hover:text-white'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <Volume2 size={14} className="text-white/40" />
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="w-16 h-1 accent-[#E94560]"
            />
          </div>

          <button className="p-1.5 hover:bg-white/10 rounded transition-colors">
            <Maximize size={14} />
          </button>
        </div>
      </div>

      <div className="flex gap-2 p-3 border-t border-white/10 shrink-0">
        {[1, 2, 3, 4].map((scene) => (
          <div key={scene} className="flex-1 h-12 bg-gradient-to-r from-[#0F3460] to-[#16213E] rounded-lg border border-white/10 cursor-pointer hover:border-white/30 transition-colors" />
        ))}
      </div>
    </div>
  )
}
