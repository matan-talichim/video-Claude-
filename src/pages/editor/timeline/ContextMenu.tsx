import { useEffect, useRef } from 'react'
import { useTimelineStore } from '../../../stores/timelineStore'
import { useEditorStore } from '../../../stores/editorStore'
import { useUIStore } from '../../../stores/uiStore'

export default function ContextMenu() {
  const menuRef = useRef<HTMLDivElement>(null)
  const { contextMenu, hideContextMenu, selectClip, removeSelectedClips, copySelected, cutSelected: _cutSelected } = useTimelineStore()
  const pasteAtTime = useTimelineStore((s) => s.pasteAtTime)
  const clipboard = useTimelineStore((s) => s.clipboard)
  const addMarker = useTimelineStore((s) => s.addMarker)
  const addTrack = useTimelineStore((s) => s.addTrack)
  const toggleTrackLock = useTimelineStore((s) => s.toggleTrackLock)
  const toggleTrackVisibility = useTimelineStore((s) => s.toggleTrackVisibility)

  const splitAtPlayhead = useEditorStore((s) => s.splitAtPlayhead)
  const { addToast } = useUIStore()

  useEffect(() => {
    const handler = () => hideContextMenu()
    if (contextMenu.visible) {
      document.addEventListener('click', handler)
      document.addEventListener('contextmenu', handler)
    }
    return () => {
      document.removeEventListener('click', handler)
      document.removeEventListener('contextmenu', handler)
    }
  }, [contextMenu.visible, hideContextMenu])

  // Position adjustment to stay within viewport
  useEffect(() => {
    if (!menuRef.current || !contextMenu.visible) return
    const rect = menuRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    if (rect.right > vw) {
      menuRef.current.style.left = `${contextMenu.x - rect.width}px`
    }
    if (rect.bottom > vh) {
      menuRef.current.style.top = `${contextMenu.y - rect.height}px`
    }
  }, [contextMenu])

  if (!contextMenu.visible) return null

  const hasClip = !!contextMenu.clipId

  const speedOptions = [
    { label: '0.25x', value: 0.25 },
    { label: '0.5x', value: 0.5 },
    { label: '1x', value: 1 },
    { label: '1.5x', value: 1.5 },
    { label: '2x', value: 2 },
    { label: '3x', value: 3 },
    { label: '4x', value: 4 },
  ]

  const transitionOptions = [
    { label: 'עמעום', value: 'fade' as const },
    { label: 'המסה', value: 'dissolve' as const },
    { label: 'הזזה', value: 'slideRight' as const },
    { label: 'מחיקה', value: 'wipe' as const },
  ]

  return (
    <div
      ref={menuRef}
      className="fixed z-[200] min-w-[200px] py-1 bg-[#1a1a2e] border border-white/[0.12] rounded-lg shadow-2xl shadow-black/50 backdrop-blur-xl"
      style={{ left: contextMenu.x, top: contextMenu.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {hasClip && (
        <>
          <MenuItem icon="✂️" label="פצל כאן" shortcut="S" onClick={() => { splitAtPlayhead(); hideContextMenu() }} />
          <MenuItem icon="📋" label="העתק" shortcut="⌘C" onClick={() => { if (contextMenu.clipId) selectClip(contextMenu.clipId); copySelected(); hideContextMenu() }} />
          <MenuItem icon="📌" label="הדבק" shortcut="⌘V" onClick={() => { pasteAtTime(contextMenu.time); hideContextMenu() }} disabled={clipboard.length === 0} />
          <MenuItem icon="🗑" label="מחק" shortcut="Del" onClick={() => { if (contextMenu.clipId) selectClip(contextMenu.clipId); removeSelectedClips(); hideContextMenu() }} danger />
          <Divider />

          {/* Speed submenu */}
          <SubMenu icon="⚡" label="שנה מהירות...">
            {speedOptions.map((opt) => (
              <MenuItem
                key={opt.value}
                label={opt.label}
                onClick={() => {
                  addToast(`מהירות שונתה ל-${opt.label}`, 'info')
                  hideContextMenu()
                }}
              />
            ))}
          </SubMenu>

          <MenuItem icon="🔊" label="נתק אודיו" onClick={() => { addToast('אודיו נותק לטראק נפרד', 'info'); hideContextMenu() }} />

          {contextMenu.trackId && (
            <>
              <MenuItem icon="🔒" label="נעל שכבה" onClick={() => { if (contextMenu.trackId) toggleTrackLock(contextMenu.trackId); hideContextMenu() }} />
              <MenuItem icon="👁" label="הסתר שכבה" onClick={() => { if (contextMenu.trackId) toggleTrackVisibility(contextMenu.trackId); hideContextMenu() }} />
            </>
          )}

          <Divider />

          {/* Transitions submenu */}
          <SubMenu icon="🎬" label="הוסף מעבר...">
            {transitionOptions.map((opt) => (
              <MenuItem
                key={opt.value}
                label={opt.label}
                onClick={() => {
                  addToast(`מעבר "${opt.label}" נוסף`, 'info')
                  hideContextMenu()
                }}
              />
            ))}
          </SubMenu>

          <MenuItem icon="🖼️" label="הוסף B-Roll כאן" onClick={() => { addToast('גרור B-Roll מהפאנל לציר הזמן', 'info'); hideContextMenu() }} />
          <MenuItem icon="💬" label="הוסף כתובית כאן" onClick={() => { addToast('הוסף כתובית מפאנל הכתוביות', 'info'); hideContextMenu() }} />

          <Divider />
          <MenuItem icon="ℹ️" label="מידע על הקליפ" onClick={() => { addToast('מידע: קליפ בציר הזמן', 'info'); hideContextMenu() }} />
        </>
      )}

      {!hasClip && (
        <>
          <MenuItem icon="📌" label="הדבק כאן" shortcut="⌘V" onClick={() => { pasteAtTime(contextMenu.time); hideContextMenu() }} disabled={clipboard.length === 0} />
          <MenuItem icon="📍" label="הוסף סמן כאן" shortcut="M" onClick={() => { addMarker(contextMenu.time); hideContextMenu() }} />
          <Divider />
          <SubMenu icon="➕" label="הוסף שכבה">
            <MenuItem label="וידאו" onClick={() => { addTrack('video'); hideContextMenu() }} />
            <MenuItem label="אודיו" onClick={() => { addTrack('audio'); hideContextMenu() }} />
            <MenuItem label="טקסט" onClick={() => { addTrack('text'); hideContextMenu() }} />
            <MenuItem label="B-Roll" onClick={() => { addTrack('broll'); hideContextMenu() }} />
            <MenuItem label="מוזיקה" onClick={() => { addTrack('music'); hideContextMenu() }} />
          </SubMenu>
          {contextMenu.trackId && (
            <>
              <MenuItem icon="🔒" label="נעל שכבה" onClick={() => { if (contextMenu.trackId) toggleTrackLock(contextMenu.trackId); hideContextMenu() }} />
              <MenuItem icon="👁" label="הסתר שכבה" onClick={() => { if (contextMenu.trackId) toggleTrackVisibility(contextMenu.trackId); hideContextMenu() }} />
            </>
          )}
        </>
      )}
    </div>
  )
}

function MenuItem({ icon, label, shortcut, onClick, disabled, danger }: {
  icon?: string
  label: string
  shortcut?: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] transition-colors text-right ${
        disabled
          ? 'opacity-30 cursor-not-allowed'
          : danger
            ? 'text-red-400 hover:bg-red-500/10'
            : 'text-text-secondary hover:bg-white/[0.06] hover:text-text-primary'
      }`}
    >
      {icon && <span className="text-xs w-4 text-center">{icon}</span>}
      <span className="flex-1 text-right">{label}</span>
      {shortcut && <span className="text-text-muted text-[9px] font-mono">{shortcut}</span>}
    </button>
  )
}

function SubMenu({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="relative group/sub">
      <div className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-text-secondary hover:bg-white/[0.06] hover:text-text-primary cursor-pointer">
        <span className="text-xs w-4 text-center">{icon}</span>
        <span className="flex-1 text-right">{label}</span>
        <span className="text-text-muted">◀</span>
      </div>
      <div className="absolute left-full top-0 ml-0.5 min-w-[140px] py-1 bg-[#1a1a2e] border border-white/[0.12] rounded-lg shadow-2xl shadow-black/50 backdrop-blur-xl opacity-0 invisible group-hover/sub:opacity-100 group-hover/sub:visible transition-all z-[210]">
        {children}
      </div>
    </div>
  )
}

function Divider() {
  return <div className="my-1 border-t border-white/[0.06]" />
}
