import { useUIStore } from '../stores/uiStore'
import Modal from './Modal'

interface ShortcutItem {
  keys: string
  description: string
}

interface ShortcutGroup {
  title: string
  shortcuts: ShortcutItem[]
}

const shortcutGroups: ShortcutGroup[] = [
  {
    title: 'כללי',
    shortcuts: [
      { keys: '⌘K', description: 'פתיחת חיפוש מהיר' },
      { keys: '?', description: 'קיצורי מקלדת' },
      { keys: '⌘S', description: 'שמירה' },
      { keys: 'Escape', description: 'סגירת חלון / ביטול' },
    ],
  },
  {
    title: 'ניווט',
    shortcuts: [
      { keys: '1', description: 'דשבורד' },
      { keys: '2', description: 'פרויקטים' },
      { keys: '3', description: 'עורך' },
      { keys: '4', description: 'הגדרות' },
    ],
  },
  {
    title: 'עורך',
    shortcuts: [
      { keys: 'Space', description: 'הפעלה / השהייה' },
      { keys: '⌘Z', description: 'ביטול פעולה' },
      { keys: '⌘⇧Z', description: 'חזרה על פעולה' },
      { keys: 'J / L', description: 'קפיצה 5 שניות' },
    ],
  },
]

export default function KeyboardShortcuts() {
  const { shortcutsModalOpen, toggleShortcutsModal } = useUIStore()

  return (
    <Modal
      isOpen={shortcutsModalOpen}
      onClose={toggleShortcutsModal}
      title="קיצורי מקלדת"
      subtitle="נווט מהר יותר עם קיצורים"
      size="md"
    >
      <div className="space-y-6">
        {shortcutGroups.map((group) => (
          <div key={group.title}>
            <h3 className="text-xs uppercase tracking-wider text-text-muted font-medium mb-3">
              {group.title}
            </h3>
            <div className="space-y-1">
              {group.shortcuts.map((shortcut) => (
                <div
                  key={shortcut.keys}
                  className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/[0.04] transition-colors"
                >
                  <span className="text-sm text-text-secondary">{shortcut.description}</span>
                  <kbd className="px-2 py-1 rounded-md bg-white/[0.06] border border-white/[0.06] text-text-primary text-xs font-mono min-w-[40px] text-center">
                    {shortcut.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}
