import { useState } from 'react'
import { Copy, Play, Star, Download, Check } from 'lucide-react'
import Modal from '../../components/Modal'
import { useUIStore } from '../../stores/uiStore'

export default function EditorModals() {
  const { activeModal, closeModal, addToast } = useUIStore()

  return (
    <>
      {/* Sound Studio Modal */}
      <Modal isOpen={activeModal === 'soundStudio'} onClose={closeModal} title="סאונד סטודיו">
        <div className="space-y-4">
          <p className="text-sm text-white/60">שפר את איכות האודיו שלך</p>
          <div>
            <label className="text-sm text-white/50 block mb-2">עוצמת שיפור</label>
            <input type="range" min="0" max="100" defaultValue={75} className="w-full accent-[#E94560]" />
            <div className="flex justify-between text-xs text-white/30 mt-1"><span>0%</span><span>100%</span></div>
          </div>
          <button onClick={() => { addToast('האודיו שופר בהצלחה!', 'success'); closeModal() }} className="w-full py-2.5 bg-[#E94560] hover:bg-[#E94560]/80 rounded-xl text-sm font-medium transition-colors">שפר אודיו</button>
        </div>
      </Modal>

      {/* Filler Words Modal */}
      <Modal isOpen={activeModal === 'fillerWords'} onClose={closeModal} title="הסר מילות מילוי" size="md">
        <FillerWordsContent />
      </Modal>

      {/* Retakes Modal */}
      <Modal isOpen={activeModal === 'retakes'} onClose={closeModal} title="הסר חזרות">
        <div className="space-y-3">
          {['משפט חוזר #1 (0:23-0:28)', 'משפט חוזר #2 (1:05-1:12)', 'משפט חוזר #3 (2:01-2:08)'].map((retake, i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
              <div className="flex items-center gap-2">
                <button className="p-1.5 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"><Play size={12} /></button>
                <span className="text-sm">{retake}</span>
              </div>
              <button className="px-3 py-1 bg-[#0F3460] hover:bg-[#0F3460]/80 rounded-lg text-xs transition-colors">שמור את זה</button>
            </div>
          ))}
        </div>
      </Modal>

      {/* Silence Shortener Modal */}
      <Modal isOpen={activeModal === 'silence'} onClose={closeModal} title="קצר שתיקות">
        <div className="space-y-4">
          <div>
            <label className="text-sm text-white/50 block mb-2">משך שתיקה מקסימלי (שניות)</label>
            <input type="range" min="0.1" max="2" step="0.1" defaultValue={0.5} className="w-full accent-[#E94560]" />
            <div className="flex justify-between text-xs text-white/30 mt-1"><span>0.1</span><span>2.0</span></div>
          </div>
          <div className="p-3 bg-white/5 rounded-xl text-sm text-center">
            <p>נמצאו <span className="text-[#E94560] font-bold">23</span> פערים</p>
            <p className="text-white/40">חיסכון: 0:45</p>
          </div>
          <button onClick={() => { addToast('שתיקות קוצרו בהצלחה!', 'success'); closeModal() }} className="w-full py-2.5 bg-[#E94560] hover:bg-[#E94560]/80 rounded-xl text-sm font-medium transition-colors">קצר שתיקות</button>
        </div>
      </Modal>

      {/* Auto Chapters Modal */}
      <Modal isOpen={activeModal === 'chapters'} onClose={closeModal} title="פרקים אוטומטיים" size="md">
        <div className="space-y-3">
          {[
            { time: '0:00', title: 'פתיחה והקדמה' },
            { time: '0:35', title: 'מהי עריכה מבוססת טקסט?' },
            { time: '1:15', title: 'יתרונות הטכנולוגיה' },
            { time: '2:10', title: 'סיכום וסגירה' },
          ].map((chapter, i) => (
            <div key={i} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
              <span className="text-xs text-white/40 font-mono w-10">{chapter.time}</span>
              <input defaultValue={chapter.title} className="flex-1 bg-transparent text-sm focus:outline-none border-b border-transparent focus:border-white/20" />
            </div>
          ))}
          <button onClick={() => { addToast('פרקים נוספו בהצלחה!', 'success'); closeModal() }} className="w-full py-2.5 bg-[#E94560] hover:bg-[#E94560]/80 rounded-xl text-sm font-medium transition-colors">שמור פרקים</button>
        </div>
      </Modal>

      {/* Eye Contact Modal */}
      <Modal isOpen={activeModal === 'eyeContact'} onClose={closeModal} title="קשר עין">
        <div className="space-y-4">
          <ToggleOption label="תיקון קשר עין" defaultOn />
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/5 rounded-xl p-2 text-center"><div className="h-24 bg-black/30 rounded-lg mb-1" /><span className="text-xs text-white/40">לפני</span></div>
            <div className="bg-white/5 rounded-xl p-2 text-center"><div className="h-24 bg-black/30 rounded-lg mb-1" /><span className="text-xs text-white/40">אחרי</span></div>
          </div>
          <button onClick={() => { addToast('קשר עין תוקן!', 'success'); closeModal() }} className="w-full py-2.5 bg-[#E94560] hover:bg-[#E94560]/80 rounded-xl text-sm font-medium transition-colors">החל</button>
        </div>
      </Modal>

      {/* Green Screen Modal */}
      <Modal isOpen={activeModal === 'greenScreen'} onClose={closeModal} title="מסך ירוק" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {['משרד', 'טבע', 'עיר', 'מופשט', 'חלל', 'העלה'].map((bg) => (
              <button key={bg} className="h-20 bg-gradient-to-br from-[#0F3460] to-[#16213E] rounded-xl border border-white/10 hover:border-[#E94560] transition-colors text-sm">
                {bg}
              </button>
            ))}
          </div>
          <div>
            <label className="text-sm text-white/50 block mb-2">רגישות</label>
            <input type="range" min="0" max="100" defaultValue={50} className="w-full accent-[#E94560]" />
          </div>
          <button onClick={() => { addToast('רקע הוחלף!', 'success'); closeModal() }} className="w-full py-2.5 bg-[#E94560] hover:bg-[#E94560]/80 rounded-xl text-sm font-medium transition-colors">החל</button>
        </div>
      </Modal>

      {/* Quick Style Modal */}
      <Modal isOpen={activeModal === 'quickStyle'} onClose={closeModal} title="עיצוב מהיר" size="lg">
        <div className="grid grid-cols-3 gap-4">
          {[
            { name: 'מינימליסטי', gradient: 'from-gray-600 to-gray-800' },
            { name: 'תאגידי', gradient: 'from-blue-600 to-indigo-800' },
            { name: 'יצירתי', gradient: 'from-pink-500 to-purple-700' },
            { name: 'דינמי', gradient: 'from-orange-500 to-red-700' },
            { name: 'אלגנטי', gradient: 'from-emerald-500 to-teal-700' },
            { name: 'רטרו', gradient: 'from-amber-500 to-orange-700' },
          ].map((style) => (
            <button
              key={style.name}
              onClick={() => { addToast(`סגנון "${style.name}" הוחל!`, 'success'); closeModal() }}
              className={`bg-gradient-to-br ${style.gradient} p-6 rounded-xl text-center hover:scale-105 hover:shadow-xl transition-all`}
            >
              <span className="font-medium text-sm">{style.name}</span>
            </button>
          ))}
        </div>
      </Modal>

      {/* Speaker Centering Modal */}
      <Modal isOpen={activeModal === 'speakerCenter'} onClose={closeModal} title="מרכז דובר">
        <div className="space-y-4">
          <ToggleOption label="מרכוז אוטומטי של הדובר" defaultOn />
          <button onClick={() => { addToast('מרכוז דובר הופעל!', 'success'); closeModal() }} className="w-full py-2.5 bg-[#E94560] hover:bg-[#E94560]/80 rounded-xl text-sm font-medium transition-colors">החל</button>
        </div>
      </Modal>

      {/* Reframe Modal */}
      <Modal isOpen={activeModal === 'reframe'} onClose={closeModal} title="מסגור מחדש">
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: '16:9 YouTube', ratio: '16:9' },
            { label: '9:16 TikTok', ratio: '9:16' },
            { label: '1:1 Instagram', ratio: '1:1' },
            { label: '4:5 Feed', ratio: '4:5' },
          ].map((format) => (
            <button
              key={format.ratio}
              onClick={() => { addToast(`פורמט שונה ל-${format.ratio}!`, 'success'); closeModal() }}
              className="p-4 bg-white/5 hover:bg-white/10 rounded-xl text-center transition-colors border border-white/10 hover:border-[#E94560]"
            >
              <p className="font-medium text-sm">{format.label}</p>
              <p className="text-xs text-white/40 mt-1">{format.ratio}</p>
            </button>
          ))}
        </div>
      </Modal>

      {/* Glass Blur Modal */}
      <Modal isOpen={activeModal === 'glassBlur'} onClose={closeModal} title="טשטוש זכוכית">
        <div className="space-y-4">
          <div>
            <label className="text-sm text-white/50 block mb-2">עוצמת טשטוש</label>
            <input type="range" min="0" max="100" defaultValue={40} className="w-full accent-[#E94560]" />
          </div>
          <button onClick={() => { addToast('טשטוש הוחל!', 'success'); closeModal() }} className="w-full py-2.5 bg-[#E94560] hover:bg-[#E94560]/80 rounded-xl text-sm font-medium transition-colors">החל</button>
        </div>
      </Modal>

      {/* Publish Modal */}
      <Modal isOpen={activeModal === 'publish'} onClose={closeModal} title="פרסום" size="xl">
        <PublishContent />
      </Modal>

      {/* Generate Content Modal */}
      <Modal isOpen={activeModal === 'generateContent'} onClose={closeModal} title="צור תוכן" size="xl">
        <GenerateContent />
      </Modal>

      {/* Clips Modal */}
      <Modal isOpen={activeModal === 'clips'} onClose={closeModal} title="צור קליפים" size="xl">
        <ClipsContent />
      </Modal>
    </>
  )
}

