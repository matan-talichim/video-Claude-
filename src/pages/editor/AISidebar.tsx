import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Bot, Send, Volume2, Scissors, Subtitles, Languages, Wand2, Film, Eye, X, Paperclip, Mic, Copy, ChevronDown, ChevronUp, AlertCircle, ExternalLink, Image, Undo2, ThumbsUp } from 'lucide-react'
import { useAIStore } from '../../stores/aiStore'
import type { AISuggestion } from '../../stores/aiStore'
import { useEditorStore } from '../../stores/editorStore'
import { useUsageStore } from '../../stores/usageStore'
import { useApiStatusStore } from '../../stores/apiStatusStore'
import { useUIStore } from '../../stores/uiStore'
import { useUserProfileStore } from '../../stores/userProfileStore'
import { api, ApiError } from '../../services/api'
import { executeAiActions, formatActionResults } from '../../services/aiActionExecutor'
import type { AIAction } from '../../services/aiActionExecutor'
import AIRecommendations from './AIRecommendations'

const quickActions = [
  { label: 'נקה אודיו', icon: Volume2, action: 'clean_audio' },
  { label: 'הסר מילוי', icon: Scissors, action: 'remove_filler' },
  { label: 'כתוביות', icon: Subtitles, action: 'add_captions' },
  { label: 'תרגם', icon: Languages, action: 'translate' },
  { label: 'עצב', icon: Wand2, action: 'quick_style' },
  { label: 'קליפים', icon: Film, action: 'clips' },
  { label: 'הסר רקע', icon: Image, action: 'green_screen' },
  { label: 'שפר מבט', icon: Eye, action: 'eye_contact' },
]

