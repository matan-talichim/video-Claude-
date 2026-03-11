import { Scissors, Trash2, Copy, ClipboardPaste, Undo2, Redo2, Magnet, Zap, Maximize } from 'lucide-react'
import { useTimelineStore } from '../../../stores/timelineStore'
import { useEditorStore } from '../../../stores/editorStore'
import { formatTime } from '../../../hooks/useDrag'

const MIN_ZOOM = 10
const MAX_ZOOM = 500

export default function TimelineToolbar() {
  const {
    zoom, setZoom, fitToScreen,
    snapEnabled, toggleSnap,
    rippleEnabled, toggleRipple,
    speedTrimEnabled, toggleSpeedTrim,
    selectedClipIds, removeSelectedClips,
    copySelected,
    clipboard,
  } = useTimelineStore()

  const { currentTime, duration, splitAtPlayhead } = useEditorStore()
  const undoLastEdit = useEditorStore((s) => s.undoLastEdit)
  const redoLastEdit = useEditorStore((s) => s.redoLastEdit)
  const redoHistory = useEditorStore((s) => s.redoHistory)
  const pasteAtTime = useTimelineStore((s) => s.pasteAtTime)
  const editHistory = useEditorStore((s) => s.editHistory)

  const handleSplit = () => {
    splitAtPlayhead()
  }

  const handleDelete = () => {
    removeSelectedClips()
  }

  const handlePaste = () => {
    pasteAtTime(currentTime)
  }

  const handleFit = () => {
    const container = document.getElementById('timeline-tracks-container')
    if (container) {
      fitToScreen(duration, container.clientWidth)
    }
  }

  const zoomRange = MAX_ZOOM - MIN_ZOOM

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-white/[0.06] bg-bg-panel shrink-0" dir="rtl">
      {/* Left group - Edit tools */}
      <div className="flex items-center gap-0.5">
        <ToolButton icon={<Scissors size={14} />} label="פצל" shortcut="S" onClick={handleSplit} />
        <ToolButton icon={<Trash2 size={14} />} label="מחק" shortcut="Del" onClick={handleDelete} disabled={selectedClipIds.length === 0} />
        <ToolButton icon={<Copy size={14} />} label="העתק" shortcut="⌘C" onClick={copySelected} disabled={selectedClipIds.length === 0} />
        <ToolButton icon={<ClipboardPaste size={14} />} label="הדבק" shortcut="⌘V" onClick={handlePaste} disabled={clipboard.length === 0} />
        <div className="w-px h-5 bg-white/[0.08] mx-1" />
        <ToolButton icon={<Undo2 size={14} />} label="בטל" shortcut="⌘Z" onClick={() => undoLastEdit()} disabled={editHistory.length === 0} />
        <ToolButton icon={<Redo2 size={14} />} label="שחזר" shortcut="⌘⇧Z" onClick={() => redoLastEdit()} disabled={redoHistory.length === 0} />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Center group - Mode toggles */}
      <div className="flex items-center gap-1">
        <ModeToggle
          icon="🔀"
          label="Ripple"
          active={rippleEnabled}
          onClick={toggleRipple}
          tooltip="מצב Ripple - קליפים זזים בעת מחיקה (R)"
        />
        <ModeToggle
          icon={<Magnet size={14} />}
          label="Snap"
          active={snapEnabled}
          onClick={toggleSnap}
          tooltip="הצמדה - קליפים נצמדים לקצוות (N)"
        />
        <ModeToggle
          icon={<Zap size={14} />}
          label="Speed"
          active={speedTrimEnabled}
          onClick={toggleSpeedTrim}
          tooltip="גזירת מהירות - גרירת קצוות משנה מהירות"
        />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right group - Zoom & Time */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleFit}
          className="p-1 hover:bg-white/[0.06] rounded transition-colors text-text-muted hover:text-text-primary"
          title="התאם לתצוגה (F)"
        >
          <Maximize size={14} />
        </button>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom(Math.max(MIN_ZOOM, zoom - 15))}
            className="text-text-muted hover:text-text-primary text-xs font-bold w-5 h-5 flex items-center justify-center rounded hover:bg-white/[0.06]"
          >
            −
          </button>
          <div className="w-24 h-1.5 bg-white/[0.06] rounded-full relative cursor-pointer group"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const ratio = (e.clientX - rect.left) / rect.width
              setZoom(Math.round(MIN_ZOOM + ratio * zoomRange))
            }}
          >
            <div
              className="h-full bg-accent-purple/60 rounded-full transition-all"
              style={{ width: `${((zoom - MIN_ZOOM) / zoomRange) * 100}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-accent-purple rounded-full shadow-lg shadow-accent-purple/30 border-2 border-white/20 transition-all"
              style={{ left: `calc(${((zoom - MIN_ZOOM) / zoomRange) * 100}% - 6px)` }}
            />
          </div>
          <button
            onClick={() => setZoom(Math.min(MAX_ZOOM, zoom + 15))}
            className="text-text-muted hover:text-text-primary text-xs font-bold w-5 h-5 flex items-center justify-center rounded hover:bg-white/[0.06]"
          >
            +
          </button>
          <span className="text-[10px] text-text-muted font-mono w-10 text-center">{zoom}%</span>
        </div>

        <div className="w-px h-5 bg-white/[0.08]" />

        <span className="text-[11px] text-text-secondary font-mono">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
    </div>
  )
}

function ToolButton({ icon, label, shortcut, onClick, disabled }: {
  icon: React.ReactNode
  label: string
  shortcut: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors group relative ${
        disabled
          ? 'opacity-30 cursor-not-allowed'
          : 'text-text-muted hover:text-text-primary hover:bg-white/[0.06]'
      }`}
      title={`${label} (${shortcut})`}
    >
      {icon}
      <span className="hidden lg:inline">{label}</span>
    </button>
  )
}

function ModeToggle({ icon, label, active, onClick, tooltip }: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
  tooltip: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-all ${
        active
          ? 'bg-accent-purple/20 text-accent-purple border border-accent-purple/30'
          : 'text-text-muted hover:text-text-primary hover:bg-white/[0.06] border border-transparent'
      }`}
      title={tooltip}
    >
      {typeof icon === 'string' ? <span className="text-xs">{icon}</span> : icon}
      <span>{label}</span>
      {active && <span className="w-1.5 h-1.5 rounded-full bg-accent-purple" />}
    </button>
  )
}
