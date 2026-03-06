import { useState, useCallback } from 'react'
import { Copy, Play, Star, Download, Loader2, Link2, CheckCircle } from 'lucide-react'
import Modal from '../../components/Modal'
import { useUIStore } from '../../stores/uiStore'

function useAIAction() {
  const [isProcessing, setIsProcessing] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const { addToast, closeModal } = useUIStore()

  const run = useCallback((message: string) => {
    setIsProcessing(true)
    setIsDone(false)
    setTimeout(() => {
      setIsProcessing(false)
      setIsDone(true)
      addToast(message, 'success')
      setTimeout(() => closeModal(), 800)
    }, 2000)
  }, [addToast, closeModal])

  return { isProcessing, isDone, run }
}

function AIActionButton({ label, message }: { label: string; message: string }) {
  const { isProcessing, isDone, run } = useAIAction()
  return (
    <button
      onClick={() => run(message)}
      disabled={isProcessing || isDone}
      className="w-full py-2.5 bg-accent-purple hover:bg-accent-purple/90 disabled:opacity-60 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-accent-purple/20"
    >
      {isDone ? (
        <><CheckCircle size={16} className="text-success" /> בוצע!</>
      ) : isProcessing ? (
        <><Loader2 size={16} className="animate-spin" /> מעבד...</>
      ) : label}
    </button>
  )
}

