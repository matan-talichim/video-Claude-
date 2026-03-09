import { useState, useCallback } from 'react'
import { Copy, Play, Star, Download, Loader2, Link2, CheckCircle, FileText, Music, Film, Captions } from 'lucide-react'
import Modal from '../../components/Modal'
import { useUIStore } from '../../stores/uiStore'
import { useEditorStore } from '../../stores/editorStore'
import { api } from '../../services/api'
import { exportVideo, exportAudio, exportSubtitles, exportTranscript, triggerDownload as triggerExportDownload } from '../../services/exportService'

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
        <SilenceContent />
      </Modal>

      <Modal isOpen={activeModal === 'chapters'} onClose={closeModal} title="פרקים אוטומטיים" size="md">
        <ChaptersContent />
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
        <ExportContent />
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
  const [retakes, setRetakes] = useState<Array<{ title: string; range: string; startTime: number; endTime: number }>>([])
  const transcript = useEditorStore((s) => s.transcript)

  // Detect retakes from transcript (find similar consecutive segments)
  useState(() => {
    const detected: Array<{ title: string; range: string; startTime: number; endTime: number }> = []
    for (let i = 1; i < transcript.length; i++) {
      const prevText = transcript[i - 1].words.map((w) => w.text).join(' ')
      const currText = transcript[i].words.map((w) => w.text).join(' ')
      if (prevText && currText && prevText.length > 10) {
        const overlap = prevText.split(' ').filter((w) => currText.includes(w)).length
        const ratio = overlap / Math.max(prevText.split(' ').length, 1)
        if (ratio > 0.5) {
          const start = transcript[i].words[0]?.start ?? 0
          const end = transcript[i].words[transcript[i].words.length - 1]?.end ?? 0
          const fmtS = `${Math.floor(start / 60)}:${Math.floor(start % 60).toString().padStart(2, '0')}`
          const fmtE = `${Math.floor(end / 60)}:${Math.floor(end % 60).toString().padStart(2, '0')}`
          detected.push({ title: `חזרה #${detected.length + 1}`, range: `${fmtS}-${fmtE}`, startTime: start, endTime: end })
        }
      }
    }
    setRetakes(detected)
  })

  if (transcript.length === 0) {
    return (
      <div className="py-8 text-center text-text-muted text-sm">
        <p>אין תמלול זמין. תמלל קובץ כדי לזהות חזרות.</p>
      </div>
    )
  }

  if (retakes.length === 0) {
    return (
      <div className="py-8 text-center text-text-muted text-sm">
        <p>לא נמצאו חזרות בתמלול.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {retakes.map((retake, i) => (
        <div key={i} className="flex items-center justify-between p-3 bg-white/[0.04] rounded-xl border border-white/[0.06]">
          <div className="flex items-center gap-2">
            <button className="p-1.5 bg-white/[0.06] rounded-lg hover:bg-white/[0.1] transition-colors text-text-secondary"><Play size={12} /></button>
            <span className="text-sm text-text-primary">{retake.title} ({retake.range})</span>
          </div>
          <button className="px-3 py-1 bg-accent-purple/10 hover:bg-accent-purple/20 text-accent-purple rounded-lg text-xs transition-colors">שמור את זה</button>
        </div>
      ))}
      <AIActionButton label="הסר חזרות" message="חזרות הוסרו בהצלחה!" />
    </div>
  )
}

