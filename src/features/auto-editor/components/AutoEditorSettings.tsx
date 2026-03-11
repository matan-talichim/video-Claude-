import { useState, useEffect } from 'react'
import { Video, Music, Sparkles, Film, ArrowRight, X } from 'lucide-react'
import type { AutoEditorInput } from '../store/autoEditorStore'

interface LocalFile {
  id: string
  name: string
  size: string
  sizeBytes: number
  type: 'video' | 'audio'
  nativeFile: File
}

interface AutoEditorSettingsProps {
  files: LocalFile[]
  onStart: (input: Omit<AutoEditorInput, 'videoUrls'>) => void
  onBack: () => void
  onClose?: () => void
}

const DURATION_OPTIONS = [
  { value: 15, label: '15 שנ׳' },
  { value: 30, label: '30 שנ׳' },
  { value: 60, label: '60 שנ׳' },
  { value: 90, label: '90 שנ׳' },
  { value: 0, label: 'מותאם' },
]

const BROLL_OPTIONS: { value: 'seedance' | 'veo'; label: string; desc: string }[] = [
  { value: 'seedance', label: 'Seedance 1.5 Pro', desc: 'מהיר ואיכותי' },
  { value: 'veo', label: 'Google VEO', desc: 'ריאליסטי במיוחד' },
]

function estimateDuration(files: LocalFile[]): number {
  // Rough estimate: ~1 minute per 10MB for video
  const totalBytes = files.reduce((sum, f) => sum + f.sizeBytes, 0)
  return Math.round(totalBytes / (10 * 1024 * 1024)) * 60
}

function estimateMaxVideos(files: LocalFile[], targetDuration: number): number {
  if (targetDuration === 0) return 1
  const estimated = estimateDuration(files)
  const available = estimated * 0.7
  return Math.max(1, Math.floor(available / targetDuration))
}

