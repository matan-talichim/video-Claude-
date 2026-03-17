import { useEffect, useRef } from 'react'
import { useTimelineStore } from '../../../stores/timelineStore'
import type { TransitionItem } from '../../../stores/timelineStore'
import { useEditorStore } from '../../../stores/editorStore'
import { useUIStore } from '../../../stores/uiStore'

// Logging wrapper for all context menu actions
function withLogging(name: string, fn: () => void) {
  return () => {
    console.log(`[EDITOR ACTION] ${name} triggered`)
    try {
      fn()
      console.log(`[EDITOR ACTION] ${name} completed`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`[EDITOR ACTION] ${name} FAILED:`, msg)
    }
  }
}

export default function ContextMenu() {
  const menuRef = useRef<HTMLDivElement>(null)
  const { contextMenu, hideContextMenu, selectClip, removeSelectedClips, copySelected } = useTimelineStore()
  const pasteAtTime = useTimelineStore((s) => s.pasteAtTime)
  const clipboard = useTimelineStore((s) => s.clipboard)
  const addMarker = useTimelineStore((s) => s.addMarker)
  const addTrack = useTimelineStore((s) => s.addTrack)
  const addClipToTrack = useTimelineStore((s) => s.addClipToTrack)
  const toggleTrackLock = useTimelineStore((s) => s.toggleTrackLock)
  const toggleTrackVisibility = useTimelineStore((s) => s.toggleTrackVisibility)
  const setClipSpeed = useTimelineStore((s) => s.setClipSpeed)
  const reverseClip = useTimelineStore((s) => s.reverseClip)
  const duplicateSelected = useTimelineStore((s) => s.duplicateSelected)
  const addTransition = useTimelineStore((s) => s.addTransition)
  const clips = useTimelineStore((s) => s.clips)

  const splitAtPlayhead = useEditorStore((s) => s.splitAtPlayhead)
  const addBRollItem = useEditorStore((s) => s.addBRollItem)
  const captions = useEditorStore((s) => s.captions)
  const setCaptions = useEditorStore((s) => s.setCaptions)
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
          <MenuItem icon="✂️" label="פצל כאן" shortcut="S" onClick={withLogging('Split', () => {
            if (contextMenu.clipId) selectClip(contextMenu.clipId)
            splitAtPlayhead()
            addToast('הקליפ פוצל בהצלחה', 'success')
            hideContextMenu()
          })} />
          <MenuItem icon="📋" label="העתק" shortcut="⌘C" onClick={withLogging('Copy', () => {
            if (contextMenu.clipId) selectClip(contextMenu.clipId)
            copySelected()
            addToast('קליפ הועתק', 'info')
            hideContextMenu()
          })} />
          <MenuItem icon="📌" label="הדבק" shortcut="⌘V" onClick={withLogging('Paste', () => {
            pasteAtTime(contextMenu.time)
            addToast('קליפ הודבק', 'success')
            hideContextMenu()
          })} disabled={clipboard.length === 0} />
          <MenuItem icon="🗑" label="מחק" shortcut="Del" onClick={withLogging('Delete', () => {
            if (contextMenu.clipId) selectClip(contextMenu.clipId)
            removeSelectedClips()
            addToast('קליפ נמחק', 'info')
            hideContextMenu()
          })} danger />
          <Divider />

          <MenuItem icon="🔄" label="שכפל" shortcut="⌘D" onClick={withLogging('Duplicate', () => {
            if (contextMenu.clipId) selectClip(contextMenu.clipId)
            duplicateSelected()
            addToast('קליפ שוכפל', 'success')
            hideContextMenu()
          })} />
          <Divider />

          {/* Speed submenu */}
          <SubMenu icon="⚡" label="שנה מהירות...">
            {speedOptions.map((opt) => (
              <MenuItem
                key={opt.value}
                label={opt.label}
                onClick={withLogging(`Speed ${opt.label}`, () => {
                  if (contextMenu.clipId) {
                    setClipSpeed(contextMenu.clipId, opt.value)
                  }
                  addToast(`מהירות שונתה ל-${opt.label}`, 'success')
                  hideContextMenu()
                })}
              />
            ))}
          </SubMenu>

          <MenuItem icon="🎨" label="תיקון צבע" onClick={withLogging('Color Correction', () => {
            // Open color correction by dispatching a custom event the editor toolbar listens for
            window.dispatchEvent(new CustomEvent('editor:openPanel', { detail: { panel: 'color' } }))
            addToast('פאנל תיקון צבע נפתח', 'info')
            hideContextMenu()
          })} />
          <MenuItem icon="↺" label="הפוך" onClick={withLogging('Reverse', () => {
            if (contextMenu.clipId) reverseClip(contextMenu.clipId)
            addToast('הקליפ הופך', 'success')
            hideContextMenu()
          })} />
          <MenuItem icon="⏸" label="הקפא פריים" onClick={withLogging('Freeze Frame', () => {
            if (contextMenu.clipId) {
              const clip = clips.find(c => c.id === contextMenu.clipId)
              if (clip) {
                // Create a frozen clip at current time
                const freezeId = `freeze-${Date.now()}`
                addClipToTrack(clip.trackId, {
                  id: freezeId,
                  startTime: contextMenu.time,
                  duration: 2, // 2-second freeze frame
                  label: '🧊 פריים מוקפא',
                  speed: 0,
                  reversed: false,
                  frozen: true,
                  url: clip.url,
                  imageUrl: clip.imageUrl,
                })
                addToast('פריים הוקפא (2 שניות)', 'success')
              }
            }
            hideContextMenu()
          })} />
          <Divider />
          <MenuItem icon="🔊" label="נתק אודיו" onClick={withLogging('Detach Audio', () => {
            if (contextMenu.clipId) {
              const clip = clips.find(c => c.id === contextMenu.clipId)
              if (clip) {
                // Add audio track and create corresponding audio clip
                addTrack('audio')
                // Small delay to let the track be created, then add clip
                setTimeout(() => {
                  const tracks = useTimelineStore.getState().tracks
                  const audioTrack = tracks.filter(t => t.type === 'audio').pop()
                  if (audioTrack) {
                    useTimelineStore.getState().addClipToTrack(audioTrack.id, {
                      id: `audio-clip-${Date.now()}`,
                      startTime: clip.startTime,
                      duration: clip.duration,
                      label: `🔊 אודיו מ-${clip.label}`,
                      speed: 1,
                      reversed: false,
                      frozen: false,
                      url: clip.url,
                    })
                  }
                }, 50)
                addToast('אודיו נותק לטראק נפרד', 'success')
              }
            } else {
              addTrack('audio')
              addToast('טראק אודיו חדש נוסף', 'info')
            }
            hideContextMenu()
          })} />

          {contextMenu.trackId && (
            <>
              <MenuItem icon="🔒" label="נעל שכבה" onClick={withLogging('Toggle Lock', () => { if (contextMenu.trackId) toggleTrackLock(contextMenu.trackId); addToast('נעילת שכבה שונתה', 'info'); hideContextMenu() })} />
              <MenuItem icon="👁" label="הסתר שכבה" onClick={withLogging('Toggle Visibility', () => { if (contextMenu.trackId) toggleTrackVisibility(contextMenu.trackId); addToast('תצוגת שכבה שונתה', 'info'); hideContextMenu() })} />
            </>
          )}

          <Divider />

          {/* Transitions submenu */}
          <SubMenu icon="🎬" label="הוסף מעבר...">
            {transitionOptions.map((opt) => (
              <MenuItem
                key={opt.value}
                label={opt.label}
                onClick={withLogging(`Transition ${opt.value}`, () => {
                  if (contextMenu.clipId) {
                    // Find the next clip on the same track
                    const clip = clips.find(c => c.id === contextMenu.clipId)
                    if (clip) {
                      const clipEnd = clip.startTime + clip.duration
                      const nextClip = clips
                        .filter(c => c.trackId === clip.trackId && c.startTime >= clipEnd - 0.1)
                        .sort((a, b) => a.startTime - b.startTime)[0]

                      const transition: TransitionItem = {
                        id: `transition-${Date.now()}`,
                        type: opt.value,
                        duration: 0.5,
                        clipBeforeId: contextMenu.clipId,
                        clipAfterId: nextClip?.id || contextMenu.clipId,
                      }
                      addTransition(transition)
                      addToast(`מעבר "${opt.label}" נוסף`, 'success')
                    }
                  }
                  hideContextMenu()
                })}
              />
            ))}
          </SubMenu>

          <MenuItem icon="🖼️" label="הוסף B-Roll כאן" onClick={withLogging('Add B-Roll', () => {
            // Create a placeholder B-Roll item at the context menu time
            const brollId = `broll-${Date.now()}`
            addBRollItem({
              id: brollId,
              imageUrl: '',
              startTime: contextMenu.time,
              duration: 3,
              source: 'upload',
            })
            // Also add to timeline
            addClipToTrack('broll-1', {
              id: `broll-clip-${Date.now()}`,
              startTime: contextMenu.time,
              duration: 3,
              label: 'B-Roll חדש',
              speed: 1,
              reversed: false,
              frozen: false,
            })
            // Open B-Roll panel via custom event
            window.dispatchEvent(new CustomEvent('editor:openPanel', { detail: { panel: 'broll' } }))
            addToast('B-Roll נוסף - בחר מדיה מהפאנל', 'success')
            hideContextMenu()
          })} />
          <MenuItem icon="💬" label="הוסף כתובית כאן" onClick={withLogging('Add Subtitle', () => {
            // Create a new caption at the context menu time
            const captionId = `caption-${Date.now()}`
            const newCaption = {
              id: captionId,
              text: 'כתובית חדשה',
              startTime: contextMenu.time,
              endTime: contextMenu.time + 3,
              style: useEditorStore.getState().captionStyle,
            }
            const currentCaptions = [...captions, newCaption]
            setCaptions(currentCaptions)
            // Also add to timeline
            addClipToTrack('captions-1', {
              id: `cap-clip-${Date.now()}`,
              startTime: contextMenu.time,
              duration: 3,
              label: 'כתובית חדשה',
              speed: 1,
              reversed: false,
              frozen: false,
              text: 'כתובית חדשה',
            })
            useEditorStore.getState().setShowCaptions(true)
            addToast('כתובית נוספה - לחץ עליה לעריכה', 'success')
            hideContextMenu()
          })} />

          <Divider />
          <MenuItem icon="ℹ️" label="מידע על הקליפ" onClick={withLogging('Clip Info', () => {
            if (contextMenu.clipId) {
              const clip = clips.find(c => c.id === contextMenu.clipId)
              if (clip) {
                const info = `קליפ: ${clip.label}\nהתחלה: ${clip.startTime.toFixed(2)}s\nמשך: ${clip.duration.toFixed(2)}s\nמהירות: ${clip.speed}x${clip.reversed ? ' (הפוך)' : ''}${clip.frozen ? ' (מוקפא)' : ''}`
                addToast(info, 'info')
              }
            }
            hideContextMenu()
          })} />
        </>
      )}

      {!hasClip && (
        <>
          <MenuItem icon="📌" label="הדבק כאן" shortcut="⌘V" onClick={withLogging('Paste here', () => {
            pasteAtTime(contextMenu.time)
            addToast('קליפ הודבק', 'success')
            hideContextMenu()
          })} disabled={clipboard.length === 0} />
          <MenuItem icon="📍" label="הוסף סמן כאן" shortcut="M" onClick={withLogging('Add Marker', () => {
            addMarker(contextMenu.time)
            addToast('סמן נוסף', 'success')
            hideContextMenu()
          })} />
          <Divider />
          <SubMenu icon="➕" label="הוסף שכבה">
            <MenuItem label="וידאו" onClick={withLogging('Add video track', () => { addTrack('video'); addToast('שכבת וידאו נוספה', 'success'); hideContextMenu() })} />
            <MenuItem label="אודיו" onClick={withLogging('Add audio track', () => { addTrack('audio'); addToast('שכבת אודיו נוספה', 'success'); hideContextMenu() })} />
            <MenuItem label="טקסט" onClick={withLogging('Add text track', () => { addTrack('text'); addToast('שכבת טקסט נוספה', 'success'); hideContextMenu() })} />
            <MenuItem label="בי-רול" onClick={withLogging('Add broll track', () => { addTrack('broll'); addToast('שכבת B-Roll נוספה', 'success'); hideContextMenu() })} />
            <MenuItem label="מוזיקה" onClick={withLogging('Add music track', () => { addTrack('music'); addToast('שכבת מוזיקה נוספה', 'success'); hideContextMenu() })} />
          </SubMenu>
          {contextMenu.trackId && (
            <>
              <MenuItem icon="🔒" label="נעל שכבה" onClick={withLogging('Toggle Lock', () => { if (contextMenu.trackId) toggleTrackLock(contextMenu.trackId); addToast('נעילת שכבה שונתה', 'info'); hideContextMenu() })} />
              <MenuItem icon="👁" label="הסתר שכבה" onClick={withLogging('Toggle Visibility', () => { if (contextMenu.trackId) toggleTrackVisibility(contextMenu.trackId); addToast('תצוגת שכבה שונתה', 'info'); hideContextMenu() })} />
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
        <span className="text-text-muted">▶</span>
      </div>
      <div className="absolute right-full top-0 me-0.5 min-w-[140px] py-1 bg-[#1a1a2e] border border-white/[0.12] rounded-lg shadow-2xl shadow-black/50 backdrop-blur-xl opacity-0 invisible group-hover/sub:opacity-100 group-hover/sub:visible transition-all z-[210]">
        {children}
      </div>
    </div>
  )
}

function Divider() {
  return <div className="my-1 border-t border-white/[0.06]" />
}
