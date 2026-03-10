import { useState, useRef } from 'react'
import {
  Image, Trash2, Loader2, Upload, Sparkles, Copy, RefreshCw, ChevronDown, ChevronUp,
  Layers, Lock, Unlock, Search, Video,
  RotateCw, FlipHorizontal, FlipVertical, Maximize, Wand2, Film, History,
  MonitorSmartphone, Square, RectangleHorizontal, ArrowUpRight, ArrowUpLeft, ArrowDownRight,
  ArrowDownLeft, LayoutTemplate, Zap
} from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'
import type { BRollItem } from '../../stores/editorStore'
import { useUIStore } from '../../stores/uiStore'
import { useUsageStore } from '../../stores/usageStore'
import { api } from '../../services/api'

// ====== TAB TYPES ======
type TabId = 'ai-image' | 'ai-video' | 'stock' | 'upload' | 'history'
const tabs: Array<{ id: TabId; label: string; icon: any }> = [
  { id: 'ai-image', label: 'תמונה AI', icon: Sparkles },
  { id: 'ai-video', label: 'סרטון AI', icon: Video },
  { id: 'stock', label: 'מאגר סטוק', icon: Search },
  { id: 'upload', label: 'העלאה', icon: Upload },
  { id: 'history', label: 'היסטוריה', icon: History },
]

// ====== CONSTANTS ======
const aspectRatios = [
  { id: '1792x1024', label: '16:9', desc: 'לרוחב' },
  { id: '1024x1792', label: '9:16', desc: 'לאורך' },
  { id: '1024x1024', label: '1:1', desc: 'ריבוע' },
]

const imageStyles = [
  { id: 'realistic', label: 'ריאליסטי' },
  { id: 'illustration', label: 'אילוסטרציה' },
  { id: '3d', label: '3D' },
  { id: 'minimalist', label: 'מינימליסטי' },
  { id: 'cinematic', label: 'סינמטי' },
  { id: 'animation', label: 'אנימציה' },
]

const examplePrompts = [
  'משרד מודרני עם אור טבעי',
  'אנשים עובדים יחד על מחשבים',
  'נוף עירוני בשעת שקיעה',
  'גרפיקה מינימליסטית בסגנון עסקי',
  'לוח עם גרפים ונתונים',
  'ידיים מקלידות על מקלדת',
]

const veoPrompts = [
  'מבט אווירי על עיר בלילה',
  'אדם הולך בשדה ירוק עם שמש',
  'גלים שוברים על חוף סלעי',
  'עשן צבעוני על רקע שחור',
]

const displayModes: Array<{ id: BRollItem['displayMode']; label: string; icon: any }> = [
  { id: 'fullscreen', label: 'מסך מלא', icon: Maximize },
  { id: 'pip', label: 'תמונה בתמונה - קטן', icon: MonitorSmartphone },
  { id: 'pipMedium', label: 'תמונה בתמונה - בינוני', icon: MonitorSmartphone },
  { id: 'halfLeft', label: 'חצי שמאל', icon: RectangleHorizontal },
  { id: 'halfRight', label: 'חצי ימין', icon: RectangleHorizontal },
  { id: 'halfTop', label: 'חצי עליון', icon: Square },
  { id: 'halfBottom', label: 'חצי תחתון', icon: Square },
  { id: 'topRight', label: 'ימין למעלה', icon: ArrowUpRight },
  { id: 'topLeft', label: 'שמאל למעלה', icon: ArrowUpLeft },
  { id: 'bottomRight', label: 'ימין למטה', icon: ArrowDownRight },
  { id: 'bottomLeft', label: 'שמאל למטה', icon: ArrowDownLeft },
]

const entranceOptions: Array<{ id: BRollItem['entranceAnimation']; label: string }> = [
  { id: 'none', label: 'ללא' },
  { id: 'fadeIn', label: 'עמעום' },
  { id: 'slideRight', label: 'הזזה מימין' },
  { id: 'slideLeft', label: 'הזזה משמאל' },
  { id: 'slideDown', label: 'הזזה מלמעלה' },
  { id: 'slideUp', label: 'הזזה מלמטה' },
  { id: 'zoomIn', label: 'זום אין' },
  { id: 'rotate', label: 'סיבוב' },
  { id: 'bounce', label: 'קפיצה' },
]

const stayingOptions: Array<{ id: BRollItem['stayingAnimation']; label: string }> = [
  { id: 'none', label: 'ללא' },
  { id: 'gentleFloat', label: 'נדנוד עדין' },
  { id: 'pulse', label: 'פעימה' },
  { id: 'hover', label: 'ריחוף' },
  { id: 'slowRotate', label: 'סיבוב איטי' },
  { id: 'blink', label: 'הבהוב' },
]

const exitOptions: Array<{ id: BRollItem['exitAnimation']; label: string }> = [
  { id: 'none', label: 'ללא' },
  { id: 'fadeOut', label: 'עמעום' },
  { id: 'slideRight', label: 'הזזה לימין' },
  { id: 'slideLeft', label: 'הזזה לשמאל' },
  { id: 'slideUp', label: 'הזזה למעלה' },
  { id: 'slideDown', label: 'הזזה למטה' },
  { id: 'zoomOut', label: 'זום אאוט' },
]

const easingOptions: Array<{ id: BRollItem['animationEasing']; label: string }> = [
  { id: 'linear', label: 'ליניארי' },
  { id: 'ease-in', label: 'האצה' },
  { id: 'ease-out', label: 'האטה' },
  { id: 'ease-in-out', label: 'האצה-האטה' },
  { id: 'bounce', label: 'קפיצה' },
  { id: 'elastic', label: 'גמיש' },
]

const blendModes: Array<{ id: BRollItem['blendMode']; label: string }> = [
  { id: 'normal', label: 'רגיל' },
  { id: 'multiply', label: 'כפל' },
  { id: 'screen', label: 'מסך' },
  { id: 'overlay', label: 'שכבה' },
  { id: 'soft-light', label: 'אור רך' },
]

const brollTemplates = [
  { id: 'pip-bottom-right', name: 'תמונה בתמונה - ימין למטה', desc: 'תמונה קטנה בפינה', preset: { displayMode: 'bottomRight' as const, x: 70, y: 70, width: 25, height: 25 } },
  { id: 'half-split', name: 'חצי-חצי', desc: 'חלוקה לשני חצאים', preset: { displayMode: 'halfRight' as const, width: 50, height: 100 } },
  { id: 'blurred-bg', name: 'רקע מטושטש', desc: 'B-Roll כרקע מטושטש', preset: { displayMode: 'fullscreen' as const, blur: 8, opacity: 60 } },
  { id: 'ken-burns', name: 'קן ברנס', desc: 'זום איטי על תמונה', preset: { displayMode: 'fullscreen' as const, entranceAnimation: 'zoomIn' as const, animationDuration: 3 } },
  { id: 'slide-reveal', name: 'חשיפה', desc: 'גילוי הדרגתי', preset: { displayMode: 'fullscreen' as const, entranceAnimation: 'slideRight' as const, animationDuration: 1.5 } },
  { id: 'frame', name: 'מסגרת', desc: 'תמונה כמסגרת', preset: { displayMode: 'fullscreen' as const, opacity: 80, borderEnabled: true, borderWidth: 8, borderColor: '#E94560' } },
]

const stockSources = [
  { id: 'unsplash', label: 'Unsplash (חינם)' },
  { id: 'pexels', label: 'Pexels (חינם)' },
  { id: 'pixabay', label: 'Pixabay (חינם)' },
]

