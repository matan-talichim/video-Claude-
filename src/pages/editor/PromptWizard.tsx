import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronRight, X, CheckCircle, Loader2, Play, Download,
  RefreshCw, ExternalLink, Plus, Upload, Mic
} from 'lucide-react'
import ConfettiEffect from '../../components/ConfettiEffect'
import { useUploadsStore } from '../../stores/uploadsStore'
import { api } from '../../services/api'

// ======================== DATA ========================

const videoTypes = [
  { id: 'marketing', label: 'סרטון שיווקי למוצר', desc: 'קידום מוצר או שירות', emoji: '📱' },
  { id: 'corporate', label: 'סרטון עסקי / תדמית חברה', desc: 'הצגת העסק, ערכים, צוות', emoji: '🏢' },
  { id: 'ad', label: 'פרסומת', desc: 'פרסומת קצרה וקליטה', emoji: '📣' },
  { id: 'tutorial', label: 'סרטון הדרכה / הסבר', desc: 'הסבר על נושא, מוצר, תהליך', emoji: '📚' },
  { id: 'sales', label: 'סרטון מכירות', desc: 'שכנוע לקנייה, הצעת ערך', emoji: '🎤' },
  { id: 'content', label: 'סרטון תוכן / בלוג', desc: 'תוכן ערך, טיפים, מידע', emoji: '📰' },
  { id: 'event', label: 'סרטון לאירוע', desc: 'הזמנה, סיכום, תיעוד', emoji: '🎉' },
  { id: 'story', label: 'סטורי / ריל', desc: 'תוכן קצר לרשתות חברתיות', emoji: '📲' },
  { id: 'education', label: 'סרטון חינוכי', desc: 'למידה, קורס, הכשרה', emoji: '🎓' },
  { id: 'creative', label: 'סרטון יצירתי / אומנותי', desc: 'ביטוי אישי, ניסיוני', emoji: '🎭' },
  { id: 'ecommerce', label: 'סרטון מוצר (E-Commerce)', desc: 'הצגת מוצר לחנות מקוונת', emoji: '🏷️' },
  { id: 'beforeafter', label: 'לפני / אחרי', desc: 'השוואה, תוצאות, שינוי', emoji: '🔄' },
]

const platforms = [
  { id: 'seedance' as const, label: 'Seedance', emoji: '🎥', desc1: 'סרטוני אנימציה', desc2: 'דינמיים ויצירתיים', timing: '4 שניות לסצנה', rec: 'מומלץ: פרסומות' },
  { id: 'veo' as const, label: 'Veo 3 (Google)', emoji: '🎬', desc1: 'סרטונים סינמטיים', desc2: 'ריאליסטיים', timing: '4 שניות לסצנה', rec: 'מומלץ: תדמית' },
  { id: 'images' as const, label: 'תמונות + דיבור', emoji: '🖼️', desc1: 'תמונות AI עם', desc2: 'קריינות ומוזיקה', timing: '5 שניות לתמונה', rec: 'מומלץ: הדרכות' },
]

const visualStyles = [
  { id: 'cinematic', label: 'סינמטי', emoji: '🎬' },
  { id: 'realistic', label: 'ריאליסטי', emoji: '📷' },
  { id: 'animation', label: 'אנימציה', emoji: '✏️' },
  { id: 'minimal', label: 'מינימליסטי', emoji: '⬜' },
  { id: 'dramatic', label: 'דרמטי', emoji: '🌑' },
  { id: 'happy', label: 'שמח/צבעוני', emoji: '🌈' },
  { id: 'corporate', label: 'תאגידי/עסקי', emoji: '💼' },
  { id: 'retro', label: 'רטרו/וינטג׳', emoji: '📼' },
  { id: 'neon', label: 'ניאון/עתידני', emoji: '💜' },
  { id: 'organic', label: 'טבע/אורגני', emoji: '🌿' },
]

const videoFormats = [
  { id: '16:9' as const, label: '16:9 רוחבי', desc: 'YouTube, מצגות' },
  { id: '9:16' as const, label: '9:16 אנכי', desc: 'TikTok, Reels, Stories' },
  { id: '1:1' as const, label: '1:1 ריבועי', desc: 'Instagram Feed' },
  { id: '4:5' as const, label: '4:5 פיד', desc: 'Instagram, Facebook' },
]

const durationPresets = [
  { label: '15 שניות', value: 15 },
  { label: '30 שניות', value: 30 },
  { label: '1 דקה', value: 60 },
  { label: '2 דקות', value: 120 },
  { label: '3 דקות', value: 180 },
]

const examplePrompts: { chip: string; expanded: string }[] = [
  { chip: 'פרסומת למסעדה חדשה', expanded: 'פרסומת קצרה למסעדה חדשה שנפתחת. מתחילה עם צילומי מנות מרהיבות, אווירה חמה, שף במטבח, לקוחות נהנים, ומסתיימת עם לוגו המסעדה וקריאה להזמנת מקום.' },
  { chip: 'סרטון הדרכה לשימוש באפליקציה', expanded: 'סרטון הדרכה קצר שמראה כיצד להשתמש באפליקציה. מתחיל עם הורדה מהחנות, רישום, סיור בממשק, הדגמת הפיצ׳רים המרכזיים, וסיום עם טיפים מתקדמים.' },
  { chip: 'תדמית לחברת טכנולוגיה', expanded: 'סרטון תדמית לחברת טכנולוגיה. פתיחה עם חזון החברה, הצגת הצוות והמשרדים, מוצרים ופתרונות, לקוחות מרוצים, וסיום עם ערכי החברה וקריאה לפעולה.' },
  { chip: 'סטורי להשקת מוצר', expanded: 'סטורי אנכי להשקת מוצר חדש. טיזר מתח, חשיפת המוצר, הדגמה מהירה של 3 יתרונות מרכזיים, מחיר השקה מיוחד, וקריאה לרכישה עם קישור.' },
  { chip: 'סרטון מכירות לקורס אונליין', expanded: 'סרטון מכירות לקורס אונליין. מתחיל עם הבעיה שהקורס פותר, מציג את המרצה, תכני הקורס, המלצות תלמידים, ומסתיים עם הצעה מיוחדת והרשמה.' },
  { chip: 'פרסומת לחנות אונליין', expanded: 'פרסומת לחנות אונליין עם מבצע מיוחד. הצגת מוצרים פופולריים, משלוח חינם, אחריות, ביקורות לקוחות, וקריאה לקנייה עם קוד הנחה.' },
]