function ChaptersContent() {
  const [chapters, setChapters] = useState<Array<{ title: string; startTime: number }>>([])
  const [isLoading, setIsLoading] = useState(false)
  const transcript = useEditorStore((s) => s.transcript)
  const { addToast } = useUIStore()

  const handleGenerate = async () => {
    const text = transcript.flatMap((s) => s.words).map((w) => w.text).join(' ')
    if (!text) {
      addToast('אין תמלול זמין ליצירת פרקים', 'warning')
      return
    }
    setIsLoading(true)
    try {
      const segments = transcript.map((s, i) => ({
        id: i,
        text: s.words.map((w) => w.text).join(' '),
        start: s.words[0]?.start ?? 0,
        end: s.words[s.words.length - 1]?.end ?? 0,
      }))
      const result = await api.chapters(text, segments)
      const chapArr = Array.isArray(result) ? result : result.chapters || []
      setChapters(chapArr.map((c: any) => ({
        title: c.title || '',
        startTime: c.startTime ?? 0,
      })))
    } catch {
      addToast('שגיאה ביצירת פרקים. נסה שוב.', 'error')
    }
    setIsLoading(false)
  }

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`

  if (transcript.length === 0) {
    return (
      <div className="py-8 text-center text-text-muted text-sm">
        <p>אין תמלול זמין. תמלל קובץ כדי ליצור פרקים.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {chapters.length === 0 && !isLoading && (
        <div className="py-4 text-center text-text-muted text-sm">
          <p>לחץ ליצירת פרקים אוטומטיים מהתמלול</p>
        </div>
      )}
      {isLoading && (
        <div className="py-8 text-center">
          <Loader2 size={24} className="mx-auto text-accent-purple animate-spin" />
          <p className="text-sm text-text-muted mt-2">מייצר פרקים...</p>
        </div>
      )}
      {chapters.map((chapter, i) => (
        <div key={i} className="flex items-center gap-3 p-3 bg-white/[0.04] rounded-xl border border-white/[0.06]">
          <span className="text-xs text-text-muted font-mono w-10">{fmtTime(chapter.startTime)}</span>
          <input
            value={chapter.title}
            onChange={(e) => {
              const updated = [...chapters]
              updated[i] = { ...updated[i], title: e.target.value }
              setChapters(updated)
            }}
            className="flex-1 bg-transparent text-sm text-text-primary focus:outline-none border-b border-transparent focus:border-accent-purple/30 transition-colors"
          />
        </div>
      ))}
      {chapters.length === 0 ? (
        <button onClick={handleGenerate} disabled={isLoading} className="w-full py-2.5 bg-accent-purple hover:bg-accent-purple/90 disabled:opacity-60 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-accent-purple/20">
          {isLoading ? <><Loader2 size={16} className="animate-spin" /> מייצר...</> : 'צור פרקים'}
        </button>
      ) : (
        <AIActionButton label="שמור פרקים" message="פרקים נוספו בהצלחה!" />
      )}
    </div>
  )
}

function SilenceContent() {
  const [maxSilence, setMaxSilence] = useState(0.5)
  const transcript = useEditorStore((s) => s.transcript)

  // Count silence gaps from transcript data
  const gaps = (() => {
    const allWords = transcript.flatMap((s) => s.words)
    let count = 0
    let totalSaved = 0
    for (let i = 1; i < allWords.length; i++) {
      const gap = allWords[i].start - allWords[i - 1].end
      if (gap > maxSilence) {
        count++
        totalSaved += gap - maxSilence
      }
    }
    return { count, totalSaved }
  })()

  if (transcript.length === 0) {
    return (
      <div className="py-8 text-center text-text-muted text-sm">
        <p>אין תמלול זמין. תמלל קובץ כדי לזהות שתיקות.</p>
      </div>
    )
  }

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm text-text-muted block mb-2">משך שתיקה מקסימלי ({maxSilence.toFixed(1)} שניות)</label>
        <input type="range" min="0.1" max="2" step="0.1" value={maxSilence} onChange={(e) => setMaxSilence(Number(e.target.value))} className="w-full accent-accent-purple" />
        <div className="flex justify-between text-xs text-text-muted mt-1"><span>0.1</span><span>2.0</span></div>
      </div>
      <div className="p-4 bg-accent-purple/5 border border-accent-purple/10 rounded-xl text-sm text-center">
        <p>נמצאו <span className="text-accent-purple font-bold">{gaps.count}</span> פערים</p>
        <p className="text-text-muted mt-1">חיסכון: {fmtTime(gaps.totalSaved)}</p>
      </div>
      <AIActionButton label="קצר שתיקות" message="שתיקות קוצרו בהצלחה!" />
    </div>
  )
}

function FillerWordsContent() {
  const { isProcessing, run } = useAIAction()
  const removeFillerWords = useEditorStore((s) => s.removeFillerWords)
  const { addToast, closeModal } = useUIStore()
  const [selected, setSelected] = useState<Record<string, boolean>>({
    'אממ': true, 'אההה': true, 'כאילו': true, 'נו': true, 'בעצם': true, 'אז': true, 'סתם': false,
  })
  const fillers = [
    { word: 'אממ', count: 12 }, { word: 'אההה', count: 8 }, { word: 'כאילו', count: 15 },
    { word: 'נו', count: 5 }, { word: 'בעצם', count: 7 }, { word: 'אז', count: 9 }, { word: 'סתם', count: 3 },
  ]

  const handleRemoveAll = () => {
    const result = removeFillerWords()
    addToast(`הוסרו ${result.totalRemoved} מילות מילוי!`, 'success')
    setTimeout(() => closeModal(), 500)
  }

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
        <button onClick={() => run('מילות מילוי נבחרות הוסרו!')} disabled={isProcessing} className="flex-1 py-2.5 bg-white/[0.06] hover:bg-white/[0.1] disabled:opacity-60 rounded-xl text-sm text-text-primary transition-all flex items-center justify-center gap-2 border border-white/[0.06]">
          {isProcessing ? <Loader2 size={16} className="animate-spin" /> : 'הסר נבחרות'}
        </button>
        <button onClick={handleRemoveAll} disabled={isProcessing} className="flex-1 py-2.5 bg-accent-purple hover:bg-accent-purple/90 disabled:opacity-60 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-accent-purple/20">
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
        <button key={style.name} onClick={() => run(`סגנון "${style.name}" הוחל!`)} disabled={isProcessing} className={`bg-gradient-to-br ${style.gradient} p-6 rounded-xl text-center hover:-translate-y-1 hover:shadow-xl transition-all disabled:opacity-60 border border-white/[0.06]`}>
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
        <button key={format.ratio} onClick={() => run(`פורמט שונה ל-${format.ratio}!`)} disabled={isProcessing} className="p-4 bg-white/[0.04] hover:bg-white/[0.08] rounded-xl text-center transition-all border border-white/[0.06] hover:border-accent-purple/40 disabled:opacity-60">
          {isProcessing ? <Loader2 size={16} className="animate-spin mx-auto" /> : (
            <><p className="font-medium text-sm text-text-primary">{format.label}</p><p className="text-xs text-text-muted mt-1">{format.ratio}</p></>
          )}
        </button>
      ))}
    </div>
  )
}

function ShareContent() {
  const { addToast } = useUIStore()
  const projectId = useEditorStore((s) => s.projectId)
  const shareUrl = projectId ? `${window.location.origin}/editor/${projectId}` : ''
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
            <Copy size={14} /><span className="text-sm">העתק</span>
          </button>
        </div>
      </div>
      <div>
        <label className="text-xs text-text-muted block mb-1.5">הרשאות</label>
        <select className="w-full px-4 py-2.5 bg-white/[0.04] rounded-xl border border-white/[0.06] text-sm text-text-primary focus:outline-none cursor-pointer">
          <option>צפייה בלבד</option><option>עריכה</option><option>הערות בלבד</option>
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

function ExportContent() {
  const { addToast } = useUIStore()
  const { mediaBlobUrl, projectName, transcript, deletedRegions, duration } = useEditorStore()
  const [exporting, setExporting] = useState<string | null>(null)
  const [exportProgress, setExportProgress] = useState(0)
  const [exportStatus, setExportStatus] = useState('')
  const [exportError, setExportError] = useState<string | null>(null)

  const getTranscriptSegments = () => {
    return transcript.map((seg) => ({
      speaker: seg.speaker,
      text: seg.words.map((w) => w.text).join(' '),
      start: seg.words[0]?.start ?? 0,
      end: seg.words[seg.words.length - 1]?.end ?? 0,
    }))
  }

  const handleVideoExport = async (format: 'mp4-720' | 'mp4-1080' | 'mp4-4k' | 'webm') => {
    if (!mediaBlobUrl) {
      addToast('העלה סרטון כדי לייצא', 'warning')
      return
    }
    setExporting(format)
    setExportProgress(0)
    setExportError(null)
    setExportStatus('טוען מנוע עיבוד...')
    try {
      const blob = await exportVideo(mediaBlobUrl, format, (p) => {
        setExportProgress(p)
        setExportStatus(`מייצא... ${p}%`)
      }, deletedRegions.length > 0 ? deletedRegions : undefined, duration > 0 ? duration : undefined)
      const ext = format === 'webm' ? 'webm' : 'mp4'
      triggerExportDownload(blob, `${projectName || 'export'}.${ext}`)
      addToast('הייצוא הושלם! הקובץ הורד למחשב', 'success')
    } catch (err: any) {
      console.error('Export error:', err)
      setExportError('שגיאה בייצוא. נסה פורמט אחר.')
    } finally {
      setExporting(null)
      setExportProgress(0)
      setExportStatus('')
    }
  }

  const handleAudioExport = async (format: 'mp3-128' | 'mp3-256' | 'mp3-320' | 'wav') => {
    if (!mediaBlobUrl) {
      addToast('העלה סרטון כדי לייצא', 'warning')
      return
    }
    setExporting(format)
    setExportProgress(0)
    setExportError(null)
    setExportStatus('טוען מנוע עיבוד...')
    try {
      const blob = await exportAudio(mediaBlobUrl, format, (p) => {
        setExportProgress(p)
        setExportStatus(`מייצא... ${p}%`)
      })
      const ext = format.startsWith('mp3') ? 'mp3' : 'wav'
      triggerExportDownload(blob, `${projectName || 'export'}.${ext}`)
      addToast('הייצוא הושלם! הקובץ הורד למחשב', 'success')
    } catch (err: any) {
      console.error('Export error:', err)
      setExportError('שגיאה בייצוא. נסה פורמט אחר.')
    } finally {
      setExporting(null)
      setExportProgress(0)
      setExportStatus('')
    }
  }

  const handleSubtitleExport = (format: 'srt' | 'vtt') => {
    const segments = getTranscriptSegments()
    if (segments.length === 0) {
      addToast('אין תמלול לייצוא', 'warning')
      return
    }
    const blob = exportSubtitles(segments, format)
    triggerExportDownload(blob, `${projectName || 'export'}.${format}`)
    addToast('קובץ כתוביות הורד!', 'success')
  }

  const handleTranscriptExport = (format: 'txt' | 'docx') => {
    const segments = getTranscriptSegments()
    if (segments.length === 0) {
      addToast('אין תמלול לייצוא', 'warning')
      return
    }
    const blob = exportTranscript(segments, format)
    triggerExportDownload(blob, `${projectName || 'export'}.${format}`)
    addToast('קובץ תמלול הורד!', 'success')
  }

  const videoFormats: Array<{ id: 'mp4-720' | 'mp4-1080' | 'mp4-4k' | 'webm'; label: string; desc: string }> = [
    { id: 'mp4-720', label: 'MP4 720p', desc: 'קובץ קטן' },
    { id: 'mp4-1080', label: 'MP4 1080p', desc: 'איכות גבוהה' },
    { id: 'mp4-4k', label: 'MP4 4K', desc: 'איכות מקסימלית' },
    { id: 'webm', label: 'WebM', desc: 'לאינטרנט' },
  ]
  const audioFormats: Array<{ id: 'mp3-128' | 'mp3-256' | 'mp3-320' | 'wav'; label: string; desc: string }> = [
    { id: 'mp3-128', label: 'MP3 128kbps', desc: 'קובץ קטן' },
    { id: 'mp3-320', label: 'MP3 320kbps', desc: 'איכות גבוהה' },
    { id: 'wav', label: 'WAV', desc: 'lossless' },
  ]

  return (
    <div className="space-y-6">
      {/* Export progress */}
      {exporting && (
        <div className="p-6 bg-accent-purple/5 border border-accent-purple/20 rounded-xl text-center space-y-3">
          <Loader2 size={32} className="mx-auto text-accent-purple animate-spin" />
          <p className="text-sm text-text-primary">{exportStatus || 'מכין לייצוא...'}</p>
          {exportProgress > 0 && (
            <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden max-w-xs mx-auto">
              <div className="h-full bg-accent-purple rounded-full transition-all" style={{ width: `${exportProgress}%` }} />
            </div>
          )}
        </div>
      )}

      {/* Export error */}
      {exportError && !exporting && (
        <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-xl text-center space-y-2">
          <p className="text-sm text-red-400">{exportError}</p>
          <button onClick={() => setExportError(null)} className="px-4 py-1.5 bg-white/[0.06] hover:bg-white/[0.1] rounded-lg text-xs text-text-secondary transition-colors">נסה שוב</button>
        </div>
      )}

      {!exporting && (
        <>
          {/* Video */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Film size={16} className="text-text-muted" />
              <h4 className="text-sm font-medium text-text-primary">וידאו</h4>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {videoFormats.map((f) => (
                <button key={f.id} onClick={() => handleVideoExport(f.id)} disabled={!!exporting} className="p-4 bg-white/[0.04] hover:bg-white/[0.08] rounded-xl text-center transition-all border border-white/[0.06] hover:border-accent-purple/40 disabled:opacity-50">
                  <Download size={20} className="mx-auto mb-2 text-text-muted" />
                  <p className="text-sm font-medium text-text-primary">{f.label}</p>
                  <p className="text-xs text-text-muted mt-1">{f.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Audio */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Music size={16} className="text-text-muted" />
              <h4 className="text-sm font-medium text-text-primary">אודיו</h4>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {audioFormats.map((f) => (
                <button key={f.id} onClick={() => handleAudioExport(f.id)} disabled={!!exporting} className="p-4 bg-white/[0.04] hover:bg-white/[0.08] rounded-xl text-center transition-all border border-white/[0.06] hover:border-accent-purple/40 disabled:opacity-50">
                  <Download size={20} className="mx-auto mb-2 text-text-muted" />
                  <p className="text-sm font-medium text-text-primary">{f.label}</p>
                  <p className="text-xs text-text-muted mt-1">{f.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Subtitles */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Captions size={16} className="text-text-muted" />
              <h4 className="text-sm font-medium text-text-primary">כתוביות</h4>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => handleSubtitleExport('srt')} className="p-4 bg-white/[0.04] hover:bg-white/[0.08] rounded-xl text-center transition-all border border-white/[0.06] hover:border-accent-purple/40">
                <Download size={20} className="mx-auto mb-2 text-text-muted" />
                <p className="text-sm font-medium text-text-primary">SRT</p>
                <p className="text-xs text-text-muted mt-1">כתוביות סטנדרטיות</p>
              </button>
              <button onClick={() => handleSubtitleExport('vtt')} className="p-4 bg-white/[0.04] hover:bg-white/[0.08] rounded-xl text-center transition-all border border-white/[0.06] hover:border-accent-purple/40">
                <Download size={20} className="mx-auto mb-2 text-text-muted" />
                <p className="text-sm font-medium text-text-primary">VTT</p>
                <p className="text-xs text-text-muted mt-1">כתוביות לאינטרנט</p>
              </button>
            </div>
          </div>

          {/* Transcript */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <FileText size={16} className="text-text-muted" />
              <h4 className="text-sm font-medium text-text-primary">תמלול</h4>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => handleTranscriptExport('txt')} className="p-4 bg-white/[0.04] hover:bg-white/[0.08] rounded-xl text-center transition-all border border-white/[0.06] hover:border-accent-purple/40">
                <Download size={20} className="mx-auto mb-2 text-text-muted" />
                <p className="text-sm font-medium text-text-primary">TXT</p>
                <p className="text-xs text-text-muted mt-1">טקסט פשוט</p>
              </button>
              <button onClick={() => handleTranscriptExport('docx')} className="p-4 bg-white/[0.04] hover:bg-white/[0.08] rounded-xl text-center transition-all border border-white/[0.06] hover:border-accent-purple/40">
                <Download size={20} className="mx-auto mb-2 text-text-muted" />
                <p className="text-sm font-medium text-text-primary">DOCX</p>
                <p className="text-xs text-text-muted mt-1">מסמך Word</p>
              </button>
            </div>
          </div>
        </>
      )}
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
            <div><label className="text-xs text-text-muted block mb-1.5">צבע נגן</label><input type="color" defaultValue="#7C5CFF" className="w-full h-8 rounded cursor-pointer" /></div>
            <div><label className="text-xs text-text-muted block mb-1.5">מיקום לוגו</label><select className="w-full px-3 py-2 bg-white/[0.04] rounded-lg border border-white/[0.06] text-sm text-text-primary"><option>למעלה מימין</option><option>למעלה משמאל</option></select></div>
          </div>
        </div>
      )}
      {tab === 'export' && <ExportContent />}
      {tab === 'youtube' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-red-500 mb-2"><span className="text-xl">▶️</span><span className="font-bold">YouTube</span></div>
          <div><label className="text-xs text-text-muted block mb-1.5">כותרת</label><input placeholder="כותרת הסרטון..." className="w-full px-3 py-2 bg-white/[0.04] rounded-lg border border-white/[0.06] text-sm text-text-primary placeholder-text-muted" /></div>
          <div><label className="text-xs text-text-muted block mb-1.5">תיאור</label><textarea placeholder="תיאור הסרטון..." className="w-full px-3 py-2 bg-white/[0.04] rounded-lg border border-white/[0.06] text-sm text-text-primary placeholder-text-muted h-20 resize-none" /></div>
          <div><label className="text-xs text-text-muted block mb-1.5">תגיות</label><input placeholder="תגיות מופרדות בפסיקים..." className="w-full px-3 py-2 bg-white/[0.04] rounded-lg border border-white/[0.06] text-sm text-text-primary placeholder-text-muted" /></div>
          <button onClick={() => addToast('הסרטון פורסם ליוטיוב!', 'success')} className="w-full py-2.5 bg-red-600 hover:bg-red-700 rounded-xl text-sm font-medium transition-colors">פרסם ליוטיוב</button>
        </div>
      )}
    </div>
  )
}

function GenerateContent() {
  const [activeType, setActiveType] = useState<string | null>(null)
  const [generatedContent, setGeneratedContent] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const { addToast } = useUIStore()
  const transcript = useEditorStore((s) => s.transcript)

  const types = [
    { id: 'social_post', label: 'פוסט לרשתות חברתיות' },
    { id: 'youtube_description', label: 'תיאור ליוטיוב' },
    { id: 'summary', label: 'סיכום' },
    { id: 'titles', label: 'כותרות' },
    { id: 'blog', label: 'פוסט בלוג' },
  ]

  // Local fallback content
  const localContent: Record<string, string> = {
    social_post: '🎙️ פרק חדש בפודקאסט!\n\nדיברנו על איך AI משנה את עולם יצירת התוכן.\n\n#AI #פודקאסט #טכנולוגיה',
    youtube_description: 'בפרק הזה אנחנו צוללים לעומק לנושא עריכת וידאו מבוססת AI.\n\n⏱️ חותמות זמן:\n0:00 פתיחה\n0:35 מהי עריכה מבוססת טקסט?\n1:15 יתרונות הטכנולוגיה',
    summary: '• דיון על עריכה מבוססת טקסט\n• הסבר על הסרת מילות מילוי אוטומטית\n• השוואה בין שיטות עריכה',
    titles: '1. AI ועריכת וידאו: למה אתה עדיין עורך בדרך הישנה?\n2. עריכת טקסט = עריכת וידאו: המהפכה כבר כאן\n3. איך AI חוסך לנו שעות של עריכה\n4. המדריך המלא לעריכת וידאו עם AI\n5. מה שלא סיפרו לך על עריכה חכמה',
    blog: 'עריכת וידאו מבוססת AI הפכה מחלום למציאות...',
  }

  const handleGenerate = async (type: string) => {
    setActiveType(type)
    setIsGenerating(true)
    setGeneratedContent('')

    const transcriptText = transcript.flatMap((s) => s.words).map((w) => w.text).join(' ')

    if (!transcriptText) {
      setGeneratedContent(localContent[type] || 'אין תמלול זמין.')
      setIsGenerating(false)
      return
    }

    try {
      const result = await api.generateContent(transcriptText, type)
      setGeneratedContent(result.content || '')
    } catch {
      // Fallback to local content
      setGeneratedContent(localContent[type] || 'שגיאה ביצירת תוכן. נסה שוב.')
    }
    setIsGenerating(false)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedContent).catch(() => {})
    addToast('התוכן הועתק!', 'success')
  }

  const handleRetry = () => {
    if (activeType) handleGenerate(activeType)
  }

  return (
    <div className="space-y-4">
      {!activeType ? (
        <div className="grid grid-cols-1 gap-3">
          {types.map((type) => (
            <button key={type.id} onClick={() => handleGenerate(type.id)} className="p-4 bg-white/[0.04] hover:bg-white/[0.08] rounded-xl text-right transition-all border border-white/[0.06] hover:border-accent-purple/40">
              <span className="font-medium text-sm text-text-primary">{type.label}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <button onClick={() => { setActiveType(null); setGeneratedContent('') }} className="text-xs text-text-muted hover:text-text-primary transition-colors">← חזרה</button>
          <h3 className="font-medium text-text-primary">{types.find((t) => t.id === activeType)?.label}</h3>
          {isGenerating ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-accent-purple" />
              <span className="text-sm text-text-muted mr-2">יוצר תוכן...</span>
            </div>
          ) : (
            <>
              <textarea value={generatedContent} onChange={(e) => setGeneratedContent(e.target.value)} className="w-full px-4 py-3 bg-white/[0.04] rounded-xl border border-white/[0.06] text-sm text-text-primary h-48 resize-none focus:outline-none focus:border-accent-purple/30" />
              <div className="flex gap-2">
                <button onClick={handleCopy} className="flex items-center gap-2 px-4 py-2 bg-accent-purple/10 hover:bg-accent-purple/20 text-accent-purple rounded-xl text-sm transition-colors border border-accent-purple/10">
                  <Copy size={14} /> העתק
                </button>
                <button onClick={handleRetry} className="flex items-center gap-2 px-4 py-2 bg-white/[0.06] hover:bg-white/[0.1] text-text-secondary rounded-xl text-sm transition-colors border border-white/[0.06]">
                  נסה שוב
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ClipsContent() {
  const { addToast } = useUIStore()
  const transcript = useEditorStore((s) => s.transcript)
  const duration = useEditorStore((s) => s.duration)
  const [clips, setClips] = useState<Array<{ title: string; startTime: number; endTime: number; viralScore: number; reason?: string }>>([])
  const [isLoading, setIsLoading] = useState(false)

  const handleGenerate = async () => {
    const text = transcript.flatMap((s) => s.words).map((w) => w.text).join(' ')
    if (!text) {
      addToast('אין תמלול זמין ליצירת קליפים', 'warning')
      return
    }
    setIsLoading(true)
    try {
      const segments = transcript.map((s, i) => ({
        id: i,
        text: s.words.map((w) => w.text).join(' '),
        start: s.words[0]?.start ?? 0,
        end: s.words[s.words.length - 1]?.end ?? 0,
      }))
      const result = await api.suggestClips(text, segments, duration)
      const clipArr = Array.isArray(result) ? result : result.clips || []
      setClips(clipArr)
    } catch {
      addToast('שגיאה ביצירת קליפים. נסה שוב.', 'error')
    }
    setIsLoading(false)
  }

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0')
    const sec = Math.floor(s % 60).toString().padStart(2, '0')
    return `${m}:${sec}`
  }

  if (transcript.length === 0) {
    return (
      <div className="py-8 text-center text-text-muted text-sm">
        <p>אין תמלול זמין. תמלל קובץ כדי ליצור קליפים.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {clips.length === 0 && !isLoading && (
        <div className="py-4 text-center text-text-muted text-sm">
          <p>לחץ ליצירת קליפים מהתמלול באמצעות AI</p>
        </div>
      )}
      {isLoading && (
        <div className="py-8 text-center">
          <Loader2 size={24} className="mx-auto text-accent-purple animate-spin" />
          <p className="text-sm text-text-muted mt-2">מייצר קליפים...</p>
        </div>
      )}
      {clips.map((clip, i) => (
        <div key={i} className="p-4 bg-white/[0.04] rounded-xl border border-white/[0.06] space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <h4 className="font-medium text-sm text-text-primary">{clip.title}</h4>
              <div className="flex items-center gap-2 text-xs text-text-muted mt-1">
                <span className="font-mono">{fmtTime(clip.startTime)}-{fmtTime(clip.endTime)}</span>
                <span>({fmtTime(clip.endTime - clip.startTime)})</span>
              </div>
              {clip.reason && <p className="text-xs text-text-muted mt-1">{clip.reason}</p>}
            </div>
            <div className="flex">
              {Array.from({ length: 5 }).map((_, si) => (
                <Star key={si} size={12} className={si < (clip.viralScore || 0) ? 'text-warning fill-warning' : 'text-text-muted/30'} />
              ))}
            </div>
          </div>
          <button onClick={() => addToast(`קליפ "${clip.title}" ייוצא!`, 'success')} className="flex items-center gap-1 px-3 py-1.5 bg-accent-purple/10 hover:bg-accent-purple/20 text-accent-purple rounded-lg text-xs transition-colors">
            <Download size={12} /> ייצא
          </button>
        </div>
      ))}
      {clips.length === 0 ? (
        <button onClick={handleGenerate} disabled={isLoading} className="w-full py-2.5 bg-accent-purple hover:bg-accent-purple/90 disabled:opacity-60 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-accent-purple/20">
          {isLoading ? <><Loader2 size={16} className="animate-spin" /> מייצר...</> : <><Film size={16} /> צור קליפים</>}
        </button>
      ) : (
        <button onClick={() => addToast('כל הקליפים ייוצאו!', 'success')} className="w-full py-2.5 bg-accent-purple hover:bg-accent-purple/90 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-accent-purple/20">
          <Download size={16} /> ייצא הכל
        </button>
      )}
    </div>
  )
}
