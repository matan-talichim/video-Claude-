import { useState } from 'react'
import { Plus, Play, Pencil, Trash2, Circle, Check } from 'lucide-react'
import Modal from '../components/Modal'

const myVoices = [
  { name: 'הקול שלי - מקצועי', date: '12/02/2026' },
  { name: 'הקול שלי - ידידותי', date: '28/01/2026' },
]

const libraryVoices = [
  { name: 'דנה - מקצועית', initials: 'דנ', lang: 'עברית', gender: 'אישה', style: 'מקצועי' },
  { name: 'יואב - אנרגטי', initials: 'יא', lang: 'עברית', gender: 'גבר', style: 'אנרגטי' },
  { name: 'שירה - חמה', initials: 'שר', lang: 'עברית', gender: 'אישה', style: 'חם' },
  { name: 'אורי - רגוע', initials: 'אר', lang: 'עברית', gender: 'גבר', style: 'רגוע' },
  { name: 'נועה - מקצועית', initials: 'נע', lang: 'עברית', gender: 'אישה', style: 'מקצועי' },
  { name: 'עידן - אנרגטי', initials: 'עד', lang: 'עברית', gender: 'גבר', style: 'אנרגטי' },
  { name: 'Sarah - Warm', initials: 'SW', lang: 'אנגלית', gender: 'אישה', style: 'חם' },
  { name: 'James - Pro', initials: 'JP', lang: 'אנגלית', gender: 'גבר', style: 'מקצועי' },
  { name: 'Emily - Calm', initials: 'EC', lang: 'אנגלית', gender: 'אישה', style: 'רגוע' },
  { name: 'Michael - Energy', initials: 'ME', lang: 'אנגלית', gender: 'גבר', style: 'אנרגטי' },
  { name: 'Lisa - Friendly', initials: 'LF', lang: 'אנגלית', gender: 'אישה', style: 'חם' },
  { name: 'David - Deep', initials: 'DD', lang: 'אנגלית', gender: 'גבר', style: 'רגוע' },
]

