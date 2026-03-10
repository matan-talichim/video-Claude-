import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Smartphone, GraduationCap, Mic, Megaphone, Video, FileText,
  Clapperboard, Package, ChevronRight, X, Check, Loader2,
  CheckCircle, Circle, Clock, Sparkles, Play, Eye
} from 'lucide-react'
import Modal from '../Modal'
import { useProjectsStore } from '../../stores/projectsStore'
import { useUploadsStore } from '../../stores/uploadsStore'
import { useUIStore } from '../../stores/uiStore'

// ─── Types ──────────────────────────────────────────────

interface LocalFile {
  id: string
  name: string
  size: string
  sizeBytes: number
  type: 'video' | 'audio'
  nativeFile: File
}

interface AutoEditPreferences {
  removeFillers: boolean
  shortenSilences: boolean
  removeRetakes: boolean
  enhanceAudio: boolean
  addCaptions: boolean
  captionLanguage: string
  captionStyle: string
  addSecondLanguage: boolean
  secondLanguage: string
  addBRoll: boolean
  eyeContact: boolean
  centerSpeaker: boolean
  greenScreen: boolean
  greenScreenBg: string
  applyDesignStyle: boolean
  designStyle: string
  reframe: boolean
  reframeRatio: string
  generateChapters: boolean
  generateClips: boolean
  clipCount: number
  generateYoutubeDesc: boolean
  generateSocialPost: boolean
}

interface ProcessingSubStep {
  label: string
  status: 'pending' | 'active' | 'done'
}

interface ProcessingStage {
  label: string
  emoji: string
  subSteps: ProcessingSubStep[]
  status: 'pending' | 'active' | 'done'
}

// ─── Constants ──────────────────────────────────────────

const PURPOSE_CATEGORIES = [
  { id: 'social', label: 'תוכן לרשתות חברתיות', desc: 'TikTok, Reels, Stories', emoji: '📱', icon: Smartphone },
  { id: 'tutorial', label: 'סרטון הדרכה / הסבר', desc: 'הדרכה, קורס, הסבר', emoji: '🎓', icon: GraduationCap },
  { id: 'podcast', label: 'פודקאסט / ראיון', desc: 'עריכת שיחה, ניקוי', emoji: '🎤', icon: Mic },
  { id: 'marketing', label: 'פרסומת / שיווק', desc: 'קידום מוצר, שירות', emoji: '📣', icon: Megaphone },
  { id: 'vlog', label: 'Vlog / יומן', desc: 'סרטון אישי, תיעוד', emoji: '🎥', icon: Video },
  { id: 'summary', label: 'סיכום פגישה / הרצאה', desc: 'קיצור וסיכום ארוע', emoji: '📋', icon: FileText },
  { id: 'professional', label: 'סרטון מקצועי / תדמית', desc: 'תאגידי, עסקי', emoji: '🎬', icon: Clapperboard },
  { id: 'product', label: 'סרטון מוצר', desc: 'הצגת מוצר, E-Commerce', emoji: '📱', icon: Package },
]

const CAPTION_LANGUAGES = [
  { id: 'he', label: 'עברית' },
  { id: 'en', label: 'אנגלית' },
  { id: 'ar', label: 'ערבית' },
  { id: 'ru', label: 'רוסית' },
  { id: 'fr', label: 'צרפתית' },
  { id: 'es', label: 'ספרדית' },
]

const CAPTION_STYLES = [
  { id: 'modern', label: 'מודרני' },
  { id: 'classic', label: 'קלאסי' },
  { id: 'bold', label: 'בולט' },
  { id: 'minimal', label: 'מינימליסטי' },
  { id: 'neon', label: 'ניאון' },
]

const BG_OPTIONS = [
  { id: 'office', label: 'משרד מודרני' },
  { id: 'studio', label: 'סטודיו' },
  { id: 'nature', label: 'טבע' },
  { id: 'abstract', label: 'מופשט' },
]

const DESIGN_STYLES = [
  { id: 'minimal', label: 'מינימליסטי' },
  { id: 'corporate', label: 'תאגידי' },
  { id: 'creative', label: 'יצירתי' },
  { id: 'dynamic', label: 'דינמי' },
  { id: 'elegant', label: 'אלגנטי' },
]

const REFRAME_OPTIONS = [
  { id: '9:16', label: '9:16 TikTok' },
  { id: '1:1', label: '1:1 Instagram' },
  { id: '4:5', label: '4:5 Facebook' },
  { id: '16:9', label: '16:9 YouTube' },
]

const EXAMPLE_CHIPS = [
  'קצר ל-60 שניות',
  'שמור רק חלקים מעניינים',
  'הוסף אנרגיה',
  'סגנון מקצועי ונקי',
  'מותאם לאינסטגרם',
]

const STEP_LABELS = ['מטרה', 'העדפות', 'הנחיות', 'סיכום', 'עיבוד']

