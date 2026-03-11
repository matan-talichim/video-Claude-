import { useState, useEffect } from 'react'
import { Video, Music, Sparkles, Film, ArrowRight, X } from 'lucide-react'
import type { AutoEditorInput } from '../store/autoEditorStore'
import { useUserProfileStore } from '../../../stores/userProfileStore'

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

const PROMPT_PRESETS: Record<string, Array<{ label: string; text: string }>> = {
  'ניקוי': [
    { label: '🧹 הסר גמגומים', text: 'הסר את כל הגמגומים והתיקונים העצמיים' },
    { label: '✂️ הסר מילות מילוי', text: 'הסר את כל מילות המילוי כמו אממ, כאילו, בעצם, נו' },
    { label: '🔇 קצר שתיקות', text: 'קצר את כל השתיקות הארוכות לשתיקות קצרות וטבעיות' },
    { label: '🔄 הסר חזרות', text: 'הסר קטעים שבהם הדובר אומר את אותו דבר פעמיים' },
  ],
  'ויזואלי': [
    { label: '🖼 הוסף B-Roll', text: 'הוסף קטעי B-Roll ויזואליים בזמנים שמתארים משהו' },
    { label: '🎨 שפר צבע', text: 'הוסף color grading סינמטי ומקצועי' },
    { label: '🔍 הוסף זומים', text: 'הוסף זומים דינמיים על נקודות חשובות' },
    { label: '📸 מולטי-קאם', text: 'דמה מצלמות מרובות עם החלפת זוויות כל כמה שניות' },
    { label: '🌅 מעברים חלקים', text: 'הוסף מעברים חלקים בין הקטעים (לא חיתוך קשה)' },
  ],
  'טקסט וכתוביות': [
    { label: '💬 הוסף כתוביות', text: 'הוסף כתוביות מעוצבות בעברית' },
    { label: '💬 כתוביות קריוקי', text: 'הוסף כתוביות בסגנון קריוקי (מילה-מילה)' },
    { label: '📝 הוסף כותרות', text: 'הוסף כותרות וגרפיקות על נקודות מפתח' },
    { label: '🏷 שם דובר', text: 'הוסף שם הדובר בתחתית המסך' },
  ],
  'אודיו': [
    { label: '🎙 הוסף קריינות', text: 'צור קריינות AI מקצועית לסרטון בעברית' },
    { label: '🎵 הוסף מוזיקה', text: 'הוסף מוזיקת רקע שמתאימה לאווירה' },
    { label: '🔊 שפר אודיו', text: 'שפר את איכות האודיו, הסר רעשי רקע ואזן עוצמה' },
    { label: '🎚 הנמך מוזיקה בדיבור', text: 'הנמך אוטומטית את המוזיקה כשמישהו מדבר' },
  ],
  'סגנון': [
    { label: '⚡ קצב מהיר', text: 'עריכה בקצב מהיר עם חיתוכים תכופים, מתאים לרשתות חברתיות' },
    { label: '🎬 סינמטי', text: 'סגנון סינמטי, קולנועי, עם תאורה חמה ומעברים חלקים' },
    { label: '🎯 מקצועי', text: 'סגנון מקצועי ונקי, מתאים לעסקים' },
    { label: '🎉 אנרגטי', text: 'סגנון אנרגטי ושמח עם קצב מהיר ומוזיקה קצבית' },
    { label: '🧘 רגוע', text: 'סגנון רגוע ואלגנטי, קצב איטי, צבעים רכים' },
  ],
  'מבנה': [
    { label: '🪝 פתיחה חזקה (Hook)', text: 'התחל עם המשפט הכי חזק כדי לעצור גלילה' },
    { label: '📢 CTA בסוף', text: 'סיים עם קריאה לפעולה ברורה' },
    { label: '🎬 Intro מונפש', text: 'הוסף כרטיס כותרת מונפש בפתיחה' },
    { label: '🔚 Outro מונפש', text: 'הוסף כרטיס סיום עם CTA' },
  ],
}