const smartSuggestions = [
  { emoji: '✂️', label: 'הסר מילות מילוי', action: 'remove_filler' },
  { emoji: '📝', label: 'הוסף כתוביות', action: 'add_captions' },
  { emoji: '🖼️', label: 'הוסף B-Roll לכל הסרטון', action: 'add_broll' },
  { emoji: '💡', label: 'מה אתה ממליץ?', action: 'recommend' },
]

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function AISidebar({ onClose }: { onClose: () => void }) {
  const { messages, mode, inputValue, setMode, setInputValue, addMessage, updateMessage, setIsProcessing } = useAIStore()
  const editor = useEditorStore()
  const addGptUsage = useUsageStore((s) => s.addGptUsage)
  const apiConnected = useApiStatusStore((s) => s.openai.connected)
  const apiChecked = useApiStatusStore((s) => s.checked)
  const [showQuickActions, setShowQuickActions] = useState(false)
  const [lastBatchActions, setLastBatchActions] = useState<AIAction[] | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const { openModal, addToast } = useUIStore()

  // Real analysis helpers - MUST be declared before getEditorContext which uses them
  const fillerCounts = useMemo(() => {
    const transcript = editor.transcript || []
    if (transcript.length === 0) return {}
    return editor.countFillerWords()
  }, [editor.transcript])

  const totalFillers = useMemo(() => Object.values(fillerCounts).reduce((s: number, c) => s + (c as number), 0), [fillerCounts])

  const silenceData = useMemo(() => {
    const transcript = editor.transcript || []
    if (transcript.length === 0) return { count: 0, totalDuration: 0, gaps: [] }
    return editor.countSilences(1.0)
  }, [editor.transcript])

  const speakerCount = useMemo(() => {
    const transcript = editor.transcript || []
    return new Set(transcript.map(s => s.speaker)).size
  }, [editor.transcript])

  const getTranscriptText = useCallback(() => {
    const transcript = editor.transcript || []
    return transcript
      .flatMap((s) => s.words)
      .map((w) => w.text)
      .join(' ')
  }, [editor.transcript])

  const getEditorContext = useCallback(() => {
    const transcript = editor.transcript || []
    const silences = transcript.length > 0 ? editor.countSilences(1.0) : { count: 0, totalDuration: 0, gaps: [] }
    return {
      projectName: editor.projectName,
      duration: editor.duration,
      transcript: getTranscriptText(),
      segmentCount: transcript.length,
      speakerCount: speakerCount,
      speakers: [...new Set(transcript.map(s => s.speaker))],
      brollItems: (editor.bRollItems || []).map(b => ({
        id: b.id,
        prompt: b.prompt,
        start: b.startTime,
        end: b.startTime + b.duration,
        position: b.displayMode,
      })),
      brollCount: (editor.bRollItems || []).length,
      captions: { enabled: editor.showCaptions, style: editor.captionStyle?.preset, language: 'he' },
      hasCaptions: editor.showCaptions,
      captionStyle: editor.captionStyle?.preset,
      editPoints: editor.deletedRegions || [],
      deletedRegionsCount: (editor.deletedRegions || []).length,
      deletedDuration: (editor.deletedRegions || []).reduce((s, r) => s + (r.endTime - r.startTime), 0),
      fillerWordCount: totalFillers,
      silenceCount: silences.count,
      silenceDuration: silences.totalDuration,
      hasEyeContact: editor.editorEffects?.eyeContact || false,
      hasGreenScreen: editor.editorEffects?.greenScreen?.enabled || false,
      reframeRatio: editor.editorEffects?.reframe?.ratio || '16:9',
      isAudioEnhanced: editor.editorEffects?.audioEnhanced || false,
      isTranscribed: transcript.length > 0,
      hasMusic: false,
      exportFormat: null,
    }
  }, [editor, getTranscriptText, totalFillers, speakerCount])

  // Execute quick action directly
  const executeQuickAction = useCallback((action: string) => {
    switch (action) {
      case 'clean_audio':
        openModal('soundStudio')
        break
      case 'remove_filler':
        if (editor.transcript.length === 0) { addToast('תמלל קודם את הסרטון', 'warning'); return }
        openModal('fillerWords')
        break
      case 'add_captions':
        if (editor.transcript.length === 0) { addToast('תמלל קודם את הסרטון', 'warning'); return }
        editor.generateCaptionsFromTranscript()
        editor.setShowCaptions(true)
        addToast('כתוביות נוספו!', 'success')
        break
      case 'translate':
        // Navigate to translate
        openModal('translate')
        break
      case 'quick_style':
        openModal('quickStyle')
        break
      case 'clips':
        openModal('clips')
        break
      case 'green_screen':
        openModal('greenScreen')
        break
      case 'eye_contact':
        editor.setEditorEffect('eyeContact', !editor.editorEffects.eyeContact)
        addToast(editor.editorEffects.eyeContact ? 'קשר עין כובה' : 'קשר עין יופעל בייצוא', 'success')
        break
      case 'shorten_silences':
        openModal('silence')
        break
      case 'center_speaker':
        editor.setEditorEffect('centerSpeaker', !editor.editorEffects.centerSpeaker)
        addToast('מרכוז דובר הופעל', 'success')
        break
      case 'add_broll':
        // Trigger B-Roll via command
        handleSuggestionClick('הוסף B-Roll לכל הסרטון')
        break
      case 'suggest_clips':
        openModal('clips')
        break
      case 'recommend':
        handleSuggestionClick('מה אתה ממליץ?')
        break
      default:
        handleSuggestionClick(action)
    }
  }, [editor, openModal, addToast])

  // Proactive suggestions based on REAL current state
  const getProactiveSuggestions = useCallback(() => {
    const suggestions: Array<{ emoji: string; label: string; action: string }> = []

    const transcript = editor.transcript || []
    if (transcript.length === 0) return suggestions

    if (totalFillers > 0) {
      suggestions.push({ emoji: '✂️', label: `מצאתי ${totalFillers} מילות מילוי. להסיר?`, action: 'remove_filler' })
    }
    if (silenceData.count > 0) {
      suggestions.push({ emoji: '⏱️', label: `${silenceData.count} שתיקות ארוכות (${silenceData.totalDuration.toFixed(0)}s). לקצר?`, action: 'shorten_silences' })
    }
    if (!editor.showCaptions) {
      suggestions.push({ emoji: '📝', label: 'אין כתוביות. כתוביות מגדילות מעורבות ב-40%', action: 'add_captions' })
    }
    if ((editor.bRollItems || []).length === 0) {
      const apiStatus = useApiStatusStore.getState()
      const canUseSeedance = apiStatus.seedance.connected
      const canUseVeo = apiStatus.gemini.connected
      const brollLabel = canUseSeedance
        ? 'אין B-Roll. רוצה שאוסיף סרטונים עם Seedance 1.5 Pro?'
        : canUseVeo
        ? 'אין B-Roll. רוצה שאוסיף סרטונים עם Veo?'
        : 'אין B-Roll. רוצה שאוסיף תמונות מתאימות?'
      suggestions.push({ emoji: '🖼️', label: brollLabel, action: 'add_broll' })
    }
    if (editor.duration > 120) {
      suggestions.push({ emoji: '🎬', label: `הסרטון ארוך (${formatSeconds(editor.duration)}). ליצור קליפים?`, action: 'suggest_clips' })
    }

    return suggestions.slice(0, 3)
  }, [editor, totalFillers, silenceData])

  // Local fallback commands (when no API)
  const processLocalCommand = useCallback((input: string, processingId: string) => {
    // Remove filler words
    if (input.includes('מילות מילוי') || input.includes('הסר מילוי') || input.includes('מחק מילות')) {
      if (editor.transcript.length === 0) {
        updateMessage(processingId, 'אין תמלול זמין. הוסף תמלול תחילה.')
        return
      }
      const result = editor.removeFillerWords()
      const entries = Object.entries(result.removed).map(([w, c]) => `${w}: ${c}`).join(' | ')
      updateMessage(processingId,
        `✅ הוסרו מילות מילוי\n\n${entries}\n\nסה"כ הוסרו: ${result.totalRemoved} מילים\nנחסכו: ${formatSeconds(result.timeSaved)} דקות`)
      return
    }

    // Add captions
    if (input.includes('כתוביות') || input.includes('הוסף כתוביות')) {
      if (input.includes('מודרני') || input.includes('מודרניות')) {
        editor.setCaptionStyle({ preset: 'modern' })
      } else if (input.includes('קריוקי')) {
        editor.setCaptionStyle({ preset: 'karaoke' })
      } else if (input.includes('מינימלי') || input.includes('מינימליסטי')) {
        editor.setCaptionStyle({ preset: 'minimal' })
      }
      editor.generateCaptionsFromTranscript()
      editor.setShowCaptions(true)
      const lineCount = editor.transcript.reduce((s, seg) => s + seg.words.length, 0)
      updateMessage(processingId,
        `✅ נוספו כתוביות\n\nנוספו כתוביות (${lineCount} מילים) המסונכרנות עם הסרטון.`)
      return
    }

    // Change caption style
    if (input.includes('שנה') && input.includes('כתוביות') && input.includes('סגנון')) {
      if (input.includes('קריוקי')) {
        editor.setCaptionStyle({ preset: 'karaoke' })
        updateMessage(processingId, '✅ סגנון הכתוביות שונה לקריוקי')
      } else if (input.includes('מודרני')) {
        editor.setCaptionStyle({ preset: 'modern' })
        updateMessage(processingId, '✅ סגנון הכתוביות שונה למודרני')
      } else {
        updateMessage(processingId, 'ציין סגנון: מודרני, קריוקי, מינימלי, קלאסי')
      }
      return
    }

    // Caption color
    if ((input.includes('צבע') || input.includes('שנה')) && input.includes('כתוביות')) {
      const colorMap: Record<string, string> = { 'צהוב': '#FFFF00', 'לבן': '#FFFFFF', 'אדום': '#FF0000', 'ירוק': '#00FF00', 'כחול': '#0000FF' }
      for (const [name, hex] of Object.entries(colorMap)) {
        if (input.includes(name)) {
          editor.setCaptionStyle({ textColor: hex })
          updateMessage(processingId, `✅ צבע הכתוביות שונה ל${name}`)
          return
        }
      }
      updateMessage(processingId, 'ציין צבע: צהוב, לבן, אדום, ירוק, כחול')
      return
    }

    // Caption size
    if (input.includes('הגדל') && input.includes('כתוביות')) {
      editor.setCaptionStyle({ fontSize: editor.captionStyle.fontSize + 8 })
      updateMessage(processingId, `✅ גודל הכתוביות הוגדל ל-${editor.captionStyle.fontSize + 8}px`)
      return
    }
    if (input.includes('הקטן') && input.includes('כתוביות')) {
      editor.setCaptionStyle({ fontSize: Math.max(12, editor.captionStyle.fontSize - 8) })
      updateMessage(processingId, `✅ גודל הכתוביות הוקטן ל-${Math.max(12, editor.captionStyle.fontSize - 8)}px`)
      return
    }

    // Delete all B-Roll
    if ((input.includes('מחק') && input.includes('B-Roll')) || (input.includes('מחק') && input.includes('בירול'))) {
      editor.removeAllBRollItems()
      updateMessage(processingId, '✅ הוסרו כל תמונות ה-B-Roll')
      return
    }

    // Replace word
    if (input.includes('החלף')) {
      const match = input.match(/החלף\s+(.+?)\s+ב[-–]\s*(.+)/)
      if (match) {
        const count = editor.replaceWord(match[1], match[2])
        updateMessage(processingId,
          count > 0
            ? `✅ הוחלפו ${count} מופעים של '${match[1]}' ב-'${match[2]}'`
            : `לא נמצא '${match[1]}' בתמלול`)
        return
      }
    }

    // Undo
    if (input === 'בטל' || input.toLowerCase() === 'undo') {
      const desc = editor.undoLastEdit()
      updateMessage(processingId,
        desc ? `↩️ בוטלה הפעולה האחרונה: ${desc}` : 'אין פעולות לביטול')
      return
    }

    // Cut/trim
    if (input.includes('חתוך') || input.includes('מחק קטע')) {
      const match = input.match(/(\d{1,2}):(\d{2}).*?(\d{1,2}):(\d{2})/)
      if (match) {
        const start = parseInt(match[1]) * 60 + parseInt(match[2])
        const end = parseInt(match[3]) * 60 + parseInt(match[4])
        editor.removeTimeRange(start, end)
        updateMessage(processingId, `✅ נחתך קטע של ${end - start} שניות (${match[1]}:${match[2]}-${match[3]}:${match[4]})`)
        return
      }
    }

    // Mute
    if (input.includes('השתק')) {
      const match = input.match(/(\d{1,2}):(\d{2}).*?(\d{1,2}):(\d{2})/)
      if (match) {
        const start = parseInt(match[1]) * 60 + parseInt(match[2])
        const end = parseInt(match[3]) * 60 + parseInt(match[4])
        editor.muteTimeRange(start, end)
        updateMessage(processingId, `✅ האודיו הושתק בין ${match[1]}:${match[2]}-${match[3]}:${match[4]}`)
        return
      }
    }

    // Recommendations (local) - REAL analysis with interactive checklist
    if (input.includes('ממליץ') || input.includes('מה לעשות') || input.includes('מה אתה ממליץ') || input.includes('ערוך מקצועי') || input.includes('ערוך את הסרטון') || input.includes('שפר את הסרטון')) {
      if (editor.transcript.length === 0) {
        updateMessage(processingId, 'תמלל קודם את הסרטון כדי שאוכל לנתח ולהמליץ.')
        return
      }
      const checklistSuggestions: AISuggestion[] = []
      const realFillers = editor.countFillerWords()
      const totalF = Object.values(realFillers).reduce((s: number, c) => s + (c as number), 0)
      const silences = editor.countSilences(1.0)
      const speakers = [...new Set(editor.transcript.map(s => s.speaker))]
      const wordCount = editor.transcript.reduce((s, seg) => s + seg.words.length, 0)

      if (totalF > 0) {
        const topFillers = Object.entries(realFillers).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 3).map(([w, c]) => `${w}(${c})`).join(', ')
        checklistSuggestions.push({
          text: `מצאתי ${totalF} מילות מילוי (${topFillers}). הסרתן תשפר את הבהירות`,
          priority: 'high',
          action: { action: 'remove_filler_words', params: {} },
        })
      }
      if (silences.count > 0) {
        checklistSuggestions.push({
          text: `יש ${silences.count} שתיקות ארוכות (סה"כ ${silences.totalDuration.toFixed(0)} שניות). קיצורן ישפר את הקצב`,
          priority: 'high',
          action: { action: 'shorten_silences', params: { threshold: 1.0 } },
        })
      }
      if (!editor.showCaptions) {
        checklistSuggestions.push({
          text: 'אין כתוביות מעוצבות. הוספת כתוביות מודרניות (ASS format) עם אנימציות תגדיל מעורבות ב-40%',
          priority: 'high',
          action: { action: 'add_captions', params: { style: 'modern' } },
        })
      }
      if (!editor.editorEffects.audioEnhanced) {
        checklistSuggestions.push({
          text: 'עיבוד אודיו מקצועי: הסרת רעש, דחיסה, נרמול עוצמה ו-sidechain ducking עם מוזיקה',
          priority: 'high',
          action: { action: 'enhance_audio', params: {} },
        })
      }
      if (editor.bRollItems.length === 0) {
        checklistSuggestions.push({
          text: 'אין B-Roll. הוספת קטעי B-Roll עם אנימציות fade in/out וזום עדין בנקודות מפתח',
          priority: 'medium',
          action: { action: 'auto_broll', params: {} },
        })
      }
      if (!editor.editorEffects.eyeContact) {
        checklistSuggestions.push({
          text: 'הפעלת קשר עין תשפר את החיבור עם הצופים',
          priority: 'medium',
          action: { action: 'eye_contact', params: { enabled: true } },
        })
      }
      if (speakers.length > 1 && !editor.editorEffects.centerSpeaker) {
        checklistSuggestions.push({
          text: `מזהה ${speakers.length} דוברים (${speakers.join(', ')}). מרכוז דובר + lower thirds עם שמות`,
          priority: 'medium',
          action: { action: 'center_speaker', params: { enabled: true } },
        })
      }
      // Professional effects suggestions
      checklistSuggestions.push({
        text: 'מעברים חלקים (transitions) בין קטעים: fade, dissolve, smoothleft, zoomin ועוד',
        priority: 'medium',
        action: { action: 'add_animation', params: { type: 'transitions' } },
      })
      checklistSuggestions.push({
        text: 'זומים דינמיים (Ken Burns): zoom in/out עדין כל 5-8 שניות לתחושה קולנועית',
        priority: 'medium',
        action: { action: 'add_animation', params: { type: 'zooms' } },
      })
      checklistSuggestions.push({
        text: 'Color grading סינמטי: cinematic, warm, moody, film - שינוי מצב רוח ויזואלי',
        priority: 'medium',
        action: { action: 'add_animation', params: { type: 'color_grade' } },
      })
      checklistSuggestions.push({
        text: 'סימולציית מולטי-קאם: החלפה בין wide/medium/closeup כל 3-8 שניות',
        priority: 'low',
        action: { action: 'add_animation', params: { type: 'multicam' } },
      })
      if (editor.duration > 120) {
        checklistSuggestions.push({
          text: `הסרטון אורך ${formatSeconds(editor.duration)}. אפשר ליצור קליפים קצרים לרשתות`,
          priority: 'low',
          action: { action: 'suggest_clips', params: { count: 3 } },
        })
      }

      if (checklistSuggestions.length === 0) {
        updateMessage(processingId, 'הכל נראה מעולה! הסרטון מוכן.')
        return
      }

      const summary = `ניתחתי את הסרטון: ${wordCount} מילים, ${speakers.length} ${speakers.length === 1 ? 'דובר' : 'דוברים'}, ${formatSeconds(editor.duration)}\n\nיכולות מקצועיות זמינות: transitions, zooms, multi-cam, color grading, ASS כתוביות, lower thirds, גרפיקות מונפשות, אודיו מקצועי עם ducking, smart framing`
      updateMessage(processingId, summary, false, {
        suggestions: checklistSuggestions,
        showAsChecklist: true,
      })
      return
    }

    // Summary (local)
    if (input.includes('סכם') || input.includes('סיכום')) {
      const speakers = [...new Set(editor.transcript.map(s => s.speaker))]
      const wordCount = editor.transcript.reduce((s, seg) => s + seg.words.length, 0)
      const fillerCount = editor.transcript.reduce((s, seg) => s + seg.words.filter(w => w.isFiller).length, 0)
      updateMessage(processingId,
        `📊 סיכום הפרויקט:\n\n• ${speakers.length} דוברים: ${speakers.join(', ')}\n• ${wordCount} מילים\n• ${fillerCount} מילות מילוי\n• ${editor.bRollItems.length} פריטי B-Roll\n• כתוביות: ${editor.showCaptions ? 'פעילות' : 'כבויות'}\n• משך: ${formatSeconds(editor.duration)}`)
      return
    }

    // YouTube description (local)
    if (input.includes('תיאור') && (input.includes('יוטיוב') || input.includes('youtube'))) {
      const words = editor.transcript.flatMap(s => s.words).map(w => w.text).join(' ')
      const summary = words.slice(0, 200) + (words.length > 200 ? '...' : '')
      const desc = `📺 ${editor.projectName}\n\n${summary || 'תיאור הסרטון'}\n\n⏱️ חותמות זמן:\n${editor.transcript.map(s => `${s.startTime} - ${s.speaker}`).join('\n')}\n\n#AI #וידאו #עריכה`
      updateMessage(processingId, `✅ תיאור ליוטיוב:\n\n${desc}`)
      return
    }

    // Social post (local)
    if (input.includes('פוסט') || input.includes('רשתות חברתיות')) {
      const words = editor.transcript.flatMap(s => s.words).map(w => w.text)
      const excerpt = words.slice(0, 20).join(' ')
      const post = `🎬 ${editor.projectName}\n\n${excerpt}...\n\n#AI #תוכן #סרטון #עריכה #טכנולוגיה`
      updateMessage(processingId, `✅ פוסט לרשתות:\n\n${post}`)
      return
    }

    // Titles (local)
    if (input.includes('כותרות') || input.includes('כותרת')) {
      const name = editor.projectName || 'הסרטון'
      updateMessage(processingId,
        `✅ 3 כותרות:\n\n1. ${name} - הדרך החדשה ליצור תוכן\n2. ${name}: כל מה שצריך לדעת\n3. למה ${name} משנה את הכללים`)
      return
    }

    // Clean audio - open modal
    if (input.includes('נקה אודיו') || (input.includes('שפר') && input.includes('אודיו'))) {
      openModal('soundStudio')
      updateMessage(processingId, '🎵 פותח את סאונד סטודיו...')
      return
    }

    // Silence - real analysis
    if (input.includes('שתיקות') || input.includes('קצר שתיקות')) {
      if (editor.transcript.length === 0) {
        updateMessage(processingId, 'תמלל קודם את הסרטון לזיהוי שתיקות.')
        return
      }
      const silences = editor.countSilences(1.0)
      if (silences.count === 0) {
        updateMessage(processingId, 'לא נמצאו שתיקות ארוכות בתמלול.')
        return
      }
      const result = editor.shortenSilences(1.0, 0.3)
      updateMessage(processingId,
        `✅ קוצרו שתיקות\n\nנמצאו ${result.count} שתיקות, קוצרו.\nנחסכו: ${result.timeSaved.toFixed(1)} שניות`)
      return
    }

    // Eye contact toggle
    if (input.includes('שפר מבט') || input.includes('קשר עין')) {
      editor.setEditorEffect('eyeContact', !editor.editorEffects.eyeContact)
      updateMessage(processingId, editor.editorEffects.eyeContact ? '✅ קשר עין יופעל בייצוא' : '⏹️ קשר עין כובה')
      return
    }

    // Quick style
    if (input.includes('עצב') || input.includes('עיצוב')) {
      openModal('quickStyle')
      updateMessage(processingId, '🎨 פותח עיצוב מהיר...')
      return
    }

    // Green screen
    if (input.includes('הסר רקע') || input.includes('מסך ירוק') || input.includes('רקע')) {
      openModal('greenScreen')
      updateMessage(processingId, '🟢 פותח מסך ירוק...')
      return
    }

    // Default - no API connected
    updateMessage(processingId,
      `כדי לקבל תשובות AI חכמות, חבר OpenAI API בהגדרות 🔗\n\nאני יכול לעזור גם בלי API עם:\n• הסר מילות מילוי\n• הוסף כתוביות / שנה סגנון כתוביות\n• הוסף B-Roll / מחק B-Roll\n• החלף X ב-Y\n• חתוך מ-XX:XX עד XX:XX\n• השתק מ-XX:XX עד XX:XX\n• סיכום / המלצות\n• בטל (undo)`)
  }, [editor, updateMessage])

  const processCommand = useCallback(async (text: string) => {
    const input = text.trim()
    setIsProcessing(true)
    const processingId = addMessage('assistant', '🔄 מעבד...', true)

    // Commands that always work locally (no API needed)
    const localOnlyCommands = ['בטל', 'undo', 'הוסף כתוביות', 'כתוביות', 'מחק', 'השתק', 'חתוך']
    const isLocalCommand = localOnlyCommands.some((cmd) => input.includes(cmd) || input === cmd)
    const isFillerRemoval = input.includes('מילות מילוי') || input.includes('הסר מילוי')
    const isReplace = input.includes('החלף')
    const isCaptionCommand = input.includes('כתוביות') && (input.includes('שנה') || input.includes('הגדל') || input.includes('הקטן') || input.includes('צבע'))
    const isBrollDelete = (input.includes('מחק') && (input.includes('B-Roll') || input.includes('בירול')))

    // Handle locally if it's a local-only command or no API
    if (isLocalCommand || isReplace || isCaptionCommand || isBrollDelete) {
      await new Promise(r => setTimeout(r, 400))
      processLocalCommand(input, processingId)
      setIsProcessing(false)
      return
    }

    // Try enhanced API if connected
    if (apiConnected) {
      try {
        const context = getEditorContext()
        const userProfile = useUserProfileStore.getState().getProfileForPrompt()
        const result = await api.enhancedChat(input, context, userProfile)

        // Track usage
        if (result.usage?.totalTokens) {
          addGptUsage(result.usage.totalTokens)
        }

        const response = result.response

        // Handle checklist/recommendation responses
        if (response.showAsChecklist && response.suggestions && response.suggestions.length > 0) {
          const suggestions: AISuggestion[] = response.suggestions.map((s: any) => ({
            text: s.text,
            priority: s.priority || 'medium',
            action: s.action || { action: 'unknown', params: {} },
          }))
          updateMessage(processingId, response.message || response.summary || 'המלצות:', false, {
            suggestions,
            showAsChecklist: true,
          })
        }
        // Handle multi-action responses (direct execution)
        else if (response.actions && Array.isArray(response.actions) && response.actions.length > 0) {
          let progressText = response.message ? `🔄 ${response.message}\n\n` : '🔄 מבצע פעולות...\n\n'
          updateMessage(processingId, progressText)

          const actionResults = await executeAiActions(response.actions, (step, total, desc) => {
            progressText = `${response.message || 'מבצע פעולות...'}\n\n${desc}\n(${step}/${total})`
            updateMessage(processingId, progressText)
          })

          setLastBatchActions(response.actions)
          const summary = formatActionResults(actionResults)
          updateMessage(processingId, `✅ ${response.message || response.summary || 'הפעולות הושלמו!'}\n\n${summary}`)
          addToast('הפעולות בוצעו בהצלחה!', 'success')
        }
        // Handle single action (backward compat)
        else if (response.type === 'action' && response.action) {
          if (response.action === 'remove_filler_words' || isFillerRemoval) {
            const editResult = editor.removeFillerWords()
            const entries = Object.entries(editResult.removed).map(([w, c]) => `${w}: ${c}`).join(' | ')
            updateMessage(processingId,
              `✅ ${response.summary || 'הוסרו מילות מילוי'}\n\n${entries}\n\nסה"כ: ${editResult.totalRemoved} מילים\nנחסכו: ${formatSeconds(editResult.timeSaved)}`)
          } else {
            const actionResults = await executeAiActions([{ action: response.action, params: response.params || {} }])
            const summary = formatActionResults(actionResults)
            updateMessage(processingId, `✅ ${response.summary || 'הפעולה בוצעה'}\n\n${summary}`)
          }
        }
        else if (response.type === 'content') {
          updateMessage(processingId, `✅ ${response.summary || 'תוכן נוצר'}:\n\n${response.content}`)
        }
        else {
          // Plain text response
          updateMessage(processingId, response.message || response.content || result.rawContent || response.summary || 'לא התקבלה תשובה.')
        }
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'שגיאה בחיבור לשרת.'
        updateMessage(processingId, `❌ ${message}`)
      }
    } else {
      // Fallback to local
      await new Promise(r => setTimeout(r, 400))
      processLocalCommand(input, processingId)
    }

    setIsProcessing(false)
  }, [editor, apiConnected, addMessage, updateMessage, setIsProcessing, getTranscriptText, processLocalCommand, addGptUsage, getEditorContext, addToast])

  const handleSend = useCallback(() => {
    if (!inputValue.trim()) return
    const text = inputValue.trim()
    addMessage('user', text)
    processCommand(text)
  }, [inputValue, addMessage, processCommand])

  const handleSuggestionClick = useCallback((label: string) => {
    addMessage('user', label)
    processCommand(label)
  }, [addMessage, processCommand])

  const handleUndoBatch = useCallback(() => {
    if (!lastBatchActions) return
    // Undo multiple times for batch actions
    let undone = 0
    for (let i = 0; i < lastBatchActions.length; i++) {
      const desc = editor.undoLastEdit()
      if (desc) undone++
    }
    if (undone > 0) {
      addMessage('assistant', `↩️ בוטלו ${undone} פעולות`)
    }
    setLastBatchActions(null)
  }, [lastBatchActions, editor, addMessage])

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {})
  }

  const proactiveSuggestions = getProactiveSuggestions()

  return (
    <div className="flex flex-col h-full glass rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center justify-between p-3 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-accent-purple/15 flex items-center justify-center">
            <Bot size={16} className="text-accent-purple" />
          </div>
          <span className="font-bold text-sm text-text-primary">עוזר AI</span>
          <span className="px-1.5 py-0.5 rounded-md bg-accent-purple/10 text-accent-purple text-[9px] font-mono font-medium">Sonnet 4.6</span>
          {apiConnected === false && (
            <span className="px-1.5 py-0.5 rounded-md bg-yellow-500/10 text-yellow-400 text-[9px] font-medium">מקומי</span>
          )}
        </div>
        <button onClick={onClose} className="p-1 hover:bg-white/[0.06] rounded transition-colors text-text-muted hover:text-text-primary">
          <X size={16} />
        </button>
      </div>

      {apiConnected === false && apiChecked && (
        <div className="mx-3 mt-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-300 flex items-start gap-2">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <div>
            <p>חלק מהפונקציות דורשות OpenAI API.</p>
            <a href="/settings" className="inline-flex items-center gap-1 text-yellow-200 hover:underline mt-1">
              <ExternalLink size={10} /> הגדרות
            </a>
          </div>
        </div>
      )}

      <div className="px-3 py-2 shrink-0">
        <div className="flex bg-white/[0.04] rounded-lg p-0.5">
          <button onClick={() => setMode('execute')} className={`flex-1 py-1.5 text-xs rounded-md transition-all font-medium ${mode === 'execute' ? 'bg-accent-purple text-white shadow-sm' : 'text-text-muted hover:text-text-secondary'}`}>ביצוע</button>
          <button onClick={() => setMode('discuss')} className={`flex-1 py-1.5 text-xs rounded-md transition-all font-medium ${mode === 'discuss' ? 'bg-accent-purple text-white shadow-sm' : 'text-text-muted hover:text-text-secondary'}`}>דיון</button>
        </div>
      </div>

      {/* Proactive Suggestions */}
      {proactiveSuggestions.length > 0 && messages.length === 0 && (
        <div className="mx-3 mb-1 p-2 rounded-lg bg-accent-purple/5 border border-accent-purple/10">
          <p className="text-[10px] text-accent-purple font-medium mb-1.5">💡 הצעות לשיפור הסרטון:</p>
          <div className="space-y-1">
            {proactiveSuggestions.map((s, i) => (
              <button key={i} onClick={() => executeQuickAction(s.action)}
                className="w-full flex items-center gap-2 px-2 py-1 rounded bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.04] text-right transition-all">
                <span className="text-[10px]">{s.emoji}</span>
                <span className="text-[10px] text-text-secondary flex-1">{s.label}</span>
                <span className="text-[9px] px-1.5 py-0.5 bg-accent-purple/10 text-accent-purple rounded">בצע</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8 text-text-muted text-xs">
            <Bot size={32} className="mx-auto mb-2 opacity-30" />
            <p>שלח פקודה או שאל שאלה</p>
            <p className="mt-1 text-[10px]">נסה: "הוסף B-Roll לכל הסרטון"</p>
            <p className="text-[10px]">"ערוך את הסרטון בסגנון מקצועי"</p>
            <p className="text-[10px]">"הכן 3 קליפים לאינסטגרם"</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`relative group ${msg.role === 'user' ? 'mr-3' : 'ml-3'}`}>
            <div className={`p-3 rounded-xl text-sm leading-relaxed ${msg.role === 'user' ? 'bg-accent-purple/15 text-text-primary border border-accent-purple/10' : 'glass-light text-text-primary'}`}>
              {msg.isProcessing ? (
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent-purple animate-bounce" />
                  <div className="w-1.5 h-1.5 rounded-full bg-accent-purple animate-bounce" style={{ animationDelay: '0.15s' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-accent-purple animate-bounce" style={{ animationDelay: '0.3s' }} />
                  <span className="text-text-muted text-xs">מעבד...</span>
                </div>
              ) : msg.showAsChecklist && msg.suggestions && msg.suggestions.length > 0 ? (
                <div>
                  {msg.content && <p className="whitespace-pre-line mb-3 text-xs text-gray-300">{msg.content}</p>}
                  <AIRecommendations suggestions={msg.suggestions} />
                </div>
              ) : (
                <p className="whitespace-pre-line">{msg.content}</p>
              )}
            </div>
            {!msg.isProcessing && msg.role === 'assistant' && !msg.showAsChecklist && (
              <div className="absolute top-2 left-2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => handleCopy(msg.content)}
                  className="p-1 rounded bg-white/[0.06] text-text-muted hover:text-text-primary">
                  <Copy size={11} />
                </button>
              </div>
            )}
          </div>
        ))}

        {/* Undo batch button */}
        {lastBatchActions && messages.length > 0 && (
          <div className="flex gap-2 justify-center">
            <button onClick={handleUndoBatch}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-lg text-xs text-text-secondary transition-all">
              <Undo2 size={12} /> בטל הכל
            </button>
            <button onClick={() => setLastBatchActions(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 rounded-lg text-xs text-green-400 transition-all">
              <ThumbsUp size={12} /> מעולה
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 border-t border-white/[0.06] space-y-2 shrink-0">
        <div className="flex gap-1.5 overflow-x-auto">
          {smartSuggestions.map((s) => (
            <button
              key={s.label}
              onClick={() => s.action === 'recommend' || s.action === 'add_broll' ? handleSuggestionClick(s.label) : executeQuickAction(s.action)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.06] hover:border-accent-purple/30 hover:bg-accent-purple/5 text-xs text-text-secondary hover:text-text-primary transition-all whitespace-nowrap"
            >
              <span>{s.emoji}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowQuickActions(!showQuickActions)}
          className="flex items-center gap-1 text-[10px] text-text-muted hover:text-text-secondary transition-colors"
        >
          {showQuickActions ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          פעולות מהירות
        </button>

        {showQuickActions && (
          <div className="grid grid-cols-4 gap-1.5 animate-fade-up">
            {quickActions.map((qa) => {
              const Icon = qa.icon
              return (
                <button
                  key={qa.label}
                  onClick={() => executeQuickAction(qa.action)}
                  className="p-2 bg-white/[0.03] hover:bg-white/[0.06] rounded-lg transition-all text-center group hover:scale-105"
                  title={qa.label}
                >
                  <Icon size={14} className="mx-auto mb-0.5 text-text-muted group-hover:text-accent-purple transition-colors" />
                  <span className="text-[9px] text-text-muted group-hover:text-text-secondary">{qa.label}</span>
                </button>
              )
            })}
          </div>
        )}

        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="מה לעשות?"
              className="w-full px-3 py-2 bg-white/[0.04] rounded-xl border border-white/[0.06] text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-purple/40 focus:bg-white/[0.06] transition-all"
            />
            <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <button className="p-0.5 text-text-muted hover:text-text-secondary transition-colors"><Paperclip size={13} /></button>
              <button className="p-0.5 text-text-muted hover:text-text-secondary transition-colors"><Mic size={13} /></button>
            </div>
          </div>
          <button
            onClick={handleSend}
            className={`p-2.5 rounded-xl transition-all ${inputValue.trim() ? 'bg-accent-purple hover:bg-accent-purple/90 text-white shadow-lg shadow-accent-purple/20' : 'bg-white/[0.06] text-text-muted'}`}
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
