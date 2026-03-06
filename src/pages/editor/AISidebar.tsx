import { Bot, Send, Volume2, Scissors, Subtitles, Languages, Wand2, Film, ImageMinus, Eye, X } from 'lucide-react'
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

export default function AISidebar({ onClose }: { onClose: () => void }) {
  const { messages, mode, inputValue, setMode, setInputValue, addMessage } = useAIStore()

  const handleSend = () => {
    if (!inputValue.trim()) return
    addMessage('user', inputValue)
    setTimeout(() => {
      addMessage('assistant', 'מעבד את הבקשה שלך... ✅ בוצע בהצלחה!')
    }, 800)
  }

  return (
    <div className="flex flex-col h-full bg-[#16213E] rounded-xl border border-white/5 overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <Bot size={18} className="text-[#E94560]" />
          <span className="font-bold text-sm">עוזר AI</span>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-white/10 rounded transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="flex border-b border-white/10 shrink-0">
        <button
          onClick={() => setMode('execute')}
          className={`flex-1 py-2 text-xs transition-colors ${mode === 'execute' ? 'bg-[#0F3460] text-white' : 'text-white/40 hover:text-white'}`}
        >
          מצב ביצוע
        </button>
        <button
          onClick={() => setMode('discuss')}
          className={`flex-1 py-2 text-xs transition-colors ${mode === 'discuss' ? 'bg-[#0F3460] text-white' : 'text-white/40 hover:text-white'}`}
        >
          מצב דיון
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`p-3 rounded-xl text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-[#0F3460] mr-4'
                : 'bg-white/5 ml-4'
            }`}
          >
            <p className="whitespace-pre-line">{msg.content}</p>
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-white/10 space-y-3 shrink-0">
        <div className="grid grid-cols-4 gap-1.5">
          {quickActions.map((action) => {
            const Icon = action.icon
            return (
              <button
                key={action.label}
                onClick={() => addMessage('user', action.label)}
                className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-center group"
              >
                <Icon size={14} className="mx-auto mb-0.5 text-white/50 group-hover:text-white transition-colors" />
                <span className="text-[10px] text-white/40 group-hover:text-white/70">{action.label}</span>
              </button>
            )
          })}
        </div>

        <div className="flex gap-2">
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="מה לעשות?"
            className="flex-1 px-3 py-2 bg-white/5 rounded-xl border border-white/10 text-sm focus:outline-none focus:border-[#0F3460]"
          />
          <button onClick={handleSend} className="p-2 bg-[#E94560] hover:bg-[#E94560]/80 rounded-xl transition-colors">
            <Send size={16} />
          </button>
        </div>

        <div className="flex items-center justify-center gap-2 text-[10px] text-white/30">
          <span>מהיר ⚡</span>
          <span>|</span>
          <span>מאוזן ⚖️</span>
          <span>|</span>
          <span>פרימיום 👑</span>
        </div>
      </div>
    </div>
  )
}
