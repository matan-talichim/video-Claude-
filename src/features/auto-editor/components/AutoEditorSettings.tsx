import { useState, useEffect } from 'react'
import { Video, Music, Sparkles, Film, ArrowRight, X } from 'lucide-react'
import type { AutoEditorInput } from '../store/autoEditorStore'
import { useUserProfileStore } from '../../../stores/userProfileStore'
import { usePromptEvolutionStore } from '../../../stores/promptEvolutionStore'

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
  { value: 15, label: '15 שנ׳', desc: 'Story / Reel' },
  { value: 30, label: '30 שנ׳', desc: 'TikTok / Reel' },
  { value: 60, label: '60 שנ׳', desc: 'Reel / Short' },
  { value: 90, label: '90 שנ׳', desc: 'YouTube Short' },
  { value: 180, label: '3 דקות', desc: 'YouTube' },
  { value: -1, label: '🤖 AI בוחר', desc: 'הזמן האופטימלי' },
  { value: 0, label: 'מותאם', desc: 'הזן ידנית' },
]

const BROLL_OPTIONS: { value: 'seedance' | 'veo'; label: string; desc: string }[] = [
  { value: 'seedance', label: 'Seedance 1.5 Pro', desc: 'מהיר ואיכותי' },
  { value: 'veo', label: 'Google VEO', desc: 'ריאליסטי במיוחד' },
]

const PLATFORM_OPTIONS = [
  { id: 'tiktok', name: 'TikTok', ratio: '9:16', icon: '📱' },
  { id: 'reels', name: 'Instagram Reels', ratio: '9:16', icon: '📸' },
  { id: 'shorts', name: 'YouTube Shorts', ratio: '9:16', icon: '🎬' },
  { id: 'youtube', name: 'YouTube', ratio: '16:9', icon: '▶️' },
  { id: 'linkedin', name: 'LinkedIn', ratio: '1:1', icon: '💼' },
  { id: 'facebook', name: 'Facebook', ratio: '16:9', icon: '👤' },
  { id: 'twitter', name: 'X / Twitter', ratio: '16:9', icon: '🐦' },
  { id: 'story', name: 'Story', ratio: '9:16', icon: '📲' },
]

const PRESET_CATEGORIES = [
  {
    title: 'עסקי',
    presets: [
      { label: 'סרטון תדמית לחברה', prompt: 'סרטון תדמית מקצועי לחברה' },
      { label: 'סרטון מכירות למוצר', prompt: 'סרטון מכירות שמציג את המוצר ויתרונותיו' },
      { label: 'סרטון לקוחות ממליצים', prompt: 'סרטון עדויות לקוחות מרוצים' },
      { label: 'סרטון הדרכה לעובדים', prompt: 'סרטון הדרכה פנימי ברור ומקצועי' },
    ]
  },
  {
    title: 'סושיאל',
    presets: [
      { label: 'TikTok / Reels', prompt: 'סרטון קצר וקצבי לרשתות חברתיות' },
      { label: 'YouTube Shorts', prompt: 'קליפ קצר ליוטיוב עם פתיחה חזקה' },
      { label: 'סטורי', prompt: 'סטורי קצר ומושך לאינסטגרם' },
      { label: 'פרסומת ממומנת', prompt: 'פרסומת קצרה ואנרגטית לקמפיין' },
    ]
  },
  {
    title: 'תוכן',
    presets: [
      { label: 'פודקאסט', prompt: 'עריכת פודקאסט נקייה ומקצועית' },
      { label: 'ראיון', prompt: 'עריכת ראיון עם מעברים חלקים' },
      { label: 'הרצאה / וובינר', prompt: 'עריכת הרצאה עם הדגשות ויזואליות' },
      { label: 'הדרכה / טוטוריאל', prompt: 'סרטון הדרכה ברור עם שלבים' },
    ]
  },
]

function EvolutionBadge() {
  const stats = usePromptEvolutionStore(s => s.getStats())
  const totalLearnings = stats.reduce((sum, s) => sum + s.additions, 0)

  if (totalLearnings === 0) return null

  return (
    <div className="flex items-center gap-2 bg-purple-500/10 rounded-full px-3 py-1 mb-4" dir="rtl">
      <span className="text-purple-400 text-xs">&#x1F9EC;</span>
      <span className="text-purple-300 text-xs">
        AI למד {totalLearnings} תובנות מ-{stats.reduce((s, st) => s + st.version, 0)} עריכות
      </span>
    </div>
  )
}