export default function Voices() {
  const [activeTab, setActiveTab] = useState<'my' | 'library'>('my')
  const [showWizard, setShowWizard] = useState(false)
  const [wizardStep, setWizardStep] = useState(1)
  const [consent, setConsent] = useState(false)
  const [langFilter, setLangFilter] = useState('הכל')
  const [genderFilter, setGenderFilter] = useState('הכל')
  const [progress, setProgress] = useState(0)

  const filteredVoices = libraryVoices.filter((v) => {
    if (langFilter !== 'הכל' && v.lang !== langFilter) return false
    if (genderFilter !== 'הכל' && v.gender !== genderFilter) return false
    return true
  })

  const startProgress = () => {
    setProgress(0)
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) { clearInterval(interval); setWizardStep(4); return 100 }
        return p + 2
      })
    }, 80)
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">קולות AI</h1>

      <div className="flex gap-1 border-b border-white/10">
        <button
          onClick={() => setActiveTab('my')}
          className={`px-4 py-3 text-sm border-b-2 transition-colors ${activeTab === 'my' ? 'border-[#E94560] text-white' : 'border-transparent text-white/50 hover:text-white'}`}
        >
          הקולות שלי
        </button>
        <button
          onClick={() => setActiveTab('library')}
          className={`px-4 py-3 text-sm border-b-2 transition-colors ${activeTab === 'library' ? 'border-[#E94560] text-white' : 'border-transparent text-white/50 hover:text-white'}`}
        >
          ספריית קולות
        </button>
      </div>

      {activeTab === 'my' && (
        <div className="space-y-4">
          <button
            onClick={() => { setShowWizard(true); setWizardStep(1); setConsent(false); setProgress(0) }}
            className="w-full p-6 border-2 border-dashed border-white/20 rounded-xl hover:border-[#E94560] transition-colors text-center"
          >
            <Plus size={24} className="mx-auto mb-2 text-white/40" />
            <span className="text-sm text-white/60">צור שיבוט קול חדש</span>
          </button>
          {myVoices.map((voice, i) => (
            <div key={i} className="flex items-center justify-between p-4 bg-[#16213E] rounded-xl border border-white/5">
              <div className="flex items-center gap-3">
                <button className="w-10 h-10 rounded-full bg-[#0F3460] flex items-center justify-center hover:bg-[#0F3460]/80 transition-colors">
                  <Play size={16} fill="white" />
                </button>
                <div>
                  <p className="text-sm font-medium">{voice.name}</p>
                  <p className="text-xs text-white/40">{voice.date}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="p-2 hover:bg-white/10 rounded-lg transition-colors"><Pencil size={16} className="text-white/40" /></button>
                <button className="p-2 hover:bg-white/10 rounded-lg transition-colors"><Trash2 size={16} className="text-white/40" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'library' && (
        <div className="space-y-4">
          <div className="flex gap-3 flex-wrap">
            <select value={langFilter} onChange={(e) => setLangFilter(e.target.value)} className="px-3 py-2 bg-[#16213E] rounded-xl border border-white/10 text-sm focus:outline-none cursor-pointer">
              <option value="הכל">כל השפות</option>
              <option value="עברית">עברית</option>
              <option value="אנגלית">אנגלית</option>
            </select>
            <select value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)} className="px-3 py-2 bg-[#16213E] rounded-xl border border-white/10 text-sm focus:outline-none cursor-pointer">
              <option value="הכל">הכל</option>
              <option value="גבר">גבר</option>
              <option value="אישה">אישה</option>
            </select>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredVoices.map((voice, i) => (
              <div key={i} className="bg-[#16213E] rounded-xl p-4 border border-white/5 hover:border-[#0F3460] transition-colors group">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#E94560] to-[#0F3460] flex items-center justify-center text-sm font-bold mx-auto mb-3">
                  {voice.initials}
                </div>
                <p className="text-sm font-medium text-center mb-1">{voice.name}</p>
                <div className="flex items-center justify-center gap-2 text-xs text-white/40 mb-3">
                  <span>{voice.lang === 'עברית' ? '🇮🇱' : '🇺🇸'}</span>
                  <span>{voice.gender === 'גבר' ? '♂️' : '♀️'}</span>
                </div>
                <div className="flex gap-2">
                  <button className="flex-1 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs transition-colors flex items-center justify-center gap-1">
                    <Play size={12} /> השמע
                  </button>
                  <button className="flex-1 py-1.5 bg-[#0F3460] hover:bg-[#0F3460]/80 rounded-lg text-xs transition-colors">בחר</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal isOpen={showWizard} onClose={() => setShowWizard(false)} title={`שיבוט קול - שלב ${wizardStep}/5`} size="lg">
        {wizardStep === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-white/70 leading-relaxed">
              שיבוט קול מאפשר ליצור עותק דיגיטלי של קול אנושי. השימוש בטכנולוגיה זו כפוף לתנאים הבאים:
              אני מאשר/ת שזהו הקול שלי או שקיבלתי אישור מפורש מבעל/ת הקול.
              אני מתחייב/ת להשתמש בשיבוט הקול לצרכים חוקיים בלבד.
            </p>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1 w-4 h-4 rounded accent-[#E94560]"
              />
              <span className="text-sm">אני מאשר/ת ששיבוט הקול הזה הוא של הקול שלי</span>
            </label>
            <button
              disabled={!consent}
              onClick={() => setWizardStep(2)}
              className="w-full py-3 bg-[#E94560] hover:bg-[#E94560]/80 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl font-medium transition-colors"
            >
              המשך
            </button>
          </div>
        )}
        {wizardStep === 2 && (
          <div className="space-y-6 text-center">
            <button className="w-24 h-24 rounded-full bg-red-500 hover:bg-red-600 mx-auto flex items-center justify-center transition-all hover:scale-110">
              <Circle size={36} fill="white" />
            </button>
            <p className="text-sm text-white/60">לחץ להקלטה</p>
            <div className="h-16 bg-white/5 rounded-xl flex items-center justify-center">
              <div className="flex items-end gap-0.5 h-10">
                {Array.from({ length: 30 }).map((_, i) => (
                  <div key={i} className="w-1 bg-gradient-to-t from-blue-500 to-purple-500 rounded-full" style={{ height: '15%' }} />
                ))}
              </div>
            </div>
            <p className="text-sm text-white/40">או <button className="text-[#E94560] hover:underline">העלה קובץ אודיו</button></p>
            <button onClick={() => { setWizardStep(3); startProgress() }} className="w-full py-3 bg-[#0F3460] hover:bg-[#0F3460]/80 rounded-xl font-medium transition-colors">המשך</button>
          </div>
        )}
        {wizardStep === 3 && (
          <div className="space-y-6 text-center py-8">
            <div className="w-16 h-16 border-4 border-[#E94560] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-lg font-medium">מאמן את המודל...</p>
            <div className="w-64 mx-auto">
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-[#E94560] rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-sm text-white/40 mt-2">{progress}%</p>
            </div>
          </div>
        )}
        {wizardStep === 4 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2 text-green-400">
              <Check size={18} />
              <span className="text-sm">המודל מוכן!</span>
            </div>
            <input placeholder="הקלד טקסט לבדיקה..." className="w-full px-4 py-2.5 bg-white/5 rounded-xl border border-white/10 text-sm focus:outline-none focus:border-[#0F3460]" />
            <button className="px-6 py-2.5 bg-[#0F3460] hover:bg-[#0F3460]/80 rounded-xl text-sm transition-colors">נסה</button>
            <div className="h-12 bg-white/5 rounded-xl" />
            <button onClick={() => setWizardStep(5)} className="w-full py-3 bg-[#E94560] hover:bg-[#E94560]/80 rounded-xl font-medium transition-colors">המשך</button>
          </div>
        )}
        {wizardStep === 5 && (
          <div className="space-y-4">
            <div>
              <label className="text-sm text-white/60 block mb-1">שם הקול</label>
              <input placeholder="הקול שלי - ..." className="w-full px-4 py-2.5 bg-white/5 rounded-xl border border-white/10 text-sm focus:outline-none focus:border-[#0F3460]" />
            </div>
            <div>
              <label className="text-sm text-white/60 block mb-1">תיאור</label>
              <textarea placeholder="תאר את הקול..." className="w-full px-4 py-2.5 bg-white/5 rounded-xl border border-white/10 text-sm focus:outline-none focus:border-[#0F3460] h-24 resize-none" />
            </div>
            <button onClick={() => setShowWizard(false)} className="w-full py-3 bg-[#E94560] hover:bg-[#E94560]/80 rounded-xl font-medium transition-colors">שמור</button>
          </div>
        )}
      </Modal>
    </div>
  )
}