function ToggleOption({ label, defaultOn = false }: { label: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn)
  return (
    <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
      <span className="text-sm">{label}</span>
      <div onClick={() => setOn(!on)} className={`w-10 h-5 rounded-full cursor-pointer relative transition-colors ${on ? 'bg-[#E94560]' : 'bg-white/20'}`}>
        <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${on ? 'left-0.5' : 'left-[22px]'}`} />
      </div>
    </div>
  )
}

function FillerWordsContent() {
  const { addToast, closeModal } = useUIStore()
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
          <label key={f.word} className="flex items-center justify-between p-2 bg-white/5 rounded-lg cursor-pointer hover:bg-white/10 transition-colors">
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={selected[f.word] ?? false} onChange={(e) => setSelected({ ...selected, [f.word]: e.target.checked })} className="w-4 h-4 rounded accent-[#E94560]" />
              <span className="text-sm">{f.word}</span>
            </div>
            <span className="text-xs text-white/40 bg-white/10 px-2 py-0.5 rounded-full">{f.count}</span>
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={() => { addToast('מילות מילוי נבחרות הוסרו!', 'success'); closeModal() }} className="flex-1 py-2.5 bg-[#0F3460] hover:bg-[#0F3460]/80 rounded-xl text-sm transition-colors">הסר נבחרות</button>
        <button onClick={() => { addToast('כל מילות המילוי הוסרו!', 'success'); closeModal() }} className="flex-1 py-2.5 bg-[#E94560] hover:bg-[#E94560]/80 rounded-xl text-sm transition-colors">הסר הכל</button>
      </div>
    </div>
  )
}

function PublishContent() {
  const [tab, setTab] = useState<'web' | 'export' | 'youtube'>('web')
  const tabs = [
    { id: 'web' as const, label: 'נגן אינטרנטי' },
    { id: 'export' as const, label: 'ייצוא קובץ' },
    { id: 'youtube' as const, label: 'פרסם ליוטיוב' },
  ]
  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-white/10">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 text-sm border-b-2 transition-colors ${tab === t.id ? 'border-[#E94560] text-white' : 'border-transparent text-white/50'}`}>{t.label}</button>
        ))}
      </div>
      {tab === 'web' && (
        <div className="space-y-4">
          <div className="aspect-video bg-black/30 rounded-xl" />
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs text-white/50 block mb-1">צבע נגן</label><input type="color" defaultValue="#E94560" className="w-full h-8 rounded cursor-pointer" /></div>
            <div><label className="text-xs text-white/50 block mb-1">מיקום לוגו</label><select className="w-full px-3 py-2 bg-white/5 rounded-lg border border-white/10 text-sm"><option>למעלה מימין</option><option>למעלה משמאל</option></select></div>
          </div>
          <div><label className="text-xs text-white/50 block mb-1">כתובת URL</label><input defaultValue="studio-ai.app/v/podcast-47" className="w-full px-3 py-2 bg-white/5 rounded-lg border border-white/10 text-sm" /></div>
          <div>
            <label className="text-xs text-white/50 block mb-1">קוד הטמעה</label>
            <div className="relative">
              <textarea readOnly value='<iframe src="https://studio-ai.app/embed/podcast-47" width="640" height="360"></iframe>' className="w-full px-3 py-2 bg-white/5 rounded-lg border border-white/10 text-xs font-mono h-16 resize-none" />
              <button className="absolute top-2 left-2 p-1 bg-white/10 rounded hover:bg-white/20 transition-colors"><Copy size={12} /></button>
            </div>
          </div>
        </div>
      )}
      {tab === 'export' && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {['MP4 720p', 'MP4 1080p', 'MP4 4K', 'MP3', 'WAV', 'SRT', 'VTT', 'DOCX'].map((format) => (
            <button key={format} className="p-4 bg-white/5 hover:bg-white/10 rounded-xl text-center transition-colors border border-white/10 hover:border-[#E94560]">
              <Download size={20} className="mx-auto mb-2 text-white/40" />
              <p className="text-sm font-medium">{format}</p>
            </button>
          ))}
        </div>
      )}
      {tab === 'youtube' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-red-500 mb-2"><span className="text-xl">▶️</span><span className="font-bold">YouTube</span></div>
          <div><label className="text-xs text-white/50 block mb-1">כותרת</label><input defaultValue="פודקאסט שבועי #47 - AI ויצירת תוכן" className="w-full px-3 py-2 bg-white/5 rounded-lg border border-white/10 text-sm" /></div>
          <div><label className="text-xs text-white/50 block mb-1">תיאור</label><textarea defaultValue="בפרק הזה אנחנו מדברים על AI ויצירת תוכן..." className="w-full px-3 py-2 bg-white/5 rounded-lg border border-white/10 text-sm h-20 resize-none" /></div>
          <div><label className="text-xs text-white/50 block mb-1">תגיות</label><input defaultValue="AI, פודקאסט, טכנולוגיה, יצירת תוכן" className="w-full px-3 py-2 bg-white/5 rounded-lg border border-white/10 text-sm" /></div>
          <div><label className="text-xs text-white/50 block mb-1">פרטיות</label><select className="w-full px-3 py-2 bg-white/5 rounded-lg border border-white/10 text-sm"><option>ציבורי</option><option>לא רשום</option><option>פרטי</option></select></div>
          <div className="h-20 bg-white/5 rounded-xl border-2 border-dashed border-white/20 flex items-center justify-center text-xs text-white/40">העלה תמונה ממוזערת</div>
          <button className="w-full py-2.5 bg-red-600 hover:bg-red-700 rounded-xl text-sm font-medium transition-colors">פרסם ליוטיוב</button>
        </div>
      )}
    </div>
  )
}