const PROMPT_TEMPLATES = [
  {
    label: '📱 סרטון TikTok מושלם',
    text: 'צור סרטון TikTok מושלם: פתיחה עם Hook חזק שעוצר גלילה, קצב מהיר עם חיתוכים כל 3 שניות, B-Roll ויזואלי בכל נקודה שמתארים משהו, כתוביות קריוקי מילה-מילה, מוזיקה אנרגטית ברקע שיורדת בזמן דיבור, זומים דינמיים על נקודות חשובות, הסר את כל הגמגומים והשתיקות, סיים עם CTA ברור'
  },
  {
    label: '💼 סרטון עסקי מקצועי',
    text: 'צור סרטון עסקי מקצועי: סגנון נקי ומינימליסטי, color grading חם, כתוביות קלאסיות, מוזיקה תאגידית שקטה, B-Roll של משרד מודרני, הסר גמגומים ושתיקות, הוסף שם הדובר בתחתית, מעברים חלקים, קצב בינוני'
  },
  {
    label: '🎓 סרטון הדרכה',
    text: 'צור סרטון הדרכה ברור: כתוביות גדולות וברורות, הדגשת נקודות מפתח עם גרפיקה, B-Roll כשמתארים תהליכים, קצב בינוני-איטי, מוזיקה רגועה ברקע, חלוקה לפרקים, הסר גמגומים ושתיקות מיותרות'
  },
  {
    label: '🎤 פודקאסט / ראיון',
    text: 'ערוך פודקאסט/ראיון: הסר את כל הגמגומים, השתיקות הארוכות והחזרות. דמה מולטי-קאם עם החלפת זוויות. הוסף שמות דוברים. כתוביות מודרניות. מוזיקת רקע שקטה. שיפור אודיו מקצועי'
  },
  {
    label: '📸 Instagram Reels',
    text: 'צור Reels מושלם: פורמט 9:16, פתיחה עם Hook תוך שנייה, B-Roll דינמי כל 4 שניות, כתוביות קריוקי צבעוניות, מוזיקה טרנדית, זומים מהירים, מעברים אנרגטיים, color grading חי וצבעוני, קצב מהיר מאוד'
  },
]

async function expandPromptWithAI(shortPrompt: string): Promise<string> {
  const response = await fetch('http://localhost:3001/api/auto-editor/expand-prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: shortPrompt }),
  })
  const data = await response.json()
  return data.expandedPrompt
}

function PromptBuilder({ prompt, setPrompt }: { prompt: string; setPrompt: (p: string) => void }) {
  const [expanding, setExpanding] = useState(false)
  const [showOriginal, setShowOriginal] = useState(false)
  const [originalPrompt, setOriginalPrompt] = useState('')

  const addToPrompt = (text: string) => {
    const separator = prompt.trim() ? '. ' : ''
    setPrompt(prompt + separator + text)
  }

  const expandWithAI = async () => {
    if (!prompt.trim()) return
    setExpanding(true)
    setOriginalPrompt(prompt)

    try {
      const expanded = await expandPromptWithAI(prompt)
      setPrompt(expanded)
      setShowOriginal(true)
    } catch (e) {
      console.error('Expand failed:', e)
    }

    setExpanding(false)
  }

  return (
    <div dir="rtl" className="space-y-4">
      {/* Full templates */}
      <div>
        <h4 className="text-sm font-medium text-purple-400 mb-2">🎬 תבניות מוכנות:</h4>
        <div className="flex flex-wrap gap-2">
          {PROMPT_TEMPLATES.map(t => (
            <button key={t.label} onClick={() => setPrompt(t.text)}
              className="bg-purple-500/15 border border-purple-500/30 text-purple-300 text-xs px-3 py-1.5 rounded-full hover:bg-purple-500/25 transition">
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Category chips */}
      {Object.entries(PROMPT_PRESETS).map(([category, chips]) => (
        <div key={category}>
          <h4 className="text-sm font-medium text-gray-400 mb-2">{category}:</h4>
          <div className="flex flex-wrap gap-2">
            {chips.map(chip => (
              <button key={chip.label} onClick={() => addToPrompt(chip.text)}
                className="bg-white/5 border border-white/10 text-gray-300 text-xs px-3 py-1.5 rounded-full hover:bg-white/10 hover:border-purple-500/30 transition">
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Prompt textarea */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <h4 className="text-sm font-medium text-white">✍️ הפרומפט שלך:</h4>
          {prompt && (
            <button onClick={() => { setPrompt(''); setShowOriginal(false) }} className="text-xs text-gray-500 hover:text-red-400">
              🗑 נקה
            </button>
          )}
        </div>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="תאר איך אתה רוצה את הסרטון... או לחץ על הצ'יפים למעלה לבניית הפרומפט"
          className="w-full h-32 bg-black/30 text-white rounded-xl p-4 text-sm resize-none border border-white/10 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
          dir="rtl"
        />
        <div className="flex justify-between mt-2">
          <span className="text-xs text-gray-500">{prompt.length} תווים</span>
          <button onClick={expandWithAI} disabled={!prompt.trim() || expanding}
            className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed">
            {expanding ? '⏳ מרחיב...' : '✨ הרחב עם AI'}
          </button>
        </div>
        {showOriginal && (
          <button onClick={() => { setPrompt(originalPrompt); setShowOriginal(false) }}
            className="text-xs text-gray-500 hover:text-white mt-1">
            ↩ חזור לפרומפט המקורי
          </button>
        )}
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
