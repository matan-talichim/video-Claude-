import { useState } from 'react'
import { Globe, Subtitles, Mic, Smile, Check, Loader2 } from 'lucide-react'

const targetLanguages = [
  { code: 'en', name: 'אנגלית', flag: '🇺🇸' },
  { code: 'ar', name: 'ערבית', flag: '🇸🇦' },
  { code: 'ru', name: 'רוסית', flag: '🇷🇺' },
  { code: 'fr', name: 'צרפתית', flag: '🇫🇷' },
  { code: 'es', name: 'ספרדית', flag: '🇪🇸' },
  { code: 'de', name: 'גרמנית', flag: '🇩🇪' },
  { code: 'ja', name: 'יפנית', flag: '🇯🇵' },
  { code: 'zh', name: 'סינית', flag: '🇨🇳' },
  { code: 'ko', name: 'קוריאנית', flag: '🇰🇷' },
  { code: 'hi', name: 'הינדי', flag: '🇮🇳' },
  { code: 'tr', name: 'טורקית', flag: '🇹🇷' },
  { code: 'pt', name: 'פורטוגזית', flag: '🇧🇷' },
]

const translationSteps = [
  { label: 'תמלול', key: 'transcription' },
  { label: 'תרגום', key: 'translation' },
  { label: 'קריינות', key: 'voiceover' },
  { label: 'סנכרון', key: 'sync' },
  { label: 'סיום', key: 'finish' },
]

export default function Translation() {
  const [selectedLangs, setSelectedLangs] = useState<string[]>(['en', 'ar'])
  const [features, setFeatures] = useState({ subtitles: true, dubbing: true, lipSync: false })
  const [translationStyle, setTranslationStyle] = useState('timing')
  const [noTranslateTerms, setNoTranslateTerms] = useState('סטודיו AI, Descript')
  const [isTranslating, setIsTranslating] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)

  const toggleLang = (code: string) => {
    setSelectedLangs((prev) =>
      prev.includes(code) ? prev.filter((l) => l !== code) : [...prev, code]
    )
  }

  const startTranslation = () => {
    setIsTranslating(true)
    setCurrentStep(0)
    const interval = setInterval(() => {
      setCurrentStep((s) => {
        if (s >= 4) { clearInterval(interval); return s }
        return s + 1
      })
    }, 1500)
  }

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">תרגום</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Settings Panel */}
        <div className="bg-bg-card rounded-xl p-6 border border-white/[0.06] space-y-5">
          <div>
            <label className="text-sm text-text-secondary block mb-1">שפת מקור</label>
            <select className="w-full px-4 py-2.5 bg-white/5 rounded-xl border border-white/[0.06] text-sm focus:outline-none cursor-pointer">
              <option>זיהוי אוטומטי</option>
              <option>עברית 🇮🇱</option>
              <option>English 🇺🇸</option>
            </select>
          </div>

          <div>
            <label className="text-sm text-text-secondary block mb-2">שפות יעד</label>
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
              {targetLanguages.map((lang) => (
                <label
                  key={lang.code}
                  className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                    selectedLangs.includes(lang.code) ? 'bg-accent-blue/20' : 'bg-white/5 hover:bg-white/10'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedLangs.includes(lang.code)}
                    onChange={() => toggleLang(lang.code)}
                    className="w-4 h-4 rounded accent-accent-purple"
                  />
                  <span>{lang.flag}</span>
                  <span className="text-sm">{lang.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {[
              { key: 'subtitles' as const, label: 'תרגם כתוביות', icon: Subtitles },
              { key: 'dubbing' as const, label: 'דאבינג AI', icon: Mic },
              { key: 'lipSync' as const, label: 'סנכרון שפתיים', icon: Smile },
            ].map((feature) => {
              const Icon = feature.icon
              return (
                <label key={feature.key} className="flex items-center justify-between p-3 bg-white/5 rounded-xl cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Icon size={16} className="text-text-muted" />
                    <span className="text-sm">{feature.label}</span>
                  </div>
                  <div
                    onClick={() => setFeatures({ ...features, [feature.key]: !features[feature.key] })}
                    className={`w-10 h-5 rounded-full transition-colors cursor-pointer relative ${features[feature.key] ? 'bg-accent-purple' : 'bg-white/20'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${features[feature.key] ? 'left-0.5' : 'left-[22px]'}`} />
                  </div>
                </label>
              )
            })}
          </div>

          <div>
            <label className="text-sm text-text-secondary block mb-2">סגנון תרגום</label>
            <div className="flex gap-2">
              {[
                { value: 'timing', label: 'התאמת תזמון' },
                { value: 'direct', label: 'תרגום ישיר' },
              ].map((style) => (
                <button
                  key={style.value}
                  onClick={() => setTranslationStyle(style.value)}
                  className={`flex-1 py-2 rounded-xl text-sm transition-colors ${
                    translationStyle === style.value ? 'bg-accent-blue/20' : 'bg-white/5 hover:bg-white/10'
                  }`}
                >
                  {style.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm text-text-secondary block mb-1">מונחים שלא לתרגם</label>
            <textarea
              value={noTranslateTerms}
              onChange={(e) => setNoTranslateTerms(e.target.value)}
              className="w-full px-4 py-2.5 bg-white/5 rounded-xl border border-white/[0.06] text-sm focus:outline-none focus:border-accent-purple/30 h-20 resize-none"
              placeholder="הפרד במילים עם פסיק..."
            />
          </div>

          <button
            onClick={startTranslation}
            className="w-full py-3 bg-accent-purple hover:bg-accent-purple/80 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Globe size={18} />
            תרגם
          </button>
        </div>

        {/* Preview Panel */}
        <div className="bg-bg-card rounded-xl p-6 border border-white/[0.06] space-y-5">
          <div className="aspect-video bg-black/50 rounded-xl flex items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-accent-blue/10 to-bg-deepest/50" />
            <p className="text-text-muted text-sm z-10">תצוגה מקדימה</p>
            <div className="absolute bottom-4 left-4 right-4 text-center">
              <span className="bg-black/60 px-3 py-1 rounded text-sm">כתובית לדוגמה</span>
            </div>
          </div>

          {selectedLangs.length > 0 && (
            <div className="flex gap-1 border-b border-white/[0.06]">
              {selectedLangs.map((code) => {
                const lang = targetLanguages.find((l) => l.code === code)
                return (
                  <button key={code} className="px-3 py-2 text-sm border-b-2 border-transparent hover:border-white/30 transition-colors">
                    {lang?.flag} {lang?.name}
                  </button>
                )
              })}
            </div>
          )}

          {isTranslating && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium">התקדמות תרגום</h3>
              <div className="flex items-center justify-between">
                {translationSteps.map((step, i) => (
                  <div key={step.key} className="flex items-center">
                    <div className={`flex items-center gap-1 ${i <= currentStep ? 'text-white' : 'text-text-muted'}`}>
                      {i < currentStep ? (
                        <Check size={16} className="text-green-400" />
                      ) : i === currentStep ? (
                        <Loader2 size={16} className="animate-spin text-accent-purple" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-white/30" />
                      )}
                      <span className="text-xs">{step.label}</span>
                    </div>
                    {i < translationSteps.length - 1 && (
                      <div className={`w-8 h-0.5 mx-1 ${i < currentStep ? 'bg-green-400' : 'bg-white/10'}`} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
