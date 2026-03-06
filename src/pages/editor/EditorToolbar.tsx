import { useState, useRef, useEffect } from 'react'
import { Mic, Scissors, RotateCcw, Clock, List, Eye, Image, Wand2, Users, Maximize2, Droplets, Share2, Upload } from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'
import { useUIStore } from '../../stores/uiStore'

interface DropdownItem {
  label: string
  icon: typeof Mic
  modal: string
}

const audioItems: DropdownItem[] = [
  { label: 'סאונד סטודיו', icon: Mic, modal: 'soundStudio' },
  { label: 'הסר מילות מילוי', icon: Scissors, modal: 'fillerWords' },
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

function Dropdown({ label, emoji, items }: { label: string; emoji: string; items: DropdownItem[] }) {
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
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${open ? 'bg-[#0F3460]' : 'hover:bg-white/10'}`}
      >
        <span>{emoji}</span>
        <span>{label}</span>
      </button>
      {open && (
        <div className="absolute top-full mt-1 right-0 bg-[#16213E] border border-white/10 rounded-xl shadow-xl py-1 min-w-[180px] z-50">
          {items.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.modal}
                onClick={() => { openModal(item.modal); setOpen(false) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/10 transition-colors"
              >
                <Icon size={14} className="text-white/50" />
                {item.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function EditorToolbar() {
  const { projectName, setProjectName } = useEditorStore()
  const { openModal } = useUIStore()

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-[#16213E]/80 backdrop-blur-sm border-b border-white/10 shrink-0">
      <div className="flex items-center gap-2">
        <Dropdown label="שמע טוב" emoji="🎵" items={audioItems} />
        <Dropdown label="תיראה טוב" emoji="🎬" items={videoItems} />
      </div>

      <input
        value={projectName}
        onChange={(e) => setProjectName(e.target.value)}
        className="bg-transparent text-center text-sm font-medium focus:outline-none focus:bg-white/5 px-3 py-1 rounded-lg border border-transparent focus:border-white/10 transition-all"
      />

      <div className="flex items-center gap-2">
        <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-sm transition-colors">
          <Share2 size={14} />
          שתף
        </button>
        <button
          onClick={() => openModal('publish')}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0F3460] hover:bg-[#0F3460]/80 rounded-lg text-sm transition-colors"
        >
          <Upload size={14} />
          פרסם
        </button>
        <button
          onClick={() => openModal('publish')}
          className="px-4 py-1.5 bg-[#E94560] hover:bg-[#E94560]/80 rounded-lg text-sm font-medium transition-colors"
        >
          ייצוא
        </button>
      </div>
    </div>
  )
}
