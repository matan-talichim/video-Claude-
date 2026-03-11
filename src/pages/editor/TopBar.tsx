import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEditorStore } from '../../stores/editorStore'
import { useUIStore } from '../../stores/uiStore'
import { useTimelineStore } from '../../stores/timelineStore'

interface TopBarProps {
  lastSaved: Date | null
  onSave: () => void
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'לפני רגע'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `לפני ${minutes} דקות`
  const hours = Math.floor(minutes / 60)
  return `לפני ${hours} שעות`
}

export default function TopBar({ lastSaved, onSave }: TopBarProps) {
  const navigate = useNavigate()
  const projectName = useEditorStore((s) => s.projectName)
  const setProjectName = useEditorStore((s) => s.setProjectName)
  const undoLastEdit = useEditorStore((s) => s.undoLastEdit)
  const redoLastEdit = useEditorStore((s) => s.redoLastEdit)
  const editHistory = useEditorStore((s) => s.editHistory)
  const redoHistory = useEditorStore((s) => s.redoHistory)
  const splitAtPlayhead = useEditorStore((s) => s.splitAtPlayhead)
  const saveVersion = useEditorStore((s) => s.saveVersion)
  const versions = useEditorStore((s) => s.versions)
  const isDirty = useEditorStore((s) => s.isDirty)
  const openModal = useUIStore((s) => s.openModal)
  const removeSelectedClips = useTimelineStore((s) => s.removeSelectedClips)
  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds)

  const [showVersions, setShowVersions] = useState(false)

  const canUndo = editHistory.length > 0
  const canRedo = redoHistory.length > 0

  return (
    <div className="h-12 flex items-center justify-between px-4 bg-[#0D0D15] border-b border-white/5 shrink-0" dir="rtl">
      {/* RIGHT: Logo + Project name + Last saved */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/')} className="text-purple-400 font-bold text-sm">
          סטודיו AI
        </button>
        <span className="text-white/20">|</span>
        <input
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          className="bg-transparent text-white text-sm font-medium border-none outline-none hover:bg-white/5 px-2 py-1 rounded max-w-[200px]"
        />
        <span className="text-gray-600 text-xs">
          {lastSaved ? `נשמר ${formatTimeAgo(lastSaved)}` : isDirty ? 'לא נשמר' : ''}
        </span>
      </div>

      {/* CENTER: Quick tools */}
      <div className="flex items-center gap-1">
        <ToolButton icon="↩" tooltip="בטל (⌘Z)" onClick={() => undoLastEdit()} disabled={!canUndo} />
        <ToolButton icon="↪" tooltip="שחזר (⌘⇧Z)" onClick={() => redoLastEdit()} disabled={!canRedo} />
        <div className="w-px h-5 bg-white/10 mx-1" />
        <ToolButton icon="✂️" tooltip="פצל (S)" onClick={splitAtPlayhead} />
        <ToolButton icon="🗑" tooltip="מחק (Del)" onClick={removeSelectedClips} disabled={selectedClipIds.length === 0} />
      </div>

      {/* LEFT: Versions + Share + Export */}
      <div className="flex items-center gap-2 relative">
        <button
          onClick={() => setShowVersions(!showVersions)}
          className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-white/5"
        >
          📋 גרסאות
        </button>
        <button
          onClick={onSave}
          className="bg-white/10 hover:bg-white/15 text-white px-4 py-1.5 rounded-lg text-sm"
        >
          💾 שמור
        </button>
        <button
          onClick={() => openModal('export')}
          className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium"
        >
          ⬇ ייצוא
        </button>

        {/* Versions dropdown */}
        {showVersions && (
          <div className="absolute top-full left-0 mt-1 w-64 bg-[#1A1A28] border border-white/10 rounded-lg shadow-xl z-50 p-3" dir="rtl">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-white text-sm font-medium">📋 גרסאות</h4>
              <button onClick={() => setShowVersions(false)} className="text-gray-400 hover:text-white text-xs">✕</button>
            </div>
            <button
              onClick={() => { saveVersion(); }}
              className="w-full bg-white/5 hover:bg-white/10 text-white text-sm py-2 rounded-lg mb-2"
            >
              💾 שמור גרסה
            </button>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {versions.length === 0 && (
                <p className="text-gray-600 text-xs text-center py-2">אין גרסאות שמורות</p>
              )}
              {versions.map((v) => (
                <div key={v.id} className="flex justify-between items-center py-1.5 px-2 rounded hover:bg-white/5 text-xs">
                  <span className="text-gray-300">{v.name}</span>
                  <button
                    onClick={() => { useEditorStore.getState().restoreVersion(v.id); setShowVersions(false); }}
                    className="text-purple-400 hover:text-purple-300"
                  >
                    שחזר
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ToolButton({ icon, tooltip, onClick, disabled }: { icon: string; tooltip: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm transition group relative ${
        disabled ? 'text-gray-700 cursor-not-allowed' : 'text-gray-400 hover:text-white hover:bg-white/10'
      }`}
      title={tooltip}
    >
      {icon}
    </button>
  )
}
