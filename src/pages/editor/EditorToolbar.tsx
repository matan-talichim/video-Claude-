import { useState, useRef, useEffect } from 'react'
import { Mic, Scissors, RotateCcw, Clock, List, Eye, Image, Wand2, Users, Maximize2, Droplets, Share2, Upload, Download, Undo2, Redo2, SplitSquareHorizontal, Trash2, VolumeX, History, Type, Shapes, Smile } from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'
import { useUIStore } from '../../stores/uiStore'
import EmojiPicker from './EmojiPicker'

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
  { label: 'הסר רעשים', icon: Mic, modal: 'noiseRemoval' },
]

const videoItems: DropdownItem[] = [
  { label: 'קשר עין', icon: Eye, modal: 'eyeContact' },
  { label: 'מסך ירוק', icon: Image, modal: 'greenScreen' },
  { label: 'עיצוב מהיר', icon: Wand2, modal: 'quickStyle' },
  { label: 'מרכז דובר', icon: Users, modal: 'speakerCenter' },
  { label: 'מסגור מחדש', icon: Maximize2, modal: 'reframe' },
  { label: 'טשטוש זכוכית', icon: Droplets, modal: 'glassBlur' },
]

const aiItems: DropdownItem[] = [
  { label: 'שפר אוטומטי', icon: Wand2, modal: 'quickStyle' },
  { label: 'הוסף כתוביות', icon: List, modal: 'captions' },
  { label: 'קריינות AI', icon: Mic, modal: 'voiceover' },
  { label: 'Color Grade', icon: Eye, modal: 'colorGrade' },
]