export default function AutoEditorSettings({ files, onStart, onBack, onClose }: AutoEditorSettingsProps) {
  const [userPrompt, setUserPrompt] = useState('')
  const [targetDuration, setTargetDuration] = useState(60)
  const [customDuration, setCustomDuration] = useState('')
  const [numberOfVideos, setNumberOfVideos] = useState(3)
  const [brollGenerator, setBrollGenerator] = useState<'seedance' | 'veo'>('seedance')

  const closeHandler = onClose || onBack

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeHandler()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [closeHandler])

  const effectiveDuration = targetDuration === 0 ? (parseInt(customDuration) || 60) : targetDuration
  const maxVideos = estimateMaxVideos(files, effectiveDuration)

  const handleStart = () => {
    onStart({
      userPrompt,
      targetDuration: effectiveDuration,
      numberOfVideos,
      brollGenerator,
    })
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-[#0A0A0F]/95 backdrop-blur-sm overflow-y-auto flex items-center justify-center">
      <div className="w-full max-w-2xl mx-auto p-8 relative" dir="rtl">
        {/* Close button */}
        <button
          onClick={closeHandler}
          className="absolute top-6 left-6 text-gray-400 hover:text-white text-xl transition-colors"
          aria-label="סגור"
        >
          <X size={20} />
        </button>

        {/* Back button */}
        <button
          onClick={onBack}
          className="mb-4 flex items-center gap-1 px-3 py-2 text-sm text-text-muted hover:text-text-primary transition-colors rounded-lg hover:bg-white/[0.05]"
        >
          <ArrowRight size={16} />
          חזרה
        </button>

        {/* Header */}
        <div className="text-center space-y-2 mb-8">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-accent-purple/20 to-accent-pink/20 flex items-center justify-center border border-accent-purple/20">
            <Sparkles size={28} className="text-accent-purple" />
          </div>
          <h2 className="text-xl font-bold text-text-primary">עריכה אוטומטית</h2>
          <p className="text-sm text-text-muted">AI יערוך את הסרטונים שלך אוטומטית</p>
        </div>

        <div className="w-full space-y-6">
          {/* Selected files */}
          <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06] space-y-2">
            <h3 className="text-sm font-medium text-text-secondary">קבצים שנבחרו:</h3>
            <div className="space-y-1.5">
              {files.map((file) => (
                <div key={file.id} className="flex items-center gap-2 text-sm">
                  <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
                    <span className="text-green-400 text-xs">✓</span>
                  </div>
                  {file.type === 'video' ? (
                    <Video size={14} className="text-accent-blue shrink-0" />
                  ) : (
                    <Music size={14} className="text-accent-purple shrink-0" />
                  )}
                  <span className="text-text-primary truncate flex-1">{file.name}</span>
                  <span className="text-text-muted text-xs">{file.size}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Prompt */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary block">
              תאר איך אתה רוצה את הסרטון:
            </label>
            <textarea
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              placeholder="לדוגמה: סרטון אנרגטי על שירות X, קצבי, ויב מודרני, מותאם לרשתות חברתיות..."
              rows={3}
              className="w-full px-4 py-3 bg-white/[0.03] rounded-xl border border-white/[0.06] text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-purple/40 resize-none transition-colors"
            />
          </div>

          {/* Duration & Video count grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Duration */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-text-primary block">אורך כל סרטון:</label>
              <div className="flex flex-wrap gap-2">
                {DURATION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setTargetDuration(opt.value)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                      targetDuration === opt.value
                        ? 'bg-accent-purple text-white shadow-lg shadow-accent-purple/20'
                        : 'bg-white/[0.04] text-text-secondary hover:bg-white/[0.08] border border-white/[0.06]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {targetDuration === 0 && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={customDuration}
                    onChange={(e) => setCustomDuration(e.target.value)}
                    placeholder="מספר שניות"
                    min={5}
                    max={300}
                    className="w-32 px-3 py-2 bg-white/[0.03] rounded-xl border border-white/[0.06] text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-purple/40 transition-colors"
                  />
                  <span className="text-sm text-text-muted">שניות</span>
                </div>
              )}
            </div>

            {/* Number of videos */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-text-primary">כמה סרטונים?</label>
                <span className="text-xs text-text-muted">
                  (מקסימום: {maxVideos})
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setNumberOfVideos(Math.max(1, numberOfVideos - 1))}
                  className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.06] text-text-secondary hover:bg-white/[0.08] transition-colors flex items-center justify-center text-lg font-bold"
                >
                  −
                </button>
                <div className="w-16 h-10 rounded-xl bg-white/[0.06] border border-accent-purple/30 flex items-center justify-center">
                  <span className="text-lg font-bold text-accent-purple">{numberOfVideos}</span>
                </div>
                <button
                  onClick={() => setNumberOfVideos(Math.min(20, numberOfVideos + 1))}
                  className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.06] text-text-secondary hover:bg-white/[0.08] transition-colors flex items-center justify-center text-lg font-bold"
                >
                  +
                </button>
              </div>
              {numberOfVideos > maxVideos && (
                <p className="text-xs text-yellow-400">
                  ייתכן שאין מספיק חומר עבור {numberOfVideos} סרטונים. מומלץ עד {maxVideos}.
                </p>
              )}
            </div>
          </div>

          {/* B-Roll generator */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-text-primary block">
              <Film size={14} className="inline ml-1" />
              מחולל B-Roll:
            </label>
            <div className="grid grid-cols-2 gap-3">
              {BROLL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setBrollGenerator(opt.value)}
                  className={`p-3 rounded-xl text-right transition-all border ${
                    brollGenerator === opt.value
                      ? 'border-accent-purple/50 bg-accent-purple/10 shadow-lg shadow-accent-purple/10'
                      : 'border-white/[0.06] bg-white/[0.03] hover:border-white/[0.12]'
                  }`}
                >
                  <div className={`text-sm font-medium ${brollGenerator === opt.value ? 'text-accent-purple' : 'text-text-primary'}`}>
                    {opt.label}
                  </div>
                  <div className="text-xs text-text-muted mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 pt-4 pb-8">
            <button
              onClick={handleStart}
              disabled={!userPrompt.trim()}
              className="flex items-center gap-2 px-8 py-3.5 bg-gradient-to-l from-accent-purple to-purple-600 hover:from-accent-purple/90 hover:to-purple-600/90 rounded-xl text-sm font-bold transition-all shadow-lg shadow-accent-purple/25 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles size={18} />
              התחל עריכה אוטומטית
            </button>
            <button
              onClick={onBack}
              className="flex items-center gap-1 px-4 py-3 text-sm text-text-muted hover:text-text-primary transition-colors"
            >
              <ArrowRight size={16} />
              חזרה
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