export default function EditorModals() {
  const { activeModal, closeModal } = useUIStore()

  return (
    <>
      <Modal isOpen={activeModal === 'soundStudio'} onClose={closeModal} title="סאונד סטודיו" subtitle="שפר את איכות האודיו שלך">
        <div className="space-y-4">
          <div>
            <label className="text-sm text-text-muted block mb-2">עוצמת שיפור</label>
            <input type="range" min="0" max="100" defaultValue={75} className="w-full accent-accent-purple" />
            <div className="flex justify-between text-xs text-text-muted mt-1"><span>עדין</span><span>חזק</span></div>
          </div>
          <AIActionButton label="שפר אודיו" message="האודיו שופר בהצלחה!" />
        </div>
      </Modal>

      <Modal isOpen={activeModal === 'fillerWords'} onClose={closeModal} title="הסר מילות מילוי" subtitle="נמצאו מילות מילוי בתמלול" size="md">
        <FillerWordsContent />
      </Modal>

      <Modal isOpen={activeModal === 'retakes'} onClose={closeModal} title="הסר חזרות" subtitle="זיהינו קטעים חוזרים">
        <RetakesContent />
      </Modal>

      <Modal isOpen={activeModal === 'silence'} onClose={closeModal} title="קצר שתיקות">
        <div className="space-y-4">
          <div>
            <label className="text-sm text-text-muted block mb-2">משך שתיקה מקסימלי (שניות)</label>
            <input type="range" min="0.1" max="2" step="0.1" defaultValue={0.5} className="w-full accent-accent-purple" />
            <div className="flex justify-between text-xs text-text-muted mt-1"><span>0.1</span><span>2.0</span></div>
          </div>
          <div className="p-4 bg-accent-purple/5 border border-accent-purple/10 rounded-xl text-sm text-center">
            <p>נמצאו <span className="text-accent-purple font-bold">23</span> פערים</p>
            <p className="text-text-muted mt-1">חיסכון: 0:45</p>
          </div>
          <AIActionButton label="קצר שתיקות" message="שתיקות קוצרו בהצלחה!" />
        </div>
      </Modal>

      <Modal isOpen={activeModal === 'chapters'} onClose={closeModal} title="פרקים אוטומטיים" size="md">
        <div className="space-y-3">
          {[
            { time: '0:00', title: 'פתיחה והקדמה' },
            { time: '0:35', title: 'מהי עריכה מבוססת טקסט?' },
            { time: '1:15', title: 'יתרונות הטכנולוגיה' },
            { time: '2:10', title: 'סיכום וסגירה' },
          ].map((chapter, i) => (
            <div key={i} className="flex items-center gap-3 p-3 bg-white/[0.04] rounded-xl border border-white/[0.06]">
              <span className="text-xs text-text-muted font-mono w-10">{chapter.time}</span>
              <input defaultValue={chapter.title} className="flex-1 bg-transparent text-sm text-text-primary focus:outline-none border-b border-transparent focus:border-accent-purple/30 transition-colors" />
            </div>
          ))}
          <AIActionButton label="שמור פרקים" message="פרקים נוספו בהצלחה!" />
        </div>
      </Modal>

      <Modal isOpen={activeModal === 'eyeContact'} onClose={closeModal} title="קשר עין">
        <div className="space-y-4">
          <ToggleOption label="תיקון קשר עין" defaultOn />
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/[0.04] rounded-xl p-2 text-center border border-white/[0.06]">
              <div className="h-24 bg-black/30 rounded-lg mb-1" />
              <span className="text-xs text-text-muted">לפני</span>
            </div>
            <div className="bg-accent-purple/5 rounded-xl p-2 text-center border border-accent-purple/10">
              <div className="h-24 bg-black/30 rounded-lg mb-1" />
              <span className="text-xs text-accent-purple">אחרי</span>
            </div>
          </div>
          <AIActionButton label="החל" message="קשר עין תוקן!" />
        </div>
      </Modal>

      <Modal isOpen={activeModal === 'greenScreen'} onClose={closeModal} title="מסך ירוק" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {['משרד', 'טבע', 'עיר', 'מופשט', 'חלל', 'העלה'].map((bg) => (
              <button key={bg} className="h-20 bg-gradient-to-br from-bg-card to-bg-elevated rounded-xl border border-white/[0.06] hover:border-accent-purple/40 transition-all text-sm text-text-secondary hover:text-text-primary">
                {bg}
              </button>
            ))}
          </div>
          <div>
            <label className="text-sm text-text-muted block mb-2">רגישות</label>
            <input type="range" min="0" max="100" defaultValue={50} className="w-full accent-accent-purple" />
          </div>
          <AIActionButton label="החל" message="רקע הוחלף!" />
        </div>
      </Modal>

      <Modal isOpen={activeModal === 'quickStyle'} onClose={closeModal} title="עיצוב מהיר" size="lg">
        <QuickStyleContent />
      </Modal>

      <Modal isOpen={activeModal === 'speakerCenter'} onClose={closeModal} title="מרכז דובר">
        <div className="space-y-4">
          <ToggleOption label="מרכוז אוטומטי של הדובר" defaultOn />
          <AIActionButton label="החל" message="מרכוז דובר הופעל!" />
        </div>
      </Modal>

      <Modal isOpen={activeModal === 'reframe'} onClose={closeModal} title="מסגור מחדש">
        <ReframeContent />
      </Modal>

      <Modal isOpen={activeModal === 'glassBlur'} onClose={closeModal} title="טשטוש זכוכית">
        <div className="space-y-4">
          <div>
            <label className="text-sm text-text-muted block mb-2">עוצמת טשטוש</label>
            <input type="range" min="0" max="100" defaultValue={40} className="w-full accent-accent-purple" />
          </div>
          <AIActionButton label="החל" message="טשטוש הוחל!" />
        </div>
      </Modal>

      <Modal isOpen={activeModal === 'share'} onClose={closeModal} title="שתף" subtitle="שתף את הפרויקט שלך" size="md">
        <ShareContent />
      </Modal>

      <Modal isOpen={activeModal === 'publish'} onClose={closeModal} title="פרסום" size="xl">
        <PublishContent defaultTab="web" />
      </Modal>

      <Modal isOpen={activeModal === 'export'} onClose={closeModal} title="ייצוא" size="xl">
        <PublishContent defaultTab="export" />
      </Modal>

      <Modal isOpen={activeModal === 'generateContent'} onClose={closeModal} title="צור תוכן" size="xl">
        <GenerateContent />
      </Modal>

      <Modal isOpen={activeModal === 'clips'} onClose={closeModal} title="צור קליפים" size="xl">
        <ClipsContent />
      </Modal>
    </>
  )
}

