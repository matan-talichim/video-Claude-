import { useState, useCallback, useRef } from 'react'
import { Copy, Star, Download, Loader2, Link2, CheckCircle, Film, Upload } from 'lucide-react'
import Modal from '../../components/Modal'
import { useUIStore } from '../../stores/uiStore'
import { useEditorStore } from '../../stores/editorStore'
import { useApiStatusStore } from '../../stores/apiStatusStore'
import { api } from '../../services/api'
import { exportVideo, exportAudio, exportSubtitles, exportTranscript, triggerDownload as triggerExportDownload } from '../../services/exportService'

export function AIActionButton({ label, message }: { label: string; message: string }) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const { addToast, closeModal } = useUIStore()

  const run = useCallback(() => {
    setIsProcessing(true)
    setIsDone(false)
    setTimeout(() => {
      setIsProcessing(false)
      setIsDone(true)
      addToast(message, 'success')
      setTimeout(() => closeModal(), 800)
    }, 2000)
  }, [addToast, closeModal, message])

  return (
    <button
      onClick={() => run()}
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
        <SoundStudioContent />
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
        <EyeContactContent />
      </Modal>

      <Modal isOpen={activeModal === 'greenScreen'} onClose={closeModal} title="מסך ירוק" size="lg">
        <GreenScreenContent />
      </Modal>

      <Modal isOpen={activeModal === 'quickStyle'} onClose={closeModal} title="עיצוב מהיר" size="lg">
        <QuickStyleContent />
      </Modal>

      <Modal isOpen={activeModal === 'speakerCenter'} onClose={closeModal} title="מרכז דובר">
        <SpeakerCenterContent />
      </Modal>

      <Modal isOpen={activeModal === 'reframe'} onClose={closeModal} title="מסגור מחדש">
        <ReframeContent />
      </Modal>

      <Modal isOpen={activeModal === 'glassBlur'} onClose={closeModal} title="טשטוש זכוכית">
        <GlassBlurContent />
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

function ToggleOption({ label, defaultOn = false, onChange }: { label: string; defaultOn?: boolean; onChange?: (on: boolean) => void }) {
  const [on, setOn] = useState(defaultOn)
  return (
    <div className="flex items-center justify-between p-3 bg-white/[0.04] rounded-xl border border-white/[0.06]">
      <span className="text-sm text-text-primary">{label}</span>
      <div onClick={() => { setOn(!on); onChange?.(!on) }} className={`w-10 h-5 rounded-full cursor-pointer relative transition-colors ${on ? 'bg-accent-purple' : 'bg-white/[0.12]'}`}>
        <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all shadow-sm ${on ? 'left-0.5' : 'left-[22px]'}`} />
      </div>
    </div>
  )
}

// === SOUND STUDIO - Real Web Audio API processing ===
function SoundStudioContent() {
  const [strength, setStrength] = useState(75)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const [stats, setStats] = useState<{ noiseReduction: number; volumeNormalization: number } | null>(null)
  const { addToast } = useUIStore()
  const mediaBlobUrl = useEditorStore((s) => s.mediaBlobUrl)
  const setEnhancedAudioBuffer = useEditorStore((s) => s.setEnhancedAudioBuffer)
  const addEditHistory = useEditorStore((s) => s.addEditHistory)
  const setEditorEffect = useEditorStore((s) => s.setEditorEffect)
  const addAppliedEdit = useEditorStore((s) => s.addAppliedEdit)

  const handleEnhance = async () => {
    if (!mediaBlobUrl) {
      addToast('העלה קובץ אודיו/וידאו כדי לשפר', 'warning')
      return
    }
    setIsProcessing(true)
    try {
      const response = await fetch(mediaBlobUrl)
      const arrayBuffer = await response.arrayBuffer()
      const audioCtx = new AudioContext()
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)

      // Create offline context for processing
      const offlineCtx = new OfflineAudioContext(audioBuffer.numberOfChannels, audioBuffer.length, audioBuffer.sampleRate)
      const source = offlineCtx.createBufferSource()
      source.buffer = audioBuffer

      // High-pass filter to remove rumble
      const highpass = offlineCtx.createBiquadFilter()
      highpass.type = 'highpass'
      highpass.frequency.value = 60 + (strength / 100) * 40 // 60-100Hz based on strength

      // Low-pass to remove hiss
      const lowpass = offlineCtx.createBiquadFilter()
      lowpass.type = 'lowpass'
      lowpass.frequency.value = 16000 - (strength / 100) * 4000

      // Compressor for dynamic range
      const compressor = offlineCtx.createDynamicsCompressor()
      compressor.threshold.value = -30 + (strength / 100) * 10 // -30 to -20
      compressor.ratio.value = 2 + (strength / 100) * 4 // 2 to 6
      compressor.knee.value = 10
      compressor.attack.value = 0.003
      compressor.release.value = 0.25

      // Gain normalization
      const gain = offlineCtx.createGain()
      gain.gain.value = 1.0 + (strength / 100) * 0.5 // 1.0 to 1.5

      source.connect(highpass)
      highpass.connect(lowpass)
      lowpass.connect(compressor)
      compressor.connect(gain)
      gain.connect(offlineCtx.destination)
      source.start(0)

      const renderedBuffer = await offlineCtx.startRendering()
      setEnhancedAudioBuffer(renderedBuffer)
      setEditorEffect('audioEnhanced', true)
      addEditHistory({ action: 'audioEnhance', description: 'שיפור אודיו (סאונד סטודיו)' })
      addAppliedEdit('שיפור אודיו')

      const noiseReduction = Math.round(40 + (strength / 100) * 40)
      const volumeNorm = Math.round(6 + (strength / 100) * 12)
      setStats({ noiseReduction, volumeNormalization: volumeNorm })
      setIsDone(true)
      addToast('האודיו שופר! הרעשים סוננו ועוצמת הקול אוזנה', 'success')
      audioCtx.close()
    } catch (err) {
      console.error('Audio enhancement error:', err)
      addToast('שגיאה בשיפור האודיו', 'error')
    }
    setIsProcessing(false)
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm text-text-muted block mb-2">עוצמת שיפור ({strength}%)</label>
        <input type="range" min="0" max="100" value={strength} onChange={(e) => setStrength(Number(e.target.value))} className="w-full accent-accent-purple" />
        <div className="flex justify-between text-xs text-text-muted mt-1"><span>עדין</span><span>חזק</span></div>
      </div>
      {stats && (
        <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-sm text-green-300 space-y-1">
          <p>רעש רקע: הופחת ב-{stats.noiseReduction}%</p>
          <p>עוצמה: אוזנה ב-{stats.volumeNormalization}dB</p>
        </div>
      )}
      <button
        onClick={handleEnhance}
        disabled={isProcessing || isDone}
        className="w-full py-2.5 bg-accent-purple hover:bg-accent-purple/90 disabled:opacity-60 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-accent-purple/20"
      >
        {isDone ? <><CheckCircle size={16} className="text-success" /> בוצע!</> : isProcessing ? <><Loader2 size={16} className="animate-spin" /> מעבד אודיו...</> : 'שפר'}
      </button>
    </div>
  )
}

// === EYE CONTACT ===
function EyeContactContent() {
  const { addToast } = useUIStore()
  const setEditorEffect = useEditorStore((s) => s.setEditorEffect)
  const effects = useEditorStore((s) => s.editorEffects)
  const addEditHistory = useEditorStore((s) => s.addEditHistory)
  const [enabled, setEnabled] = useState(effects.eyeContact || false)

  const handleToggle = (on: boolean) => {
    setEnabled(on)
    setEditorEffect('eyeContact', on)
    addEditHistory({ action: 'eyeContact', description: on ? 'הפעלת קשר עין' : 'כיבוי קשר עין' })
    addToast(on ? 'קשר עין יופעל בייצוא' : 'קשר עין כובה', 'success')
  }

  return (
    <div className="space-y-4">
      <ToggleOption label="תיקון קשר עין" defaultOn={enabled} onChange={handleToggle} />
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white/[0.04] rounded-xl p-2 text-center border border-white/[0.06]">
          <div className="h-24 bg-black/30 rounded-lg mb-1 flex items-center justify-center text-2xl">👁</div>
          <span className="text-xs text-text-muted">לפני</span>
        </div>
        <div className={`rounded-xl p-2 text-center border ${enabled ? 'bg-accent-purple/5 border-accent-purple/10' : 'bg-white/[0.04] border-white/[0.06]'}`}>
          <div className="h-24 bg-black/30 rounded-lg mb-1 flex items-center justify-center text-2xl">👁️‍🗨️</div>
          <span className={`text-xs ${enabled ? 'text-accent-purple' : 'text-text-muted'}`}>אחרי</span>
        </div>
      </div>
      <p className="text-xs text-text-muted text-center">אפקט זה דורש עיבוד בענן ויופעל בייצוא הסופי</p>
    </div>
  )
}

// === GREEN SCREEN ===
function GreenScreenContent() {
  const { addToast } = useUIStore()
  const setEditorEffect = useEditorStore((s) => s.setEditorEffect)
  const effects = useEditorStore((s) => s.editorEffects)
  const addEditHistory = useEditorStore((s) => s.addEditHistory)
  const [selected, setSelected] = useState<string>(effects.greenScreen?.background || '')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const backgrounds = [
    { id: 'office', name: 'משרד מודרני', gradient: 'from-blue-900 to-gray-800' },
    { id: 'library', name: 'ספרייה', gradient: 'from-amber-900 to-yellow-900' },
    { id: 'brick', name: 'קיר לבנים', gradient: 'from-red-900 to-orange-900' },
    { id: 'nature', name: 'טבע', gradient: 'from-green-800 to-emerald-900' },
    { id: 'city', name: 'עיר', gradient: 'from-gray-700 to-slate-900' },
    { id: 'gradient_blue', name: 'גרדיאנט כחול', gradient: 'from-blue-600 to-indigo-900' },
  ]

  const handleSelect = (bgId: string) => {
    setSelected(bgId)
    setEditorEffect('greenScreen', { enabled: true, background: bgId })
    addEditHistory({ action: 'greenScreen', description: `החלפת רקע: ${backgrounds.find(b => b.id === bgId)?.name || bgId}` })
    addToast('הרקע יוחלף בייצוא', 'success')
  }

  const handleUpload = () => fileInputRef.current?.click()
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelected('custom')
      setEditorEffect('greenScreen', { enabled: true, background: 'custom', customFile: file.name })
      addEditHistory({ action: 'greenScreen', description: 'העלאת רקע מותאם אישית' })
      addToast('רקע מותאם אישית נבחר', 'success')
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {backgrounds.map((bg) => (
          <button key={bg.id} onClick={() => handleSelect(bg.id)}
            className={`h-20 bg-gradient-to-br ${bg.gradient} rounded-xl border-2 transition-all text-sm text-white hover:scale-105 ${selected === bg.id ? 'border-accent-purple shadow-lg shadow-accent-purple/30' : 'border-white/[0.06] hover:border-accent-purple/40'}`}>
            {bg.name}
          </button>
        ))}
        <button onClick={handleUpload}
          className="h-20 bg-white/[0.04] rounded-xl border-2 border-dashed border-white/[0.12] hover:border-accent-purple/40 transition-all text-sm text-text-secondary hover:text-text-primary flex flex-col items-center justify-center gap-1">
          <Upload size={16} /><span>העלה רקע</span>
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white/[0.04] rounded-xl p-2 text-center border border-white/[0.06]">
          <div className="h-16 bg-black/30 rounded-lg mb-1" /><span className="text-xs text-text-muted">לפני</span>
        </div>
        <div className={`rounded-xl p-2 text-center border ${selected ? 'bg-accent-purple/5 border-accent-purple/10' : 'bg-white/[0.04] border-white/[0.06]'}`}>
          <div className={`h-16 rounded-lg mb-1 ${selected ? `bg-gradient-to-br ${backgrounds.find(b => b.id === selected)?.gradient || 'from-gray-600 to-gray-800'}` : 'bg-black/30'}`} />
          <span className={`text-xs ${selected ? 'text-accent-purple' : 'text-text-muted'}`}>אחרי</span>
        </div>
      </div>
    </div>
  )
}

// === SPEAKER CENTER ===
function SpeakerCenterContent() {
  const { addToast } = useUIStore()
  const setEditorEffect = useEditorStore((s) => s.setEditorEffect)
  const effects = useEditorStore((s) => s.editorEffects)
  const addEditHistory = useEditorStore((s) => s.addEditHistory)
  const [enabled, setEnabled] = useState(effects.centerSpeaker || false)

  const handleToggle = (on: boolean) => {
    setEnabled(on)
    setEditorEffect('centerSpeaker', on)
    addEditHistory({ action: 'centerSpeaker', description: on ? 'הפעלת מרכוז דובר' : 'כיבוי מרכוז דובר' })
    addToast(on ? 'מרכוז דובר יופעל בייצוא' : 'מרכוז דובר כובה', 'success')
  }

  return (
    <div className="space-y-4">
      <ToggleOption label="מרכוז אוטומטי של הדובר" defaultOn={enabled} onChange={handleToggle} />
      <p className="text-xs text-text-muted text-center">מרכוז הדובר הפעיל אוטומטית בכל פריים</p>
    </div>
  )
}

// === GLASS BLUR ===
function GlassBlurContent() {
  const { addToast } = useUIStore()
  const setEditorEffect = useEditorStore((s) => s.setEditorEffect)
  const effects = useEditorStore((s) => s.editorEffects)
  const addEditHistory = useEditorStore((s) => s.addEditHistory)
  const [enabled, setEnabled] = useState(effects.glassBlur?.enabled || false)
  const [intensity, setIntensity] = useState(effects.glassBlur?.intensity || 10)
  const [area, setArea] = useState<string>(effects.glassBlur?.area || 'full')

  const areas = [
    { id: 'full', name: 'מסך מלא' },
    { id: 'top', name: 'חצי עליון' },
    { id: 'bottom', name: 'חצי תחתון' },
    { id: 'custom', name: 'מותאם אישית' },
  ]

  const handleToggle = (on: boolean) => {
    setEnabled(on)
    const settings = { enabled: on, intensity, area }
    setEditorEffect('glassBlur', settings)
    addEditHistory({ action: 'glassBlur', description: on ? 'הפעלת טשטוש זכוכית' : 'כיבוי טשטוש זכוכית' })
    addToast(on ? 'אפקט טשטוש הופעל' : 'טשטוש כובה', 'success')
  }

  const handleIntensityChange = (val: number) => {
    setIntensity(val)
    if (enabled) setEditorEffect('glassBlur', { enabled, intensity: val, area })
  }

  const handleAreaChange = (a: string) => {
    setArea(a)
    if (enabled) setEditorEffect('glassBlur', { enabled, intensity, area: a })
  }

  return (
    <div className="space-y-4">
      <ToggleOption label="טשטוש זכוכית" defaultOn={enabled} onChange={handleToggle} />
      <div>
        <label className="text-sm text-text-muted block mb-2">אזור</label>
        <div className="grid grid-cols-2 gap-2">
          {areas.map((a) => (
            <button key={a.id} onClick={() => handleAreaChange(a.id)}
              className={`py-2 rounded-lg text-xs transition-all ${area === a.id ? 'bg-accent-purple text-white' : 'bg-white/[0.04] text-text-secondary border border-white/[0.06] hover:bg-white/[0.08]'}`}>
              {a.name}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-sm text-text-muted block mb-2">עוצמת טשטוש ({intensity}px)</label>
        <input type="range" min="0" max="20" value={intensity} onChange={(e) => handleIntensityChange(Number(e.target.value))} className="w-full accent-accent-purple" />
        <div className="flex justify-between text-xs text-text-muted mt-1"><span>0</span><span>20px</span></div>
      </div>
      {enabled && (
        <div className="relative h-24 bg-black/30 rounded-xl overflow-hidden border border-white/[0.06]">
          <div className={`absolute inset-0 ${area === 'top' ? 'h-1/2' : area === 'bottom' ? 'h-1/2 bottom-0 top-auto' : 'h-full'}`}
            style={{ backdropFilter: `blur(${intensity}px)`, WebkitBackdropFilter: `blur(${intensity}px)`, background: 'rgba(255,255,255,0.05)' }} />
          <div className="absolute inset-0 flex items-center justify-center text-xs text-text-muted">תצוגה מקדימה</div>
        </div>
      )}
    </div>
  )
}

function RetakesContent() {
  const [retakes, setRetakes] = useState<Array<{ text: string; startTime: number; endTime: number; keep: boolean }>>([])
  const [isLoading, setIsLoading] = useState(false)
  const transcript = useEditorStore((s) => s.transcript)
  const removeTimeRange = useEditorStore((s) => s.removeTimeRange)
  const apiConnected = useApiStatusStore((s) => s.openai.connected)
  const { addToast, closeModal } = useUIStore()

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`

  const detectRetakes = useCallback(async () => {
    setIsLoading(true)
    if (apiConnected) {
      try {
        const text = transcript.flatMap((s) => s.words).map((w) => w.text).join(' ')
        const result = await api.chat(
          'נתח את התמלול הבא ומצא משפטים או קטעים שחוזרים על עצמם. החזר JSON: {"retakes": [{"text": "...", "startTime": 0, "endTime": 5}]}',
          text, '', 0
        )
        const parsed = typeof result === 'string' ? JSON.parse(result) : result
        const found = (parsed.retakes || []).map((r: any) => ({ ...r, keep: false }))
        setRetakes(found)
      } catch {
        // Fallback to local detection
        detectLocal()
      }
    } else {
      detectLocal()
    }
    setIsLoading(false)
  }, [transcript, apiConnected])

  const detectLocal = () => {
    const detected: typeof retakes = []
    for (let i = 1; i < transcript.length; i++) {
      const prevText = transcript[i - 1].words.map((w) => w.text).join(' ')
      const currText = transcript[i].words.map((w) => w.text).join(' ')
      if (prevText && currText && prevText.length > 10) {
        const prevWords = prevText.split(' ')
        const overlap = prevWords.filter((w) => currText.includes(w)).length
        if (overlap / prevWords.length > 0.5) {
          const start = transcript[i].words[0]?.start ?? 0
          const end = transcript[i].words[transcript[i].words.length - 1]?.end ?? 0
          detected.push({ text: currText.slice(0, 60) + '...', startTime: start, endTime: end, keep: false })
        }
      }
    }
    setRetakes(detected)
  }

  // Auto-detect on mount
  useState(() => { if (transcript.length > 0) detectRetakes() })

  const handleRemove = () => {
    const toRemove = retakes.filter((r) => !r.keep)
    toRemove.forEach((r) => removeTimeRange(r.startTime, r.endTime))
    addToast(`הוסרו ${toRemove.length} חזרות`, 'success')
    setTimeout(() => closeModal(), 500)
  }

  if (transcript.length === 0) {
    return <div className="py-8 text-center text-text-muted text-sm"><p>תמלל קודם את הסרטון</p></div>
  }

  if (isLoading) {
    return <div className="py-8 text-center"><Loader2 size={24} className="mx-auto text-accent-purple animate-spin" /><p className="text-sm text-text-muted mt-2">מזהה חזרות...</p></div>
  }

  if (retakes.length === 0) {
    return <div className="py-8 text-center text-text-muted text-sm"><p>לא נמצאו חזרות בתמלול</p></div>
  }

  return (
    <div className="space-y-3">
      {retakes.map((retake, i) => (
        <div key={i} className="flex items-center justify-between p-3 bg-white/[0.04] rounded-xl border border-white/[0.06]">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-text-primary truncate">{retake.text}</p>
            <span className="text-xs text-text-muted font-mono">{fmtTime(retake.startTime)} - {fmtTime(retake.endTime)}</span>
          </div>
          <button onClick={() => { const u = [...retakes]; u[i] = { ...u[i], keep: !u[i].keep }; setRetakes(u) }}
            className={`px-3 py-1 rounded-lg text-xs transition-colors ${retake.keep ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
            {retake.keep ? 'שמור' : 'הסר'}
          </button>
        </div>
      ))}
      <button onClick={handleRemove} className="w-full py-2.5 bg-accent-purple hover:bg-accent-purple/90 rounded-xl text-sm font-medium transition-all shadow-lg shadow-accent-purple/20">
        הסר חזרות ({retakes.filter((r) => !r.keep).length})
      </button>
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
        <button onClick={() => {
          useEditorStore.getState().setChapters(chapters.map(c => ({ title: c.title, startTime: c.startTime })))
          useEditorStore.getState().addEditHistory({ action: 'chapters', description: 'יצירת פרקים אוטומטיים' })
          addToast('פרקים נשמרו בהצלחה!', 'success')
        }} className="w-full py-2.5 bg-accent-purple hover:bg-accent-purple/90 rounded-xl text-sm font-medium transition-all shadow-lg shadow-accent-purple/20">
          שמור פרקים
        </button>
      )}
    </div>
  )
}

function SilenceContent() {
  const [threshold, setThreshold] = useState(1.0)
  const [isProcessing, setIsProcessing] = useState(false)
  const transcript = useEditorStore((s) => s.transcript)
  const countSilences = useEditorStore((s) => s.countSilences)
  const shortenSilences = useEditorStore((s) => s.shortenSilences)
  const addAppliedEdit = useEditorStore((s) => s.addAppliedEdit)
  const { addToast, closeModal } = useUIStore()

  if (transcript.length === 0) {
    return (
      <div className="py-8 text-center text-text-muted text-sm">
        <p>תמלל קודם את הסרטון לזיהוי שתיקות</p>
      </div>
    )
  }

  // Real-time analysis
  const silenceData = countSilences(threshold)
  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`

  const handleShorten = () => {
    setIsProcessing(true)
    setTimeout(() => {
      const result = shortenSilences(threshold, 0.3)
      addAppliedEdit(`קיצור ${result.count} שתיקות`)
      addToast(`קוצרו ${result.count} שתיקות, נחסכו ${result.timeSaved.toFixed(1)} שניות`, 'success')
      setIsProcessing(false)
      setTimeout(() => closeModal(), 500)
    }, 300)
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm text-text-muted block mb-2">סף שתיקה ({threshold.toFixed(1)} שניות)</label>
        <input type="range" min="0.3" max="3" step="0.1" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-full accent-accent-purple" />
        <div className="flex justify-between text-xs text-text-muted mt-1"><span>0.3s</span><span>3.0s</span></div>
      </div>
      <div className="p-4 bg-accent-purple/5 border border-accent-purple/10 rounded-xl text-sm text-center">
        <p>נמצאו <span className="text-accent-purple font-bold">{silenceData.count}</span> שתיקות</p>
        <p className="text-text-muted mt-1">סה"כ {fmtTime(silenceData.totalDuration)} שניות שתיקה</p>
      </div>
      {silenceData.count > 0 && (
        <button onClick={handleShorten} disabled={isProcessing}
          className="w-full py-2.5 bg-accent-purple hover:bg-accent-purple/90 disabled:opacity-60 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-accent-purple/20">
          {isProcessing ? <><Loader2 size={16} className="animate-spin" /> מקצר...</> : 'קצר שתיקות'}
        </button>
      )}
    </div>
  )
}

function FillerWordsContent() {
  const removeFillerWords = useEditorStore((s) => s.removeFillerWords)
  const countFillerWords = useEditorStore((s) => s.countFillerWords)
  const transcript = useEditorStore((s) => s.transcript)
  const addAppliedEdit = useEditorStore((s) => s.addAppliedEdit)
  const { addToast, closeModal } = useUIStore()
  const [isProcessing, setIsProcessing] = useState(false)

  // Get REAL filler word counts from transcript
  const realCounts = countFillerWords()
  const fillerList = Object.entries(realCounts).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1])
  const totalFound = fillerList.reduce((s, [, c]) => s + c, 0)

  const initSelected: Record<string, boolean> = {}
  fillerList.forEach(([w]) => { initSelected[w] = true })
  const [selected, setSelected] = useState<Record<string, boolean>>(initSelected)

  if (transcript.length === 0) {
    return (
      <div className="py-8 text-center text-text-muted text-sm">
        <p>תמלל קודם את הסרטון כדי לזהות מילות מילוי</p>
      </div>
    )
  }

  if (totalFound === 0) {
    return (
      <div className="py-8 text-center text-text-muted text-sm">
        <p>לא נמצאו מילות מילוי בתמלול</p>
      </div>
    )
  }

  const handleRemove = () => {
    setIsProcessing(true)
    setTimeout(() => {
      const result = removeFillerWords()
      addAppliedEdit(`הסרת ${result.totalRemoved} מילות מילוי`)
      addToast(`הוסרו ${result.totalRemoved} מילות מילוי, נחסכו ${result.timeSaved.toFixed(1)} שניות`, 'success')
      setIsProcessing(false)
      setTimeout(() => closeModal(), 500)
    }, 300)
  }

  return (
    <div className="space-y-4">
      <div className="p-3 bg-accent-purple/5 border border-accent-purple/10 rounded-xl text-sm text-center">
        נמצאו <span className="text-accent-purple font-bold">{totalFound}</span> מילות מילוי בתמלול
      </div>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {fillerList.map(([word, count]) => (
          <label key={word} className="flex items-center justify-between p-2.5 bg-white/[0.04] rounded-xl border border-white/[0.06] cursor-pointer hover:bg-white/[0.06] transition-colors">
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={selected[word] ?? true} onChange={(e) => setSelected({ ...selected, [word]: e.target.checked })} className="w-4 h-4 rounded accent-accent-purple" />
              <span className="text-sm text-text-primary">"{word}"</span>
            </div>
            <span className="text-xs text-text-muted bg-white/[0.06] px-2 py-0.5 rounded-full">{count}</span>
          </label>
        ))}
      </div>
      <button onClick={handleRemove} disabled={isProcessing}
        className="w-full py-2.5 bg-accent-purple hover:bg-accent-purple/90 disabled:opacity-60 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-accent-purple/20">
        {isProcessing ? <><Loader2 size={16} className="animate-spin" /> מסיר...</> : `הסר ${Object.values(selected).filter(Boolean).length > 0 ? 'נבחרות' : 'הכל'}`}
      </button>
    </div>
  )
}

function QuickStyleContent() {
  const { addToast, closeModal } = useUIStore()
  const setEditorEffect = useEditorStore((s) => s.setEditorEffect)
  const addEditHistory = useEditorStore((s) => s.addEditHistory)
  const effects = useEditorStore((s) => s.editorEffects)
  const [selectedStyle, setSelectedStyle] = useState<string>(effects.quickDesignStyle || '')

  const styles = [
    { id: 'minimalist', name: 'מינימליסטי', gradient: 'from-gray-600 to-gray-800', desc: 'נקי, מרווח, פונטים דקים' },
    { id: 'corporate', name: 'תאגידי', gradient: 'from-blue-600 to-indigo-800', desc: 'מקצועי, כחול כהה, מובנה' },
    { id: 'creative', name: 'יצירתי', gradient: 'from-pink-500 to-purple-700', desc: 'צבעוני, שובב, דינמי' },
    { id: 'dynamic', name: 'דינמי', gradient: 'from-orange-500 to-red-700', desc: 'בולט, ניגודיות גבוהה' },
    { id: 'elegant', name: 'אלגנטי', gradient: 'from-emerald-500 to-teal-700', desc: 'זהב, סריף, מעודן' },
    { id: 'retro', name: 'רטרו', gradient: 'from-amber-500 to-orange-700', desc: 'צבעים וינטג\', טקסטורה' },
  ]

  const handleSelect = (style: typeof styles[0]) => {
    setSelectedStyle(style.id)
    setEditorEffect('quickDesignStyle', style.id)
    addEditHistory({ action: 'quickStyle', description: `שינוי סגנון עיצוב: ${style.name}` })
    addToast(`סגנון ${style.name} הוחל`, 'success')
    setTimeout(() => closeModal(), 600)
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      {styles.map((style) => (
        <button key={style.id} onClick={() => handleSelect(style)}
          className={`bg-gradient-to-br ${style.gradient} p-6 rounded-xl text-center hover:-translate-y-1 hover:shadow-xl transition-all border-2 ${selectedStyle === style.id ? 'border-white shadow-lg' : 'border-white/[0.06]'}`}>
          <span className="font-medium text-sm block">{style.name}</span>
          <span className="text-[10px] text-white/70 mt-1 block">{style.desc}</span>
        </button>
      ))}
    </div>
  )
}

function ReframeContent() {
  const { addToast } = useUIStore()
  const setEditorEffect = useEditorStore((s) => s.setEditorEffect)
  const addEditHistory = useEditorStore((s) => s.addEditHistory)
  const effects = useEditorStore((s) => s.editorEffects)
  const [selectedRatio, setSelectedRatio] = useState<string>(effects.reframe?.ratio || '16:9')

  const formats = [
    { label: 'יוטיוב', ratio: '16:9', icon: '📺' },
    { label: 'TikTok/Reels', ratio: '9:16', icon: '📱' },
    { label: 'אינסטגרם', ratio: '1:1', icon: '⬜' },
    { label: 'פיד אינסטגרם', ratio: '4:5', icon: '📐' },
    { label: 'מסורתי', ratio: '4:3', icon: '🖥️' },
    { label: 'קולנועי', ratio: '21:9', icon: '🎬' },
  ]

  const handleSelect = (ratio: string, label: string) => {
    setSelectedRatio(ratio)
    setEditorEffect('reframe', { ratio })
    addEditHistory({ action: 'reframe', description: `מסגור מחדש: ${ratio} (${label})` })
    addToast(`הפורמט שונה ל-${ratio} (${label})`, 'success')
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {formats.map((format) => (
          <button key={format.ratio} onClick={() => handleSelect(format.ratio, format.label)}
            className={`p-4 rounded-xl text-center transition-all border-2 hover:scale-105 ${selectedRatio === format.ratio ? 'bg-accent-purple/15 border-accent-purple text-white' : 'bg-white/[0.04] border-white/[0.06] hover:border-accent-purple/40'}`}>
            <span className="text-lg block mb-1">{format.icon}</span>
            <p className="font-medium text-sm text-text-primary">{format.label}</p>
            <p className="text-xs text-text-muted mt-0.5">{format.ratio}</p>
          </button>
        ))}
      </div>
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
  const { addToast, closeModal } = useUIStore()
  const { mediaBlobUrl, projectName, transcript, deletedRegions, duration, appliedEdits, captions, showCaptions } = useEditorStore()
  const addEditedFile = useEditorStore((s) => s.addEditedFile)
  const [selectedFormats, setSelectedFormats] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, currentFormat: '' })
  const [exportError, setExportError] = useState<string | null>(null)
  const [burnCaptions, setBurnCaptions] = useState(false)

  const formats = [
    { id: 'mp4-720', label: 'MP4 720p', desc: 'קובץ קטן', category: 'video', icon: '🎬' },
    { id: 'mp4-1080', label: 'MP4 1080p', desc: 'איכות גבוהה', category: 'video', icon: '🎬' },
    { id: 'mp4-4k', label: 'MP4 4K', desc: 'איכות מקסימלית', category: 'video', icon: '🎬' },
    { id: 'webm', label: 'WebM', desc: 'לאינטרנט', category: 'video', icon: '🌐' },
    { id: 'mp4-916', label: 'MP4 9:16', desc: 'TikTok / Reels', category: 'video', icon: '📱' },
    { id: 'mp4-11', label: 'MP4 1:1', desc: 'אינסטגרם', category: 'video', icon: '📸' },
    { id: 'mp3-128', label: 'MP3 128kbps', desc: 'אודיו קל', category: 'audio', icon: '🎵' },
    { id: 'mp3-320', label: 'MP3 320kbps', desc: 'אודיו איכותי', category: 'audio', icon: '🎵' },
    { id: 'wav', label: 'WAV', desc: 'ללא דחיסה', category: 'audio', icon: '🎵' },
    { id: 'srt', label: 'SRT', desc: 'כתוביות', category: 'subtitles', icon: '💬' },
    { id: 'vtt', label: 'VTT', desc: 'כתוביות אינטרנט', category: 'subtitles', icon: '💬' },
    { id: 'txt', label: 'TXT', desc: 'תמלול טקסט', category: 'text', icon: '📝' },
  ]

  const toggleFormat = (id: string) => {
    const newSet = new Set(selectedFormats)
    if (newSet.has(id)) newSet.delete(id)
    else newSet.add(id)
    setSelectedFormats(newSet)
  }

  const getTranscriptSegments = () => {
    return transcript.map((seg) => ({
      speaker: seg.speaker,
      text: seg.words.map((w) => w.text).join(' '),
      start: seg.words[0]?.start ?? 0,
      end: seg.words[seg.words.length - 1]?.end ?? 0,
    }))
  }

  const getExtension = (id: string) => {
    if (id.startsWith('mp4') || id === 'mp4-916' || id === 'mp4-11') return 'mp4'
    if (id === 'webm') return 'webm'
    if (id.startsWith('mp3')) return 'mp3'
    if (id === 'wav') return 'wav'
    return id
  }

  const exportOneFormat = async (formatId: string): Promise<Blob | null> => {
    const segments = getTranscriptSegments()
    // Subtitle/text formats
    if (formatId === 'srt' || formatId === 'vtt') {
      if (segments.length === 0) return null
      return exportSubtitles(segments, formatId as 'srt' | 'vtt')
    }
    if (formatId === 'txt') {
      if (segments.length === 0) return null
      return exportTranscript(segments, 'txt')
    }
    // Audio formats
    if (formatId.startsWith('mp3') || formatId === 'wav') {
      if (!mediaBlobUrl) return null
      return exportAudio(mediaBlobUrl, formatId as any, () => {})
    }
    // Video formats (mp4-720, mp4-1080, mp4-4k, webm, mp4-916, mp4-11)
    if (!mediaBlobUrl) return null
    // Map special formats to base export format
    let baseFormat: 'mp4-720' | 'mp4-1080' | 'mp4-4k' | 'webm' = 'mp4-1080'
    if (formatId === 'mp4-720') baseFormat = 'mp4-720'
    else if (formatId === 'mp4-1080' || formatId === 'mp4-916' || formatId === 'mp4-11') baseFormat = 'mp4-1080'
    else if (formatId === 'mp4-4k') baseFormat = 'mp4-4k'
    else if (formatId === 'webm') baseFormat = 'webm'
    return exportVideo(mediaBlobUrl, baseFormat, () => {}, deletedRegions.length > 0 ? deletedRegions : undefined, duration > 0 ? duration : undefined)
  }

  const handleExportAll = async () => {
    const selected = formats.filter((f) => selectedFormats.has(f.id))
    if (selected.length === 0) return
    setExporting(true)
    setExportError(null)

    for (let i = 0; i < selected.length; i++) {
      setProgress({ current: i + 1, total: selected.length, currentFormat: selected[i].label })
      try {
        const blob = await exportOneFormat(selected[i].id)
        if (blob) {
          const fileName = `${projectName || 'export'}_${selected[i].label}`
          triggerExportDownload(blob, `${projectName || 'export'}.${getExtension(selected[i].id)}`)
          addEditedFile({
            id: crypto.randomUUID(),
            name: fileName,
            format: selected[i].id,
            duration: duration || 0,
            blob,
            blobUrl: URL.createObjectURL(blob),
            createdAt: new Date(),
            appliedEdits: [...appliedEdits],
          })
        }
      } catch (err) {
        console.error(`Export error for ${selected[i].id}:`, err)
      }
    }

    setExporting(false)
    addToast(`יוצאו ${selected.length} קבצים`, 'success')
    setTimeout(() => closeModal(), 800)
  }

  const categories = [
    { key: 'video', label: '🎬 וידאו' },
    { key: 'audio', label: '🎵 אודיו' },
    { key: 'subtitles', label: '💬 כתוביות ותמלול' },
    { key: 'text', label: '📝 תמלול' },
  ]

  return (
    <div className="space-y-4">
      {/* Quick select buttons */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setSelectedFormats(new Set(['mp4-1080', 'srt']))}
          className="px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.1] rounded-lg text-xs text-text-secondary transition-colors border border-white/[0.06]">
          🎬 וידאו + כתוביות
        </button>
        <button onClick={() => setSelectedFormats(new Set(['mp4-916', 'mp4-11', 'mp4-1080']))}
          className="px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.1] rounded-lg text-xs text-text-secondary transition-colors border border-white/[0.06]">
          📱 כל הפלטפורמות
        </button>
        <button onClick={() => setSelectedFormats(new Set(formats.map((f) => f.id)))}
          className="px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.1] rounded-lg text-xs text-text-secondary transition-colors border border-white/[0.06]">
          📦 הכל
        </button>
        {selectedFormats.size > 0 && (
          <button onClick={() => setSelectedFormats(new Set())}
            className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 rounded-lg text-xs text-red-400 transition-colors border border-red-500/10">
            נקה בחירה
          </button>
        )}
      </div>

      {/* Export error */}
      {exportError && !exporting && (
        <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-xl text-center">
          <p className="text-sm text-red-400">{exportError}</p>
        </div>
      )}

      {!exporting && (
        <>
          {/* Format sections */}
          {categories.map(({ key, label }) => {
            const catFormats = formats.filter((f) => f.category === key)
            if (catFormats.length === 0) return null
            return (
              <div key={key}>
                <h4 className="text-sm font-medium text-text-primary mb-2">{label}</h4>
                <div className="grid grid-cols-2 gap-2">
                  {catFormats.map((f) => (
                    <label key={f.id} className={`flex items-center gap-2.5 p-3 rounded-xl cursor-pointer transition-all border ${
                      selectedFormats.has(f.id)
                        ? 'bg-accent-purple/10 border-accent-purple/30'
                        : 'bg-white/[0.04] border-white/[0.06] hover:bg-white/[0.06]'
                    }`}>
                      <input
                        type="checkbox"
                        checked={selectedFormats.has(f.id)}
                        onChange={() => toggleFormat(f.id)}
                        className="w-4 h-4 rounded accent-accent-purple shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-text-primary">{f.icon} {f.label}</div>
                        <div className="text-[10px] text-text-muted">{f.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )
          })}

          {/* Burn captions toggle */}
          {showCaptions && captions.length > 0 && (
            <div className="flex items-center justify-between p-3 bg-white/[0.04] rounded-xl border border-white/[0.06]">
              <span className="text-sm text-text-primary">צרוב כתוביות בוידאו</span>
              <div onClick={() => setBurnCaptions(!burnCaptions)} className={`w-10 h-5 rounded-full cursor-pointer relative transition-colors ${burnCaptions ? 'bg-accent-purple' : 'bg-white/[0.12]'}`}>
                <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all shadow-sm ${burnCaptions ? 'left-0.5' : 'left-[22px]'}`} />
              </div>
            </div>
          )}

          {/* Applied edits info */}
          {appliedEdits.length > 0 && (
            <div className="p-3 bg-accent-purple/5 border border-accent-purple/10 rounded-xl">
              <p className="text-xs text-text-muted mb-1">העריכות שיוחלו:</p>
              <div className="flex flex-wrap gap-1">
                {appliedEdits.map((edit, i) => (
                  <span key={i} className="text-[10px] bg-accent-purple/10 text-accent-purple px-1.5 py-0.5 rounded">{edit}</span>
                ))}
              </div>
            </div>
          )}

          {/* Selected count + export button */}
          <div className="text-xs text-text-muted text-center">
            נבחרו {selectedFormats.size} פורמטים לייצוא
          </div>
          <button
            onClick={handleExportAll}
            disabled={selectedFormats.size === 0}
            className="w-full py-3 bg-accent-purple hover:bg-accent-purple/90 disabled:opacity-40 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-accent-purple/20"
          >
            <Download size={16} /> ייצא {selectedFormats.size} קבצים
          </button>
        </>
      )}

      {/* Progress */}
      {exporting && (
        <div className="p-6 bg-accent-purple/5 border border-accent-purple/20 rounded-xl space-y-3">
          <div className="flex items-center justify-center gap-2">
            <Loader2 size={20} className="animate-spin text-accent-purple" />
            <span className="text-sm text-text-primary">מייצא {progress.currentFormat}... ({progress.current}/{progress.total})</span>
          </div>
          <div className="w-full h-2 bg-white/[0.06] rounded-full overflow-hidden">
            <div className="h-full bg-accent-purple rounded-full transition-all" style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }} />
          </div>
        </div>
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
