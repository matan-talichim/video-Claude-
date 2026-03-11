import { useState } from 'react'
import { useTimelineStore } from '../../stores/timelineStore'

const transitions = [
  { id: 'none', name: 'ללא', icon: '✂️' },
  { id: 'fade', name: 'עמעום', icon: '🌅' },
  { id: 'dissolve', name: 'המסה', icon: '💫' },
  { id: 'slideLeft', name: 'החלקה שמאלה', icon: '⬅️' },
  { id: 'slideRight', name: 'החלקה ימינה', icon: '➡️' },
  { id: 'zoom', name: 'זום פנימה', icon: '🔍' },
  { id: 'spin', name: 'סיבוב', icon: '🌀' },
  { id: 'blur', name: 'טשטוש', icon: '🌫️' },
  { id: 'flash', name: 'הבזק', icon: '⚡' },
  { id: 'glitch', name: "גליץ'", icon: '📺' },
  { id: 'wipe', name: 'מחיקה שמאלה', icon: '🧹' },
] as const

interface TransitionsLibraryProps {
  clipBeforeId: string
  clipAfterId: string
  onClose: () => void
}

export default function TransitionsLibrary({ clipBeforeId, clipAfterId, onClose }: TransitionsLibraryProps) {
  const [transitionDuration, setTransitionDuration] = useState(0.5)
  const addTransition = useTimelineStore((s) => s.addTransition)

  const handleApply = (type: string) => {
    addTransition({
      id: `transition-${Date.now()}`,
      type: type as any,
      duration: transitionDuration,
      clipBeforeId,
      clipAfterId,
    })
    onClose()
  }

  return (
    <div className="bg-[#1A1A28] rounded-xl p-4 border border-white/10 shadow-2xl" dir="rtl">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-white font-medium">מעברים</span>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-sm">✕</button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {transitions.map((t) => (
          <button
            key={t.id}
            onClick={() => handleApply(t.id)}
            className="bg-white/5 hover:bg-purple-500/20 rounded-lg p-3 text-center transition-colors"
          >
            <span className="text-2xl block mb-1">{t.icon}</span>
            <span className="text-xs text-gray-300">{t.name}</span>
          </button>
        ))}
      </div>

      <div className="mt-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">משך מעבר:</span>
          <input
            type="range"
            min="0.2"
            max="2"
            step="0.1"
            value={transitionDuration}
            onChange={(e) => setTransitionDuration(+e.target.value)}
            className="flex-1 accent-purple-500"
          />
          <span className="text-white text-sm">{transitionDuration}שנ</span>
        </div>
      </div>
    </div>
  )
}
