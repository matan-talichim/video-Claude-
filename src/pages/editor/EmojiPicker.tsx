import { useState } from 'react'

const categories: Record<string, string[]> = {
  'פופולרי': ['😀','😂','❤️','🔥','⭐','✨','💯','🎉','👏','🙌','💪','🚀','✅','❌','⚡'],
  'פנים': ['😊','😍','🤔','😎','🥳','😢','😤','🤯','😱','🤩','😴','🥰','😏','🙄','😇'],
  'ידיים': ['👍','👎','👋','🤝','✌️','🤞','👆','👇','👈','👉','🫶','🤟','🖐️','✊','🫡'],
  'חפצים': ['🎬','🎥','📹','🎤','🎧','💡','📱','💻','📷','🎵','🔔','⏰','📌','🏆','🎯'],
  'חיצים': ['➡️','⬅️','⬆️','⬇️','↗️','↘️','↙️','↖️','↕️','↔️','🔄','🔃','🔙','🔚','🔛'],
  'סמלים': ['⚠️','🔴','🟢','🔵','🟡','🟣','⬛','⬜','🔶','🔷','💜','💚','💛','🤍','🖤'],
}

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  onClose: () => void
}

export default function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const [search, setSearch] = useState('')

  const filteredCategories = search
    ? { 'תוצאות': Object.values(categories).flat().filter((e) => e.includes(search)) }
    : categories

  return (
    <div className="bg-[#1A1A28] rounded-xl p-4 max-h-80 overflow-y-auto border border-white/10 shadow-2xl" dir="rtl">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-white font-medium">בחר אימוג׳י</span>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-sm">✕</button>
      </div>
      <input
        placeholder="חפש אימוג'י..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full bg-black/30 rounded p-2 mb-3 text-white text-sm border border-white/10 focus:border-purple-500 focus:outline-none"
      />
      {Object.entries(filteredCategories).map(([cat, emojis]) => (
        <div key={cat} className="mb-3">
          <h4 className="text-gray-400 text-xs mb-1">{cat}</h4>
          <div className="grid grid-cols-8 gap-1">
            {emojis.map((emoji, i) => (
              <button
                key={`${emoji}-${i}`}
                onClick={() => onSelect(emoji)}
                className="text-2xl hover:bg-white/10 rounded p-1 transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