function ToggleOption({ label, defaultOn = false }: { label: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn)
  return (
    <div className="flex items-center justify-between p-3 bg-white/[0.04] rounded-xl border border-white/[0.06]">
      <span className="text-sm text-text-primary">{label}</span>
      <div onClick={() => setOn(!on)} className={`w-10 h-5 rounded-full cursor-pointer relative transition-colors ${on ? 'bg-accent-purple' : 'bg-white/[0.12]'}`}>
        <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all shadow-sm ${on ? 'left-0.5' : 'left-[22px]'}`} />
      </div>
    </div>
  )
}

function RetakesContent() {
  const { isProcessing, run } = useAIAction()
  return (
    <div className="space-y-3">
      {['משפט חוזר #1 (0:23-0:28)', 'משפט חוזר #2 (1:05-1:12)', 'משפט חוזר #3 (2:01-2:08)'].map((retake, i) => (
        <div key={i} className="flex items-center justify-between p-3 bg-white/[0.04] rounded-xl border border-white/[0.06]">
          <div className="flex items-center gap-2">
            <button className="p-1.5 bg-white/[0.06] rounded-lg hover:bg-white/[0.1] transition-colors text-text-secondary">
              <Play size={12} />
            </button>
            <span className="text-sm text-text-primary">{retake}</span>
          </div>
          <button className="px-3 py-1 bg-accent-purple/10 hover:bg-accent-purple/20 text-accent-purple rounded-lg text-xs transition-colors">שמור את זה</button>
        </div>
      ))}
      <button
        onClick={() => run('חזרות הוסרו בהצלחה!')}
        disabled={isProcessing}
        className="w-full py-2.5 bg-accent-purple hover:bg-accent-purple/90 disabled:opacity-60 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-accent-purple/20"
      >
        {isProcessing ? <><Loader2 size={16} className="animate-spin" /> מעבד...</> : 'הסר חזרות'}
      </button>
    </div>
  )
}

function FillerWordsContent() {
  const { isProcessing, run } = useAIAction()
  const [selected, setSelected] = useState<Record<string, boolean>>({
    'אממ': true, 'אההה': true, 'כאילו': true, 'נו': true, 'בעצם': true, 'אז': true, 'סתם': false,
  })
  const fillers = [
    { word: 'אממ', count: 12 },
    { word: 'אההה', count: 8 },
    { word: 'כאילו', count: 15 },
    { word: 'נו', count: 5 },
    { word: 'בעצם', count: 7 },
    { word: 'אז', count: 9 },
    { word: 'סתם', count: 3 },
  ]
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {fillers.map((f) => (
          <label key={f.word} className="flex items-center justify-between p-2.5 bg-white/[0.04] rounded-xl border border-white/[0.06] cursor-pointer hover:bg-white/[0.06] transition-colors">
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={selected[f.word] ?? false} onChange={(e) => setSelected({ ...selected, [f.word]: e.target.checked })} className="w-4 h-4 rounded accent-accent-purple" />
              <span className="text-sm text-text-primary">{f.word}</span>
            </div>
            <span className="text-xs text-text-muted bg-white/[0.06] px-2 py-0.5 rounded-full">{f.count}</span>
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => run('מילות מילוי נבחרות הוסרו!')}
          disabled={isProcessing}
          className="flex-1 py-2.5 bg-white/[0.06] hover:bg-white/[0.1] disabled:opacity-60 rounded-xl text-sm text-text-primary transition-all flex items-center justify-center gap-2 border border-white/[0.06]"
        >
          {isProcessing ? <Loader2 size={16} className="animate-spin" /> : 'הסר נבחרות'}
        </button>
        <button
          onClick={() => run('כל מילות המילוי הוסרו!')}
          disabled={isProcessing}
          className="flex-1 py-2.5 bg-accent-purple hover:bg-accent-purple/90 disabled:opacity-60 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-accent-purple/20"
        >
          {isProcessing ? <Loader2 size={16} className="animate-spin" /> : 'הסר הכל'}
        </button>
      </div>
    </div>
  )
}

function QuickStyleContent() {
  const { isProcessing, run } = useAIAction()
  const styles = [
    { name: 'מינימליסטי', gradient: 'from-gray-600 to-gray-800' },
    { name: 'תאגידי', gradient: 'from-blue-600 to-indigo-800' },
    { name: 'יצירתי', gradient: 'from-pink-500 to-purple-700' },
    { name: 'דינמי', gradient: 'from-orange-500 to-red-700' },
    { name: 'אלגנטי', gradient: 'from-emerald-500 to-teal-700' },
    { name: 'רטרו', gradient: 'from-amber-500 to-orange-700' },
  ]
  return (
    <div className="grid grid-cols-3 gap-4">
      {styles.map((style) => (
        <button
          key={style.name}
          onClick={() => run(`סגנון "${style.name}" הוחל!`)}
          disabled={isProcessing}
          className={`bg-gradient-to-br ${style.gradient} p-6 rounded-xl text-center hover:-translate-y-1 hover:shadow-xl transition-all disabled:opacity-60 border border-white/[0.06]`}
        >
          {isProcessing ? <Loader2 size={16} className="animate-spin mx-auto" /> : <span className="font-medium text-sm">{style.name}</span>}
        </button>
      ))}
    </div>
  )
}

function ReframeContent() {
  const { isProcessing, run } = useAIAction()
  const formats = [
    { label: '16:9 YouTube', ratio: '16:9' },
    { label: '9:16 TikTok', ratio: '9:16' },
    { label: '1:1 Instagram', ratio: '1:1' },
    { label: '4:5 Feed', ratio: '4:5' },
  ]
  return (
    <div className="grid grid-cols-2 gap-3">
      {formats.map((format) => (
        <button
          key={format.ratio}
          onClick={() => run(`פורמט שונה ל-${format.ratio}!`)}
          disabled={isProcessing}
          className="p-4 bg-white/[0.04] hover:bg-white/[0.08] rounded-xl text-center transition-all border border-white/[0.06] hover:border-accent-purple/40 disabled:opacity-60"
        >
          {isProcessing ? (
            <Loader2 size={16} className="animate-spin mx-auto" />
          ) : (
            <>
              <p className="font-medium text-sm text-text-primary">{format.label}</p>
              <p className="text-xs text-text-muted mt-1">{format.ratio}</p>
            </>
          )}
        </button>
      ))}
    </div>
  )
}

function ShareContent() {
  const { addToast } = useUIStore()
  const shareUrl = 'https://studio-ai.app/v/podcast-47'

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl).catch(() => {})
    addToast('הקישור הועתק!', 'success')
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs text-text-muted block mb-1.5">קישור לשיתוף</label>
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 px-3 py-2.5 bg-white/[0.04] rounded-xl border border-white/[0.06]">
            <Link2 size={14} className="text-text-muted shrink-0" />
            <span className="text-sm text-text-secondary truncate">{shareUrl}</span>
          </div>
          <button onClick={copyLink} className="px-4 py-2.5 bg-accent-purple hover:bg-accent-purple/90 rounded-xl transition-all flex items-center gap-1.5 shadow-lg shadow-accent-purple/20">
            <Copy size={14} />
            <span className="text-sm">העתק</span>
          </button>
        </div>
      </div>
      <div>
        <label className="text-xs text-text-muted block mb-1.5">הרשאות</label>
        <select className="w-full px-4 py-2.5 bg-white/[0.04] rounded-xl border border-white/[0.06] text-sm text-text-primary focus:outline-none focus:border-accent-purple/30 cursor-pointer">
          <option>צפייה בלבד</option>
          <option>עריכה</option>
          <option>הערות בלבד</option>
        </select>
      </div>
      <div>
        <label className="text-xs text-text-muted block mb-1.5">הזמן בעזרת אימייל</label>
        <div className="flex gap-2">
          <input placeholder="אימייל..." className="flex-1 px-4 py-2.5 bg-white/[0.04] rounded-xl border border-white/[0.06] text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-purple/30" />
          <button onClick={() => addToast('ההזמנה נשלחה!', 'success')} className="px-4 py-2.5 bg-white/[0.06] hover:bg-white/[0.1] rounded-xl text-sm transition-colors border border-white/[0.06]">שלח</button>
        </div>
      </div>
    </div>
  )
}

function PublishContent({ defaultTab = 'web' }: { defaultTab?: 'web' | 'export' | 'youtube' }) {
  const [tab, setTab] = useState<'web' | 'export' | 'youtube'>(defaultTab)
  const { addToast } = useUIStore()
  const tabs = [
    { id: 'web' as const, label: 'נגן אינטרנטי' },
    { id: 'export' as const, label: 'ייצוא קובץ' },
    { id: 'youtube' as const, label: 'פרסם ליוטיוב' },
  ]
  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-white/[0.06]">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 text-sm border-b-2 transition-all ${tab === t.id ? 'border-accent-purple text-text-primary' : 'border-transparent text-text-muted hover:text-text-secondary'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'web' && (
        <div className="space-y-4">
          <div className="aspect-video bg-black/30 rounded-xl border border-white/[0.06]" />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-text-muted block mb-1.5">צבע נגן</label>
              <input type="color" defaultValue="#7C5CFF" className="w-full h-8 rounded cursor-pointer" />
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1.5">מיקום לוגו</label>
              <select className="w-full px-3 py-2 bg-white/[0.04] rounded-lg border border-white/[0.06] text-sm text-text-primary">
                <option>למעלה מימין</option>
                <option>למעלה משמאל</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1.5">כתובת URL</label>
            <input defaultValue="studio-ai.app/v/podcast-47" className="w-full px-3 py-2 bg-white/[0.04] rounded-lg border border-white/[0.06] text-sm text-text-primary" />
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1.5">קוד הטמעה</label>
            <div className="relative">
              <textarea readOnly value='<iframe src="https://studio-ai.app/embed/podcast-47" width="640" height="360"></iframe>' className="w-full px-3 py-2 bg-white/[0.04] rounded-lg border border-white/[0.06] text-xs font-mono text-text-secondary h-16 resize-none" />
              <button onClick={() => addToast('קוד ההטמעה הועתק!', 'success')} className="absolute top-2 left-2 p-1 bg-white/[0.06] rounded hover:bg-white/[0.1] transition-colors text-text-muted">
                <Copy size={12} />
              </button>
            </div>
          </div>
        </div>
      )}
      {tab === 'export' && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {['MP4 720p', 'MP4 1080p', 'MP4 4K', 'MP3', 'WAV', 'SRT', 'VTT', 'DOCX'].map((format) => (
            <button key={format} onClick={() => addToast(`מייצא ${format}...`, 'info')} className="p-4 bg-white/[0.04] hover:bg-white/[0.08] rounded-xl text-center transition-all border border-white/[0.06] hover:border-accent-purple/40">
              <Download size={20} className="mx-auto mb-2 text-text-muted" />
              <p className="text-sm font-medium text-text-primary">{format}</p>
            </button>
          ))}
        </div>
      )}
      {tab === 'youtube' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-red-500 mb-2"><span className="text-xl">▶️</span><span className="font-bold">YouTube</span></div>
          <div><label className="text-xs text-text-muted block mb-1.5">כותרת</label><input defaultValue="פודקאסט שבועי #47 - AI ויצירת תוכן" className="w-full px-3 py-2 bg-white/[0.04] rounded-lg border border-white/[0.06] text-sm text-text-primary" /></div>
          <div><label className="text-xs text-text-muted block mb-1.5">תיאור</label><textarea defaultValue="בפרק הזה אנחנו מדברים על AI ויצירת תוכן..." className="w-full px-3 py-2 bg-white/[0.04] rounded-lg border border-white/[0.06] text-sm text-text-primary h-20 resize-none" /></div>
          <div><label className="text-xs text-text-muted block mb-1.5">תגיות</label><input defaultValue="AI, פודקאסט, טכנולוגיה, יצירת תוכן" className="w-full px-3 py-2 bg-white/[0.04] rounded-lg border border-white/[0.06] text-sm text-text-primary" /></div>
          <div><label className="text-xs text-text-muted block mb-1.5">פרטיות</label><select className="w-full px-3 py-2 bg-white/[0.04] rounded-lg border border-white/[0.06] text-sm text-text-primary"><option>ציבורי</option><option>לא רשום</option><option>פרטי</option></select></div>
          <div className="h-20 bg-white/[0.04] rounded-xl border-2 border-dashed border-white/[0.08] flex items-center justify-center text-xs text-text-muted">העלה תמונה ממוזערת</div>
          <button onClick={() => addToast('הסרטון פורסם ליוטיוב!', 'success')} className="w-full py-2.5 bg-red-600 hover:bg-red-700 rounded-xl text-sm font-medium transition-colors">פרסם ליוטיוב</button>
        </div>
      )}
    </div>
  )
}

function GenerateContent() {
  const [activeType, setActiveType] = useState<string | null>(null)
  const { addToast } = useUIStore()
  const types = [
    { id: 'social', label: 'פוסט לרשתות חברתיות', content: '🎙️ פרק חדש בפודקאסט!\n\nדיברנו על איך AI משנה את עולם יצירת התוכן. מתברר שעריכת וידאו מבוססת טקסט זה העתיד 🚀\n\nהאזינו עכשיו 👇\n\n#AI #פודקאסט #טכנולוגיה #יצירתתוכן #סטודיוAI' },
    { id: 'youtube', label: 'תיאור ליוטיוב', content: 'בפרק 47 של הפודקאסט השבועי שלנו, אנחנו צוללים לעומק לנושא עריכת וידאו מבוססת AI.\n\n⏱️ חותמות זמן:\n0:00 פתיחה\n0:35 מהי עריכה מבוססת טקסט?\n1:15 יתרונות הטכנולוגיה\n2:10 סיכום\n\n🔗 קישורים:\nסטודיו AI - studio-ai.app' },
    { id: 'summary', label: 'סיכום / Show Notes', content: '• דיון על עריכה מבוססת טקסט וכיצד היא מפשטת את תהליך העריכה\n• הסבר על הסרת מילות מילוי אוטומטית\n• השוואה בין שיטות עריכה מסורתיות לחדשות\n• תחזית לעתיד יצירת התוכן' },
    { id: 'blog', label: 'פוסט לבלוג', content: 'עריכת וידאו מבוססת טקסט: המהפכה השקטה\n\nבשנים האחרונות, עולם עריכת הוידאו עובר שינוי מהותי. בפרק האחרון של הפודקאסט שלנו, דיברנו על הטכנולוגיה שמאפשרת לערוך סרטונים כמו שעורכים מסמך טקסט.' },
    { id: 'titles', label: 'כותרות', content: '' },
  ]
  const titles = [
    'AI ועריכת וידאו: למה אתה עדיין עורך בדרך הישנה?',
    'עריכת טקסט = עריכת וידאו: המהפכה כבר כאן',
    'איך AI חוסך לנו שעות של עריכה',
    'הפודקאסט שישנה את הדרך שלכם ליצור תוכן',
    'מילות מילוי? תנו ל-AI לטפל בזה',
  ]

  return (
    <div className="space-y-4">
      {!activeType ? (
        <div className="grid grid-cols-1 gap-3">
          {types.map((type) => (
            <button key={type.id} onClick={() => setActiveType(type.id)} className="p-4 bg-white/[0.04] hover:bg-white/[0.08] rounded-xl text-right transition-all border border-white/[0.06] hover:border-accent-purple/40">
              <span className="font-medium text-sm text-text-primary">{type.label}</span>
            </button>
          ))}
        </div>
      ) : activeType === 'titles' ? (
        <div className="space-y-3">
          <button onClick={() => setActiveType(null)} className="text-xs text-text-muted hover:text-text-primary transition-colors">← חזרה</button>
          {titles.map((title, i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-white/[0.04] rounded-xl border border-white/[0.06]">
              <span className="text-sm text-text-primary">{title}</span>
              <button onClick={() => addToast('הכותרת הועתקה!', 'success')} className="p-1.5 bg-white/[0.06] rounded-lg hover:bg-white/[0.1] transition-colors text-text-muted">
                <Copy size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <button onClick={() => setActiveType(null)} className="text-xs text-text-muted hover:text-text-primary transition-colors">← חזרה</button>
          <h3 className="font-medium text-text-primary">{types.find((t) => t.id === activeType)?.label}</h3>
          <textarea defaultValue={types.find((t) => t.id === activeType)?.content} className="w-full px-4 py-3 bg-white/[0.04] rounded-xl border border-white/[0.06] text-sm text-text-primary h-48 resize-none focus:outline-none focus:border-accent-purple/30" />
          <button onClick={() => addToast('התוכן הועתק!', 'success')} className="flex items-center gap-2 px-4 py-2 bg-accent-purple/10 hover:bg-accent-purple/20 text-accent-purple rounded-xl text-sm transition-colors border border-accent-purple/10">
            <Copy size={14} /> העתק
          </button>
        </div>
      )}
    </div>
  )
}

function ClipsContent() {
  const { addToast } = useUIStore()
  const clips = [
    { title: 'AI ועריכת טקסט', range: '00:15-00:45', stars: 4, duration: '0:30' },
    { title: 'מילות מילוי אוטומטיות', range: '00:45-01:20', stars: 5, duration: '0:35' },
    { title: 'השוואה לעריכה מסורתית', range: '01:20-01:50', stars: 3, duration: '0:30' },
    { title: 'עתיד יצירת התוכן', range: '02:00-02:35', stars: 4, duration: '0:35' },
  ]
  const formats = ['9:16 TikTok', '9:16 Reel', '9:16 Short', '16:9 LinkedIn']

  return (
    <div className="space-y-4">
      {clips.map((clip, i) => (
        <div key={i} className="p-4 bg-white/[0.04] rounded-xl border border-white/[0.06] space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <h4 className="font-medium text-sm text-text-primary">{clip.title}</h4>
              <div className="flex items-center gap-2 text-xs text-text-muted mt-1">
                <span className="font-mono">{clip.range}</span>
                <span>({clip.duration})</span>
              </div>
            </div>
            <div className="flex">
              {Array.from({ length: 5 }).map((_, si) => (
                <Star key={si} size={12} className={si < clip.stars ? 'text-warning fill-warning' : 'text-text-muted/30'} />
              ))}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {formats.map((fmt) => (
              <button key={fmt} className="px-2 py-1 bg-white/[0.06] hover:bg-white/[0.1] rounded text-[10px] text-text-secondary transition-colors">{fmt}</button>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
              <input type="checkbox" defaultChecked className="w-3 h-3 rounded accent-accent-purple" />
              הוסף כתוביות
            </label>
            <button onClick={() => addToast(`קליפ "${clip.title}" ייוצא!`, 'success')} className="flex items-center gap-1 px-3 py-1.5 bg-accent-purple/10 hover:bg-accent-purple/20 text-accent-purple rounded-lg text-xs transition-colors">
              <Download size={12} /> ייצא
            </button>
          </div>
        </div>
      ))}
      <button onClick={() => addToast('כל הקליפים ייוצאו!', 'success')} className="w-full py-2.5 bg-accent-purple hover:bg-accent-purple/90 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-accent-purple/20">
        <Download size={16} /> ייצא הכל
      </button>
    </div>
  )
}
