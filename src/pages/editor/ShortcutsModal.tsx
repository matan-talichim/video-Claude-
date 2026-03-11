import { useUIStore } from '../../stores/uiStore'

const shortcutSections = [
  {
    category: 'כללי',
    items: [
      { keys: 'Space', action: 'הפעל / השהה' },
      { keys: 'Cmd+Z', action: 'בטל' },
      { keys: 'Cmd+Shift+Z', action: 'שחזר' },
      { keys: 'Cmd+S', action: 'שמור' },
      { keys: 'Cmd+C', action: 'העתק' },
      { keys: 'Cmd+V', action: 'הדבק' },
      { keys: 'Cmd+X', action: 'גזור' },
      { keys: 'Cmd+A', action: 'בחר הכל' },
      { keys: 'Cmd+D', action: 'שכפל' },
      { keys: 'Delete', action: 'מחק נבחר' },
    ],
  },
  {
    category: 'טיימליין',
    items: [
      { keys: 'S', action: 'פצל בנקודת הפליי' },
      { keys: '← / →', action: 'הזז פריים' },
      { keys: 'Shift+← / →', action: 'הזז שנייה' },
      { keys: 'Home', action: 'התחלה' },
      { keys: 'End', action: 'סוף' },
      { keys: '+ / -', action: 'זום פנימה/החוצה' },
      { keys: 'F', action: 'התאם לחלון' },
      { keys: 'N', action: 'הפעל/כבה Snap' },
      { keys: 'R', action: 'הפעל/כבה Ripple' },
      { keys: 'M', action: 'הוסף סימן' },
    ],
  },
  {
    category: 'כלים',
    items: [
      { keys: 'T', action: 'הוסף טקסט' },
      { keys: 'H', action: 'היסטוריה' },
      { keys: '1-5', action: 'פתח פאנל צד' },
      { keys: '0', action: 'סגור פאנלים' },
      { keys: 'Esc', action: 'סגור חלון / בטל בחירה' },
      { keys: '?', action: 'קיצורי מקלדת' },
    ],
  },
]

export default function ShortcutsModal() {
  const { shortcutsModalOpen, toggleShortcutsModal } = useUIStore()

  if (!shortcutsModalOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60" onClick={toggleShortcutsModal}>
      <div
        className="bg-[#1A1A28] rounded-2xl border border-white/10 shadow-2xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white">קיצורי מקלדת</h2>
          <button onClick={toggleShortcutsModal} className="text-gray-400 hover:text-white text-lg">✕</button>
        </div>

        {shortcutSections.map((section) => (
          <div key={section.category} className="mb-6">
            <h3 className="text-sm font-semibold text-purple-400 mb-3">{section.category}</h3>
            <div className="space-y-1">
              {section.items.map((item) => (
                <div key={item.keys} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-white/5">
                  <span className="text-sm text-gray-300">{item.action}</span>
                  <kbd className="text-xs text-gray-400 font-mono bg-white/5 px-2 py-0.5 rounded border border-white/10">
                    {item.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