function PromptBuilder({ prompt, setPrompt }: { prompt: string; setPrompt: (p: string) => void }) {
  return (
    <div dir="rtl" className="space-y-4">
      {/* Practical preset categories */}
      {PRESET_CATEGORIES.map(cat => (
        <div key={cat.title}>
          <h4 className="text-xs text-gray-500 mb-2">{cat.title}</h4>
          <div className="flex flex-wrap gap-2">
            {cat.presets.map(p => (
              <button key={p.label} onClick={() => setPrompt(p.prompt)}
                className="bg-white/5 border border-white/10 text-gray-300 text-xs px-3 py-1.5 rounded-full hover:border-purple-500/30 hover:bg-purple-500/10 transition">
                {p.label}
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Prompt textarea */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <h4 className="text-sm font-medium text-white">הפרומפט שלך:</h4>
          {prompt && (
            <button onClick={() => setPrompt('')} className="text-xs text-gray-500 hover:text-red-400">
              נקה
            </button>
          )}
        </div>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="תאר בקצרה מה אתה רוצה. אחרי התמלול ה-AI ישפר אוטומטית..."
          className="w-full h-20 bg-black/30 text-white rounded-xl p-4 text-sm resize-none border border-white/10 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
          dir="rtl"
        />
        <p className="text-xs text-gray-600 text-center mt-1">
          הפרומפט ישתפר אוטומטית אחרי התמלול בהתאם לתוכן הסרטון
        </p>
      </div>
    </div>
  )
}

function estimateDuration(files: LocalFile[]): number {
  const totalBytes = files.reduce((sum, f) => sum + f.sizeBytes, 0)
  return Math.round(totalBytes / (10 * 1024 * 1024)) * 60
}

function estimateMaxVideos(files: LocalFile[], targetDuration: number): number {
  if (targetDuration <= 0) return 1
  const estimated = estimateDuration(files)
  const available = estimated * 0.7
  return Math.max(1, Math.floor(available / targetDuration))
}

export default function AutoEditorSettings({ files, onStart, onBack, onClose }: AutoEditorSettingsProps) {
  const profile = useUserProfileStore()
  const [userPrompt, setUserPrompt] = useState('')
  const [targetDuration, setTargetDuration] = useState(60)
  const [customDuration, setCustomDuration] = useState('')
  const [numberOfVideos, setNumberOfVideos] = useState(3)
  const [brollGenerator, setBrollGenerator] = useState<'seedance' | 'veo'>(
    (profile.preferredBrollProvider === 'seedance' || profile.preferredBrollProvider === 'veo')
      ? profile.preferredBrollProvider
      : 'seedance'
  )
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(
    new Set(['tiktok', 'reels', 'shorts'])
  )

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

  const togglePlatform = (id: string) => {
    setSelectedPlatforms(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleStart = () => {
    if (selectedPlatforms.size === 0) return
    onStart({
      userPrompt,
      targetDuration: effectiveDuration,
      numberOfVideos,
      brollGenerator,
      platforms: Array.from(selectedPlatforms),
    })
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-[#0A0A0F]/95 backdrop-blur-sm overflow-y-auto flex items-start justify-center">
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

        <EvolutionBadge />

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

          {/* Prompt Builder with chips */}
          <PromptBuilder prompt={userPrompt} setPrompt={setUserPrompt} />

          {/* Platform selection */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-text-primary">פלטפורמות לייצוא:</h4>
            <div className="grid grid-cols-2 gap-2">
              {PLATFORM_OPTIONS.map(platform => (
                <label key={platform.id} className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border transition ${
                  selectedPlatforms.has(platform.id) ? 'border-purple-500 bg-purple-500/15' : 'border-white/10 bg-white/5'
                }`}>
                  <input
                    type="checkbox"
                    checked={selectedPlatforms.has(platform.id)}
                    onChange={() => togglePlatform(platform.id)}
                    className="accent-purple-500"
                  />
                  <span>{platform.icon}</span>
                  <div>
                    <div className="text-white text-sm">{platform.name}</div>
                    <div className="text-gray-500 text-xs">{platform.ratio}</div>
                  </div>
                </label>
              ))}
            </div>
            {selectedPlatforms.size === 0 && (
              <p className="text-xs text-red-400">יש לבחור לפחות פלטפורמה אחת</p>
            )}
          </div>

          {/* Duration selection */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-text-primary">⏱ אורך כל סרטון:</h4>
            <div className="grid grid-cols-3 gap-2">
              {DURATION_OPTIONS.map(option => (
                <button
                  key={option.value}
                  onClick={() => setTargetDuration(option.value)}
                  className={`p-3 rounded-xl border text-center transition ${
                    targetDuration === option.value
                      ? 'border-purple-500 bg-purple-500/15'
                      : 'border-white/10 bg-white/5 hover:border-white/20'
                  }`}
                >
                  <div className="text-white font-medium text-sm">{option.label}</div>
                  <div className="text-gray-500 text-xs">{option.desc}</div>
                </button>
              ))}
            </div>

            {/* Custom duration input */}
            {targetDuration === 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">מותאם:</span>
                <input
                  type="number"
                  value={customDuration}
                  onChange={(e) => setCustomDuration(e.target.value)}
                  placeholder="מספר שניות"
                  min={5}
                  max={600}
                  className="w-32 px-3 py-2 bg-white/[0.03] rounded-xl border border-white/[0.06] text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-purple/40 transition-colors"
                />
                <span className="text-sm text-text-muted">שניות</span>
              </div>
            )}

            {/* AI explanation when selected */}
            {targetDuration === -1 && (
              <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 mt-2">
                <p className="text-purple-300 text-sm">
                  🤖 ה-AI ינתח את התוכן ויבחר את האורך האופטימלי לכל סרטון:
                </p>
                <ul className="text-gray-400 text-xs mt-2 space-y-1">
                  <li>• מנתח את קצב הדיבור וצפיפות התוכן</li>
                  <li>• מזהה נקודות פתיחה וסגירה טבעיות</li>
                  <li>• מתאים את האורך לפלטפורמה שנבחרה</li>
                  <li>• מוודא שכל סרטון מספר סיפור שלם</li>
                </ul>
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

          {/* Personalization indicator */}
          {profile.confidenceScore >= 0.3 && (
            <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 text-center">
              <span className="text-purple-400 text-sm">ההגדרות מותאמות אישית לפרופיל העריכה שלך</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-3 pt-4 pb-8">
            <button
              onClick={handleStart}
              disabled={!userPrompt.trim() || selectedPlatforms.size === 0}
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
