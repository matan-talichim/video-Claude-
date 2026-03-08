import { useState, useRef, useEffect } from 'react'
import { Mic, Scissors, RotateCcw, Clock, List, Eye, Image, Wand2, Users, Maximize2, Droplets, Share2, Upload, Download, Undo2, Redo2 } from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'
import { useUIStore } from '../../stores/uiStore'

interface DropdownItem {
  label: string
  icon: typeof Mic
  modal: string
  shortcut?: string
}

const audioItems: DropdownItem[] = [
  { label: 'סאונד סטודיו', icon: Mic, modal: 'soundStudio', shortcut: '⌘1' },
  { label: 'הסר מילות מילוי', icon: Scissors, modal: 'fillerWords', shortcut: '⌘2' },
  { label: 'הסר חזרות', icon: RotateCcw, modal: 'retakes' },
  { label: 'קצר שתיקות', icon: Clock, modal: 'silence' },
  { label: 'פרקים אוטומטיים', icon: List, modal: 'chapters' },
]

const videoItems: DropdownItem[] = [
  { label: 'קשר עין', icon: Eye, modal: 'eyeContact' },
  { label: 'מסך ירוק', icon: Image, modal: 'greenScreen' },
  { label: 'עיצוב מהיר', icon: Wand2, modal: 'quickStyle' },
  { label: 'מרכז דובר', icon: Users, modal: 'speakerCenter' },
  { label: 'מסגור מחדש', icon: Maximize2, modal: 'reframe' },
  { label: 'טשטוש זכוכית', icon: Droplets, modal: 'glassBlur' },
]

function Dropdown({ label, emoji, items, accentColor }: { label: string; emoji: string; items: DropdownItem[]; accentColor: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { openModal } = useUIStore()

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${
          open
            ? `${accentColor} border-current`
            : `text-text-secondary hover:text-text-primary border-white/[0.06] hover:border-white/[0.12]`
        }`}
      >
        <span>{emoji}</span>
        <span>{label}</span>
      </button>
      {open && (
        <div className="absolute top-full mt-2 right-0 glass rounded-xl shadow-2xl py-1 min-w-[200px] z-50 animate-scale-in" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
          {items.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.modal}
                onClick={() => { openModal(item.modal); setOpen(false) }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-white/[0.06] transition-colors"
              >
                <Icon size={15} className="text-text-muted" />
                <span className="flex-1 text-right">{item.label}</span>
                {item.shortcut && (
                  <kbd className="text-[10px] text-text-muted font-mono">{item.shortcut}</kbd>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function EditorToolbar() {
  const { projectName, setProjectName, undoLastEdit, editHistory } = useEditorStore()
  const { openModal, addToast } = useUIStore()

  const handleUndo = () => {
    const desc = undoLastEdit()
    if (desc) {
      addToast(`בוטל: ${desc}`, 'info')
    }
  }

  return (
    <div className="flex items-center justify-between px-4 h-12 bg-bg-panel border-b border-white/[0.06] shrink-0">
      <div className="flex items-center gap-2">
        <Dropdown label="שמע טוב" emoji="🎵" items={audioItems} accentColor="text-accent-purple" />
        <Dropdown label="תיראה טוב" emoji="🎬" items={videoItems} accentColor="text-accent-blue" />
        <div className="w-px h-5 bg-white/[0.06] mx-1" />
        <button
          onClick={handleUndo}
          disabled={editHistory.length === 0}
          className="p-1.5 hover:bg-white/[0.06] rounded-lg transition-colors text-text-muted hover:text-text-primary disabled:opacity-30"
          title="⌘Z"
        >
          <Undo2 size={15} />
        </button>
        <button className="p-1.5 hover:bg-white/[0.06] rounded-lg transition-colors text-text-muted hover:text-text-primary opacity-30" title="⌘⇧Z">
          <Redo2 size={15} />
        </button>
      </div>

      <input
        value={projectName}
        onChange={(e) => setProjectName(e.target.value)}
        className="bg-transparent text-center text-sm font-medium text-text-primary focus:outline-none focus:bg-white/[0.04] px-3 py-1 rounded-lg border border-transparent focus:border-white/[0.08] transition-all"
      />

      <div className="flex items-center gap-2">
        <button
          onClick={() => openModal('share')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-text-secondary hover:text-text-primary hover:bg-white/[0.06] rounded-lg text-sm transition-all"
        >
          <Share2 size={14} />
          שתף
        </button>
        <button
          onClick={() => openModal('export')}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-white/[0.08] hover:border-white/[0.16] rounded-lg text-sm text-text-secondary hover:text-text-primary transition-all"
        >
          <Download size={14} />
          ייצוא
        </button>
        <button
          onClick={() => openModal('publish')}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-accent-purple hover:bg-accent-purple/90 rounded-lg text-sm font-medium text-white transition-all shadow-lg shadow-accent-purple/20"
        >
          <Upload size={14} />
          פרסם
        </button>
      </div>
    </div>
  )
}
