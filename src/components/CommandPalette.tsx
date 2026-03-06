import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, LayoutDashboard, FolderOpen, Mic, AudioLines,
  Languages, UserCircle, Palette, Settings, Scissors,
  Wand2, FileText, Share2, Download
} from 'lucide-react'
import { useUIStore } from '../stores/uiStore'

interface CommandItem {
  id: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  shortcut?: string
  action: () => void
  group: string
}

export default function CommandPalette() {
  const { commandPaletteOpen, toggleCommandPalette } = useUIStore()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const commands: CommandItem[] = [
    // Pages
    { id: 'dashboard', icon: LayoutDashboard, label: 'דשבורד', group: 'דפים', action: () => navigate('/') },
    { id: 'projects', icon: FolderOpen, label: 'פרויקטים', group: 'דפים', action: () => navigate('/projects') },
    { id: 'recording', icon: Mic, label: 'הקלטה', group: 'דפים', action: () => navigate('/recording') },
    { id: 'voices', icon: AudioLines, label: 'קולות AI', group: 'דפים', action: () => navigate('/voices') },
    { id: 'translation', icon: Languages, label: 'תרגום', group: 'דפים', action: () => navigate('/translation') },
    { id: 'avatars', icon: UserCircle, label: 'אווטארים', group: 'דפים', action: () => navigate('/avatars') },
    { id: 'brand', icon: Palette, label: 'סטודיו מותג', group: 'דפים', action: () => navigate('/brand') },
    { id: 'settings', icon: Settings, label: 'הגדרות', shortcut: '⌘,', group: 'דפים', action: () => navigate('/settings') },
    // Tools
    { id: 'edit-filler', icon: Scissors, label: 'הסרת מילות מילוי', group: 'כלים', action: () => {} },
    { id: 'ai-enhance', icon: Wand2, label: 'שיפור AI', group: 'כלים', action: () => {} },
    { id: 'transcribe', icon: FileText, label: 'תמלול אוטומטי', group: 'כלים', action: () => {} },
    // Actions
    { id: 'share', icon: Share2, label: 'שיתוף', group: 'פעולות', action: () => {} },
    { id: 'export', icon: Download, label: 'ייצוא', group: 'פעולות', action: () => {} },
  ]

  const filtered = query
    ? commands.filter((c) => c.label.includes(query))
    : commands

  const groups = filtered.reduce<Record<string, CommandItem[]>>((acc, cmd) => {
    if (!acc[cmd.group]) acc[cmd.group] = []
    acc[cmd.group].push(cmd)
    return acc
  }, {})

  const flatFiltered = Object.values(groups).flat()

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [commandPaletteOpen])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, flatFiltered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && flatFiltered[selectedIndex]) {
      flatFiltered[selectedIndex].action()
      toggleCommandPalette()
    } else if (e.key === 'Escape') {
      toggleCommandPalette()
    }
  }

  if (!commandPaletteOpen) return null

  let globalIndex = 0

  return (
    <div className="fixed inset-0 z-[200] flex justify-center pt-[15vh]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={toggleCommandPalette} />
      <div className="relative w-full max-w-[540px] animate-scale-in" style={{ maxHeight: '60vh' }}>
        <div className="glass rounded-2xl shadow-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
            <Search size={18} className="text-text-muted shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="חפש דפים, כלים, פעולות..."
              className="flex-1 bg-transparent text-text-primary placeholder-text-muted text-sm outline-none"
            />
            <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] text-text-muted text-[10px] font-mono">ESC</kbd>
          </div>

          {/* Results */}
          <div className="max-h-[400px] overflow-y-auto py-2">
            {Object.entries(groups).map(([groupName, items]) => (
              <div key={groupName}>
                <div className="px-4 py-1.5 text-[10px] uppercase tracking-wider text-text-muted font-medium">
                  {groupName}
                </div>
                {items.map((item) => {
                  const Icon = item.icon
                  const itemIndex = globalIndex++
                  const isSelected = itemIndex === selectedIndex
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        item.action()
                        toggleCommandPalette()
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                        isSelected ? 'bg-accent-purple/10 text-text-primary' : 'text-text-secondary hover:bg-white/[0.04]'
                      }`}
                    >
                      <Icon size={16} className={isSelected ? 'text-accent-purple' : ''} />
                      <span className="flex-1 text-right">{item.label}</span>
                      {item.shortcut && (
                        <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] text-text-muted text-[10px] font-mono">{item.shortcut}</kbd>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
            {flatFiltered.length === 0 && (
              <div className="px-4 py-8 text-center text-text-muted text-sm">
                לא נמצאו תוצאות
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