const fitOptions: Array<{ id: BRollItem['objectFit']; label: string }> = [
  { id: 'cover', label: 'מלא' },
  { id: 'contain', label: 'התאם' },
  { id: 'fill', label: 'מתח' },
]

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`

// ====== MAIN COMPONENT ======
export default function BRollPanel({ onClose }: { onClose: () => void }) {
  const store = useEditorStore()
  const { bRollItems, addBRollItem, removeBRollItem, updateBRollItem, duplicateBRollItem,
    moveBRollLayer, bringToFront, sendToBack, currentTime, duration, selectedBRollId, setSelectedBRollId,
    bRollHistory, removeBRollHistoryItem, transcript } = store
  const { addToast } = useUIStore()
  const addDalleUsage = useUsageStore((s) => s.addDalleUsage)

  const [activeTab, setActiveTab] = useState<TabId>('ai-image')
  const [prompt, setPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [selectedAspect, setSelectedAspect] = useState('1792x1024')
  const [selectedStyle, setSelectedStyle] = useState('realistic')
  const [generatedImage, setGeneratedImage] = useState<{ url: string; prompt: string } | null>(null)
  const [imageModel, setImageModel] = useState<'nano-banana-2' | 'nano-banana-pro' | 'dall-e-3'>('nano-banana-2')

  // AI Video state
  const [videoProvider, setVideoProvider] = useState<'veo' | 'seedance'>('veo')
  const [videoPrompt, setVideoPrompt] = useState('')
  const [videoStyle, setVideoStyle] = useState('cinematic')
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false)
  const [motionIntensity, setMotionIntensity] = useState(50)
  const [cameraMove, setCameraMove] = useState('static')
  const [videoModel, setVideoModel] = useState<'veo-3.1' | 'veo-3.1-fast' | 'veo-3' | 'veo-3-fast'>('veo-3.1')
  const [videoAspect, setVideoAspect] = useState('16:9')
  const [videoResolution, setVideoResolution] = useState('720p')
  const [videoStatus, setVideoStatus] = useState('')
  // Seedance-specific state
  const [seedanceAspect, setSeedanceAspect] = useState('9:16')
  const [seedanceResolution, setSeedanceResolution] = useState('720p')
  const [seedanceDuration, setSeedanceDuration] = useState('5')
  const [seedanceAudio, setSeedanceAudio] = useState(false)

  // Stock state
  const [stockQuery, setStockQuery] = useState('')
  const [stockSource, setStockSource] = useState('unsplash')
  const [stockResults, setStockResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [stockPage, setStockPage] = useState(1)

  // Upload state
  const fileRef = useRef<HTMLInputElement>(null)
  const replaceFileRef = useRef<HTMLInputElement>(null)
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; url: string; type: string; size: number }>>([])

  // History search
  const [historySearch, setHistorySearch] = useState('')

  // Suggestions state
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)

  // Properties section toggles
  const [openSection, setOpenSection] = useState<string>('transform')

  const selectedItem = bRollItems.find(b => b.id === selectedBRollId)

  // ====== HANDLERS ======
  const handleGenerateImage = async () => {
    if (!prompt.trim()) return
    setIsGenerating(true)
    setGeneratedImage(null)
    try {
      const stylePrefix = selectedStyle !== 'realistic' ? `${selectedStyle} style: ` : ''
      const fullPrompt = `${stylePrefix}${prompt.trim()}`
      let imageUrl: string

      if (imageModel === 'dall-e-3') {
        const result = await api.generateImage(fullPrompt, selectedAspect)
        imageUrl = result.url
      } else {
        const aspectMap: Record<string, string> = { '1792x1024': '16:9', '1024x1792': '9:16', '1024x1024': '1:1' }
        const result = await api.generateImageGemini(fullPrompt, aspectMap[selectedAspect] || '16:9', imageModel)
        imageUrl = result.imageUrl
      }

      addDalleUsage()
      setGeneratedImage({ url: imageUrl, prompt: prompt.trim() })
      addToast('תמונה נוצרה בהצלחה!', 'success')
    } catch (e: any) {
      addToast(e.message || 'שגיאה ביצירת תמונה. נסה שוב.', 'error')
    }
    setIsGenerating(false)
  }

  const handleConfirmImage = () => {
    if (!generatedImage) return
    addBRollItem({
      id: `broll-${Date.now()}`,
      imageUrl: generatedImage.url,
      startTime: currentTime,
      duration: 5,
      source: 'ai',
      prompt: generatedImage.prompt,
      provider: 'dall-e',
    })
    setGeneratedImage(null)
    setPrompt('')
    addToast('תמונה הוספה לציר הזמן!', 'success')
  }

  const handleGenerateVideo = async () => {
    if (!videoPrompt.trim()) return
    setIsGeneratingVideo(true)
    setVideoStatus('')
    try {
      if (videoProvider === 'veo') {
        // Cost estimate
        const costMap: Record<string, string> = { 'veo-3.1': '~$4.00', 'veo-3.1-fast': '~$2.00', 'veo-3': '~$4.00', 'veo-3-fast': '~$3.20' }
        setVideoStatus(`מייצר סרטון AI... עלות משוערת: ${costMap[videoModel] || '~$4.00'} ⏳`)

        const videoBlob = await api.generateVideoVeo(videoPrompt.trim(), videoAspect, videoResolution, videoModel)
        const blobUrl = URL.createObjectURL(videoBlob)
        addBRollItem({
          id: `broll-${Date.now()}`,
          imageUrl: blobUrl,
          startTime: currentTime,
          duration: 8,
          source: 'video',
          mediaType: 'video',
          prompt: videoPrompt.trim(),
          provider: 'veo',
        })
        setVideoPrompt('')
        addToast('סרטון AI נוצר והתווסף לטיימליין!', 'success')
      } else {
        // Seedance 1.5 Pro via kie.ai
        setVideoStatus('מייצר סרטון AI עם Seedance 1.5 Pro...')
        const videoBlob = await api.generateVideoSeedance(
          videoPrompt.trim(),
          seedanceAspect,
          seedanceDuration,
          seedanceResolution,
          seedanceAudio,
        )
        const blobUrl = URL.createObjectURL(videoBlob)
        addBRollItem({
          id: `broll-${Date.now()}`,
          imageUrl: blobUrl,
          startTime: currentTime,
          duration: Number(seedanceDuration),
          source: 'video',
          mediaType: 'video',
          prompt: videoPrompt.trim(),
          provider: 'seedance',
        })
        setVideoPrompt('')
        addToast('סרטון Seedance נוצר והתווסף לטיימליין!', 'success')
      }
    } catch (e: any) {
      addToast(e.message || 'שגיאה ביצירת סרטון. נסה שוב.', 'error')
    }
    setIsGeneratingVideo(false)
    setVideoStatus('')
  }

  const handleStockSearch = async (page = 1) => {
    if (!stockQuery.trim()) return
    setIsSearching(true)
    try {
      const result = await api.searchStock(stockQuery.trim(), stockSource, page)
      setStockResults(page === 1 ? result.results : [...stockResults, ...result.results])
      setStockPage(page)
    } catch {
      addToast('שגיאה בחיפוש. נסה שוב.', 'error')
    }
    setIsSearching(false)
  }

  const handleAddStockImage = (item: any) => {
    addBRollItem({
      id: `broll-${Date.now()}`,
      imageUrl: item.url,
      startTime: currentTime,
      duration: 5,
      source: 'stock',
      prompt: `${stockQuery} - ${item.photographer}`,
    })
    addToast('תמונה הוספה לציר הזמן!', 'success')
  }

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    const newFiles: typeof uploadedFiles = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const url = URL.createObjectURL(file)
      newFiles.push({ name: file.name, url, type: file.type, size: file.size })
    }
    setUploadedFiles((prev) => [...prev, ...newFiles])
    addToast(`${newFiles.length} קבצים הועלו!`, 'success')
    e.target.value = ''
  }

  const handleAddUploadedFile = (file: typeof uploadedFiles[0]) => {
    const isVideo = file.type.startsWith('video/')
    addBRollItem({
      id: `broll-${Date.now()}`,
      imageUrl: file.url,
      startTime: currentTime,
      duration: 5,
      source: 'upload',
      mediaType: isVideo ? 'video' : 'image',
    })
    addToast('קובץ הוסף לציר הזמן!', 'success')
  }

  const handleReplaceImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedBRollId) return
    const url = URL.createObjectURL(file)
    updateBRollItem(selectedBRollId, { imageUrl: url })
    addToast('המדיה הוחלפה!', 'success')
    e.target.value = ''
  }

  const handleLoadSuggestions = async () => {
    const text = transcript.flatMap(s => s.words).map(w => w.text).join(' ')
    if (!text) { addToast('אין תמלול זמין.', 'error'); return }
    setIsLoadingSuggestions(true)
    try {
      const result = await api.suggestBRoll(text, transcript)
      setSuggestions(result.suggestions || [])
    } catch {
      addToast('שגיאה ביצירת הצעות.', 'error')
    }
    setIsLoadingSuggestions(false)
  }

  const handleGenerateSuggestion = async (s: any) => {
    setIsGenerating(true)
    try {
      const result = await api.generateImage(s.prompt, '1792x1024')
      addDalleUsage()
      addBRollItem({
        id: `broll-${Date.now()}`,
        imageUrl: result.url,
        startTime: s.timestamp,
        duration: s.duration || 5,
        source: 'ai',
        prompt: s.prompt,
        displayMode: s.position || 'fullscreen',
      })
      addToast(`B-Roll נוסף ב-${fmtTime(s.timestamp)}!`, 'success')
    } catch {
      addToast('שגיאה ביצירת תמונה.', 'error')
    }
    setIsGenerating(false)
  }

  const applyTemplate = (template: typeof brollTemplates[0]) => {
    if (!selectedBRollId) {
      addToast('בחר פריט B-Roll תחילה.', 'info')
      return
    }
    updateBRollItem(selectedBRollId, template.preset as Partial<BRollItem>)
    addToast(`תבנית "${template.name}" הוחלה!`, 'success')
  }

  // ====== PROPERTIES PANEL (when item selected) ======
  if (selectedItem) {
    return (
      <div className="flex flex-col h-full glass rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center justify-between p-3 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={() => setSelectedBRollId(null)} className="p-1 hover:bg-white/[0.06] rounded transition-colors text-text-muted hover:text-text-primary">
              <ChevronDown size={14} />
            </button>
            <span className="font-bold text-sm text-text-primary">מאפייני B-Roll</span>
          </div>
          <button onClick={onClose} className="text-xs text-text-muted hover:text-text-primary transition-colors">סגור</button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* Thumbnail */}
          <img src={selectedItem.imageUrl} alt="B-Roll" className="w-full h-20 object-cover rounded-lg" />

          {/* Position Presets */}
          <div className="space-y-1.5">
            <label className="text-xs text-text-muted flex items-center gap-1"><LayoutTemplate size={11} /> מיקום מהיר</label>
            <div className="grid grid-cols-3 gap-1">
              {displayModes.slice(0, 9).map(m => (
                <button key={m.id} onClick={() => updateBRollItem(selectedItem.id, { displayMode: m.id })}
                  className={`py-1 text-[9px] rounded border transition-all ${selectedItem.displayMode === m.id ? 'bg-accent-purple/15 border-accent-purple/40 text-accent-purple' : 'bg-white/[0.04] border-white/[0.06] text-text-muted hover:text-text-secondary'}`}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* === TRANSFORM === */}
          <SectionHeader title="📐 טרנספורם" section="transform" open={openSection} setOpen={setOpenSection} />
          {openSection === 'transform' && (
            <div className="space-y-2 pl-1">
              <div className="grid grid-cols-2 gap-2">
                <NumInput label="X (%)" value={selectedItem.x} onChange={(v) => updateBRollItem(selectedItem.id, { x: v })} min={0} max={100} />
                <NumInput label="Y (%)" value={selectedItem.y} onChange={(v) => updateBRollItem(selectedItem.id, { y: v })} min={0} max={100} />
                <NumInput label="רוחב (%)" value={selectedItem.width} onChange={(v) => updateBRollItem(selectedItem.id, { width: v })} min={5} max={100} />
                <div className="flex items-end gap-1">
                  <div className="flex-1">
                    <NumInput label="גובה (%)" value={selectedItem.height} onChange={(v) => updateBRollItem(selectedItem.id, { height: v })} min={5} max={100} />
                  </div>
                  <button onClick={() => updateBRollItem(selectedItem.id, { lockAspectRatio: !selectedItem.lockAspectRatio })}
                    className={`p-1 rounded mb-0.5 transition-colors ${selectedItem.lockAspectRatio ? 'text-accent-purple bg-accent-purple/10' : 'text-text-muted hover:bg-white/[0.06]'}`}>
                    {selectedItem.lockAspectRatio ? <Lock size={12} /> : <Unlock size={12} />}
                  </button>
                </div>
              </div>
              <SliderInput label="סיבוב" value={selectedItem.rotation} onChange={(v) => updateBRollItem(selectedItem.id, { rotation: v })} min={-360} max={360} unit="°" />
              <div className="flex gap-2">
                <button onClick={() => updateBRollItem(selectedItem.id, { flipH: !selectedItem.flipH })}
                  className={`flex-1 py-1.5 text-[10px] rounded-lg border transition-all flex items-center justify-center gap-1 ${selectedItem.flipH ? 'bg-accent-purple/15 border-accent-purple/40 text-accent-purple' : 'bg-white/[0.04] border-white/[0.06] text-text-muted'}`}>
                  <FlipHorizontal size={10} /> היפוך אופקי
                </button>
                <button onClick={() => updateBRollItem(selectedItem.id, { flipV: !selectedItem.flipV })}
                  className={`flex-1 py-1.5 text-[10px] rounded-lg border transition-all flex items-center justify-center gap-1 ${selectedItem.flipV ? 'bg-accent-purple/15 border-accent-purple/40 text-accent-purple' : 'bg-white/[0.04] border-white/[0.06] text-text-muted'}`}>
                  <FlipVertical size={10} /> היפוך אנכי
                </button>
              </div>
              <button onClick={() => updateBRollItem(selectedItem.id, { x: 0, y: 0, width: 100, height: 100, rotation: 0, flipH: false, flipV: false })}
                className="w-full py-1 text-[10px] bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-lg text-text-muted transition-all">
                <RotateCw size={10} className="inline mr-1" /> איפוס טרנספורם
              </button>
            </div>
          )}

          {/* === APPEARANCE === */}
          <SectionHeader title="🎨 תצוגה" section="appearance" open={openSection} setOpen={setOpenSection} />
          {openSection === 'appearance' && (
            <div className="space-y-2 pl-1">
              <SliderInput label="שקיפות" value={selectedItem.opacity} onChange={(v) => updateBRollItem(selectedItem.id, { opacity: v })} min={0} max={100} unit="%" />
              <SliderInput label="פינות מעוגלות" value={selectedItem.borderRadius} onChange={(v) => updateBRollItem(selectedItem.id, { borderRadius: v })} min={0} max={100} unit="px" />

              <ToggleRow label="מסגרת" value={selectedItem.borderEnabled} onChange={(v) => updateBRollItem(selectedItem.id, { borderEnabled: v })} />
              {selectedItem.borderEnabled && (
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="text-[10px] text-text-muted">צבע</label>
                    <input type="color" value={selectedItem.borderColor} onChange={(e) => updateBRollItem(selectedItem.id, { borderColor: e.target.value })} className="w-full h-6 rounded cursor-pointer" />
                  </div>
                  <div className="flex-1">
                    <SliderInput label="עובי" value={selectedItem.borderWidth} onChange={(v) => updateBRollItem(selectedItem.id, { borderWidth: v })} min={1} max={10} unit="px" />
                  </div>
                </div>
              )}

              <ToggleRow label="צל" value={selectedItem.shadowEnabled} onChange={(v) => updateBRollItem(selectedItem.id, { shadowEnabled: v })} />
              {selectedItem.shadowEnabled && (
                <div className="space-y-1">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] text-text-muted">צבע צל</label>
                      <input type="color" value={selectedItem.shadowColor} onChange={(e) => updateBRollItem(selectedItem.id, { shadowColor: e.target.value })} className="w-full h-5 rounded cursor-pointer" />
                    </div>
                  </div>
                  <SliderInput label="טשטוש" value={selectedItem.shadowBlur} onChange={(v) => updateBRollItem(selectedItem.id, { shadowBlur: v })} min={0} max={50} unit="px" />
                  <div className="grid grid-cols-2 gap-2">
                    <SliderInput label="X" value={selectedItem.shadowX} onChange={(v) => updateBRollItem(selectedItem.id, { shadowX: v })} min={-20} max={20} unit="px" />
                    <SliderInput label="Y" value={selectedItem.shadowY} onChange={(v) => updateBRollItem(selectedItem.id, { shadowY: v })} min={-20} max={20} unit="px" />
                  </div>
                </div>
              )}

              {/* Filters */}
              <div className="pt-1 border-t border-white/[0.06]">
                <label className="text-[10px] text-text-muted font-medium">פילטרים</label>
              </div>
              <SliderInput label="בהירות" value={selectedItem.brightness} onChange={(v) => updateBRollItem(selectedItem.id, { brightness: v })} min={0} max={200} unit="%" />
              <SliderInput label="ניגודיות" value={selectedItem.contrast} onChange={(v) => updateBRollItem(selectedItem.id, { contrast: v })} min={0} max={200} unit="%" />
              <SliderInput label="רוויה" value={selectedItem.saturation} onChange={(v) => updateBRollItem(selectedItem.id, { saturation: v })} min={0} max={200} unit="%" />
              <SliderInput label="טשטוש" value={selectedItem.blur} onChange={(v) => updateBRollItem(selectedItem.id, { blur: v })} min={0} max={20} unit="px" />
              <ToggleRow label="גווני אפור" value={selectedItem.grayscale} onChange={(v) => updateBRollItem(selectedItem.id, { grayscale: v })} />
              <ToggleRow label="ספיה" value={selectedItem.sepia} onChange={(v) => updateBRollItem(selectedItem.id, { sepia: v })} />
              <div>
                <label className="text-[10px] text-text-muted">מצב שכבה</label>
                <select value={selectedItem.blendMode} onChange={(e) => updateBRollItem(selectedItem.id, { blendMode: e.target.value as BRollItem['blendMode'] })}
                  className="w-full px-2 py-1 bg-white/[0.04] rounded-lg border border-white/[0.06] text-xs text-text-primary focus:outline-none cursor-pointer">
                  {blendModes.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select>
              </div>
              {/* Fit */}
              <div className="flex gap-1">
                {fitOptions.map(f => (
                  <button key={f.id} onClick={() => updateBRollItem(selectedItem.id, { objectFit: f.id })}
                    className={`flex-1 py-1.5 text-[10px] rounded-lg border transition-all ${selectedItem.objectFit === f.id ? 'bg-accent-purple/15 border-accent-purple/40 text-accent-purple' : 'bg-white/[0.04] border-white/[0.06] text-text-muted'}`}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* === ANIMATION === */}
          <SectionHeader title="🎬 אנימציה" section="animation" open={openSection} setOpen={setOpenSection} />
          {openSection === 'animation' && (
            <div className="space-y-2 pl-1">
              <div>
                <label className="text-[10px] text-text-muted">כניסה</label>
                <select value={selectedItem.entranceAnimation} onChange={(e) => updateBRollItem(selectedItem.id, { entranceAnimation: e.target.value as BRollItem['entranceAnimation'] })}
                  className="w-full px-2 py-1 bg-white/[0.04] rounded-lg border border-white/[0.06] text-xs text-text-primary focus:outline-none cursor-pointer">
                  {entranceOptions.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-text-muted">לופ (במהלך תצוגה)</label>
                <select value={selectedItem.stayingAnimation} onChange={(e) => updateBRollItem(selectedItem.id, { stayingAnimation: e.target.value as BRollItem['stayingAnimation'] })}
                  className="w-full px-2 py-1 bg-white/[0.04] rounded-lg border border-white/[0.06] text-xs text-text-primary focus:outline-none cursor-pointer">
                  {stayingOptions.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </div>
              {selectedItem.stayingAnimation !== 'none' && (
                <div className="flex gap-1">
                  {(['slow', 'medium', 'fast'] as const).map(s => (
                    <button key={s} onClick={() => updateBRollItem(selectedItem.id, { stayingSpeed: s })}
                      className={`flex-1 py-1 text-[10px] rounded border transition-all ${selectedItem.stayingSpeed === s ? 'bg-accent-purple/15 border-accent-purple/40 text-accent-purple' : 'bg-white/[0.04] border-white/[0.06] text-text-muted'}`}>
                      {s === 'slow' ? 'איטי' : s === 'medium' ? 'בינוני' : 'מהיר'}
                    </button>
                  ))}
                </div>
              )}
              <div>
                <label className="text-[10px] text-text-muted">יציאה</label>
                <select value={selectedItem.exitAnimation} onChange={(e) => updateBRollItem(selectedItem.id, { exitAnimation: e.target.value as BRollItem['exitAnimation'] })}
                  className="w-full px-2 py-1 bg-white/[0.04] rounded-lg border border-white/[0.06] text-xs text-text-primary focus:outline-none cursor-pointer">
                  {exitOptions.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </div>
              <SliderInput label="משך אנימציה" value={selectedItem.animationDuration} onChange={(v) => updateBRollItem(selectedItem.id, { animationDuration: v })} min={0.1} max={3} step={0.1} unit="s" />
              <div>
                <label className="text-[10px] text-text-muted">עקומת תנועה</label>
                <select value={selectedItem.animationEasing} onChange={(e) => updateBRollItem(selectedItem.id, { animationEasing: e.target.value as BRollItem['animationEasing'] })}
                  className="w-full px-2 py-1 bg-white/[0.04] rounded-lg border border-white/[0.06] text-xs text-text-primary focus:outline-none cursor-pointer">
                  {easingOptions.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </div>
              <SliderInput label="השהייה" value={selectedItem.animationDelay} onChange={(v) => updateBRollItem(selectedItem.id, { animationDelay: v })} min={0} max={5} step={0.1} unit="s" />
            </div>
          )}

          {/* === TIMING === */}
          <SectionHeader title="⏱️ תזמון" section="timing" open={openSection} setOpen={setOpenSection} />
          {openSection === 'timing' && (
            <div className="space-y-2 pl-1">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-text-muted">התחלה (שניות)</label>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateBRollItem(selectedItem.id, { startTime: Math.max(0, selectedItem.startTime - 0.5) })} className="p-0.5 bg-white/[0.04] rounded text-text-muted hover:text-text-primary text-xs">-</button>
                    <input type="number" value={Number(selectedItem.startTime.toFixed(1))} onChange={(e) => updateBRollItem(selectedItem.id, { startTime: Math.max(0, Number(e.target.value)) })}
                      className="flex-1 px-2 py-1 bg-white/[0.04] rounded text-xs text-text-primary border border-white/[0.06]" step={0.5} min={0} max={duration} />
                    <button onClick={() => updateBRollItem(selectedItem.id, { startTime: Math.min(duration, selectedItem.startTime + 0.5) })} className="p-0.5 bg-white/[0.04] rounded text-text-muted hover:text-text-primary text-xs">+</button>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-text-muted">סיום (שניות)</label>
                  <input type="number" value={Number((selectedItem.startTime + selectedItem.duration).toFixed(1))}
                    onChange={(e) => updateBRollItem(selectedItem.id, { duration: Math.max(0.5, Number(e.target.value) - selectedItem.startTime) })}
                    className="w-full px-2 py-1 bg-white/[0.04] rounded text-xs text-text-primary border border-white/[0.06]" step={0.5} />
                </div>
              </div>
              <p className="text-[10px] text-text-muted">משך: {selectedItem.duration.toFixed(1)} שניות ({fmtTime(selectedItem.startTime)} - {fmtTime(selectedItem.startTime + selectedItem.duration)})</p>
            </div>
          )}

          {/* === LAYER === */}
          <SectionHeader title="📑 שכבה" section="layer" open={openSection} setOpen={setOpenSection} />
          {openSection === 'layer' && (
            <div className="space-y-2 pl-1">
              <p className="text-[10px] text-text-muted">שכבה {bRollItems.indexOf(selectedItem) + 1} מתוך {bRollItems.length}</p>
              <div className="grid grid-cols-2 gap-1">
                <button onClick={() => bringToFront(selectedItem.id)} className="py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-lg text-[10px] text-text-secondary transition-all">הבא לחזית</button>
                <button onClick={() => sendToBack(selectedItem.id)} className="py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-lg text-[10px] text-text-secondary transition-all">שלח לרקע</button>
                <button onClick={() => moveBRollLayer(selectedItem.id, 'up')} className="py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-lg text-[10px] text-text-secondary transition-all flex items-center justify-center gap-1"><ChevronUp size={10} /> למעלה</button>
                <button onClick={() => moveBRollLayer(selectedItem.id, 'down')} className="py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-lg text-[10px] text-text-secondary transition-all flex items-center justify-center gap-1"><ChevronDown size={10} /> למטה</button>
              </div>
            </div>
          )}

          {/* === ACTIONS === */}
          <div className="space-y-2 border-t border-white/[0.06] pt-3">
            <button onClick={() => duplicateBRollItem(selectedItem.id)} className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-lg text-xs text-text-secondary transition-all"><Copy size={12} /> שכפל</button>
            <input ref={replaceFileRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleReplaceImage} />
            <button onClick={() => replaceFileRef.current?.click()} className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-lg text-xs text-text-secondary transition-all"><RefreshCw size={12} /> החלף מדיה</button>
            {selectedItem.source === 'ai' && selectedItem.prompt && (
              <button onClick={() => { setPrompt(selectedItem.prompt || ''); setSelectedBRollId(null); setActiveTab('ai-image') }}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-lg text-xs text-text-secondary transition-all"><Wand2 size={12} /> ערוך פרומפט</button>
            )}
            {selectedItem.source === 'ai' && (
              <button onClick={async () => {
                if (!selectedItem.prompt) return
                setIsGenerating(true)
                try {
                  const result = await api.generateImage(selectedItem.prompt, selectedAspect)
                  addDalleUsage()
                  updateBRollItem(selectedItem.id, { imageUrl: result.url })
                  addToast('התמונה נוצרה מחדש!', 'success')
                } catch { addToast('שגיאה ביצירת תמונה.', 'error') }
                setIsGenerating(false)
              }} disabled={isGenerating}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-accent-purple/10 hover:bg-accent-purple/20 border border-accent-purple/20 rounded-lg text-xs text-accent-purple transition-all disabled:opacity-50">
                {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} צור מחדש
              </button>
            )}
            <button onClick={() => { removeBRollItem(selectedItem.id); setSelectedBRollId(null) }}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-xs text-red-400 transition-all"><Trash2 size={12} /> מחק</button>
          </div>
        </div>
      </div>
    )
  }

  // ====== MAIN PANEL WITH TABS ======
  return (
    <div className="flex flex-col h-full glass rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center justify-between p-3 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2">
          <Image size={16} className="text-accent-blue" />
          <span className="font-bold text-sm text-text-primary">B-Roll</span>
        </div>
        <button onClick={onClose} className="text-xs text-text-muted hover:text-text-primary transition-colors">סגור</button>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-white/[0.06] px-1 shrink-0 overflow-x-auto">
        {tabs.map(tab => {
          const Icon = tab.icon
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1 px-2 py-2 text-[10px] whitespace-nowrap border-b-2 transition-all ${activeTab === tab.id ? 'border-accent-purple text-accent-purple' : 'border-transparent text-text-muted hover:text-text-secondary'}`}>
              <Icon size={11} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Templates bar */}
      <div className="px-3 pt-2 shrink-0">
        <button onClick={() => setOpenSection(openSection === 'templates' ? '' : 'templates')}
          className="flex items-center gap-1 text-[10px] text-text-muted hover:text-accent-purple transition-colors">
          <LayoutTemplate size={10} />
          תבניות B-Roll
          {openSection === 'templates' ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </button>
        {openSection === 'templates' && (
          <div className="grid grid-cols-2 gap-1 mt-1.5 mb-1">
            {brollTemplates.map(t => (
              <button key={t.id} onClick={() => applyTemplate(t)}
                className="p-1.5 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-accent-purple/30 rounded-lg text-right transition-all">
                <p className="text-[9px] font-medium text-text-secondary">{t.name}</p>
                <p className="text-[8px] text-text-muted">{t.desc}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Smart suggestions */}
      {transcript.length > 0 && (
        <div className="px-3 py-1.5 shrink-0">
          <button onClick={handleLoadSuggestions} disabled={isLoadingSuggestions}
            className="flex items-center gap-1 text-[10px] text-accent-purple hover:text-accent-purple/80 transition-colors">
            {isLoadingSuggestions ? <Loader2 size={10} className="animate-spin" /> : <Zap size={10} />}
            ✨ הצעות חכמות
          </button>
          {suggestions.length > 0 && (
            <div className="mt-1 space-y-1 max-h-32 overflow-y-auto">
              {suggestions.map((s, i) => (
                <div key={i} className="flex items-center gap-1.5 p-1.5 bg-white/[0.03] rounded-lg border border-white/[0.06]">
                  <span className="text-[9px] px-1 py-0.5 bg-accent-purple/10 text-accent-purple rounded">{fmtTime(s.timestamp)}</span>
                  <p className="text-[9px] text-text-muted flex-1 truncate">{s.reason || s.prompt}</p>
                  <button onClick={() => handleGenerateSuggestion(s)} disabled={isGenerating}
                    className="text-[8px] px-1.5 py-0.5 bg-accent-purple/10 text-accent-purple rounded hover:bg-accent-purple/20 transition-colors whitespace-nowrap">
                    צור
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* ====== TAB CONTENT ====== */}

        {/* TAB 1: AI IMAGE */}
        {activeTab === 'ai-image' && (
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-xs text-text-muted">יצירת תמונה עם AI</label>

              {/* Model selector */}
              <div>
                <label className="text-[10px] text-text-muted">מנוע יצירה</label>
                <div className="grid grid-cols-3 gap-1 mt-0.5">
                  <button onClick={() => setImageModel('nano-banana-2')}
                    className={`py-1.5 text-[10px] rounded border transition-all flex flex-col items-center gap-0.5 ${imageModel === 'nano-banana-2' ? 'bg-purple-500/15 border-purple-500/40 text-purple-400' : 'bg-white/[0.04] border-white/[0.06] text-text-muted'}`}>
                    Nano Banana 2
                    <span className="text-[8px] opacity-70">~$0.02</span>
                  </button>
                  <button onClick={() => setImageModel('nano-banana-pro')}
                    className={`py-1.5 text-[10px] rounded border transition-all flex flex-col items-center gap-0.5 ${imageModel === 'nano-banana-pro' ? 'bg-purple-500/15 border-purple-500/40 text-purple-400' : 'bg-white/[0.04] border-white/[0.06] text-text-muted'}`}>
                    Nano Banana Pro
                    <span className="text-[8px] opacity-70">~$0.06</span>
                  </button>
                  <button onClick={() => setImageModel('dall-e-3')}
                    className={`py-1.5 text-[10px] rounded border transition-all flex flex-col items-center gap-0.5 ${imageModel === 'dall-e-3' ? 'bg-purple-500/15 border-purple-500/40 text-purple-400' : 'bg-white/[0.04] border-white/[0.06] text-text-muted'}`}>
                    DALL-E 3
                    <span className="text-[8px] opacity-70">~$0.04</span>
                  </button>
                </div>
              </div>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerateImage() } }}
                placeholder="תאר את התמונה שאתה רוצה..."
                className="w-full px-3 py-2 bg-white/[0.04] rounded-lg border border-white/[0.06] text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-purple/30 resize-none h-16" />

              {/* Example prompts */}
              <div className="flex flex-wrap gap-1">
                {examplePrompts.map((p) => (
                  <button key={p} onClick={() => setPrompt(p)}
                    className="px-2 py-0.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-full text-[9px] text-text-muted hover:text-text-secondary transition-all">{p}</button>
                ))}
              </div>

              {/* Aspect Ratio */}
              <div>
                <label className="text-[10px] text-text-muted">יחס מסך</label>
                <div className="flex gap-1 mt-0.5">
                  {aspectRatios.map(ar => (
                    <button key={ar.id} onClick={() => setSelectedAspect(ar.id)}
                      className={`flex-1 py-1 text-[10px] rounded border transition-all text-center ${selectedAspect === ar.id ? 'bg-accent-purple/15 border-accent-purple/40 text-accent-purple' : 'bg-white/[0.04] border-white/[0.06] text-text-muted'}`}>
                      {ar.label}<br /><span className="text-[8px]">{ar.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Style */}
              <div>
                <label className="text-[10px] text-text-muted">סגנון</label>
                <div className="grid grid-cols-3 gap-1 mt-0.5">
                  {imageStyles.map(s => (
                    <button key={s.id} onClick={() => setSelectedStyle(s.id)}
                      className={`py-1.5 text-[10px] rounded border transition-all ${selectedStyle === s.id ? 'bg-accent-purple/15 border-accent-purple/40 text-accent-purple' : 'bg-white/[0.04] border-white/[0.06] text-text-muted'}`}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={handleGenerateImage} disabled={!prompt.trim() || isGenerating}
                className="w-full py-2 bg-accent-purple hover:bg-accent-purple/90 disabled:opacity-50 rounded-lg text-sm text-white font-medium transition-all flex items-center justify-center gap-2">
                {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                צור תמונה
              </button>
            </div>

            {/* Generated image preview */}
            {generatedImage && (
              <div className="space-y-2 p-2 bg-white/[0.03] rounded-lg border border-white/[0.06]">
                <img src={generatedImage.url} alt="Generated" className="w-full rounded-lg" />
                <div className="flex gap-2">
                  <button onClick={handleConfirmImage} className="flex-1 py-1.5 bg-green-500/15 hover:bg-green-500/25 border border-green-500/30 rounded-lg text-xs text-green-400 transition-all">אשר והוסף</button>
                  <button onClick={handleGenerateImage} className="flex-1 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-lg text-xs text-text-secondary transition-all">צור מחדש</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: AI VIDEO */}
        {activeTab === 'ai-video' && (
          <div className="space-y-3">
            <label className="text-xs text-text-muted">יצירת סרטון AI</label>
            <div className="flex gap-1">
              <button onClick={() => setVideoProvider('veo')}
                className={`flex-1 py-1.5 text-[10px] rounded border transition-all ${videoProvider === 'veo' ? 'bg-accent-purple/15 border-accent-purple/40 text-accent-purple' : 'bg-white/[0.04] border-white/[0.06] text-text-muted'}`}>
                Google Veo (Gemini)
              </button>
              <button onClick={() => setVideoProvider('seedance')}
                className={`flex-1 py-1.5 text-[10px] rounded border transition-all ${videoProvider === 'seedance' ? 'bg-accent-purple/15 border-accent-purple/40 text-accent-purple' : 'bg-white/[0.04] border-white/[0.06] text-text-muted'}`}>
                <span>Seedance 1.5 Pro</span>
                <span className="block text-[8px] opacity-60">ByteDance via kie.ai</span>
              </button>
            </div>

            <textarea value={videoPrompt} onChange={(e) => setVideoPrompt(e.target.value)}
              placeholder="תאר את הסצנה שאתה רוצה ליצור..."
              className="w-full px-3 py-2 bg-white/[0.04] rounded-lg border border-white/[0.06] text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-purple/30 resize-none h-16" />

            {/* Example prompts for video */}
            <div className="flex flex-wrap gap-1">
              {veoPrompts.map((p) => (
                <button key={p} onClick={() => setVideoPrompt(p)}
                  className="px-2 py-0.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-full text-[9px] text-text-muted hover:text-text-secondary transition-all">{p}</button>
              ))}
            </div>

            {videoProvider === 'veo' && (
              <div className="space-y-2">
                {/* Veo Model selector */}
                <div>
                  <label className="text-[10px] text-text-muted">מנוע וידאו</label>
                  <div className="grid grid-cols-2 gap-1 mt-0.5">
                    <button onClick={() => setVideoModel('veo-3.1')}
                      className={`py-1.5 text-[10px] rounded border transition-all flex flex-col items-center gap-0.5 ${videoModel === 'veo-3.1' ? 'bg-accent-purple/15 border-accent-purple/40 text-accent-purple' : 'bg-white/[0.04] border-white/[0.06] text-text-muted'}`}>
                      Veo 3.1
                      <span className="text-[8px] opacity-70">סינמטי, 4K, אודיו</span>
                    </button>
                    <button onClick={() => setVideoModel('veo-3.1-fast')}
                      className={`py-1.5 text-[10px] rounded border transition-all flex flex-col items-center gap-0.5 ${videoModel === 'veo-3.1-fast' ? 'bg-accent-purple/15 border-accent-purple/40 text-accent-purple' : 'bg-white/[0.04] border-white/[0.06] text-text-muted'}`}>
                      Veo 3.1 Fast
                      <span className="text-[8px] opacity-70">מהיר, איכותי</span>
                    </button>
                    <button onClick={() => setVideoModel('veo-3')}
                      className={`py-1.5 text-[10px] rounded border transition-all flex flex-col items-center gap-0.5 ${videoModel === 'veo-3' ? 'bg-accent-purple/15 border-accent-purple/40 text-accent-purple' : 'bg-white/[0.04] border-white/[0.06] text-text-muted'}`}>
                      Veo 3
                      <span className="text-[8px] opacity-70">יציב, אמין</span>
                    </button>
                    <button onClick={() => setVideoModel('veo-3-fast')}
                      className={`py-1.5 text-[10px] rounded border transition-all flex flex-col items-center gap-0.5 ${videoModel === 'veo-3-fast' ? 'bg-accent-purple/15 border-accent-purple/40 text-accent-purple' : 'bg-white/[0.04] border-white/[0.06] text-text-muted'}`}>
                      Veo 3 Fast
                      <span className="text-[8px] opacity-70">הכי מהיר</span>
                    </button>
                  </div>
                </div>

                {/* Aspect Ratio */}
                <div>
                  <label className="text-[10px] text-text-muted">פורמט</label>
                  <div className="flex gap-1 mt-0.5">
                    {[{ id: '16:9', label: '16:9 רוחבי' }, { id: '9:16', label: '9:16 אנכי' }, { id: '1:1', label: '1:1 ריבועי' }].map(ar => (
                      <button key={ar.id} onClick={() => setVideoAspect(ar.id)}
                        className={`flex-1 py-1 text-[10px] rounded border transition-all ${videoAspect === ar.id ? 'bg-accent-purple/15 border-accent-purple/40 text-accent-purple' : 'bg-white/[0.04] border-white/[0.06] text-text-muted'}`}>
                        {ar.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Resolution */}
                <div>
                  <label className="text-[10px] text-text-muted">רזולוציה</label>
                  <div className="flex gap-1 mt-0.5">
                    {[{ id: '720p', label: '720p' }, { id: '1080p', label: '1080p HD' }, { id: '4k', label: '4K' }].map(r => (
                      <button key={r.id} onClick={() => setVideoResolution(r.id)}
                        className={`flex-1 py-1 text-[10px] rounded border transition-all ${videoResolution === r.id ? 'bg-accent-purple/15 border-accent-purple/40 text-accent-purple' : 'bg-white/[0.04] border-white/[0.06] text-text-muted'}`}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cost estimate */}
                <div className="text-[9px] text-text-muted bg-white/[0.03] rounded p-1.5 text-center">
                  עלות משוערת: {videoModel === 'veo-3.1' ? '~$4.00' : videoModel === 'veo-3.1-fast' ? '~$2.00' : videoModel === 'veo-3' ? '~$4.00' : '~$3.20'} | משך: ~8 שניות
                </div>
              </div>
            )}

            {videoProvider === 'seedance' && (
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] text-text-muted">פורמט</label>
                  <div className="flex gap-1 mt-0.5">
                    {[{ id: '9:16', label: '9:16 אנכי' }, { id: '16:9', label: '16:9 רוחבי' }, { id: '1:1', label: '1:1 ריבועי' }, { id: '4:3', label: '4:3' }, { id: '3:4', label: '3:4' }, { id: '21:9', label: '21:9 קולנועי' }].map(ar => (
                      <button key={ar.id} onClick={() => setSeedanceAspect(ar.id)}
                        className={`flex-1 py-1 text-[10px] rounded border transition-all ${seedanceAspect === ar.id ? 'bg-accent-purple/15 border-accent-purple/40 text-accent-purple' : 'bg-white/[0.04] border-white/[0.06] text-text-muted'}`}>
                        {ar.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-text-muted">רזולוציה</label>
                  <div className="flex gap-1 mt-0.5">
                    {[{ id: '480p', label: '480p (מהיר)' }, { id: '720p', label: '720p (מומלץ)' }].map(r => (
                      <button key={r.id} onClick={() => setSeedanceResolution(r.id)}
                        className={`flex-1 py-1 text-[10px] rounded border transition-all ${seedanceResolution === r.id ? 'bg-accent-purple/15 border-accent-purple/40 text-accent-purple' : 'bg-white/[0.04] border-white/[0.06] text-text-muted'}`}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-text-muted">משך</label>
                  <div className="flex gap-1 mt-0.5">
                    {[{ id: '5', label: '5 שניות' }, { id: '8', label: '8 שניות' }].map(d => (
                      <button key={d.id} onClick={() => setSeedanceDuration(d.id)}
                        className={`flex-1 py-1 text-[10px] rounded border transition-all ${seedanceDuration === d.id ? 'bg-accent-purple/15 border-accent-purple/40 text-accent-purple' : 'bg-white/[0.04] border-white/[0.06] text-text-muted'}`}>
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={seedanceAudio} onChange={e => setSeedanceAudio(e.target.checked)}
                    className="rounded border-white/20 bg-white/5" />
                  <span className="text-[10px] text-text-muted">צור אודיו (אפקטי קול + דיבור)</span>
                </label>
                <div className="text-[9px] text-text-muted bg-white/[0.03] rounded p-1.5 text-center">
                  סינמטי + אודיו מקורי | ByteDance via kie.ai
                </div>
              </div>
            )}

            {videoStatus && (
              <div className="text-[10px] text-amber-400 bg-amber-500/10 rounded p-2 text-center">{videoStatus}</div>
            )}

            <button onClick={handleGenerateVideo} disabled={!videoPrompt.trim() || isGeneratingVideo}
              className="w-full py-2 bg-accent-purple hover:bg-accent-purple/90 disabled:opacity-50 rounded-lg text-sm text-white font-medium transition-all flex items-center justify-center gap-2">
              {isGeneratingVideo ? (
                <><Loader2 size={14} className="animate-spin" /> מייצר סרטון AI... (עד 2 דקות)</>
              ) : (
                <><Video size={14} /> צור סרטון (~8 שניות)</>
              )}
            </button>
          </div>
        )}

        {/* TAB 3: STOCK */}
        {activeTab === 'stock' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input value={stockQuery} onChange={(e) => setStockQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleStockSearch()}
                placeholder="חפש תמונה או סרטון..."
                className="flex-1 px-3 py-2 bg-white/[0.04] rounded-lg border border-white/[0.06] text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-purple/30" />
              <button onClick={() => handleStockSearch()} disabled={isSearching}
                className="p-2 bg-accent-purple hover:bg-accent-purple/90 disabled:opacity-50 rounded-lg transition-all">
                {isSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              </button>
            </div>

            <div className="flex gap-1">
              {stockSources.map(s => (
                <button key={s.id} onClick={() => { setStockSource(s.id); if (stockQuery) handleStockSearch() }}
                  className={`flex-1 py-1 text-[9px] rounded border transition-all ${stockSource === s.id ? 'bg-accent-purple/15 border-accent-purple/40 text-accent-purple' : 'bg-white/[0.04] border-white/[0.06] text-text-muted'}`}>
                  {s.label}
                </button>
              ))}
            </div>

            {stockResults.length > 0 && (
              <div className="grid grid-cols-2 gap-1.5">
                {stockResults.map((item) => (
                  <div key={item.id} className="rounded-lg border border-white/[0.06] overflow-hidden hover:border-accent-purple/30 transition-all cursor-pointer group"
                    onClick={() => handleAddStockImage(item)}>
                    <img src={item.thumbUrl} alt="" className="w-full h-20 object-cover" />
                    <div className="p-1">
                      <p className="text-[8px] text-text-muted truncate">{item.photographer}</p>
                      <p className="text-[8px] text-text-muted">{item.resolution}</p>
                    </div>
                    <div className="absolute inset-0 bg-accent-purple/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-[10px] text-white bg-accent-purple px-2 py-0.5 rounded">הוסף</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {stockResults.length > 0 && (
              <button onClick={() => handleStockSearch(stockPage + 1)}
                className="w-full py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-lg text-xs text-text-secondary transition-all">
                טען עוד
              </button>
            )}

            {stockResults.length === 0 && !isSearching && (
              <div className="py-6 text-center text-text-muted text-xs">
                <Search size={24} className="mx-auto mb-2 opacity-30" />
                <p>חפש תמונות חינם</p>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: UPLOAD */}
        {activeTab === 'upload' && (
          <div className="space-y-3">
            <input ref={fileRef} type="file" accept="image/*,video/*,.gif,.webp,.webm,.mov" multiple className="hidden" onChange={handleUpload} />
            <button onClick={() => fileRef.current?.click()}
              className="w-full py-8 bg-white/[0.03] hover:bg-white/[0.06] border-2 border-dashed border-white/[0.12] hover:border-accent-purple/30 rounded-xl text-text-secondary transition-all flex flex-col items-center gap-2"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                if (e.dataTransfer.files.length > 0) {
                  const dt = new DataTransfer()
                  for (let i = 0; i < e.dataTransfer.files.length; i++) dt.items.add(e.dataTransfer.files[i])
                  const fakeEvt = { target: { files: dt.files, value: '' } } as any
                  handleUpload(fakeEvt)
                }
              }}>
              <Upload size={24} className="text-text-muted" />
              <span className="text-xs">גרור קבצים לכאן או לחץ לבחירה</span>
              <span className="text-[9px] text-text-muted">JPG, PNG, WebP, GIF, MP4, MOV, WebM</span>
            </button>

            {uploadedFiles.length > 0 && (
              <div className="grid grid-cols-2 gap-1.5">
                {uploadedFiles.map((file, i) => (
                  <div key={i} className="rounded-lg border border-white/[0.06] overflow-hidden hover:border-accent-purple/30 transition-all cursor-pointer"
                    onClick={() => handleAddUploadedFile(file)}>
                    {file.type.startsWith('video/') ? (
                      <div className="w-full h-20 bg-white/[0.03] flex items-center justify-center"><Film size={20} className="text-text-muted" /></div>
                    ) : (
                      <img src={file.url} alt="" className="w-full h-20 object-cover" />
                    )}
                    <div className="p-1">
                      <p className="text-[8px] text-text-muted truncate">{file.name}</p>
                      <p className="text-[8px] text-text-muted">{(file.size / 1024 / 1024).toFixed(1)}MB</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: HISTORY */}
        {activeTab === 'history' && (
          <div className="space-y-3">
            <input value={historySearch} onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="חפש בהיסטוריה..."
              className="w-full px-3 py-2 bg-white/[0.04] rounded-lg border border-white/[0.06] text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-purple/30" />

            {bRollHistory.length === 0 && (
              <div className="py-6 text-center text-text-muted text-xs">
                <History size={24} className="mx-auto mb-2 opacity-30" />
                <p>אין היסטוריה עדיין</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-1.5">
              {bRollHistory
                .filter(h => !historySearch || (h.prompt || '').includes(historySearch))
                .map((item) => (
                  <div key={item.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/x-broll-item', JSON.stringify({
                        imageUrl: item.imageUrl,
                        source: item.source,
                        prompt: item.prompt,
                        duration: 5,
                      }))
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                    className="rounded-lg border border-white/[0.06] overflow-hidden hover:border-accent-purple/30 transition-all group relative cursor-grab active:cursor-grabbing">
                    <img src={item.imageUrl} alt="" className="w-full h-20 object-cover cursor-pointer" draggable={false}
                      onClick={() => {
                        addBRollItem({
                          id: `broll-${Date.now()}`,
                          imageUrl: item.imageUrl,
                          startTime: currentTime,
                          duration: 5,
                          source: item.source,
                          prompt: item.prompt,
                        })
                        addToast('הוסף מההיסטוריה!', 'success')
                      }} />
                    <div className="p-1">
                      {item.prompt && <p className="text-[8px] text-text-muted truncate">{item.prompt}</p>}
                      <p className="text-[8px] text-text-muted">{new Date(item.createdAt).toLocaleDateString('he-IL')}</p>
                    </div>
                    <button onClick={() => removeBRollHistoryItem(item.id)}
                      className="absolute top-1 left-1 p-0.5 bg-black/50 rounded opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-300">
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* B-Roll items list (always shown below tabs) */}
        {bRollItems.length > 0 && (
          <div className="border-t border-white/[0.06] pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-text-muted flex items-center gap-1"><Layers size={11} /> פריטים בציר הזמן ({bRollItems.length})</label>
            </div>
            {bRollItems.map((item) => (
              <div key={item.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-broll-item', JSON.stringify({
                    imageUrl: item.imageUrl,
                    source: item.source,
                    prompt: item.prompt,
                    duration: item.duration,
                  }))
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                className={`rounded-xl border overflow-hidden cursor-grab transition-all active:cursor-grabbing ${selectedBRollId === item.id ? 'border-accent-purple/50 bg-accent-purple/5' : 'border-white/[0.06] hover:border-white/[0.12]'}`}
                onClick={() => setSelectedBRollId(item.id)}>
                <img src={item.imageUrl} alt={item.prompt || 'B-Roll'} className="w-full h-16 object-cover pointer-events-none" />
                <div className="p-1.5 space-y-0.5">
                  {item.prompt && <p className="text-[9px] text-text-muted truncate">{item.prompt}</p>}
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] text-text-muted">{fmtTime(item.startTime)} - {fmtTime(item.startTime + item.duration)}</p>
                    <div className="flex items-center gap-0.5">
                      <button onClick={(e) => { e.stopPropagation(); duplicateBRollItem(item.id) }} className="p-0.5 text-text-muted hover:text-accent-purple rounded transition-colors" title="שכפל"><Copy size={9} /></button>
                      <button onClick={(e) => { e.stopPropagation(); removeBRollItem(item.id) }} className="p-0.5 text-text-muted hover:text-red-400 rounded transition-colors" title="מחק"><Trash2 size={9} /></button>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <span className="text-[8px] px-1 py-0.5 rounded bg-white/[0.04] text-text-muted">
                      {displayModes.find(m => m.id === item.displayMode)?.label || 'מסך מלא'}
                    </span>
                    {item.source === 'ai' && <span className="text-[8px] px-1 py-0.5 rounded bg-accent-purple/10 text-accent-purple">AI</span>}
                    {item.source === 'stock' && <span className="text-[8px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-400">סטוק</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {bRollItems.length === 0 && activeTab === 'ai-image' && !generatedImage && (
          <div className="py-4 text-center text-text-muted text-xs">
            <Image size={24} className="mx-auto mb-2 opacity-30" />
            <p>אין תמונות B-Roll עדיין</p>
            <p className="mt-1">צור תמונה עם AI או העלה מהמחשב</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ====== HELPER COMPONENTS ======

function SectionHeader({ title, section, open, setOpen }: { title: string; section: string; open: string; setOpen: (s: string) => void }) {
  return (
    <button onClick={() => setOpen(open === section ? '' : section)}
      className="w-full flex items-center justify-between py-1.5 border-t border-white/[0.06] text-xs text-text-secondary hover:text-text-primary transition-colors">
      <span>{title}</span>
      {open === section ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
    </button>
  )
}

function SliderInput({ label, value, onChange, min, max, step, unit }: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; unit?: string
}) {
  return (
    <div>
      <label className="text-[10px] text-text-muted">{label} ({value}{unit || ''})</label>
      <input type="range" min={min} max={max} step={step || 1} value={value}
        onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-accent-purple h-1" />
    </div>
  )
}

function NumInput({ label, value, onChange, min, max }: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number
}) {
  return (
    <div>
      <label className="text-[10px] text-text-muted">{label}</label>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="w-full px-2 py-1 bg-white/[0.04] rounded text-xs text-text-primary border border-white/[0.06]" min={min} max={max} />
    </div>
  )
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-text-muted">{label}</span>
      <div onClick={() => onChange(!value)}
        className={`w-8 h-4 rounded-full cursor-pointer relative transition-colors ${value ? 'bg-accent-purple' : 'bg-white/[0.12]'}`}>
        <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all ${value ? 'left-0.5' : 'left-[18px]'}`} />
      </div>
    </div>
  )
}
