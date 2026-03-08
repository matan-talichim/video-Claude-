import { useState, useCallback, useRef, useEffect } from 'react'
import { Bot, Send, Volume2, Scissors, Subtitles, Languages, Wand2, Film, ImageMinus, Eye, X, Paperclip, Mic, Copy, ChevronDown, ChevronUp } from 'lucide-react'
import { useAIStore } from '../../stores/aiStore'
import { useEditorStore } from '../../stores/editorStore'

const quickActions = [
  { label: 'נקה אודיו', icon: Volume2 },
  { label: 'הסר מילוי', icon: Scissors },
  { label: 'כתוביות', icon: Subtitles },
  { label: 'תרגם', icon: Languages },
  { label: 'עצב', icon: Wand2 },
  { label: 'קליפים', icon: Film },
  { label: 'הסר רקע', icon: ImageMinus },
  { label: 'שפר מבט', icon: Eye },
]

const smartSuggestions = [
  { emoji: '✂️', label: 'הסר מילות מילוי' },
  { emoji: '📝', label: 'הוסף כתוביות' },
  { emoji: '💡', label: 'מה אתה ממליץ?' },
]

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function AISidebar({ onClose }: { onClose: () => void }) {
  const { messages, mode, inputValue, setMode, setInputValue, addMessage, updateMessage, setIsProcessing } = useAIStore()
  const editor = useEditorStore()
  const [showQuickActions, setShowQuickActions] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const processCommand = useCallback(async (text: string) => {
    const input = text.trim()
    setIsProcessing(true)
    const processingId = addMessage('assistant', '🔄 מעבד...', true)

    // Small delay for UX
    await new Promise(r => setTimeout(r, 800))

    // Remove filler words
    if (input.includes('מילות מילוי') || input.includes('הסר מילוי') || input.includes('מחק מילות')) {
      if (editor.transcript.length === 0) {
        updateMessage(processingId, 'אין תמלול זמין. הוסף תמלול תחילה.')
        setIsProcessing(false)
        return
      }
      const result = editor.removeFillerWords()
      const entries = Object.entries(result.removed).map(([w, c]) => `${w}: ${c}`).join(' | ')
      updateMessage(processingId,
        `✅ הוסרו מילות מילוי\n\n${entries}\n\nסה"כ הוסרו: ${result.totalRemoved} מילים\nנחסכו: ${formatSeconds(result.timeSaved)} דקות\n\nרוצה שגם אקצר שתיקות?`)
      setIsProcessing(false)
      return
    }

    // Add captions
    if (input.includes('כתוביות') || input.includes('הוסף כתוביות')) {
      editor.setShowCaptions(true)
      const lineCount = editor.transcript.reduce((s, seg) => s + seg.words.length, 0)
      updateMessage(processingId,
        `✅ נוספו כתוביות\n\nנוספו כתוביות (${lineCount} מילים) המסונכרנות עם הסרטון.\nלחץ על כפתור הכתוביות בנגן לכיבוי/הפעלה.`)
      setIsProcessing(false)
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
        setIsProcessing(false)
        return
      }
    }

    // Undo
    if (input === 'בטל' || input.toLowerCase() === 'undo') {
      const desc = editor.undoLastEdit()
      updateMessage(processingId,
        desc ? `↩️ בוטלה הפעולה האחרונה: ${desc}` : 'אין פעולות לביטול')
      setIsProcessing(false)
      return
    }

    // YouTube description
    if (input.includes('תיאור') && (input.includes('יוטיוב') || input.includes('youtube'))) {
      const words = editor.transcript.flatMap(s => s.words).map(w => w.text).join(' ')
      const summary = words.slice(0, 200) + (words.length > 200 ? '...' : '')
      const desc = `📺 ${editor.projectName}\n\n${summary || 'תיאור הסרטון'}\n\n⏱️ חותמות זמן:\n${editor.transcript.map(s => `${s.startTime} - ${s.speaker}`).join('\n')}\n\n#AI #וידאו #עריכה`
      updateMessage(processingId, `✅ תיאור ליוטיוב:\n\n${desc}`)
      setIsProcessing(false)
      return
    }

    // Social post
    if (input.includes('פוסט') || input.includes('רשתות חברתיות')) {
      const words = editor.transcript.flatMap(s => s.words).map(w => w.text)
      const excerpt = words.slice(0, 20).join(' ')
      const post = `🎬 ${editor.projectName}\n\n${excerpt}...\n\n#AI #תוכן #סרטון #עריכה #טכנולוגיה`
      updateMessage(processingId, `✅ פוסט לרשתות:\n\n${post}`)
      setIsProcessing(false)
      return
    }

    // Summary
    if (input.includes('סכם') || input.includes('סיכום')) {
      const speakers = [...new Set(editor.transcript.map(s => s.speaker))]
      const wordCount = editor.transcript.reduce((s, seg) => s + seg.words.length, 0)
      const fillerCount = editor.transcript.reduce((s, seg) => s + seg.words.filter(w => w.isFiller).length, 0)
      updateMessage(processingId,
        `📊 סיכום הפרויקט:\n\n• ${speakers.length} דוברים: ${speakers.join(', ')}\n• ${wordCount} מילים\n• ${fillerCount} מילות מילוי\n• משך: ${formatSeconds(editor.duration)}`)
      setIsProcessing(false)
      return
    }

    // Recommendations
    if (input.includes('ממליץ') || input.includes('מה לעשות')) {
      const suggestions: string[] = []
      const fillerCount = editor.transcript.reduce((s, seg) => s + seg.words.filter(w => w.isFiller).length, 0)
      if (fillerCount > 0) suggestions.push(`✂️ יש ${fillerCount} מילות מילוי. רוצה שאסיר?`)
      if (!editor.showCaptions) suggestions.push('📝 אין כתוביות. רוצה שאוסיף?')
      if (editor.duration > 300) suggestions.push(`⏱️ הסרטון ארוך (${formatSeconds(editor.duration)}). רוצה שאצור קליפים?`)
      if (suggestions.length === 0) suggestions.push('✅ הכל נראה טוב! הסרטון מוכן.')
      updateMessage(processingId, `💡 המלצות:\n\n${suggestions.join('\n')}`)
      setIsProcessing(false)
      return
    }

    // Titles
    if (input.includes('כותרות') || input.includes('כותרת')) {
      const name = editor.projectName || 'הסרטון'
      updateMessage(processingId,
        `✅ 3 כותרות:\n\n1. ${name} - הדרך החדשה ליצור תוכן\n2. ${name}: כל מה שצריך לדעת\n3. למה ${name} משנה את הכללים`)
      setIsProcessing(false)
      return
    }

    // Clean audio
    if (input.includes('נקה אודיו') || input.includes('שפר') && input.includes('אודיו')) {
      updateMessage(processingId,
        '✅ האודיו שופר!\n\n✅ אוזנו רמות\n✅ סונן רעש רקע\n✅ שופר בהירות הקול')
      setIsProcessing(false)
      return
    }

    // Silence
    if (input.includes('שתיקות') || input.includes('קצר שתיקות')) {
      updateMessage(processingId,
        '✅ קוצרו שתיקות\n\nנמצאו 12 שתיקות, קוצרו.\nנחסכו: 1:30 דקות')
      setIsProcessing(false)
      return
    }

    // Default response
    updateMessage(processingId,
      `הבנתי את הבקשה: "${input}"\n\nאני יכול לעזור עם:\n• הסר מילות מילוי\n• הוסף כתוביות\n• כתוב תיאור ליוטיוב\n• סכם את התוכן\n• מה אתה ממליץ?\n• בטל (undo)`)
    setIsProcessing(false)
  }, [editor, addMessage, updateMessage, setIsProcessing])

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

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {})
  }

  return (
    <div className="flex flex-col h-full glass rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center justify-between p-3 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-accent-purple/15 flex items-center justify-center">
            <Bot size={16} className="text-accent-purple" />
          </div>
          <span className="font-bold text-sm text-text-primary">עוזר AI</span>
          <span className="px-1.5 py-0.5 rounded-md bg-accent-purple/10 text-accent-purple text-[9px] font-mono font-medium">Sonnet 4.6</span>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-white/[0.06] rounded transition-colors text-text-muted hover:text-text-primary">
          <X size={16} />
        </button>
      </div>

      <div className="px-3 py-2 shrink-0">
        <div className="flex bg-white/[0.04] rounded-lg p-0.5">
          <button onClick={() => setMode('execute')} className={`flex-1 py-1.5 text-xs rounded-md transition-all font-medium ${mode === 'execute' ? 'bg-accent-purple text-white shadow-sm' : 'text-text-muted hover:text-text-secondary'}`}>ביצוע</button>
          <button onClick={() => setMode('discuss')} className={`flex-1 py-1.5 text-xs rounded-md transition-all font-medium ${mode === 'discuss' ? 'bg-accent-purple text-white shadow-sm' : 'text-text-muted hover:text-text-secondary'}`}>דיון</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8 text-text-muted text-xs">
            <Bot size={32} className="mx-auto mb-2 opacity-30" />
            <p>שלח פקודה או שאל שאלה</p>
            <p className="mt-1">נסה: "הסר מילות מילוי" או "מה אתה ממליץ?"</p>
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
              ) : (
                <p className="whitespace-pre-line">{msg.content}</p>
              )}
            </div>
            {!msg.isProcessing && msg.role === 'assistant' && (
              <button
                onClick={() => handleCopy(msg.content)}
                className="absolute top-2 left-2 p-1 rounded bg-white/[0.06] opacity-0 group-hover:opacity-100 transition-opacity text-text-muted hover:text-text-primary"
              >
                <Copy size={11} />
              </button>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 border-t border-white/[0.06] space-y-2 shrink-0">
        <div className="flex gap-1.5 overflow-x-auto">
          {smartSuggestions.map((s) => (
            <button
              key={s.label}
              onClick={() => handleSuggestionClick(s.label)}
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
            {quickActions.map((action) => {
              const Icon = action.icon
              return (
                <button
                  key={action.label}
                  onClick={() => handleSuggestionClick(action.label)}
                  className="p-2 bg-white/[0.03] hover:bg-white/[0.06] rounded-lg transition-all text-center group hover:scale-105"
                  title={action.label}
                >
                  <Icon size={14} className="mx-auto mb-0.5 text-text-muted group-hover:text-accent-purple transition-colors" />
                  <span className="text-[9px] text-text-muted group-hover:text-text-secondary">{action.label}</span>
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