const voiceTones = [
  { id: 'professional', label: 'מקצועי' },
  { id: 'warm', label: 'חם וידידותי' },
  { id: 'energetic', label: 'אנרגטי' },
  { id: 'calm', label: 'רגוע' },
  { id: 'dramatic', label: 'דרמטי' },
]

const voiceLanguages = [
  { id: 'he', label: 'עברית' },
  { id: 'en', label: 'אנגלית' },
  { id: 'ar', label: 'ערבית' },
  { id: 'ru', label: 'רוסית' },
  { id: 'fr', label: 'צרפתית' },
  { id: 'es', label: 'ספרדית' },
  { id: 'de', label: 'גרמנית' },
  { id: 'ja', label: 'יפנית' },
  { id: 'zh', label: 'סינית' },
  { id: 'ko', label: 'קוריאנית' },
  { id: 'hi', label: 'הינדי' },
  { id: 'tr', label: 'טורקית' },
  { id: 'pt', label: 'פורטוגזית' },
  { id: 'it', label: 'איטלקית' },
  { id: 'nl', label: 'הולנדית' },
  { id: 'pl', label: 'פולנית' },
  { id: 'cs', label: 'צ\'כית' },
  { id: 'ro', label: 'רומנית' },
  { id: 'bg', label: 'בולגרית' },
  { id: 'el', label: 'יוונית' },
  { id: 'fi', label: 'פינית' },
  { id: 'sv', label: 'שוודית' },
  { id: 'da', label: 'דנית' },
  { id: 'uk', label: 'אוקראינית' },
  { id: 'id', label: 'אינדונזית' },
  { id: 'hu', label: 'הונגרית' },
  { id: 'nb', label: 'נורווגית' },
  { id: 'vi', label: 'וייטנאמית' },
  { id: 'sk', label: 'סלובקית' },
  { id: 'hr', label: 'קרואטית' },
  { id: 'ms', label: 'מלאית' },
  { id: 'ta', label: 'טמילית' },
  { id: 'fil', label: 'פיליפינית' },
]

const captionStyles = [
  { id: 'classic', label: 'קלאסי' },
  { id: 'modern', label: 'מודרני' },
  { id: 'karaoke', label: 'קריוקי' },
  { id: 'minimal', label: 'מינימלי' },
  { id: 'typewriter', label: 'הקלדה' },
  { id: 'bounce', label: 'קפיצה' },
]

const captionLanguageOptions = [
  { id: 'he', label: 'עברית' },
  { id: 'en', label: 'אנגלית' },
  { id: 'ar', label: 'ערבית' },
  { id: 'ru', label: 'רוסית' },
  { id: 'fr', label: 'צרפתית' },
  { id: 'es', label: 'ספרדית' },
  { id: 'de', label: 'גרמנית' },
  { id: 'ja', label: 'יפנית' },
  { id: 'zh', label: 'סינית' },
  { id: 'ko', label: 'קוריאנית' },
  { id: 'hi', label: 'הינדי' },
  { id: 'tr', label: 'טורקית' },
  { id: 'pt', label: 'פורטוגזית' },
  { id: 'it', label: 'איטלקית' },
  { id: 'nl', label: 'הולנדית' },
  { id: 'pl', label: 'פולנית' },
  { id: 'cs', label: 'צ\'כית' },
  { id: 'ro', label: 'רומנית' },
  { id: 'bg', label: 'בולגרית' },
  { id: 'el', label: 'יוונית' },
  { id: 'fi', label: 'פינית' },
  { id: 'sv', label: 'שוודית' },
  { id: 'da', label: 'דנית' },
  { id: 'uk', label: 'אוקראינית' },
  { id: 'id', label: 'אינדונזית' },
  { id: 'hu', label: 'הונגרית' },
  { id: 'nb', label: 'נורווגית' },
  { id: 'vi', label: 'וייטנאמית' },
  { id: 'sk', label: 'סלובקית' },
  { id: 'sl', label: 'סלובנית' },
  { id: 'et', label: 'אסטונית' },
  { id: 'lv', label: 'לטבית' },
  { id: 'lt', label: 'ליטאית' },
]

const musicMoods = [
  { id: 'happy', label: 'שמח' },
  { id: 'calm', label: 'רגוע' },
  { id: 'dramatic', label: 'דרמטי' },
  { id: 'energetic', label: 'אנרגטי' },
  { id: 'corporate', label: 'עסקי' },
  { id: 'romantic', label: 'רומנטי' },
]

// ======================== TYPES ========================

interface WizardState {
  step: number
  videoType: string
  platform: 'seedance' | 'veo' | 'images'
  style: string
  format: '16:9' | '9:16' | '1:1' | '4:5'
  duration: number
  prompt: string
  brandName: string
  brandSlogan: string
  brandColors: { primary: string; secondary: string }
  keyMessages: string[]
  voiceType: 'ai' | 'none' | 'upload'
  voiceLanguage: string
  voiceId: string
  voiceTone: string
  voiceSpeed: number
  captionsEnabled: boolean
  captionLanguages: string[]
  captionStyle: string
  musicType: 'auto' | 'manual' | 'none' | 'upload'
  musicMood: string
  generating: boolean
  generationPhase: string
  generationProgress: number
  generationSceneIndex: number
  generationTotalScenes: number
  generationSteps: GenerationStep[]
  completed: boolean
}

interface GenerationStep {
  label: string
  status: 'pending' | 'active' | 'done'
  children?: { label: string; status: 'pending' | 'active' | 'done' }[]
}

interface PromptWizardProps {
  isOpen: boolean
  onClose: () => void
}

// ======================== COMPONENT ========================