const PRESETS: Record<string, Partial<AutoEditPreferences>> = {
  social: {
    removeFillers: true, shortenSilences: true, addCaptions: true,
    captionStyle: 'modern', addBRoll: true, reframe: true, reframeRatio: '9:16',
    generateClips: true, clipCount: 3,
  },
  podcast: {
    removeFillers: true, shortenSilences: true, removeRetakes: true,
    enhanceAudio: true, addCaptions: true, generateChapters: true,
  },
  marketing: {
    removeFillers: true, shortenSilences: true, addCaptions: true,
    addBRoll: true, applyDesignStyle: true, designStyle: 'dynamic',
    generateYoutubeDesc: true,
  },
  summary: {
    removeFillers: true, shortenSilences: true, addCaptions: true,
    generateChapters: true,
  },
  tutorial: {
    removeFillers: true, shortenSilences: true, enhanceAudio: true,
    addCaptions: true, generateChapters: true,
  },
  vlog: {
    removeFillers: true, shortenSilences: true, addCaptions: true,
    captionStyle: 'modern', addBRoll: true,
  },
  professional: {
    removeFillers: true, shortenSilences: true, enhanceAudio: true,
    addCaptions: true, applyDesignStyle: true, designStyle: 'corporate',
    generateYoutubeDesc: true,
  },
  product: {
    removeFillers: true, shortenSilences: true, addCaptions: true,
    addBRoll: true, applyDesignStyle: true, designStyle: 'elegant',
    generateSocialPost: true,
  },
}

const DEFAULT_PREFERENCES: AutoEditPreferences = {
  removeFillers: true,
  shortenSilences: true,
  removeRetakes: false,
  enhanceAudio: true,
  addCaptions: true,
  captionLanguage: 'he',
  captionStyle: 'modern',
  addSecondLanguage: false,
  secondLanguage: 'en',
  addBRoll: false,
  eyeContact: false,
  centerSpeaker: false,
  greenScreen: false,
  greenScreenBg: 'office',
  applyDesignStyle: false,
  designStyle: 'minimal',
  reframe: false,
  reframeRatio: '9:16',
  generateChapters: false,
  generateClips: false,
  clipCount: 3,
  generateYoutubeDesc: false,
  generateSocialPost: false,
}

// ─── Helpers ────────────────────────────────────────────

function getTotalSize(files: LocalFile[]): string {
  const total = files.reduce((acc, f) => acc + f.sizeBytes, 0)
  if (total < 1024 * 1024) return `${(total / 1024).toFixed(0)}KB`
  if (total < 1024 * 1024 * 1024) return `${(total / (1024 * 1024)).toFixed(0)}MB`
  return `${(total / (1024 * 1024 * 1024)).toFixed(1)}GB`
}

function countVideoFiles(files: LocalFile[]): number {
  return files.filter(f => f.type === 'video').length
}

function countAudioFiles(files: LocalFile[]): number {
  return files.filter(f => f.type === 'audio').length
}

function getActivePreferences(prefs: AutoEditPreferences): string[] {
  const actions: string[] = []
  if (prefs.removeFillers) actions.push('הסרת מילות מילוי')
  if (prefs.shortenSilences) actions.push('קיצור שתיקות')
  if (prefs.removeRetakes) actions.push('הסרת חזרות')
  if (prefs.enhanceAudio) actions.push('שיפור אודיו')
  if (prefs.addCaptions) {
    const style = CAPTION_STYLES.find(s => s.id === prefs.captionStyle)?.label || prefs.captionStyle
    const lang = CAPTION_LANGUAGES.find(l => l.id === prefs.captionLanguage)?.label || prefs.captionLanguage
    actions.push(`כתוביות ${style} ב${lang}`)
  }
  if (prefs.addSecondLanguage) {
    const lang = CAPTION_LANGUAGES.find(l => l.id === prefs.secondLanguage)?.label || prefs.secondLanguage
    actions.push(`כתוביות ב${lang}`)
  }
  if (prefs.addBRoll) actions.push('B-Roll אוטומטי')
  if (prefs.eyeContact) actions.push('הפעלת קשר עין')
  if (prefs.centerSpeaker) actions.push('מרכוז דובר')
  if (prefs.greenScreen) {
    const bg = BG_OPTIONS.find(b => b.id === prefs.greenScreenBg)?.label || prefs.greenScreenBg
    actions.push(`החלפת רקע - ${bg}`)
  }
  if (prefs.applyDesignStyle) {
    const style = DESIGN_STYLES.find(s => s.id === prefs.designStyle)?.label || prefs.designStyle
    actions.push(`סגנון עיצובי ${style}`)
  }
  if (prefs.reframe) {
    const ratio = REFRAME_OPTIONS.find(r => r.id === prefs.reframeRatio)?.label || prefs.reframeRatio
    actions.push(`מסגור ${ratio}`)
  }
  if (prefs.generateChapters) actions.push('פרקים אוטומטיים')
  if (prefs.generateClips) actions.push(`${prefs.clipCount} קליפים קצרים`)
  if (prefs.generateYoutubeDesc) actions.push('תיאור ליוטיוב')
  if (prefs.generateSocialPost) actions.push('פוסט לרשתות חברתיות')
  return actions
}

// ─── Sub-Components ─────────────────────────────────────