function GenerateContent() {
  const [activeType, setActiveType] = useState<string | null>(null)
  const types = [
    { id: 'social', label: 'פוסט לרשתות חברתיות', content: '🎙️ פרק חדש בפודקאסט!\n\nדיברנו על איך AI משנה את עולם יצירת התוכן. מתברר שעריכת וידאו מבוססת טקסט זה העתיד 🚀\n\nהאזינו עכשיו 👇\n\n#AI #פודקאסט #טכנולוגיה #יצירתתוכן #סטודיוAI' },
    { id: 'youtube', label: 'תיאור ליוטיוב', content: 'בפרק 47 של הפודקאסט השבועי שלנו, אנחנו צוללים לעומק לנושא עריכת וידאו מבוססת AI.\n\n⏱️ חותמות זמן:\n0:00 פתיחה\n0:35 מהי עריכה מבוססת טקסט?\n1:15 יתרונות הטכנולוגיה\n2:10 סיכום\n\n🔗 קישורים:\nסטודיו AI - studio-ai.app' },
    { id: 'summary', label: 'סיכום / Show Notes', content: '• דיון על עריכה מבוססת טקסט וכיצד היא מפשטת את תהליך העריכה\n• הסבר על הסרת מילות מילוי אוטומטית\n• השוואה בין שיטות עריכה מסורתיות לחדשות\n• תחזית לעתיד יצירת התוכן' },
    { id: 'blog', label: 'פוסט לבלוג', content: 'עריכת וידאו מבוססת טקסט: המהפכה השקטה\n\nבשנים האחרונות, עולם עריכת הוידאו עובר שינוי מהותי. בפרק האחרון של הפודקאסט שלנו, דיברנו על הטכנולוגיה שמאפשרת לערוך סרטונים כמו שעורכים מסמך טקסט.\n\nהרעיון פשוט: במקום לגרור קליפים על ציר זמן, אתה פשוט מוחק מילים מהתמלול. המילה נעלמת - וגם הקטע המתאים בסרטון.\n\nזה נשמע כמו קסם, אבל זו מציאות.' },
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
            <button key={type.id} onClick={() => setActiveType(type.id)} className="p-4 bg-white/5 hover:bg-white/10 rounded-xl text-right transition-colors border border-white/10 hover:border-[#E94560]">
              <span className="font-medium text-sm">{type.label}</span>
            </button>
          ))}
        </div>
      ) : activeType === 'titles' ? (
        <div className="space-y-3">
          <button onClick={() => setActiveType(null)} className="text-xs text-white/40 hover:text-white">← חזרה</button>
          {titles.map((title, i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
              <span className="text-sm">{title}</span>
              <button className="p-1.5 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"><Copy size={14} /></button>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <button onClick={() => setActiveType(null)} className="text-xs text-white/40 hover:text-white">← חזרה</button>
          <h3 className="font-medium">{types.find((t) => t.id === activeType)?.label}</h3>
          <textarea defaultValue={types.find((t) => t.id === activeType)?.content} className="w-full px-4 py-3 bg-white/5 rounded-xl border border-white/10 text-sm h-48 resize-none focus:outline-none" />
          <button className="flex items-center gap-2 px-4 py-2 bg-[#0F3460] hover:bg-[#0F3460]/80 rounded-xl text-sm transition-colors"><Copy size={14} /> העתק</button>
        </div>
      )}
    </div>
  )
}

function ClipsContent() {
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
        <div key={i} className="p-4 bg-white/5 rounded-xl border border-white/10 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <h4 className="font-medium text-sm">{clip.title}</h4>
              <div className="flex items-center gap-2 text-xs text-white/40 mt-1">
                <span>{clip.range}</span>
                <span>({clip.duration})</span>
              </div>
            </div>
            <div className="flex">
              {Array.from({ length: 5 }).map((_, si) => (
                <Star key={si} size={12} className={si < clip.stars ? 'text-yellow-400 fill-yellow-400' : 'text-white/20'} />
              ))}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {formats.map((fmt) => (
              <button key={fmt} className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-[10px] transition-colors">{fmt}</button>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" defaultChecked className="w-3 h-3 rounded accent-[#E94560]" />
              הוסף כתוביות
            </label>
            <button className="flex items-center gap-1 px-3 py-1.5 bg-[#0F3460] hover:bg-[#0F3460]/80 rounded-lg text-xs transition-colors"><Download size={12} /> ייצא</button>
          </div>
        </div>
      ))}
      <button className="w-full py-2.5 bg-[#E94560] hover:bg-[#E94560]/80 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2">
        <Download size={16} /> ייצא הכל
      </button>
    </div>
  )
}