const effectsItems: DropdownItem[] = [
  { label: 'מעברים', icon: Image, modal: 'transitions' },
  { label: 'מהירות', icon: Clock, modal: 'speed' },
  { label: 'חיתוך (Crop)', icon: Maximize2, modal: 'crop' },
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
  const { projectName, setProjectName, undoLastEdit, redoLastEdit, editHistory, redoHistory, splitAtPlayhead, removeTimeRange, muteTimeRange, rangeStart, rangeEnd, currentTime, setRangeStart, setRangeEnd, clearRange } = useEditorStore()
  const { openModal, addToast } = useUIStore()

  const handleUndo = () => {
    const desc = undoLastEdit()
    if (desc) {
      addToast(`בוטל: ${desc}`, 'info')
    }
  }

  const handleRedo = () => {
    const desc = redoLastEdit()
    if (desc) {
      addToast(`שוחזר: ${desc}`, 'info')
    }
  }

  const handleSplit = () => {
    splitAtPlayhead()
    addToast('פוצל בנקודת ה-playhead', 'info')
  }

  const handleDeleteRange = () => {
    if (rangeStart !== null && rangeEnd !== null) {
      const start = Math.min(rangeStart, rangeEnd)
      const end = Math.max(rangeStart, rangeEnd)
      removeTimeRange(start, end)
      clearRange()
      addToast('נמחק קטע נבחר', 'info')
    }
  }

  const handleMuteRange = () => {
    if (rangeStart !== null && rangeEnd !== null) {
      const start = Math.min(rangeStart, rangeEnd)
      const end = Math.max(rangeStart, rangeEnd)
      muteTimeRange(start, end)
      clearRange()
      addToast('הושתק קטע נבחר', 'info')
    }
  }

  const handleSetRangeStart = () => {
    setRangeStart(currentTime)
    addToast('סומנה תחילת טווח', 'info')
  }

  const handleSetRangeEnd = () => {
    setRangeEnd(currentTime)
    addToast('סומן סוף טווח', 'info')
  }

  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const emojiRef = useRef<HTMLDivElement>(null)

  const handleAddText = () => {
    const { addTextOverlay, currentTime: ct, duration: dur, setSelectedCanvasItem } = useEditorStore.getState()
    const id = `text-${Date.now()}`
    addTextOverlay({
      id,
      text: 'טקסט חדש',
      x: 50,
      y: 50,
      width: 30,
      height: 10,
      rotation: 0,
      fontFamily: 'Heebo',
      fontSize: 32,
      fontWeight: 'normal',
      fontStyle: 'normal',
      color: '#ffffff',
      backgroundColor: '#000000',
      backgroundOpacity: 0,
      textAlign: 'center',
      lineHeight: 1.2,
      letterSpacing: 0,
      shadow: null,
      outline: null,
      animation: { entrance: 'none', exit: 'none', duration: 0.5 },
      startTime: ct,
      endTime: Math.min(ct + 5, dur || ct + 5),
    })
    setSelectedCanvasItem({ type: 'text', id })
    addToast('נוסף טקסט חדש', 'success')
  }

  const handleAddShape = () => {
    const { addShape, currentTime: ct, duration: dur, setSelectedCanvasItem } = useEditorStore.getState()
    const id = `shape-${Date.now()}`
    addShape({
      id,
      type: 'rectangle',
      x: 40,
      y: 40,
      width: 20,
      height: 15,
      rotation: 0,
      fill: '#7C5CFF',
      fillOpacity: 80,
      stroke: '#ffffff',
      strokeWidth: 2,
      cornerRadius: 8,
      startTime: ct,
      endTime: Math.min(ct + 5, dur || ct + 5),
      animation: 'none',
    })
    setSelectedCanvasItem({ type: 'shape', id })
    addToast('נוספה צורה חדשה', 'success')
  }

  const handleAddEmoji = (emoji: string) => {
    const { addSticker, currentTime: ct, duration: dur, setSelectedCanvasItem } = useEditorStore.getState()
    const id = `sticker-${Date.now()}`
    addSticker({
      id,
      emoji,
      x: 50,
      y: 50,
      size: 64,
      rotation: 0,
      startTime: ct,
      endTime: Math.min(ct + 5, dur || ct + 5),
    })
    setSelectedCanvasItem({ type: 'sticker', id })
    setShowEmojiPicker(false)
    addToast('נוסף אימוג׳י', 'success')
  }

  const [showHistory, setShowHistory] = useState(false)
  const historyRef = useRef<HTMLDivElement>(null)

  // Close history panel on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) setShowHistory(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if typing in input/textarea/contentEditable
      const tag = (e.target as HTMLElement)?.tagName
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable

      // Cmd+Z / Cmd+Shift+Z work globally (even in inputs)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) {
          handleRedo()
        } else {
          handleUndo()
        }
        return
      }

      if (isInput) return

      switch (e.key.toLowerCase()) {
        case 's':
          if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); handleSplit() }
          break
        case 'delete':
        case 'backspace':
          if (!e.metaKey && !e.ctrlKey) handleDeleteRange()
          break
        case 'm':
          if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); handleMuteRange() }
          break
        case '[':
          e.preventDefault(); handleSetRangeStart()
          break
        case ']':
          e.preventDefault(); handleSetRangeEnd()
          break
        case 'h':
          e.preventDefault(); setShowHistory((p) => !p)
          break
        case 't':
          e.preventDefault(); handleAddText()
          break
        case '?':
          e.preventDefault(); useUIStore.getState().toggleShortcutsModal()
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  const hasRange = rangeStart !== null && rangeEnd !== null

  return (
    <div className="flex items-center justify-between px-4 h-12 bg-bg-panel border-b border-white/[0.06] shrink-0">
      <div className="flex items-center gap-2">
        <Dropdown label="שמע טוב" emoji="🎵" items={audioItems} accentColor="text-accent-purple" />
        <Dropdown label="תיראה טוב" emoji="🎬" items={videoItems} accentColor="text-accent-blue" />
        <Dropdown label="AI" emoji="🤖" items={aiItems} accentColor="text-accent-pink" />
        <Dropdown label="אפקטים" emoji="✨" items={effectsItems} accentColor="text-yellow-400" />
        <div className="w-px h-5 bg-white/[0.06] mx-1" />
        {/* Cut/Split tools */}
        <button
          onClick={handleSplit}
          className="flex items-center gap-1 px-2 py-1.5 hover:bg-white/[0.06] rounded-lg transition-colors text-text-muted hover:text-text-primary text-xs"
          title="S - פיצול בנקודת playhead"
        >
          <SplitSquareHorizontal size={14} />
          <span className="hidden xl:inline">פצל</span>
        </button>
        <button
          onClick={handleSetRangeStart}
          className="px-1.5 py-1.5 hover:bg-white/[0.06] rounded-lg transition-colors text-text-muted hover:text-text-primary text-xs font-mono"
          title="[ - סמן תחילת טווח"
        >
          [
        </button>
        <button
          onClick={handleSetRangeEnd}
          className="px-1.5 py-1.5 hover:bg-white/[0.06] rounded-lg transition-colors text-text-muted hover:text-text-primary text-xs font-mono"
          title="] - סמן סוף טווח"
        >
          ]
        </button>
        <button
          onClick={handleDeleteRange}
          disabled={!hasRange}
          className="flex items-center gap-1 px-2 py-1.5 hover:bg-red-500/10 rounded-lg transition-colors text-text-muted hover:text-red-400 disabled:opacity-30 text-xs"
          title="Delete - מחק טווח נבחר"
        >
          <Trash2 size={14} />
          <span className="hidden xl:inline">מחק</span>
        </button>
        <button
          onClick={handleMuteRange}
          disabled={!hasRange}
          className="flex items-center gap-1 px-2 py-1.5 hover:bg-yellow-500/10 rounded-lg transition-colors text-text-muted hover:text-yellow-400 disabled:opacity-30 text-xs"
          title="M - השתק טווח נבחר"
        >
          <VolumeX size={14} />
          <span className="hidden xl:inline">השתק</span>
        </button>
        <div className="w-px h-5 bg-white/[0.06] mx-1" />
        {/* Creative tools */}
        <button
          onClick={handleAddText}
          className="flex items-center gap-1 px-2 py-1.5 hover:bg-white/[0.06] rounded-lg transition-colors text-text-muted hover:text-text-primary text-xs"
          title="T - הוסף טקסט"
        >
          <Type size={14} />
          <span className="hidden xl:inline">טקסט</span>
        </button>
        <button
          onClick={handleAddShape}
          className="flex items-center gap-1 px-2 py-1.5 hover:bg-white/[0.06] rounded-lg transition-colors text-text-muted hover:text-text-primary text-xs"
          title="הוסף צורה"
        >
          <Shapes size={14} />
          <span className="hidden xl:inline">צורה</span>
        </button>
        <div className="relative" ref={emojiRef}>
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="flex items-center gap-1 px-2 py-1.5 hover:bg-white/[0.06] rounded-lg transition-colors text-text-muted hover:text-text-primary text-xs"
            title="הוסף אימוג'י"
          >
            <Smile size={14} />
            <span className="hidden xl:inline">אימוג׳י</span>
          </button>
          {showEmojiPicker && (
            <div className="absolute top-full mt-2 right-0 z-50 animate-scale-in">
              <EmojiPicker onSelect={handleAddEmoji} onClose={() => setShowEmojiPicker(false)} />
            </div>
          )}
        </div>
        <div className="w-px h-5 bg-white/[0.06] mx-1" />
        <button
          onClick={handleUndo}
          disabled={editHistory.length === 0}
          className="p-1.5 hover:bg-white/[0.06] rounded-lg transition-colors text-text-muted hover:text-text-primary disabled:opacity-30"
          title={editHistory.length > 0 ? `בטל: ${editHistory[editHistory.length - 1]?.description} (⌘Z)` : '⌘Z'}
        >
          <Undo2 size={15} />
        </button>
        <button
          onClick={handleRedo}
          disabled={redoHistory.length === 0}
          className="p-1.5 hover:bg-white/[0.06] rounded-lg transition-colors text-text-muted hover:text-text-primary disabled:opacity-30"
          title={redoHistory.length > 0 ? `שחזר: ${redoHistory[redoHistory.length - 1]?.description} (⌘⇧Z)` : '⌘⇧Z'}
        >
          <Redo2 size={15} />
        </button>
        <div className="relative" ref={historyRef}>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="p-1.5 hover:bg-white/[0.06] rounded-lg transition-colors text-text-muted hover:text-text-primary"
            title="היסטוריית עריכה (H)"
          >
            <History size={15} />
          </button>
          {showHistory && (
            <div className="absolute top-full mt-2 left-0 glass rounded-xl shadow-2xl py-2 min-w-[280px] max-h-[320px] overflow-y-auto z-50 animate-scale-in" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="px-3 pb-2 border-b border-white/[0.06] flex items-center justify-between">
                <span className="text-xs font-medium text-text-primary">היסטוריית עריכה</span>
                {editHistory.length > 0 && (
                  <button onClick={() => { /* would need a clearHistory method */ }} className="text-[10px] text-text-muted hover:text-red-400 transition-colors">נקה</button>
                )}
              </div>
              {editHistory.length === 0 && redoHistory.length === 0 && (
                <div className="px-3 py-4 text-center text-xs text-text-muted">אין פעולות בהיסטוריה</div>
              )}
              {/* Redo entries (future) */}
              {redoHistory.slice().reverse().map((entry, i) => (
                <div key={`redo-${i}`} className="px-3 py-1.5 text-xs text-text-muted/50 flex items-center gap-2">
                  <span className="w-12 font-mono text-[10px]">{new Date(entry.timestamp).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="flex-1">{entry.description}</span>
                </div>
              ))}
              {/* Current position indicator */}
              {editHistory.length > 0 && (
                <div className="px-3 py-0.5"><div className="border-t border-accent-purple/40" /></div>
              )}
              {/* Edit history entries */}
              {editHistory.slice().reverse().map((entry, i) => (
                <div key={`edit-${i}`} className={`px-3 py-1.5 text-xs flex items-center gap-2 ${i === 0 ? 'text-accent-purple bg-accent-purple/5' : 'text-text-secondary'}`}>
                  {i === 0 && <span className="text-accent-purple">→</span>}
                  <span className="w-12 font-mono text-[10px]">{new Date(entry.timestamp).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="flex-1">{entry.description}</span>
                </div>
              ))}
            </div>
          )}
        </div>
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
