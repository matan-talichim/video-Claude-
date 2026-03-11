import { useState, useRef, useCallback } from 'react'
import { Volume2, Music, Sliders, RotateCcw, Play, Trash2, Upload, Sparkles, X } from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'

const eqPresets = [
  { id: 'speech', label: 'דיבור', bass: -3, mid: 6, treble: 2 },
  { id: 'music', label: 'מוזיקה', bass: 4, mid: 0, treble: 3 },
  { id: 'podcast', label: 'פודקאסט', bass: -2, mid: 8, treble: 1 },
  { id: 'standard', label: 'סטנדרטי', bass: 0, mid: 0, treble: 0 },
]

const moodCategories = ['הכל', 'שמח', 'רגוע', 'דרמטי', 'אנרגטי', 'עסקי', 'רומנטי', 'מתח', 'השראה', 'חגיגי'] as const

const musicLibrary = [
  { id: 'happy-1', name: 'יום חדש', mood: 'שמח', duration: 120, bpm: 120, genre: 'Pop' },
  { id: 'happy-2', name: 'חיוך בבוקר', mood: 'שמח', duration: 90, bpm: 110, genre: 'Acoustic' },
  { id: 'happy-3', name: 'קיץ אינסופי', mood: 'שמח', duration: 150, bpm: 128, genre: 'Electronic' },
  { id: 'calm-1', name: 'שקט פנימי', mood: 'רגוע', duration: 180, bpm: 70, genre: 'Ambient' },
  { id: 'calm-2', name: 'זריחה', mood: 'רגוע', duration: 120, bpm: 80, genre: 'Piano' },
  { id: 'calm-3', name: 'גלים', mood: 'רגוע', duration: 200, bpm: 60, genre: 'Nature' },
  { id: 'drama-1', name: 'רגע האמת', mood: 'דרמטי', duration: 90, bpm: 90, genre: 'Cinematic' },
  { id: 'drama-2', name: 'מתח עולה', mood: 'דרמטי', duration: 120, bpm: 100, genre: 'Orchestral' },
  { id: 'energy-1', name: 'אנרגיה חיובית', mood: 'אנרגטי', duration: 100, bpm: 140, genre: 'EDM' },
  { id: 'energy-2', name: 'ריצה קדימה', mood: 'אנרגטי', duration: 90, bpm: 150, genre: 'Rock' },
  { id: 'corp-1', name: 'עסקים כרגיל', mood: 'עסקי', duration: 120, bpm: 100, genre: 'Corporate' },
  { id: 'corp-2', name: 'חדשנות', mood: 'עסקי', duration: 150, bpm: 110, genre: 'Technology' },
  { id: 'corp-3', name: 'צמיחה', mood: 'עסקי', duration: 100, bpm: 95, genre: 'Corporate' },
  { id: 'romantic-1', name: 'רגע של אהבה', mood: 'רומנטי', duration: 180, bpm: 75, genre: 'Piano' },
  { id: 'tension-1', name: 'מאחורי הקלעים', mood: 'מתח', duration: 120, bpm: 85, genre: 'Dark' },
  { id: 'inspire-1', name: 'חלום גדול', mood: 'השראה', duration: 150, bpm: 100, genre: 'Cinematic' },
  { id: 'inspire-2', name: 'הדרך קדימה', mood: 'השראה', duration: 120, bpm: 110, genre: 'Motivational' },
  { id: 'party-1', name: 'חגיגה', mood: 'חגיגי', duration: 100, bpm: 128, genre: 'Dance' },
  { id: 'party-2', name: 'יום הולדת', mood: 'חגיגי', duration: 90, bpm: 120, genre: 'Fun' },
  { id: 'party-3', name: 'ריקוד חופשי', mood: 'חגיגי', duration: 130, bpm: 135, genre: 'Dance' },
]

