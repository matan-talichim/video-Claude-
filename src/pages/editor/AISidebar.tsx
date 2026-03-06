import { useState } from 'react'
import { Bot, Send, Volume2, Scissors, Subtitles, Languages, Wand2, Film, ImageMinus, Eye, X, Paperclip, Mic, Copy, ChevronDown, ChevronUp } from 'lucide-react'
import { useAIStore } from '../../stores/aiStore'

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
  { emoji: '✨', label: 'נקה אודיו' },
  { emoji: '✂️', label: 'הסר מילות מילוי' },
  { emoji: '📝', label: 'הוסף כתוביות' },
]

export default function AISidebar({ onClose }: { onClose: () => void }) {
  const { messages, mode, inputValue, setMode, setInputValue, addMessage } = useAIStore()
  const [showQuickActions, setShowQuickActions] = useState(false)
  const [isTyping, setIsTyping] = useState(false)

  const handleSend = () => {
    if (!inputValue.trim()) return
    addMessage('user', inputValue)
    setIsTyping(true)
    setTimeout(() => {
      setIsTyping(false)
      addMessage('assistant', 'מעבד את הבקשה שלך... ✅ בוצע בהצלחה!')
    }, 1200)
  }

  return (
    <div className="flex flex-col h-full glass rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-accent-purple/15 flex items-center justify-center">
            <Bot size={16} className="text-accent-purple" />
          </div>
          <span className="font-bold text-sm text-text-primary">עוזר AI</span>
          <span className="px-1.5 py-0.5 rounded-md bg-accent-purple/10 text-accent-purple text-[9px] font-mono font-medium">
            Sonnet 4.6
          </span>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-white/[0.06] rounded transition-colors text-text-muted hover:text-text-primary">
          <X size={16} />
        </button>
      </div>

      {/* Mode toggle - segmented control */}
      <div className="px-3 py-2 shrink-0">
        <div className="flex bg-white/[0.04] rounded-lg p-0.5">
          <button
            onClick={() => setMode('execute')}
            className={`flex-1 py-1.5 text-xs rounded-md transition-all font-medium ${
              mode === 'execute'
                ? 'bg-accent-purple text-white shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            ביצוע
          </button>
          <button
            onClick={() => setMode('discuss')}
            className={`flex-1 py-1.5 text-xs rounded-md transition-all font-medium ${
              mode === 'discuss'
                ? 'bg-accent-purple text-white shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            דיון
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`relative group ${
              msg.role === 'user' ? 'mr-3' : 'ml-3'
            }`}
          >
            <div
              className={`p-3 rounded-xl text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-accent-purple/15 text-text-primary border border-accent-purple/10'
                  : 'glass-light text-text-primary'
              }`}
            >
              <p className="whitespace-pre-line">{msg.content}</p>
            </div>
            {/* Copy button on hover */}
            <button className="absolute top-2 left-2 p-1 rounded bg-white/[0.06] opacity-0 group-hover:opacity-100 transition-opacity text-text-muted hover:text-text-primary">
              <Copy size={11} />
            </button>
          </div>
        ))}

        {/* Typing indicator */}
        {isTyping && (
          <div className="ml-3">
            <div className="glass-light p-3 rounded-xl inline-flex gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce-dot" />
              <div className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce-dot-2" />
              <div className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce-dot-3" />
            </div>
          </div>
        )}
      </div>

      {/* Bottom input area */}
      <div className="p-3 border-t border-white/[0.06] space-y-2 shrink-0">
        {/* Smart suggestions */}
        <div className="flex gap-1.5 overflow-x-auto">
          {smartSuggestions.map((s) => (
            <button
              key={s.label}
              onClick={() => { addMessage('user', s.label) }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.06] hover:border-accent-purple/30 hover:bg-accent-purple/5 text-xs text-text-secondary hover:text-text-primary transition-all whitespace-nowrap"
            >
              <span>{s.emoji}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>

        {/* Quick actions (collapsible) */}
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
                  onClick={() => addMessage('user', action.label)}
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

        {/* Input */}
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
              <button className="p-0.5 text-text-muted hover:text-text-secondary transition-colors">
                <Paperclip size={13} />
              </button>
              <button className="p-0.5 text-text-muted hover:text-text-secondary transition-colors">
                <Mic size={13} />
              </button>
            </div>
          </div>
          <button
            onClick={handleSend}
            className={`p-2.5 rounded-xl transition-all ${
              inputValue.trim()
                ? 'bg-accent-purple hover:bg-accent-purple/90 text-white shadow-lg shadow-accent-purple/20 animate-pulse-glow'
                : 'bg-white/[0.06] text-text-muted'
            }`}
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
