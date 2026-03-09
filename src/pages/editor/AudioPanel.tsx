import { useState } from 'react'
import { Volume2, Music, Sliders, RotateCcw, Play } from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'

const eqPresets = [
  { id: 'speech', label: 'דיבור', bass: 0, mid: 3, treble: 2 },
  { id: 'music', label: 'מוזיקה', bass: 4, mid: 0, treble: 2 },
  { id: 'podcast', label: 'פודקאסט', bass: 2, mid: 4, treble: 1 },
  { id: 'standard', label: 'סטנדרטי', bass: 0, mid: 0, treble: 0 },
]

export default function AudioPanel({ onClose }: { onClose?: () => void }) {
  const { volume, setVolume, playbackSpeed, setPlaybackSpeed } = useEditorStore()
  const [noiseReduction, setNoiseReduction] = useState(false)
  const [noiseIntensity, setNoiseIntensity] = useState(50)
  const [bass, setBass] = useState(0)
  const [mid, setMid] = useState(0)
  const [treble, setTreble] = useState(0)
  const [fadeIn, setFadeIn] = useState(0)
  const [fadeOut, setFadeOut] = useState(0)
  const [activePreset, setActivePreset] = useState<string | null>('standard')

  const applyPreset = (preset: typeof eqPresets[0]) => {
    setBass(preset.bass)
    setMid(preset.mid)
    setTreble(preset.treble)
    setActivePreset(preset.id)
  }

  return (
    <div className="flex flex-col h-full glass rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center justify-between p-3 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2">
          <Music size={16} className="text-accent-purple" />
          <span className="font-bold text-sm text-text-primary">אודיו</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-xs text-text-muted hover:text-text-primary transition-colors">סגור</button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-5">
        {/* Master Volume */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Volume2 size={14} className="text-text-secondary" />
            <span className="text-xs font-medium text-text-primary">עוצמת קול ראשית</span>
            <span className="text-[10px] text-text-muted mr-auto font-mono">{volume}%</span>
          </div>
          <input
            type="range" min="0" max="200" value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="w-full h-1.5 accent-accent-purple rounded-full"
          />
          <div className="flex justify-between text-[9px] text-text-muted">
            <span>200%</span>
            <span>100%</span>
            <span>0%</span>
          </div>
          {/* Level meter */}
          <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden flex gap-px" dir="ltr">
            {Array.from({ length: 20 }, (_, i) => {
              const level = (volume / 200) * 20
              const isActive = i < level
              const color = i < 12 ? 'bg-green-500' : i < 16 ? 'bg-yellow-500' : 'bg-red-500'
              return (
                <div key={i} className={`flex-1 h-full rounded-sm transition-colors ${isActive ? color : 'bg-white/[0.06]'}`} />
              )
            })}
          </div>
        </div>

        {/* Noise Reduction */}
        <div className="space-y-2 p-3 bg-white/[0.02] rounded-lg border border-white/[0.06]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-primary">סינון רעשים</span>
            <button
              onClick={() => setNoiseReduction(!noiseReduction)}
              className={`w-9 h-5 rounded-full transition-colors relative ${noiseReduction ? 'bg-accent-purple' : 'bg-white/[0.12]'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${noiseReduction ? 'right-0.5' : 'right-[18px]'}`} />
            </button>
          </div>
          {noiseReduction && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-text-muted">עוצמה:</span>
                <input
                  type="range" min="0" max="100" value={noiseIntensity}
                  onChange={(e) => setNoiseIntensity(Number(e.target.value))}
                  className="flex-1 h-1 accent-accent-purple"
                />
                <span className="text-[10px] text-text-muted font-mono w-8 text-left">{noiseIntensity}%</span>
              </div>
              <button className="flex items-center gap-1.5 text-[10px] text-accent-purple hover:text-accent-purple/80 transition-colors">
                <Play size={10} />
                השמע דוגמה
              </button>
            </>
          )}
        </div>

        {/* Equalizer */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sliders size={14} className="text-text-secondary" />
            <span className="text-xs font-medium text-text-primary">אקולייזר</span>
          </div>

          {/* Preset buttons */}
          <div className="flex gap-1.5 flex-wrap">
            {eqPresets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => applyPreset(preset)}
                className={`px-2.5 py-1 rounded-lg text-[10px] transition-all ${
                  activePreset === preset.id
                    ? 'bg-accent-purple/20 text-accent-purple border border-accent-purple/30'
                    : 'bg-white/[0.04] text-text-muted hover:bg-white/[0.08] border border-white/[0.06]'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* EQ Sliders */}
          <div className="space-y-2.5">
            {[
              { label: 'באס', value: bass, onChange: setBass },
              { label: 'אמצע', value: mid, onChange: setMid },
              { label: 'טרבל', value: treble, onChange: setTreble },
            ].map(({ label, value, onChange }) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-[10px] text-text-muted w-10">{label}</span>
                <span className="text-[9px] text-text-muted font-mono w-7 text-left">-12</span>
                <input
                  type="range" min="-12" max="12" value={value}
                  onChange={(e) => { onChange(Number(e.target.value)); setActivePreset(null) }}
                  className="flex-1 h-1 accent-accent-purple"
                />
                <span className="text-[9px] text-text-muted font-mono w-7">+12</span>
                <span className="text-[10px] text-accent-purple font-mono w-6 text-left">{value > 0 ? `+${value}` : value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Playback Speed */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-text-primary">מהירות ניגון</span>
            <span className="text-[10px] text-accent-purple font-mono mr-auto">{playbackSpeed}x</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPlaybackSpeed(Math.max(0.25, playbackSpeed - 0.25))}
              className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-text-secondary text-sm transition-colors"
            >
              -
            </button>
            <input
              type="range" min="0.25" max="4" step="0.25" value={playbackSpeed}
              onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
              className="flex-1 h-1 accent-accent-purple"
            />
            <button
              onClick={() => setPlaybackSpeed(Math.min(4, playbackSpeed + 0.25))}
              className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-text-secondary text-sm transition-colors"
            >
              +
            </button>
          </div>
          <button
            onClick={() => setPlaybackSpeed(1)}
            className="flex items-center gap-1 text-[10px] text-text-muted hover:text-text-primary transition-colors"
          >
            <RotateCcw size={10} />
            איפוס ל-1x
          </button>
        </div>

        {/* Fade In / Out */}
        <div className="space-y-3 p-3 bg-white/[0.02] rounded-lg border border-white/[0.06]">
          <span className="text-xs font-medium text-text-primary">עמעום</span>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-text-muted w-16">Fade In:</span>
              <input
                type="range" min="0" max="5" step="0.5" value={fadeIn}
                onChange={(e) => setFadeIn(Number(e.target.value))}
                className="flex-1 h-1 accent-accent-purple"
              />
              <span className="text-[10px] text-text-muted font-mono w-8 text-left">{fadeIn}s</span>
              <button className="p-1 hover:bg-white/[0.06] rounded transition-colors text-text-muted hover:text-accent-purple">
                <Play size={10} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-text-muted w-16">Fade Out:</span>
              <input
                type="range" min="0" max="5" step="0.5" value={fadeOut}
                onChange={(e) => setFadeOut(Number(e.target.value))}
                className="flex-1 h-1 accent-accent-purple"
              />
              <span className="text-[10px] text-text-muted font-mono w-8 text-left">{fadeOut}s</span>
              <button className="p-1 hover:bg-white/[0.06] rounded transition-colors text-text-muted hover:text-accent-purple">
                <Play size={10} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