function Checkbox({ checked, onChange, label, description }: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <button
        onClick={() => onChange(!checked)}
        className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
          checked
            ? 'bg-accent-purple border-accent-purple'
            : 'border-white/20 group-hover:border-white/40'
        }`}
      >
        {checked && <Check size={12} className="text-white" />}
      </button>
      <div>
        <span className="text-sm text-text-primary">{label}</span>
        {description && <p className="text-xs text-text-muted mt-0.5">{description}</p>}
      </div>
    </label>
  )
}

function SelectDropdown({ value, onChange, options, className }: {
  value: string
  onChange: (v: string) => void
  options: { id: string; label: string }[]
  className?: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`px-3 py-1.5 bg-bg-card rounded-lg border border-white/[0.06] text-xs text-text-primary focus:outline-none cursor-pointer ${className || ''}`}
    >
      {options.map((opt) => (
        <option key={opt.id} value={opt.id}>{opt.label}</option>
      ))}
    </select>
  )
}

// ─── Main Component ─────────────────────────────────────

interface AutoEditWizardProps {
  isOpen: boolean
  onClose: () => void
  onBack: () => void
  files: LocalFile[]
  projectName: string
}

export default function AutoEditWizard({ isOpen, onClose, onBack, files, projectName }: AutoEditWizardProps) {
  const navigate = useNavigate()
  const addProject = useProjectsStore((s) => s.addProject)
  const addUploadFile = useUploadsStore((s) => s.addFile)
  const simulateUpload = useUploadsStore((s) => s.simulateUpload)
  const addToast = useUIStore((s) => s.addToast)

  const [step, setStep] = useState(0)
  const [purpose, setPurpose] = useState('')
  const [prefs, setPrefs] = useState<AutoEditPreferences>({ ...DEFAULT_PREFERENCES })
  const [customInstructions, setCustomInstructions] = useState('')
  const [processingStages, setProcessingStages] = useState<ProcessingStage[]>([])
  const [processingProgress, setProcessingProgress] = useState(0)
  const [processingLabel, setProcessingLabel] = useState('')
  const [isComplete, setIsComplete] = useState(false)
  const [completionStats, setCompletionStats] = useState<string[]>([])

  // Apply preset when purpose changes
  useEffect(() => {
    if (purpose && PRESETS[purpose]) {
      setPrefs({ ...DEFAULT_PREFERENCES, ...PRESETS[purpose] })
    }
  }, [purpose])

  const updatePref = <K extends keyof AutoEditPreferences>(key: K, value: AutoEditPreferences[K]) => {
    setPrefs(prev => ({ ...prev, [key]: value }))
  }

  const handleClose = () => {
    setStep(0)
    setPurpose('')
    setPrefs({ ...DEFAULT_PREFERENCES })
    setCustomInstructions('')
    setProcessingStages([])
    setProcessingProgress(0)
    setIsComplete(false)
    onClose()
  }

  // ─── Build processing stages based on preferences ───
  const buildProcessingStages = useCallback((): ProcessingStage[] => {
    const stages: ProcessingStage[] = []

    // Stage 1: Upload & Transcribe (always)
    stages.push({
      label: 'העלאה ותמלול',
      emoji: '📤',
      status: 'pending',
      subSteps: [
        { label: 'מעלה קבצים...', status: 'pending' },
        { label: 'ממיר פורמט...', status: 'pending' },
        { label: 'מתמלל עם Whisper...', status: 'pending' },
        { label: 'מזהה דוברים...', status: 'pending' },
        { label: 'תמלול מוכן!', status: 'pending' },
      ],
    })

    // Stage 2: Cleaning
    const cleaningSteps: ProcessingSubStep[] = []
    if (prefs.removeFillers) {
      cleaningSteps.push({ label: 'מזהה מילות מילוי...', status: 'pending' })
      cleaningSteps.push({ label: 'מסיר מילות מילוי...', status: 'pending' })
    }
    if (prefs.shortenSilences) {
      cleaningSteps.push({ label: 'מזהה שתיקות...', status: 'pending' })
      cleaningSteps.push({ label: 'מקצר שתיקות...', status: 'pending' })
    }
    if (prefs.removeRetakes) {
      cleaningSteps.push({ label: 'מזהה חזרות...', status: 'pending' })
      cleaningSteps.push({ label: 'מסיר חזרות...', status: 'pending' })
    }
    if (prefs.enhanceAudio) {
      cleaningSteps.push({ label: 'משפר אודיו...', status: 'pending' })
    }
    if (cleaningSteps.length > 0) {
      cleaningSteps.push({ label: 'ניקוי הושלם', status: 'pending' })
      stages.push({ label: 'ניקוי', emoji: '🧹', status: 'pending', subSteps: cleaningSteps })
    }

    // Stage 3: Visual
    const visualSteps: ProcessingSubStep[] = []
    if (prefs.addBRoll) visualSteps.push({ label: 'מוסיף B-Roll...', status: 'pending' })
    if (prefs.eyeContact) visualSteps.push({ label: 'מפעיל קשר עין...', status: 'pending' })
    if (prefs.centerSpeaker) visualSteps.push({ label: 'ממרכז דובר...', status: 'pending' })
    if (prefs.greenScreen) visualSteps.push({ label: 'מחליף רקע...', status: 'pending' })
    if (prefs.reframe) visualSteps.push({ label: `ממסגר ל-${prefs.reframeRatio}...`, status: 'pending' })
    if (prefs.applyDesignStyle) visualSteps.push({ label: 'מחיל סגנון עיצובי...', status: 'pending' })
    if (visualSteps.length > 0) {
      visualSteps.push({ label: 'ויזואלי הושלם', status: 'pending' })
      stages.push({ label: 'ויזואלי', emoji: '🎨', status: 'pending', subSteps: visualSteps })
    }

    // Stage 4: Captions
    if (prefs.addCaptions) {
      const captionSteps: ProcessingSubStep[] = [
        { label: `מייצר כתוביות ב${CAPTION_LANGUAGES.find(l => l.id === prefs.captionLanguage)?.label || 'עברית'}...`, status: 'pending' },
      ]
      if (prefs.addSecondLanguage) {
        captionSteps.push({ label: `מייצר כתוביות ב${CAPTION_LANGUAGES.find(l => l.id === prefs.secondLanguage)?.label || 'אנגלית'}...`, status: 'pending' })
      }
      captionSteps.push({ label: 'כתוביות מוכנות', status: 'pending' })
      stages.push({ label: 'כתוביות', emoji: '💬', status: 'pending', subSteps: captionSteps })
    }

    // Stage 5: Content generation
    const contentSteps: ProcessingSubStep[] = []
    if (prefs.generateChapters) contentSteps.push({ label: 'מייצר פרקים...', status: 'pending' })
    if (prefs.generateClips) {
      contentSteps.push({ label: 'מנתח קטעים מעניינים...', status: 'pending' })
      for (let i = 1; i <= prefs.clipCount; i++) {
        contentSteps.push({ label: `יוצר קליפ ${i}...`, status: 'pending' })
      }
      contentSteps.push({ label: 'קליפים מוכנים', status: 'pending' })
    }
    if (prefs.generateYoutubeDesc) contentSteps.push({ label: 'מייצר תיאור ליוטיוב...', status: 'pending' })
    if (prefs.generateSocialPost) contentSteps.push({ label: 'מייצר פוסט לרשתות...', status: 'pending' })
    if (contentSteps.length > 0) {
      stages.push({ label: 'תוכן', emoji: '📝', status: 'pending', subSteps: contentSteps })
    }

    // Stage 6: Finalize (always)
    stages.push({
      label: 'סיום',
      emoji: '🎬',
      status: 'pending',
      subSteps: [
        { label: 'מרכיב סרטון סופי...', status: 'pending' },
        { label: 'הסרטון מוכן!', status: 'pending' },
      ],
    })

    return stages
  }, [prefs])

  // ─── Simulate processing ───
  const startProcessing = useCallback(() => {
    const stages = buildProcessingStages()
    setProcessingStages(stages)
    setProcessingProgress(0)
    setProcessingLabel('')

    // Count total sub-steps for progress
    const totalSubSteps = stages.reduce((acc, s) => acc + s.subSteps.length, 0)
    let completedSubSteps = 0

    const processNextSubStep = (stageIdx: number, subStepIdx: number) => {
      if (stageIdx >= stages.length) {
        // All done
        setProcessingProgress(100)
        setIsComplete(true)

        // Generate completion stats
        const stats: string[] = []
        if (prefs.removeFillers) stats.push('הוסרו 15 מילות מילוי (-45 שניות)')
        if (prefs.shortenSilences) stats.push('קוצרו 8 שתיקות (-23 שניות)')
        if (prefs.removeRetakes) stats.push('הוסרו 3 חזרות (-30 שניות)')
        if (prefs.enhanceAudio) stats.push('אודיו שופר')
        if (prefs.addCaptions) stats.push('נוספו 33 כתוביות')
        if (prefs.addBRoll) stats.push('נוספו 5 תמונות B-Roll')
        if (prefs.reframe) stats.push(`פורמט שונה ל-${prefs.reframeRatio}`)
        if (prefs.generateClips) stats.push(`נוצרו ${prefs.clipCount} קליפים לרשתות`)
        if (prefs.generateChapters) stats.push('נוצרו פרקים אוטומטיים')
        if (prefs.generateYoutubeDesc) stats.push('נוצר תיאור ליוטיוב')
        if (prefs.generateSocialPost) stats.push('נוצר פוסט לרשתות')
        if (prefs.applyDesignStyle) stats.push('הוחל סגנון עיצובי')
        setCompletionStats(stats)
        return
      }

      const stage = stages[stageIdx]
      if (subStepIdx >= stage.subSteps.length) {
        // Move to next stage
        setProcessingStages(prev => prev.map((s, i) =>
          i === stageIdx ? { ...s, status: 'done' } : s
        ))
        processNextSubStep(stageIdx + 1, 0)
        return
      }

      // Mark current stage as active
      setProcessingStages(prev => prev.map((s, i) => {
        if (i === stageIdx) {
          return {
            ...s,
            status: 'active',
            subSteps: s.subSteps.map((ss, j) => {
              if (j < subStepIdx) return { ...ss, status: 'done' as const }
              if (j === subStepIdx) return { ...ss, status: 'active' as const }
              return ss
            }),
          }
        }
        if (i < stageIdx) return { ...s, status: 'done' }
        return s
      }))

      setProcessingLabel(stage.subSteps[subStepIdx].label)
      completedSubSteps++
      setProcessingProgress(Math.round((completedSubSteps / totalSubSteps) * 100))

      // Random delay between 400-1200ms per sub-step
      const delay = 400 + Math.random() * 800
      setTimeout(() => {
        // Mark sub-step as done
        setProcessingStages(prev => prev.map((s, i) => {
          if (i === stageIdx) {
            return {
              ...s,
              subSteps: s.subSteps.map((ss, j) =>
                j === subStepIdx ? { ...ss, status: 'done' as const } : ss
              ),
            }
          }
          return s
        }))
        processNextSubStep(stageIdx, subStepIdx + 1)
      }, delay)
    }

    processNextSubStep(0, 0)
  }, [buildProcessingStages, prefs])

  const handleStartAutoEdit = () => {
    setStep(4)

    // Create project
    const videosData = files.map((file) => ({
      file: file.nativeFile,
      blobUrl: URL.createObjectURL(file.nativeFile),
      mediaType: file.type,
    }))

    const projectId = addProject({
      name: projectName.trim(),
      mediaFile: files[0]?.nativeFile,
      mediaBlobUrl: videosData[0]?.blobUrl,
      mediaType: files[0]?.type,
      source: 'upload',
      videos: videosData,
    })

    // Track uploads
    files.forEach((file) => {
      const uploadId = addUploadFile({
        name: file.name,
        size: file.size,
        sizeBytes: file.sizeBytes,
        type: file.type,
        source: 'upload',
        status: 'waiting',
        progress: 0,
        thumbnailGradient: '',
        projectId,
        file: file.nativeFile,
        blobUrl: URL.createObjectURL(file.nativeFile),
      })
      simulateUpload(uploadId)
    })

    // Store projectId for navigation after completion
    sessionStorage.setItem('autoEditProjectId', projectId)

    startProcessing()
  }

  const handleGoToEditor = () => {
    const projectId = sessionStorage.getItem('autoEditProjectId')
    addToast('העריכה האוטומטית הושלמה! כל העריכות הוחלו.', 'success')
    handleClose()
    if (projectId) {
      navigate(`/editor/${projectId}`)
    }
  }

  const handleViewClips = () => {
    const projectId = sessionStorage.getItem('autoEditProjectId')
    addToast('הקליפים מוכנים!', 'success')
    handleClose()
    if (projectId) {
      navigate(`/editor/${projectId}`)
    }
  }

  const progress = step < 4 ? (step / 4) * 100 : processingProgress

  // ─── Render ───────────────────────────────────────────

  return (
    <Modal isOpen={isOpen} onClose={step === 4 && !isComplete ? () => {} : handleClose} size="full" hideHeader>
      {/* Progress bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-white/[0.06]">
        <div
          className="h-full bg-gradient-to-l from-accent-purple to-accent-blue rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Header */}
      {step < 4 && (
        <div className="flex items-center justify-between mb-6 -mt-1">
          <div className="w-24">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary transition-colors"
              >
                <ChevronRight size={16} />
                חזרה
              </button>
            )}
            {step === 0 && (
              <button
                onClick={onBack}
                className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary transition-colors"
              >
                <ChevronRight size={16} />
                חזרה
              </button>
            )}
          </div>

          <div className="flex flex-col items-center gap-3">
            <h2 className="text-lg font-bold text-text-primary">עריכה אוטומטית</h2>
            <div className="flex items-center gap-2">
              {STEP_LABELS.map((label, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex flex-col items-center gap-1">
                    <button
                      onClick={() => { if (i < step) setStep(i) }}
                      className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                        i === step
                          ? 'bg-accent-purple scale-125 shadow-lg shadow-accent-purple/40'
                          : i < step
                            ? 'bg-accent-purple/60 cursor-pointer hover:bg-accent-purple/80'
                            : 'bg-white/[0.12]'
                      }`}
                    />
                    <span className={`text-[10px] whitespace-nowrap ${
                      i === step ? 'text-text-primary' : 'text-text-muted'
                    }`}>
                      {label}
                    </span>
                  </div>
                  {i < STEP_LABELS.length - 1 && (
                    <div className={`w-8 h-px mt-[-14px] ${i < step ? 'bg-accent-purple/60' : 'bg-white/[0.08]'}`} />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="w-24 flex justify-end">
            <button
              onClick={handleClose}
              className="p-1.5 rounded-lg hover:bg-white/[0.08] transition-colors text-text-muted hover:text-text-primary"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {/* ═══ STEP 0: Video Purpose ═══ */}
      {step === 0 && (
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="text-center">
            <h3 className="text-xl font-bold text-text-primary mb-2">מה מטרת הסרטון?</h3>
            <p className="text-sm text-text-muted">בחר את הקטגוריה המתאימה כדי שנתאים את העריכה</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {PURPOSE_CATEGORIES.map((cat) => {
              const isSelected = purpose === cat.id
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    setPurpose(cat.id)
                    setStep(1)
                  }}
                  className={`p-4 rounded-xl border-2 text-center transition-all hover:-translate-y-0.5 ${
                    isSelected
                      ? 'border-accent-purple bg-accent-purple/10'
                      : 'border-white/[0.06] hover:border-white/[0.15] bg-white/[0.02] hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="text-2xl mb-2">{cat.emoji}</div>
                  <div className="text-sm font-medium text-text-primary mb-1">{cat.label}</div>
                  <div className="text-[11px] text-text-muted">{cat.desc}</div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ═══ STEP 1: Edit Preferences ═══ */}
      {step === 1 && (
        <div className="max-w-3xl mx-auto space-y-6 max-h-[65vh] overflow-y-auto px-1">
          <div className="text-center">
            <h3 className="text-xl font-bold text-text-primary mb-2">מה תרצה שה-AI יעשה?</h3>
            <p className="text-sm text-text-muted">בחר את הפעולות הרצויות (ניתן לשנות)</p>
          </div>

          {/* Audio & Language Cleaning */}
          <div className="bg-bg-card rounded-xl p-4 border border-white/[0.06] space-y-3">
            <h4 className="text-sm font-medium text-text-primary flex items-center gap-2">
              <span className="text-base">🎙️</span> ניקוי אודיו ושפה
            </h4>
            <div className="space-y-2.5 pr-2">
              <Checkbox
                checked={prefs.removeFillers}
                onChange={(v) => updatePref('removeFillers', v)}
                label="הסרת מילות מילוי (אממ, כאילו, נו...)"
              />
              <Checkbox
                checked={prefs.shortenSilences}
                onChange={(v) => updatePref('shortenSilences', v)}
                label="קיצור שתיקות ארוכות"
              />
              <Checkbox
                checked={prefs.removeRetakes}
                onChange={(v) => updatePref('removeRetakes', v)}
                label="הסרת חזרות (משפטים שנאמרו פעמיים)"
              />
              <Checkbox
                checked={prefs.enhanceAudio}
                onChange={(v) => updatePref('enhanceAudio', v)}
                label="שיפור איכות אודיו"
              />
            </div>
          </div>

          {/* Captions */}
          <div className="bg-bg-card rounded-xl p-4 border border-white/[0.06] space-y-3">
            <h4 className="text-sm font-medium text-text-primary flex items-center gap-2">
              <span className="text-base">💬</span> כתוביות
            </h4>
            <div className="space-y-2.5 pr-2">
              <Checkbox
                checked={prefs.addCaptions}
                onChange={(v) => updatePref('addCaptions', v)}
                label="הוספת כתוביות"
              />
              {prefs.addCaptions && (
                <div className="flex items-center gap-3 pr-8">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-muted">שפה:</span>
                    <SelectDropdown
                      value={prefs.captionLanguage}
                      onChange={(v) => updatePref('captionLanguage', v)}
                      options={CAPTION_LANGUAGES}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-muted">סגנון:</span>
                    <SelectDropdown
                      value={prefs.captionStyle}
                      onChange={(v) => updatePref('captionStyle', v)}
                      options={CAPTION_STYLES}
                    />
                  </div>
                </div>
              )}
              <Checkbox
                checked={prefs.addSecondLanguage}
                onChange={(v) => updatePref('addSecondLanguage', v)}
                label="הוספת כתוביות בשפה נוספת"
              />
              {prefs.addSecondLanguage && (
                <div className="flex items-center gap-2 pr-8">
                  <span className="text-xs text-text-muted">שפה:</span>
                  <SelectDropdown
                    value={prefs.secondLanguage}
                    onChange={(v) => updatePref('secondLanguage', v)}
                    options={CAPTION_LANGUAGES.filter(l => l.id !== prefs.captionLanguage)}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Visual */}
          <div className="bg-bg-card rounded-xl p-4 border border-white/[0.06] space-y-3">
            <h4 className="text-sm font-medium text-text-primary flex items-center gap-2">
              <span className="text-base">🎨</span> ויזואלי
            </h4>
            <div className="space-y-2.5 pr-2">
              <Checkbox
                checked={prefs.addBRoll}
                onChange={(v) => updatePref('addBRoll', v)}
                label="הוספת B-Roll אוטומטי"
                description="תמונות AI בנקודות מפתח"
              />
              <Checkbox
                checked={prefs.eyeContact}
                onChange={(v) => updatePref('eyeContact', v)}
                label="הפעלת קשר עין"
              />
              <Checkbox
                checked={prefs.centerSpeaker}
                onChange={(v) => updatePref('centerSpeaker', v)}
                label="מרכוז דובר"
              />
              <Checkbox
                checked={prefs.greenScreen}
                onChange={(v) => updatePref('greenScreen', v)}
                label="החלפת רקע (מסך ירוק)"
              />
              {prefs.greenScreen && (
                <div className="flex items-center gap-2 pr-8">
                  <span className="text-xs text-text-muted">רקע:</span>
                  <SelectDropdown
                    value={prefs.greenScreenBg}
                    onChange={(v) => updatePref('greenScreenBg', v)}
                    options={BG_OPTIONS}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Design */}
          <div className="bg-bg-card rounded-xl p-4 border border-white/[0.06] space-y-3">
            <h4 className="text-sm font-medium text-text-primary flex items-center gap-2">
              <span className="text-base">🎨</span> עיצוב
            </h4>
            <div className="space-y-2.5 pr-2">
              <Checkbox
                checked={prefs.applyDesignStyle}
                onChange={(v) => updatePref('applyDesignStyle', v)}
                label="החלת סגנון עיצובי"
              />
              {prefs.applyDesignStyle && (
                <div className="flex items-center gap-2 pr-8">
                  <span className="text-xs text-text-muted">סגנון:</span>
                  <SelectDropdown
                    value={prefs.designStyle}
                    onChange={(v) => updatePref('designStyle', v)}
                    options={DESIGN_STYLES}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Format */}
          <div className="bg-bg-card rounded-xl p-4 border border-white/[0.06] space-y-3">
            <h4 className="text-sm font-medium text-text-primary flex items-center gap-2">
              <span className="text-base">📐</span> פורמט
            </h4>
            <div className="space-y-2.5 pr-2">
              <Checkbox
                checked={prefs.reframe}
                onChange={(v) => updatePref('reframe', v)}
                label="מסגור מחדש (שינוי יחס)"
              />
              {prefs.reframe && (
                <div className="flex items-center gap-2 pr-8">
                  <span className="text-xs text-text-muted">פורמט:</span>
                  <SelectDropdown
                    value={prefs.reframeRatio}
                    onChange={(v) => updatePref('reframeRatio', v)}
                    options={REFRAME_OPTIONS}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="bg-bg-card rounded-xl p-4 border border-white/[0.06] space-y-3">
            <h4 className="text-sm font-medium text-text-primary flex items-center gap-2">
              <span className="text-base">📝</span> תוכן
            </h4>
            <div className="space-y-2.5 pr-2">
              <Checkbox
                checked={prefs.generateChapters}
                onChange={(v) => updatePref('generateChapters', v)}
                label="יצירת פרקים אוטומטיים"
              />
              <Checkbox
                checked={prefs.generateClips}
                onChange={(v) => updatePref('generateClips', v)}
                label="יצירת קליפים קצרים לרשתות"
              />
              {prefs.generateClips && (
                <div className="flex items-center gap-2 pr-8">
                  <span className="text-xs text-text-muted">כמות:</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={prefs.clipCount}
                    onChange={(e) => updatePref('clipCount', Math.max(1, Math.min(10, parseInt(e.target.value) || 3)))}
                    className="w-16 px-2 py-1 bg-bg-card rounded-lg border border-white/[0.06] text-xs text-text-primary text-center focus:outline-none"
                  />
                </div>
              )}
              <Checkbox
                checked={prefs.generateYoutubeDesc}
                onChange={(v) => updatePref('generateYoutubeDesc', v)}
                label="יצירת תיאור ליוטיוב"
              />
              <Checkbox
                checked={prefs.generateSocialPost}
                onChange={(v) => updatePref('generateSocialPost', v)}
                label="יצירת פוסט לרשתות חברתיות"
              />
            </div>
          </div>

          {/* Next button */}
          <div className="sticky bottom-0 pt-4 pb-2 bg-gradient-to-t from-bg-deepest via-bg-deepest to-transparent">
            <button
              onClick={() => setStep(2)}
              className="w-full px-6 py-3 bg-accent-purple hover:bg-accent-purple/90 rounded-xl text-sm font-medium transition-all shadow-lg shadow-accent-purple/20"
            >
              המשך
            </button>
          </div>
        </div>
      )}

      {/* ═══ STEP 2: Custom Instructions ═══ */}
      {step === 2 && (
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="text-center">
            <h3 className="text-xl font-bold text-text-primary mb-2">הוראות נוספות (אופציונלי)</h3>
            <p className="text-sm text-text-muted">הוסף הנחיות ספציפיות לעריכה</p>
          </div>

          <textarea
            value={customInstructions}
            onChange={(e) => setCustomInstructions(e.target.value)}
            placeholder="הוסף הנחיות ספציפיות לעריכה. לדוגמה: 'שמור רק את החלקים שבהם מדברים על המוצר', 'קצר את הסרטון ל-60 שניות', 'הוסף אנרגיה וקצב מהיר'..."
            className="w-full h-36 px-4 py-3 bg-bg-card rounded-xl border border-white/[0.06] text-text-primary text-sm placeholder-text-muted focus:outline-none focus:border-accent-purple/30 resize-none"
          />

          <div>
            <p className="text-xs text-text-muted mb-2">דוגמאות:</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_CHIPS.map((chip) => (
                <button
                  key={chip}
                  onClick={() => setCustomInstructions(prev => prev ? `${prev}, ${chip}` : chip)}
                  className="px-3 py-1.5 rounded-full text-xs bg-white/[0.04] text-text-secondary border border-white/[0.06] hover:bg-accent-purple/10 hover:text-accent-purple hover:border-accent-purple/20 transition-all"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setStep(3)}
            className="w-full px-6 py-3 bg-accent-purple hover:bg-accent-purple/90 rounded-xl text-sm font-medium transition-all shadow-lg shadow-accent-purple/20"
          >
            המשך לסיכום
          </button>
        </div>
      )}

      {/* ═══ STEP 3: Review Summary ═══ */}
      {step === 3 && (
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="text-center">
            <h3 className="text-xl font-bold text-text-primary mb-2">סיכום העריכה האוטומטית</h3>
            <p className="text-sm text-text-muted">בדוק את ההגדרות לפני שמתחילים</p>
          </div>

          <div className="bg-bg-card rounded-xl p-5 border border-white/[0.06] space-y-4">
            {/* Files info */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-muted">קבצים:</span>
              <span className="text-sm text-text-primary">
                {countVideoFiles(files) > 0 && `${countVideoFiles(files)} סרטונים`}
                {countVideoFiles(files) > 0 && countAudioFiles(files) > 0 && ', '}
                {countAudioFiles(files) > 0 && `${countAudioFiles(files)} אודיו`}
                {' '}({getTotalSize(files)})
              </span>
            </div>

            {/* Purpose */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-muted">מטרה:</span>
              <span className="text-sm text-text-primary">
                {PURPOSE_CATEGORIES.find(c => c.id === purpose)?.label || purpose}
              </span>
            </div>

            <div className="border-t border-white/[0.06] pt-4">
              <h4 className="text-sm font-medium text-text-primary mb-3">פעולות שיבוצעו:</h4>
              <div className="space-y-2">
                {getActivePreferences(prefs).map((action, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-text-secondary">
                    <Check size={14} className="text-success shrink-0" />
                    {action}
                  </div>
                ))}
              </div>
            </div>

            {customInstructions && (
              <div className="border-t border-white/[0.06] pt-4">
                <h4 className="text-sm font-medium text-text-primary mb-2">הנחיות:</h4>
                <p className="text-sm text-text-muted bg-white/[0.02] rounded-lg p-3 border border-white/[0.04]">
                  "{customInstructions}"
                </p>
              </div>
            )}

            <div className="border-t border-white/[0.06] pt-4 flex items-center justify-between text-xs text-text-muted">
              <div className="flex items-center gap-1">
                <Clock size={12} />
                זמן עריכה משוער: ~3-5 דקות
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setStep(2)}
              className="px-6 py-3 text-sm text-text-muted hover:text-text-primary transition-colors"
            >
              ← חזור
            </button>
            <button
              onClick={handleStartAutoEdit}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-accent-purple hover:bg-accent-purple/90 rounded-xl text-sm font-medium transition-all shadow-lg shadow-accent-purple/20"
            >
              <Sparkles size={16} /> התחל עריכה אוטומטית
            </button>
          </div>
        </div>
      )}

      {/* ═══ STEP 4: Processing ═══ */}
      {step === 4 && !isComplete && (
        <div className="max-w-2xl mx-auto py-4">
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-accent-purple/10 flex items-center justify-center">
              <Loader2 size={28} className="text-accent-purple animate-spin" />
            </div>
            <h3 className="text-xl font-bold text-text-primary mb-1">עורך את הסרטון שלך...</h3>
            <p className="text-sm text-text-muted">זה ייקח כמה דקות</p>
          </div>

          <div className="space-y-4 max-h-[50vh] overflow-y-auto px-1">
            {processingStages.map((stage, stageIdx) => (
              <div key={stageIdx} className={`rounded-xl border transition-all ${
                stage.status === 'active'
                  ? 'border-accent-purple/30 bg-accent-purple/5'
                  : stage.status === 'done'
                    ? 'border-success/20 bg-success/5'
                    : 'border-white/[0.06] bg-white/[0.01] opacity-50'
              }`}>
                {/* Stage header */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="text-lg">{stage.emoji}</span>
                  <span className={`text-sm font-medium flex-1 ${
                    stage.status === 'active' ? 'text-text-primary' :
                    stage.status === 'done' ? 'text-text-secondary' : 'text-text-muted'
                  }`}>
                    שלב {stageIdx + 1}: {stage.label}
                  </span>
                  {stage.status === 'done' && <CheckCircle size={16} className="text-success" />}
                  {stage.status === 'active' && <Loader2 size={16} className="text-accent-purple animate-spin" />}
                </div>

                {/* Sub-steps */}
                {(stage.status === 'active' || stage.status === 'done') && (
                  <div className="px-4 pb-3 pr-12 space-y-1.5">
                    {stage.subSteps.map((sub, subIdx) => (
                      <div key={subIdx} className="flex items-center gap-2 text-xs">
                        {sub.status === 'done' ? (
                          <Check size={12} className="text-success shrink-0" />
                        ) : sub.status === 'active' ? (
                          <Loader2 size={12} className="text-accent-purple animate-spin shrink-0" />
                        ) : (
                          <Circle size={12} className="text-text-muted/30 shrink-0" />
                        )}
                        <span className={
                          sub.status === 'done' ? 'text-text-secondary' :
                          sub.status === 'active' ? 'text-text-primary' : 'text-text-muted'
                        }>
                          {sub.label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div className="mt-6">
            <div className="h-2.5 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-l from-accent-purple to-accent-blue rounded-full transition-all duration-500"
                style={{ width: `${processingProgress}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-text-muted">{processingLabel}</span>
              <span className="text-xs text-text-muted font-mono">{processingProgress}%</span>
            </div>
          </div>
        </div>
      )}

      {/* ═══ STEP 4 (Complete): Results ═══ */}
      {step === 4 && isComplete && (
        <div className="max-w-2xl mx-auto py-4 text-center">
          <div className="text-5xl mb-4 animate-bounce">🎉</div>
          <h3 className="text-2xl font-bold text-text-primary mb-2">העריכה האוטומטית הושלמה!</h3>
          <p className="text-sm text-text-muted mb-8">כל העריכות הוחלו על הסרטון</p>

          <div className="bg-bg-card rounded-xl p-5 border border-white/[0.06] text-right space-y-3 mb-8">
            <h4 className="text-sm font-medium text-text-primary">מה נעשה:</h4>
            {completionStats.map((stat, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-text-secondary">
                <Check size={14} className="text-success shrink-0" />
                {stat}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center gap-3">
            {prefs.generateClips && (
              <button
                onClick={handleViewClips}
                className="flex items-center gap-2 px-5 py-2.5 bg-white/[0.06] hover:bg-white/[0.1] rounded-xl text-sm text-text-secondary transition-colors border border-white/[0.06]"
              >
                <Play size={16} /> צפה בקליפים
              </button>
            )}
            <button
              onClick={handleGoToEditor}
              className="flex items-center gap-2 px-6 py-3 bg-accent-purple hover:bg-accent-purple/90 rounded-xl text-sm font-medium transition-all shadow-lg shadow-accent-purple/20"
            >
              <Eye size={16} /> המשך לעורך
            </button>
          </div>

          <p className="text-xs text-text-muted mt-6">
            ניתן לערוך ולשנות כל דבר בעורך. כל הפעולות ניתנות לביטול (Cmd+Z)
          </p>
        </div>
      )}
    </Modal>
  )
}