const moodColors: Record<string, string> = {
  'שמח': 'bg-yellow-500/20 text-yellow-400',
  'רגוע': 'bg-sky-500/20 text-sky-400',
  'דרמטי': 'bg-red-500/20 text-red-400',
  'אנרגטי': 'bg-orange-500/20 text-orange-400',
  'עסקי': 'bg-blue-500/20 text-blue-400',
  'רומנטי': 'bg-pink-500/20 text-pink-400',
  'מתח': 'bg-purple-500/20 text-purple-400',
  'השראה': 'bg-emerald-500/20 text-emerald-400',
  'חגיגי': 'bg-amber-500/20 text-amber-400',
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function AudioPanel({ onClose }: { onClose?: () => void }) {
  // Use store values with null safety
  const masterVolume = useEditorStore(s => s.masterVolume ?? 80)
  const volume = useEditorStore(s => s.volume ?? 80)
  const setVolume = useEditorStore(s => s.setVolume)
  const setMasterVolume = useEditorStore(s => s.setMasterVolume)
  const noiseReduction = useEditorStore(s => s.noiseReduction ?? false)
  const setNoiseReduction = useEditorStore(s => s.setNoiseReduction)
  const noiseReductionIntensity = useEditorStore(s => s.noiseReductionIntensity ?? 50)
  const setNoiseReductionIntensity = useEditorStore(s => s.setNoiseReductionIntensity)
  const eq = useEditorStore(s => s.eq ?? { bass: 0, mid: 0, treble: 0, preset: 'standard' })
  const setEq = useEditorStore(s => s.setEq)
  const playbackSpeed = useEditorStore(s => s.playbackSpeed ?? 1)
  const setPlaybackSpeed = useEditorStore(s => s.setPlaybackSpeed)
  const fadeIn = useEditorStore(s => s.fadeIn ?? 0)
  const setFadeIn = useEditorStore(s => s.setFadeIn)
  const fadeOut = useEditorStore(s => s.fadeOut ?? 0)
  const setFadeOut = useEditorStore(s => s.setFadeOut)
  const backgroundMusic = useEditorStore(s => s.backgroundMusic)
  const setBackgroundMusic = useEditorStore(s => s.setBackgroundMusic)
  const setMusicVolume = useEditorStore(s => s.setMusicVolume)
  const setMusicDucking = useEditorStore(s => s.setMusicDucking)
  const removeBackgroundMusic = useEditorStore(s => s.removeBackgroundMusic)

  const [showMusicLibrary, setShowMusicLibrary] = useState(false)
  const [activeMoodFilter, setActiveMoodFilter] = useState<string>('הכל')
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null)
  const musicFileInput = useRef<HTMLInputElement>(null)

  const handleVolumeChange = useCallback((value: number) => {
    try {
      setMasterVolume(value)
      setVolume(value)
    } catch (e) {
      console.error('Volume change error:', e)
    }
  }, [setMasterVolume, setVolume])

  const handleNoiseReductionToggle = useCallback(() => {
    try {
      setNoiseReduction(!noiseReduction)
    } catch (e) {
      console.error('Noise reduction toggle error:', e)
    }
  }, [noiseReduction, setNoiseReduction])

  const handleNoiseIntensityChange = useCallback((value: number) => {
    try {
      setNoiseReductionIntensity(value)
    } catch (e) {
      console.error('Noise intensity change error:', e)
    }
  }, [setNoiseReductionIntensity])

  const applyPreset = useCallback((preset: typeof eqPresets[0]) => {
    try {
      setEq({ bass: preset.bass, mid: preset.mid, treble: preset.treble, preset: preset.id })
    } catch (e) {
      console.error('EQ preset error:', e)
    }
  }, [setEq])

  const handleEqChange = useCallback((band: 'bass' | 'mid' | 'treble', value: number) => {
    try {
      setEq({ ...eq, [band]: value, preset: 'custom' })
    } catch (e) {
      console.error('EQ change error:', e)
    }
  }, [eq, setEq])

  const handleSpeedChange = useCallback((speed: number) => {
    try {
      setPlaybackSpeed(speed)
    } catch (e) {
      console.error('Speed change error:', e)
    }
  }, [setPlaybackSpeed])

  const handleFadeInChange = useCallback((value: number) => {
    try {
      setFadeIn(value)
    } catch (e) {
      console.error('Fade in change error:', e)
    }
  }, [setFadeIn])

  const handleFadeOutChange = useCallback((value: number) => {
    try {
      setFadeOut(value)
    } catch (e) {
      console.error('Fade out change error:', e)
    }
  }, [setFadeOut])

  const handleMusicUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = e.target.files?.[0]
      if (!file) return
      const blobUrl = URL.createObjectURL(file)
      const audio = new Audio(blobUrl)
      audio.addEventListener('loadedmetadata', () => {
        setBackgroundMusic({
          file,
          blobUrl,
          name: file.name,
          duration: audio.duration,
          volume: 50,
          startOffset: 0,
          ducking: true,
          fadeOut: true,
          trackId: `music-${Date.now()}`,
        })
      })
      audio.addEventListener('error', () => {
        URL.revokeObjectURL(blobUrl)
        console.error('Failed to load audio file')
      })
    } catch (e) {
      console.error('Music upload error:', e)
    }
  }, [setBackgroundMusic])

  const handleSelectLibraryTrack = useCallback((track: typeof musicLibrary[0]) => {
    try {
      setBackgroundMusic({
        file: null,
        blobUrl: '',
        name: track.name,
        duration: track.duration,
        volume: 50,
        startOffset: 0,
        ducking: true,
        fadeOut: true,
        trackId: `music-${track.id}-${Date.now()}`,
      })
      setShowMusicLibrary(false)
    } catch (e) {
      console.error('Select library track error:', e)
    }
  }, [setBackgroundMusic])

  const handleAISuggestMusic = useCallback(() => {
    try {
      const moods = ['שמח', 'רגוע', 'אנרגטי', 'השראה', 'עסקי']
      const randomMood = moods[Math.floor(Math.random() * moods.length)]
      const matching = musicLibrary.filter(t => t.mood === randomMood)
      const suggestion = matching[Math.floor(Math.random() * matching.length)]
      if (suggestion) {
        setAiSuggestion(`לפי הסרטון שלך, מוזיקה בסגנון '${randomMood}' עם קצב ${suggestion.bpm} BPM תתאים מצוין. מומלץ: "${suggestion.name}"`)
      }
    } catch (e) {
      console.error('AI suggest error:', e)
    }
  }, [])

  const displayVolume = masterVolume ?? volume ?? 80
  const filteredTracks = activeMoodFilter === 'הכל'
    ? musicLibrary
    : musicLibrary.filter(t => t.mood === activeMoodFilter)

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
            <span className="text-[10px] text-text-muted ms-auto font-mono">{displayVolume}%</span>
          </div>
          <input
            type="range" min="0" max="200" value={displayVolume}
            onChange={(e) => handleVolumeChange(Number(e.target.value))}
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
              const level = (displayVolume / 200) * 20
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
              onClick={handleNoiseReductionToggle}
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
                  type="range" min="0" max="100" value={noiseReductionIntensity}
                  onChange={(e) => handleNoiseIntensityChange(Number(e.target.value))}
                  className="flex-1 h-1 accent-accent-purple"
                />
                <span className="text-[10px] text-text-muted font-mono w-8 text-left">{noiseReductionIntensity}%</span>
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
                  eq.preset === preset.id
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
              { label: 'באס', band: 'bass' as const, value: eq.bass },
              { label: 'אמצע', band: 'mid' as const, value: eq.mid },
              { label: 'טרבל', band: 'treble' as const, value: eq.treble },
            ].map(({ label, band, value }) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-[10px] text-text-muted w-10">{label}</span>
                <span className="text-[9px] text-text-muted font-mono w-7 text-left">-12</span>
                <input
                  type="range" min="-12" max="12" value={value}
                  onChange={(e) => handleEqChange(band, Number(e.target.value))}
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
            <span className="text-[10px] text-accent-purple font-mono ms-auto">{playbackSpeed}x</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSpeedChange(Math.max(0.25, playbackSpeed - 0.25))}
              className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-text-secondary text-sm transition-colors"
            >
              -
            </button>
            <input
              type="range" min="0.25" max="4" step="0.25" value={playbackSpeed}
              onChange={(e) => handleSpeedChange(Number(e.target.value))}
              className="flex-1 h-1 accent-accent-purple"
            />
            <button
              onClick={() => handleSpeedChange(Math.min(4, playbackSpeed + 0.25))}
              className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-text-secondary text-sm transition-colors"
            >
              +
            </button>
          </div>
          <button
            onClick={() => handleSpeedChange(1)}
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
                onChange={(e) => handleFadeInChange(Number(e.target.value))}
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
                onChange={(e) => handleFadeOutChange(Number(e.target.value))}
                className="flex-1 h-1 accent-accent-purple"
              />
              <span className="text-[10px] text-text-muted font-mono w-8 text-left">{fadeOut}s</span>
              <button className="p-1 hover:bg-white/[0.06] rounded transition-colors text-text-muted hover:text-accent-purple">
                <Play size={10} />
              </button>
            </div>
          </div>
        </div>

        {/* Background Music Section */}
        <div className="space-y-3 p-3 bg-white/[0.02] rounded-lg border border-white/[0.06]">
          <div className="flex items-center gap-2">
            <Music size={14} className="text-accent-purple" />
            <span className="text-xs font-medium text-text-primary">מוזיקת רקע</span>
          </div>

          {backgroundMusic ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-2 bg-white/[0.04] rounded-lg border border-white/[0.06]">
                <Music size={12} className="text-pink-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-text-primary truncate">{backgroundMusic.name}</div>
                  <div className="text-[9px] text-text-muted">{formatDuration(backgroundMusic.duration)}</div>
                </div>
                <button
                  onClick={() => { try { removeBackgroundMusic() } catch (e) { console.error(e) } }}
                  className="p-1 hover:bg-red-500/20 rounded transition-colors text-text-muted hover:text-red-400"
                >
                  <Trash2 size={12} />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] text-text-muted">עוצמה:</span>
                <input
                  type="range" min="0" max="100" value={backgroundMusic.volume}
                  onChange={(e) => { try { setMusicVolume(Number(e.target.value)) } catch (err) { console.error(err) } }}
                  className="flex-1 h-1 accent-pink-500"
                />
                <span className="text-[10px] text-text-muted font-mono w-8 text-left">{backgroundMusic.volume}%</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[10px] text-text-muted">הנמך בזמן דיבור</span>
                <button
                  onClick={() => { try { setMusicDucking(!backgroundMusic.ducking) } catch (err) { console.error(err) } }}
                  className={`w-8 h-4 rounded-full transition-colors relative ${backgroundMusic.ducking ? 'bg-pink-500' : 'bg-white/[0.12]'}`}
                >
                  <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all shadow-sm ${backgroundMusic.ducking ? 'right-0.5' : 'right-[14px]'}`} />
                </button>
              </div>
            </div>
          ) : (
            <p className="text-[10px] text-text-muted">אין מוזיקת רקע</p>
          )}

          {/* Add music options */}
          <div className="space-y-1.5">
            <button
              onClick={() => setShowMusicLibrary(true)}
              className="w-full flex items-center gap-2 px-3 py-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-lg text-[10px] text-text-secondary hover:text-text-primary transition-all"
            >
              <Music size={12} className="text-pink-400" />
              בחר מספריית מוזיקה
            </button>
            <button
              onClick={() => musicFileInput.current?.click()}
              className="w-full flex items-center gap-2 px-3 py-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-lg text-[10px] text-text-secondary hover:text-text-primary transition-all"
            >
              <Upload size={12} className="text-blue-400" />
              העלה מוזיקה שלי
            </button>
            <input
              ref={musicFileInput}
              type="file"
              accept="audio/mp3,audio/wav,audio/m4a,audio/ogg,audio/flac,audio/*"
              className="hidden"
              onChange={handleMusicUpload}
            />
            <button
              onClick={handleAISuggestMusic}
              className="w-full flex items-center gap-2 px-3 py-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-lg text-[10px] text-text-secondary hover:text-text-primary transition-all"
            >
              <Sparkles size={12} className="text-accent-purple" />
              הצע מוזיקה לפי תוכן הסרטון
            </button>
          </div>

          {aiSuggestion && (
            <div className="p-2 bg-accent-purple/10 border border-accent-purple/20 rounded-lg">
              <div className="flex items-start gap-2">
                <Sparkles size={12} className="text-accent-purple shrink-0 mt-0.5" />
                <p className="text-[10px] text-text-secondary leading-relaxed">{aiSuggestion}</p>
              </div>
              <button
                onClick={() => setAiSuggestion(null)}
                className="text-[9px] text-text-muted hover:text-text-primary mt-1 transition-colors"
              >
                סגור
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Music Library Modal */}
      {showMusicLibrary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowMusicLibrary(false)}>
          <div
            className="w-full max-w-2xl max-h-[80vh] bg-bg-card rounded-2xl border border-white/[0.08] shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Music size={18} className="text-pink-400" />
                <span className="font-bold text-sm text-text-primary">ספריית מוזיקה</span>
              </div>
              <button onClick={() => setShowMusicLibrary(false)} className="p-1 hover:bg-white/[0.08] rounded-lg transition-colors">
                <X size={18} className="text-text-muted" />
              </button>
            </div>

            {/* Mood filter tabs */}
            <div className="flex gap-1.5 p-3 overflow-x-auto border-b border-white/[0.06]">
              {moodCategories.map((mood) => (
                <button
                  key={mood}
                  onClick={() => setActiveMoodFilter(mood)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] whitespace-nowrap transition-all ${
                    activeMoodFilter === mood
                      ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30'
                      : 'bg-white/[0.04] text-text-muted hover:bg-white/[0.08] border border-white/[0.06]'
                  }`}
                >
                  {mood}
                </button>
              ))}
            </div>

            {/* Tracks grid */}
            <div className="flex-1 overflow-y-auto p-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {filteredTracks.map((track) => (
                  <div
                    key={track.id}
                    className="flex items-center gap-3 p-3 bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.06] rounded-xl transition-all group"
                  >
                    <div className="w-9 h-9 rounded-lg bg-pink-500/10 flex items-center justify-center shrink-0">
                      <Music size={16} className="text-pink-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium text-text-primary truncate">{track.name}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`px-1.5 py-0.5 rounded text-[8px] ${moodColors[track.mood] || 'bg-gray-500/20 text-gray-400'}`}>
                          {track.mood}
                        </span>
                        <span className="text-[9px] text-text-muted">{formatDuration(track.duration)}</span>
                        <span className="text-[9px] text-text-muted">{track.bpm} BPM</span>
                        <span className="text-[9px] text-text-muted">{track.genre}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleSelectLibraryTrack(track)}
                      className="px-2.5 py-1 bg-pink-500/20 hover:bg-pink-500/30 text-pink-400 rounded-lg text-[10px] transition-all opacity-60 group-hover:opacity-100"
                    >
                      בחר
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-[9px] text-text-muted text-center mt-4 p-2">
                מוזיקה אמיתית תהיה זמינה בקרוב. בינתיים ניתן להעלות מוזיקה משלך.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