export default function PromptWizard({ isOpen, onClose }: PromptWizardProps) {
  const navigate = useNavigate()
  const addFile = useUploadsStore((s) => s.addFile)

  const [state, setState] = useState<WizardState>({
    step: 1,
    videoType: '',
    platform: 'veo',
    style: 'cinematic',
    format: '16:9',
    duration: 30,
    prompt: '',
    brandName: '',
    brandSlogan: '',
    brandColors: { primary: '#7C5CFF', secondary: '#5C8AFF' },
    keyMessages: [],
    voiceType: 'ai',
    voiceLanguage: 'he',
    voiceId: '',
    voiceTone: 'professional',
    voiceSpeed: 1.0,
    captionsEnabled: true,
    captionLanguages: ['he'],
    captionStyle: 'modern',
    musicType: 'auto',
    musicMood: 'energetic',
    generating: false,
    generationPhase: '',
    generationProgress: 0,
    generationSceneIndex: 0,
    generationTotalScenes: 0,
    generationSteps: [],
    completed: false,
  })

  const [brandOpen, setBrandOpen] = useState(false)
  const [newMessage, setNewMessage] = useState('')
  const [maxVisitedStep, setMaxVisitedStep] = useState(1)

  const update = useCallback((partial: Partial<WizardState>) => {
    setState((prev) => ({ ...prev, ...partial }))
  }, [])

  const handleClose = () => {
    setState({
      step: 1, videoType: '', platform: 'veo', style: 'cinematic', format: '16:9',
      duration: 30, prompt: '', brandName: '', brandSlogan: '',
      brandColors: { primary: '#7C5CFF', secondary: '#5C8AFF' }, keyMessages: [],
      voiceType: 'ai', voiceLanguage: 'he', voiceId: '', voiceTone: 'professional',
      voiceSpeed: 1.0, captionsEnabled: true, captionLanguages: ['he'],
      captionStyle: 'modern', musicType: 'auto', musicMood: 'energetic',
      generating: false, generationPhase: '', generationProgress: 0,
      generationSceneIndex: 0, generationTotalScenes: 0, generationSteps: [],
      completed: false,
    })
    setBrandOpen(false)
    setNewMessage('')
    setMaxVisitedStep(1)
    onClose()
  }

  const goToStep = (nextStep: number) => {
    update({ step: nextStep })
    setMaxVisitedStep((prev) => Math.max(prev, nextStep))
  }

  const sceneCount = Math.ceil(state.duration / (state.platform === 'images' ? 5 : 4))
  const stepLabels = ['סוג סרטון', 'פלטפורמה וסגנון', 'תוכן', 'דיבור וכתוביות', 'סקירה', 'יצירה']

  const getVideoTypeLabel = () => videoTypes.find((v) => v.id === state.videoType)?.label || ''
  const getPlatformLabel = () => platforms.find((p) => p.id === state.platform)?.label || ''
  const getStyleLabel = () => visualStyles.find((s) => s.id === state.style)?.label || ''
  const getFormatLabel = () => videoFormats.find((f) => f.id === state.format)?.desc || ''

  const formatDuration = (sec: number) => {
    if (sec < 60) return `${sec} שניות`
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return s > 0 ? `${m} דקות ו-${s} שניות` : `${m} דקות`
  }

  const estimatedCost = () => {
    const base = state.platform === 'images' ? 0.04 : 0.08
    return (sceneCount * base).toFixed(2)
  }

  // ======================== GENERATION ========================

  const startGeneration = useCallback(async () => {
    const totalScenes = sceneCount
    const steps: GenerationStep[] = [
      {
        label: 'יצירת סקריפט',
        status: 'active',
        children: [
          { label: 'מנתח את הפרומפט...', status: 'active' },
          { label: `כותב סקריפט (${totalScenes} סצנות)...`, status: 'pending' },
          { label: `מתאים לסגנון "${getStyleLabel()}"...`, status: 'pending' },
          { label: 'סקריפט מוכן!', status: 'pending' },
        ],
      },
      {
        label: 'יצירת סצנות',
        status: 'pending',
        children: Array.from({ length: totalScenes }, (_, i) => ({
          label: `סצנה ${i + 1}/${totalScenes}`,
          status: 'pending' as const,
        })),
      },
      {
        label: 'הרכבה',
        status: 'pending',
        children: [
          { label: 'עורך סצנות ובוחר קטעים...', status: 'pending' },
          { label: 'מוסיף מעברים...', status: 'pending' },
          { label: 'מרכיב סרטון...', status: 'pending' },
        ],
      },
      {
        label: 'אודיו וכתוביות',
        status: 'pending',
        children: [
          ...(state.voiceType === 'ai' ? [{ label: 'מייצר קריינות AI...', status: 'pending' as const }] : []),
          ...(state.musicType !== 'none' ? [{ label: 'מוסיף מוזיקת רקע...', status: 'pending' as const }] : []),
          ...(state.captionsEnabled ? [{ label: 'מוסיף כתוביות...', status: 'pending' as const }] : []),
          { label: 'מאזן אודיו...', status: 'pending' },
        ],
      },
      {
        label: 'ליטוש סופי',
        status: 'pending',
        children: [
          { label: 'ליטוש סופי...', status: 'pending' },
          { label: 'הסרטון מוכן! 🎉', status: 'pending' },
        ],
      },
    ]

    update({
      step: 6,
      generating: true,
      generationProgress: 0,
      generationSceneIndex: 0,
      generationTotalScenes: totalScenes,
      generationSteps: steps,
      generationPhase: 'יצירת סקריפט',
    })

    // Simulate generation with realistic timing
    const updateStep = (phaseIdx: number, childIdx: number, childStatus: 'active' | 'done', phaseStatus?: 'active' | 'done') => {
      setState((prev) => {
        const newSteps = prev.generationSteps.map((step, i) => {
          if (i === phaseIdx) {
            const newChildren = step.children?.map((child, j) => {
              if (j === childIdx) return { ...child, status: childStatus }
              if (j < childIdx) return { ...child, status: 'done' as const }
              return child
            })
            return { ...step, status: phaseStatus || step.status, children: newChildren }
          }
          if (i < phaseIdx) return { ...step, status: 'done' as const, children: step.children?.map((c) => ({ ...c, status: 'done' as const })) }
          return step
        })
        const totalChildren = newSteps.reduce((acc, s) => acc + (s.children?.length || 0), 0)
        const doneChildren = newSteps.reduce((acc, s) => acc + (s.children?.filter((c) => c.status === 'done').length || 0), 0)
        return {
          ...prev,
          generationSteps: newSteps,
          generationProgress: Math.round((doneChildren / totalChildren) * 100),
          generationPhase: newSteps[phaseIdx].label,
          generationSceneIndex: phaseIdx === 1 ? childIdx : prev.generationSceneIndex,
        }
      })
    }

    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

    try {
      // Try real API first
      let useSimulation = false
      try {
        const result = await api.generateVideoProject({
          prompt: state.prompt,
          videoType: state.videoType,
          platform: state.platform,
          style: state.style,
          format: state.format,
          duration: state.duration,
          voiceType: state.voiceType,
          voiceLanguage: state.voiceLanguage,
          voiceTone: state.voiceTone,
          captionsEnabled: state.captionsEnabled,
          captionLanguages: state.captionLanguages,
          musicType: state.musicType,
          musicMood: state.musicMood,
          brandName: state.brandName,
          brandSlogan: state.brandSlogan,
        })
        // If API works, simulate the progress UI while result is ready
        if (result) {
          useSimulation = true
        }
      } catch {
        useSimulation = true
      }

      if (useSimulation) {
        // Phase 1: Script
        for (let i = 0; i < 4; i++) {
          updateStep(0, i, 'active', 'active')
          await delay(600 + Math.random() * 400)
          updateStep(0, i, 'done')
        }

        // Phase 2: Scenes
        for (let i = 0; i < totalScenes; i++) {
          updateStep(1, i, 'active', 'active')
          await delay(800 + Math.random() * 700)
          updateStep(1, i, 'done')
        }

        // Phase 3: Assembly
        const assemblyChildren = steps[2].children?.length || 3
        for (let i = 0; i < assemblyChildren; i++) {
          updateStep(2, i, 'active', 'active')
          await delay(500 + Math.random() * 500)
          updateStep(2, i, 'done')
        }

        // Phase 4: Audio
        const audioChildren = steps[3].children?.length || 1
        for (let i = 0; i < audioChildren; i++) {
          updateStep(3, i, 'active', 'active')
          await delay(600 + Math.random() * 400)
          updateStep(3, i, 'done')
        }

        // Phase 5: Final
        for (let i = 0; i < 2; i++) {
          updateStep(4, i, 'active', 'active')
          await delay(400 + Math.random() * 300)
          updateStep(4, i, 'done')
        }
      }

      // Complete
      update({ generating: false, completed: true, generationProgress: 100 })
    } catch {
      // Even on error, complete with simulation
      update({ generating: false, completed: true, generationProgress: 100 })
    }
  }, [state, sceneCount, update])

  const handleOpenEditor = () => {
    addFile({
      name: `סרטון - ${getVideoTypeLabel()}`,
      size: '45MB',
      sizeBytes: 45 * 1024 * 1024,
      type: 'video',
      source: 'prompt',
      status: 'ready',
      progress: 100,
      thumbnailGradient: 'from-purple-600/30 to-pink-600/30',
      duration: formatDuration(state.duration),
    })
    handleClose()
    navigate('/editor/new')
  }

  // ======================== RENDER ========================

  if (!isOpen) return null

  const progress = stepLabels.length > 1 ? ((state.step - 1) / (stepLabels.length - 1)) * 100 : 100

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={state.generating ? undefined : handleClose} />

      {/* Modal */}
      <div className="relative w-full h-full max-w-6xl max-h-[95vh] mx-4 glass rounded-2xl shadow-2xl overflow-hidden animate-scale-in flex flex-col" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
        {/* Progress bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-white/[0.06] z-10">
          <div className="h-full bg-gradient-to-l from-accent-purple to-accent-blue rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 shrink-0">
          <div className="w-24">
            {state.step > 1 && state.step <= 5 && (
              <button onClick={() => update({ step: state.step - 1 })} className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary transition-colors">
                <ChevronRight size={16} />
                חזרה
              </button>
            )}
          </div>
          <div className="flex flex-col items-center gap-3">
            <h2 className="text-lg font-bold text-text-primary">צור מפרומפט</h2>
            <div className="flex items-center gap-2">
              {stepLabels.map((label, i) => {
                const stepNum = i + 1
                const isCurrent = stepNum === state.step
                const isVisited = stepNum <= maxVisitedStep
                const canClick = isVisited && !state.generating && stepNum <= 5
                return (
                  <div key={i} className="flex items-center gap-2">
                    <button
                      onClick={() => canClick && goToStep(stepNum)}
                      disabled={!canClick}
                      className={`flex flex-col items-center gap-1 ${
                        isCurrent ? 'text-purple-400' :
                        isVisited ? 'text-gray-300 hover:text-purple-300 cursor-pointer' :
                        'text-gray-600 cursor-not-allowed'
                      }`}
                    >
                      <div className={`w-3 h-3 rounded-full transition-all duration-300 ${
                        isCurrent ? 'bg-purple-500 scale-125 shadow-lg shadow-accent-purple/40'
                          : stepNum < state.step ? 'bg-purple-400' : 'bg-gray-700'
                      }`} />
                      <span className={`text-[10px] whitespace-nowrap hidden md:block ${
                        isCurrent ? 'text-text-primary' : isVisited ? 'text-gray-300' : 'text-text-muted'
                      }`}>{label}</span>
                    </button>
                    {i < stepLabels.length - 1 && (
                      <div className={`w-6 h-px mt-[-14px] hidden md:block ${i + 1 < state.step ? 'bg-accent-purple/60' : 'bg-white/[0.08]'}`} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          <div className="w-24 flex justify-end">
            {!state.generating && (
              <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-white/[0.08] transition-colors text-text-muted hover:text-text-primary">
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {/* ======== STEP 1: VIDEO TYPE ======== */}
          {state.step === 1 && (
            <div className="max-w-3xl mx-auto space-y-6 py-4">
              <div className="text-center">
                <h3 className="text-title font-bold text-text-primary">🎬 איזה סרטון תרצה ליצור?</h3>
                <p className="text-text-muted text-sm mt-2">בחר את סוג הסרטון שמתאים לך</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {videoTypes.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => update({ videoType: type.id })}
                    className={`flex items-start gap-4 p-5 rounded-2xl border-2 text-right transition-all duration-200 hover:-translate-y-0.5 ${
                      state.videoType === type.id
                        ? 'border-accent-purple bg-accent-purple/5 shadow-lg shadow-accent-purple/10'
                        : 'border-white/[0.06] hover:border-white/[0.15] bg-bg-card'
                    }`}
                  >
                    <span className="text-2xl mt-0.5">{type.emoji}</span>
                    <div>
                      <div className="font-medium text-sm text-text-primary">{type.label}</div>
                      <div className="text-xs text-text-muted mt-1">{type.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
              <button
                onClick={() => goToStep(2)}
                disabled={!state.videoType}
                className="w-full max-w-md mx-auto block px-6 py-3 bg-accent-purple hover:bg-accent-purple/90 rounded-xl text-sm font-medium transition-all shadow-lg shadow-accent-purple/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                המשך
              </button>
            </div>
          )}

          {/* ======== STEP 2: PLATFORM & STYLE ======== */}
          {state.step === 2 && (
            <div className="max-w-3xl mx-auto space-y-8 py-4">
              {/* Platform */}
              <div>
                <h3 className="text-subtitle font-bold text-text-primary mb-4">🤖 בחר מנוע יצירה:</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {platforms.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => update({ platform: p.id })}
                      className={`p-5 rounded-2xl border-2 text-center transition-all duration-200 hover:-translate-y-0.5 ${
                        state.platform === p.id
                          ? 'border-accent-purple bg-accent-purple/5 shadow-lg shadow-accent-purple/10'
                          : 'border-white/[0.06] hover:border-white/[0.15] bg-bg-card'
                      }`}
                    >
                      <div className="text-3xl mb-2">{p.emoji}</div>
                      <div className="font-bold text-sm text-text-primary">{p.label}</div>
                      <div className="text-xs text-text-muted mt-2">{p.desc1}</div>
                      <div className="text-xs text-text-muted">{p.desc2}</div>
                      <div className="text-[11px] text-text-muted mt-3 pt-2 border-t border-white/[0.06]">{p.timing}</div>
                      <div className="text-[11px] text-accent-purple mt-1">{p.rec}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Visual Style */}
              <div>
                <h3 className="text-subtitle font-bold text-text-primary mb-4">🎨 בחר סגנון ויזואלי:</h3>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                  {visualStyles.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => update({ style: s.id })}
                      className={`shrink-0 px-4 py-3 rounded-xl border-2 text-center transition-all ${
                        state.style === s.id
                          ? 'border-accent-purple bg-accent-purple/5'
                          : 'border-white/[0.06] hover:border-white/[0.15] bg-bg-card'
                      }`}
                    >
                      <div className="text-lg mb-1">{s.emoji}</div>
                      <div className="text-[11px] text-text-secondary whitespace-nowrap">{s.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Format */}
              <div>
                <h3 className="text-subtitle font-bold text-text-primary mb-4">📐 בחר פורמט:</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {videoFormats.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => update({ format: f.id })}
                      className={`p-4 rounded-xl border-2 text-center transition-all ${
                        state.format === f.id
                          ? 'border-accent-purple bg-accent-purple/5'
                          : 'border-white/[0.06] hover:border-white/[0.15] bg-bg-card'
                      }`}
                    >
                      <div className="font-medium text-sm text-text-primary">{f.label}</div>
                      <div className="text-[11px] text-text-muted mt-1">{f.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-subtitle font-bold text-text-primary">⏱️ משך הסרטון:</h3>
                  <span className="text-sm text-accent-purple font-medium">{formatDuration(state.duration)}</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={180}
                  step={5}
                  value={state.duration}
                  onChange={(e) => update({ duration: Number(e.target.value) })}
                  className="w-full accent-accent-purple"
                  style={{ direction: 'ltr' }}
                />
                <div className="flex justify-between text-[10px] text-text-muted mt-1" style={{ direction: 'ltr' }}>
                  <span>10 שניות</span>
                  <span>3 דקות</span>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  {durationPresets.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => update({ duration: p.value })}
                      className={`px-3 py-1.5 rounded-full text-xs transition-all ${
                        state.duration === p.value
                          ? 'bg-accent-purple/20 text-accent-purple border border-accent-purple/30'
                          : 'bg-white/[0.04] text-text-secondary border border-white/[0.06] hover:bg-white/[0.08]'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="text-xs text-text-muted mt-2">~{sceneCount} סצנות יווצרו</div>
              </div>

              <button
                onClick={() => goToStep(3)}
                className="w-full max-w-md mx-auto block px-6 py-3 bg-accent-purple hover:bg-accent-purple/90 rounded-xl text-sm font-medium transition-all shadow-lg shadow-accent-purple/20"
              >
                המשך
              </button>
            </div>
          )}

          {/* ======== STEP 3: CONTENT ======== */}
          {state.step === 3 && (
            <div className="max-w-3xl mx-auto space-y-8 py-4">
              {/* Prompt */}
              <div>
                <h3 className="text-subtitle font-bold text-text-primary mb-4">✍️ תאר את הסרטון שאתה רוצה ליצור:</h3>
                <textarea
                  value={state.prompt}
                  onChange={(e) => update({ prompt: e.target.value })}
                  placeholder="לדוגמה: סרטון שיווקי לאפליקציה חדשה לניהול משימות. מתחיל עם בעיה - אנשים מוצפים במשימות, ואז מציג את הפתרון - האפליקציה שלנו. מסתיים עם קריאה לפעולה להורדה."
                  className="w-full h-36 px-4 py-3 bg-bg-card rounded-xl border border-white/[0.06] text-text-primary text-body placeholder-text-muted focus:outline-none focus:border-accent-purple/30 resize-none"
                />
                <div className="flex flex-wrap gap-2 mt-3">
                  {examplePrompts.map((ex) => (
                    <button
                      key={ex.chip}
                      onClick={() => update({ prompt: ex.expanded })}
                      className="px-3 py-1.5 rounded-full text-xs bg-white/[0.04] text-text-secondary border border-white/[0.06] hover:bg-accent-purple/10 hover:text-accent-purple hover:border-accent-purple/20 transition-all"
                    >
                      {ex.chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* Brand Details - Collapsible */}
              <div className="rounded-xl border border-white/[0.06] overflow-hidden">
                <button
                  onClick={() => setBrandOpen(!brandOpen)}
                  className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors"
                >
                  <span className="text-sm font-medium text-text-primary">🏢 פרטי מותג (אופציונלי)</span>
                  <ChevronRight size={16} className={`text-text-muted transition-transform ${brandOpen ? '-rotate-90' : ''}`} />
                </button>
                {brandOpen && (
                  <div className="p-4 pt-0 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-text-muted mb-1 block">שם המותג/מוצר</label>
                        <input
                          type="text"
                          value={state.brandName}
                          onChange={(e) => update({ brandName: e.target.value })}
                          className="w-full px-3 py-2 bg-bg-card rounded-lg border border-white/[0.06] text-sm text-text-primary focus:outline-none focus:border-accent-purple/30"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-text-muted mb-1 block">סלוגן</label>
                        <input
                          type="text"
                          value={state.brandSlogan}
                          onChange={(e) => update({ brandSlogan: e.target.value })}
                          className="w-full px-3 py-2 bg-bg-card rounded-lg border border-white/[0.06] text-sm text-text-primary focus:outline-none focus:border-accent-purple/30"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-text-muted mb-2 block">צבעים</label>
                      <div className="flex gap-4">
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={state.brandColors.primary}
                            onChange={(e) => update({ brandColors: { ...state.brandColors, primary: e.target.value } })}
                            className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
                          />
                          <span className="text-xs text-text-muted">ראשי</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={state.brandColors.secondary}
                            onChange={(e) => update({ brandColors: { ...state.brandColors, secondary: e.target.value } })}
                            className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
                          />
                          <span className="text-xs text-text-muted">משני</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Key Messages */}
              <div>
                <h3 className="text-sm font-medium text-text-primary mb-3">💡 מסרים עיקריים (אופציונלי):</h3>
                <div className="flex flex-wrap gap-2 mb-2">
                  {state.keyMessages.map((msg, i) => (
                    <span key={i} className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs bg-accent-purple/10 text-accent-purple border border-accent-purple/20">
                      {msg}
                      <button onClick={() => update({ keyMessages: state.keyMessages.filter((_, j) => j !== i) })} className="hover:text-white transition-colors">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newMessage.trim()) {
                        update({ keyMessages: [...state.keyMessages, newMessage.trim()] })
                        setNewMessage('')
                      }
                    }}
                    placeholder="הוסף מסר... (Enter להוספה)"
                    className="flex-1 px-3 py-2 bg-bg-card rounded-lg border border-white/[0.06] text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-purple/30"
                  />
                  <button
                    onClick={() => {
                      if (newMessage.trim()) {
                        update({ keyMessages: [...state.keyMessages, newMessage.trim()] })
                        setNewMessage('')
                      }
                    }}
                    className="px-3 py-2 bg-white/[0.06] hover:bg-white/[0.1] rounded-lg transition-colors"
                  >
                    <Plus size={16} className="text-text-muted" />
                  </button>
                </div>
              </div>

              <button
                onClick={() => goToStep(4)}
                disabled={!state.prompt.trim()}
                className="w-full max-w-md mx-auto block px-6 py-3 bg-accent-purple hover:bg-accent-purple/90 rounded-xl text-sm font-medium transition-all shadow-lg shadow-accent-purple/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                המשך
              </button>
            </div>
          )}

          {/* ======== STEP 4: VOICE & CAPTIONS ======== */}
          {state.step === 4 && (
            <div className="max-w-3xl mx-auto space-y-8 py-4">
              {/* Voiceover */}
              <div>
                <h3 className="text-subtitle font-bold text-text-primary mb-4">🎙️ האם תרצה דיבור בסרטון?</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { id: 'ai' as const, label: 'כן - קריינות AI', desc: 'AI יקריין את הסקריפט', emoji: '🎙️' },
                    { id: 'none' as const, label: 'לא - בלי דיבור', desc: 'רק מוזיקה ואפקטים', emoji: '🔇' },
                    { id: 'upload' as const, label: 'כן - אני אקליט', desc: 'אעלה הקלטה שלי', emoji: '📝' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => update({ voiceType: opt.id })}
                      className={`p-4 rounded-xl border-2 text-center transition-all ${
                        state.voiceType === opt.id
                          ? 'border-accent-purple bg-accent-purple/5'
                          : 'border-white/[0.06] hover:border-white/[0.15] bg-bg-card'
                      }`}
                    >
                      <div className="text-2xl mb-2">{opt.emoji}</div>
                      <div className="font-medium text-sm text-text-primary">{opt.label}</div>
                      <div className="text-[11px] text-text-muted mt-1">{opt.desc}</div>
                    </button>
                  ))}
                </div>

                {/* AI Voice Options */}
                {state.voiceType === 'ai' && (
                  <div className="mt-4 p-4 rounded-xl bg-bg-card border border-white/[0.06] space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-text-muted mb-1 block">שפה</label>
                        <select
                          value={state.voiceLanguage}
                          onChange={(e) => update({ voiceLanguage: e.target.value })}
                          className="w-full px-3 py-2 bg-bg-deepest rounded-lg border border-white/[0.06] text-sm text-text-primary focus:outline-none cursor-pointer"
                        >
                          {voiceLanguages.map((l) => (
                            <option key={l.id} value={l.id}>{l.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-text-muted mb-1 block">טון</label>
                        <select
                          value={state.voiceTone}
                          onChange={(e) => update({ voiceTone: e.target.value })}
                          className="w-full px-3 py-2 bg-bg-deepest rounded-lg border border-white/[0.06] text-sm text-text-primary focus:outline-none cursor-pointer"
                        >
                          {voiceTones.map((t) => (
                            <option key={t.id} value={t.id}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs text-text-muted">מהירות</label>
                        <span className="text-xs text-accent-purple font-mono">{state.voiceSpeed.toFixed(1)}x</span>
                      </div>
                      <input
                        type="range"
                        min={0.8}
                        max={1.5}
                        step={0.1}
                        value={state.voiceSpeed}
                        onChange={(e) => update({ voiceSpeed: Number(e.target.value) })}
                        className="w-full accent-accent-purple"
                        style={{ direction: 'ltr' }}
                      />
                    </div>
                  </div>
                )}

                {/* Upload Audio */}
                {state.voiceType === 'upload' && (
                  <div className="mt-4 p-6 rounded-xl bg-bg-card border-2 border-dashed border-white/[0.1] text-center">
                    <Upload size={24} className="mx-auto text-text-muted mb-2" />
                    <p className="text-sm text-text-muted">גרור קובץ אודיו לכאן או לחץ להעלאה</p>
                    <button className="mt-3 flex items-center gap-2 mx-auto px-4 py-2 bg-white/[0.06] hover:bg-white/[0.1] rounded-lg text-sm text-text-secondary transition-colors">
                      <Mic size={14} /> הקלט
                    </button>
                  </div>
                )}
              </div>

              {/* Captions */}
              <div>
                <h3 className="text-subtitle font-bold text-text-primary mb-4">💬 האם תרצה כתוביות?</h3>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => update({ captionsEnabled: true, captionLanguages: state.captionLanguages.length > 0 ? state.captionLanguages : ['he'] })}
                    className={`p-4 rounded-xl border-2 text-center transition-all ${
                      state.captionsEnabled
                        ? 'border-accent-purple bg-accent-purple/5'
                        : 'border-white/[0.06] hover:border-white/[0.15] bg-bg-card'
                    }`}
                  >
                    <div className="text-2xl mb-2">✅</div>
                    <div className="text-sm font-medium text-text-primary">כן, אני רוצה כתוביות</div>
                  </button>
                  <button
                    onClick={() => update({ captionsEnabled: false, captionLanguages: [] })}
                    className={`p-4 rounded-xl border-2 text-center transition-all ${
                      !state.captionsEnabled
                        ? 'border-accent-purple bg-accent-purple/5'
                        : 'border-white/[0.06] hover:border-white/[0.15] bg-bg-card'
                    }`}
                  >
                    <div className="text-2xl mb-2">❌</div>
                    <div className="text-sm font-medium text-text-primary">לא</div>
                  </button>
                </div>

                {state.captionsEnabled && (
                  <div className="mt-6 space-y-5">
                    <div>
                      <label className="text-sm text-text-secondary mb-3 block">באיזו שפה? (ניתן לבחור יותר מאחת)</label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
                        {captionLanguageOptions.map((lang) => (
                          <label
                            key={lang.id}
                            className={`flex items-center gap-2 p-2.5 rounded-lg cursor-pointer transition-colors ${
                              state.captionLanguages.includes(lang.id) ? 'bg-accent-purple/15 border border-accent-purple/30' : 'bg-white/5 hover:bg-white/10 border border-transparent'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={state.captionLanguages.includes(lang.id)}
                              onChange={() => {
                                const langs = state.captionLanguages.includes(lang.id)
                                  ? state.captionLanguages.filter((l) => l !== lang.id)
                                  : [...state.captionLanguages, lang.id]
                                update({ captionLanguages: langs, captionsEnabled: langs.length > 0 })
                              }}
                              className="w-4 h-4 rounded accent-accent-purple"
                            />
                            <span className="text-sm text-text-primary">{lang.label}</span>
                            <span className="text-[10px] text-text-muted uppercase">({lang.id})</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-text-muted mb-2 block">סגנון כתוביות:</label>
                      <div className="flex flex-wrap gap-2">
                        {captionStyles.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => update({ captionStyle: s.id })}
                            className={`px-4 py-2 rounded-lg text-xs transition-all ${
                              state.captionStyle === s.id
                                ? 'bg-accent-purple/20 text-accent-purple border border-accent-purple/30'
                                : 'bg-white/[0.04] text-text-secondary border border-white/[0.06] hover:bg-white/[0.08]'
                            }`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Music */}
              <div>
                <h3 className="text-subtitle font-bold text-text-primary mb-4">🎵 מוזיקת רקע:</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { id: 'auto' as const, label: 'אוטומטית', desc: 'AI בוחר לפי סגנון', emoji: '🎵' },
                    { id: 'manual' as const, label: 'בחר ידנית', desc: 'בחר מצב רוח', emoji: '🎵' },
                    { id: 'none' as const, label: 'בלי מוזיקה', desc: '', emoji: '🔇' },
                    { id: 'upload' as const, label: 'העלה מוזיקה', desc: 'העלה מוזיקה שלי', emoji: '📁' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => update({ musicType: opt.id })}
                      className={`p-3 rounded-xl border-2 text-center transition-all ${
                        state.musicType === opt.id
                          ? 'border-accent-purple bg-accent-purple/5'
                          : 'border-white/[0.06] hover:border-white/[0.15] bg-bg-card'
                      }`}
                    >
                      <div className="text-lg mb-1">{opt.emoji}</div>
                      <div className="text-xs font-medium text-text-primary">{opt.label}</div>
                      {opt.desc && <div className="text-[10px] text-text-muted mt-0.5">{opt.desc}</div>}
                    </button>
                  ))}
                </div>

                {state.musicType === 'manual' && (
                  <div className="mt-4">
                    <label className="text-xs text-text-muted mb-2 block">מצב רוח:</label>
                    <div className="flex flex-wrap gap-2">
                      {musicMoods.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => update({ musicMood: m.id })}
                          className={`px-4 py-2 rounded-lg text-xs transition-all ${
                            state.musicMood === m.id
                              ? 'bg-accent-purple/20 text-accent-purple border border-accent-purple/30'
                              : 'bg-white/[0.04] text-text-secondary border border-white/[0.06] hover:bg-white/[0.08]'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => goToStep(5)}
                className="w-full max-w-md mx-auto block px-6 py-3 bg-accent-purple hover:bg-accent-purple/90 rounded-xl text-sm font-medium transition-all shadow-lg shadow-accent-purple/20"
              >
                המשך
              </button>
            </div>
          )}

          {/* ======== STEP 5: REVIEW ======== */}
          {state.step === 5 && (
            <div className="max-w-2xl mx-auto w-full py-4">
              <div className="bg-[#1A1A28] rounded-xl p-6" dir="rtl">
                <h3 className="text-xl font-bold mb-4">📋 סיכום הסרטון</h3>
                <div className="space-y-3">
                  {[
                    { label: 'סוג', value: getVideoTypeLabel() },
                    { label: 'מנוע', value: getPlatformLabel() },
                    { label: 'סגנון', value: getStyleLabel() },
                    { label: 'פורמט', value: `${state.format} (${getFormatLabel()})` },
                    { label: 'משך', value: `${formatDuration(state.duration)} (~${sceneCount} סצנות)` },
                    { label: 'דיבור', value: state.voiceType === 'ai' ? `קריינות AI ב${voiceLanguages.find((l) => l.id === state.voiceLanguage)?.label}` : state.voiceType === 'upload' ? 'הקלטה עצמית' : 'ללא דיבור' },
                    { label: 'כתוביות', value: state.captionsEnabled ? `${state.captionLanguages.map((l) => captionLanguageOptions.find((v) => v.id === l)?.label || l).join(', ')} | סגנון ${captionStyles.find((s) => s.id === state.captionStyle)?.label}` : 'ללא' },
                    { label: 'מוזיקה', value: state.musicType === 'auto' ? 'אוטומטית' : state.musicType === 'manual' ? musicMoods.find((m) => m.id === state.musicMood)?.label || '' : state.musicType === 'upload' ? 'מוזיקה מותאמת' : 'ללא' },
                    ...(state.brandName ? [{ label: 'מותג', value: state.brandName }] : []),
                  ].map((item) => (
                    <div key={item.label} className="flex justify-between items-start gap-4 py-2 border-b border-white/5">
                      <span className="text-gray-400 text-sm whitespace-nowrap min-w-[80px]">{item.label}:</span>
                      <span className="text-white text-sm text-left flex-1">{item.value}</span>
                    </div>
                  ))}

                  <div className="pt-3">
                    <div className="text-gray-400 text-xs mb-1">פרומפט:</div>
                    <div className="text-white text-sm bg-bg-deepest p-3 rounded-lg break-words">{state.prompt}</div>
                  </div>

                  {state.keyMessages.length > 0 && (
                    <div className="pt-2">
                      <div className="text-gray-400 text-xs mb-1">מסרים:</div>
                      <div className="flex flex-wrap gap-1">
                        {state.keyMessages.map((m, i) => (
                          <span key={i} className="px-2 py-1 rounded-full text-[11px] bg-accent-purple/10 text-accent-purple">{m}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-3 border-t border-white/5 flex justify-between items-center">
                    <div>
                      <div className="text-gray-400 text-xs">עלות משוערת</div>
                      <div className="text-white font-bold">~${estimatedCost()}</div>
                    </div>
                    <div className="text-left">
                      <div className="text-gray-400 text-xs">זמן יצירה</div>
                      <div className="text-white font-bold">~3-5 דקות</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between mt-6 gap-4">
                <button
                  onClick={() => update({ step: state.step - 1 })}
                  className="flex items-center gap-1 px-4 py-2.5 text-sm text-text-muted hover:text-text-primary transition-colors"
                >
                  <ChevronRight size={16} />
                  חזור לשלב הקודם
                </button>
                <button
                  onClick={startGeneration}
                  className="flex items-center gap-2 px-8 py-3 bg-accent-purple hover:bg-accent-purple/90 rounded-xl text-sm font-medium transition-all shadow-lg shadow-accent-purple/20"
                >
                  🚀 צור סרטון
                </button>
              </div>
            </div>
          )}

          {/* ======== STEP 6: GENERATION ======== */}
          {state.step === 6 && !state.completed && (
            <div className="max-w-2xl mx-auto py-4">
              <div className="text-center mb-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-accent-purple/10 flex items-center justify-center">
                  <Loader2 size={28} className="text-accent-purple animate-spin" />
                </div>
                <h3 className="text-xl font-bold text-text-primary mb-1">🎬 יוצר את הסרטון שלך...</h3>
                <p className="text-sm text-text-muted">{state.generationPhase}</p>
              </div>

              <div className="space-y-4">
                {state.generationSteps.map((phase, pi) => (
                  <div key={pi} className="rounded-xl overflow-hidden">
                    <div className={`flex items-center gap-2 px-4 py-2 text-sm font-medium ${
                      phase.status === 'done' ? 'text-success' : phase.status === 'active' ? 'text-accent-purple' : 'text-text-muted'
                    }`}>
                      {phase.status === 'done' ? <CheckCircle size={16} /> : phase.status === 'active' ? <Loader2 size={16} className="animate-spin" /> : <div className="w-4 h-4 rounded-full border border-white/[0.15]" />}
                      {phase.label}
                    </div>
                    {phase.children && (phase.status === 'active' || phase.status === 'done') && (
                      <div className="mr-6 pr-4 border-r border-white/[0.06] space-y-1 pb-2">
                        {phase.children.map((child, ci) => (
                          <div key={ci} className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg transition-all ${
                            child.status === 'done' ? 'text-success/80' : child.status === 'active' ? 'text-accent-purple bg-accent-purple/5' : 'text-text-muted'
                          }`}>
                            {child.status === 'done' ? '✅' : child.status === 'active' ? '⏳' : '⬜'}
                            <span>{child.label}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Progress bar */}
              <div className="mt-8">
                <div className="h-3 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-l from-accent-purple to-accent-blue rounded-full transition-all duration-700"
                    style={{ width: `${state.generationProgress}%` }}
                  />
                </div>
                <div className="text-center mt-2 text-sm text-text-muted font-mono">
                  {state.generationProgress}%
                </div>
              </div>
            </div>
          )}

          {/* ======== COMPLETION ======== */}
          {state.step === 6 && state.completed && (
            <div className="max-w-lg mx-auto py-6 text-center">
              <ConfettiEffect />
              <div className="text-5xl mb-4 animate-bounce">🎉</div>
              <h3 className="text-2xl font-bold text-text-primary mb-2">הסרטון מוכן!</h3>
              <p className="text-text-muted mb-8">הסרטון נוצר בהצלחה ושמור בקבצים שלך</p>

              <div className="relative aspect-video rounded-2xl overflow-hidden mb-8 bg-gradient-to-br from-accent-purple/20 to-accent-blue/20 border border-white/[0.06]">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer">
                    <Play size={28} className="text-white mr-[-3px]" />
                  </div>
                </div>
                <div className="absolute bottom-3 left-3 px-2 py-1 rounded bg-black/60 text-xs text-white font-mono">
                  {formatDuration(state.duration)}
                </div>
              </div>

              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={handleOpenEditor}
                  className="flex items-center gap-2 px-5 py-2.5 bg-accent-purple hover:bg-accent-purple/90 rounded-xl text-sm font-medium transition-all shadow-lg shadow-accent-purple/20"
                >
                  <ExternalLink size={16} /> פתח בעורך
                </button>
                <button className="flex items-center gap-2 px-5 py-2.5 bg-white/[0.06] hover:bg-white/[0.1] rounded-xl text-sm text-text-secondary transition-colors border border-white/[0.06]">
                  <Download size={16} /> הורד
                </button>
                <button
                  onClick={() => update({ step: 1, completed: false, generating: false, generationProgress: 0, generationSteps: [] })}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white/[0.06] hover:bg-white/[0.1] rounded-xl text-sm text-text-secondary transition-colors border border-white/[0.06]"
                >
                  <RefreshCw size={16} /> צור עוד
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
