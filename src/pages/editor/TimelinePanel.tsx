import { useRef, useEffect, useState, useCallback } from 'react'
import { useTimelineStore } from '../../stores/timelineStore'
import { useEditorStore } from '../../stores/editorStore'
import { useUIStore } from '../../stores/uiStore'
import TimelineToolbar from './timeline/TimelineToolbar'
import TimeRuler from './timeline/TimeRuler'
import TrackRow from './timeline/TrackRow'
import ContextMenu from './timeline/ContextMenu'
import AddLayerButton from './timeline/AddLayerButton'

export default function TimelinePanel() {
  const containerRef = useRef<HTMLDivElement>(null)
  const tracksRef = useRef<HTMLDivElement>(null)
  const [isResizing, setIsResizing] = useState(false)

  const {
    zoom, setZoom, scrollLeft, setScrollLeft,
    tracks, selectedClipIds, clearSelection,
    selectAllClips, removeSelectedClips,
    copySelected, cutSelected, pasteAtTime,
    addMarker, toggleSnap, toggleRipple,
    duplicateSelected,
    timelineHeight, setTimelineHeight,
    hideContextMenu, snapEnabled,
  } = useTimelineStore()

  const {
    currentTime, duration, setCurrentTime,
    splitAtPlayhead, isPlaying, setIsPlaying,
    mediaFile, waveformData, setWaveformData,
  } = useEditorStore()

  const { addToast } = useUIStore()

  const pixelsPerSecond = zoom / 100 * 80

  // Generate waveform from audio file
  useEffect(() => {
    if (!mediaFile) {
      setWaveformData(null)
      return
    }

    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer
        const audioCtx = new AudioContext()
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
        const channelData = audioBuffer.getChannelData(0)

        const samples = 500
        const blockSize = Math.floor(channelData.length / samples)
        const data: number[] = []
        for (let i = 0; i < samples; i++) {
          let sum = 0
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(channelData[i * blockSize + j])
          }
          data.push(sum / blockSize)
        }

        const max = Math.max(...data, 0.01)
        const normalized = data.map((v) => v / max)
        setWaveformData(normalized)
        audioCtx.close()
      } catch {
        setWaveformData(null)
      }
    }

    reader.readAsArrayBuffer(mediaFile)
  }, [mediaFile, setWaveformData])

  // Horizontal scroll with Cmd+Scroll = zoom
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    if (e.metaKey || e.ctrlKey) {
      // Zoom
      const delta = e.deltaY > 0 ? -10 : 10
      setZoom(zoom + delta)
    } else {
      // Scroll
      setScrollLeft(scrollLeft + e.deltaX + e.deltaY)
    }
  }, [zoom, scrollLeft, setZoom, setScrollLeft])

  useEffect(() => {
    const el = tracksRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't handle if focus is in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      const isMod = e.metaKey || e.ctrlKey

      switch (true) {
        // Space: play/pause
        case e.key === ' ' && !isMod:
          e.preventDefault()
          setIsPlaying(!isPlaying)
          break

        // S: split at playhead
        case e.key === 's' && !isMod:
          e.preventDefault()
          splitAtPlayhead()
          addToast('קליפ פוצל', 'info')
          break

        // Delete/Backspace: delete selected
        case (e.key === 'Delete' || e.key === 'Backspace') && !isMod:
          e.preventDefault()
          removeSelectedClips()
          break

        // Cmd+C: copy
        case e.key === 'c' && isMod && !e.shiftKey:
          e.preventDefault()
          copySelected()
          break

        // Cmd+V: paste
        case e.key === 'v' && isMod && !e.shiftKey:
          e.preventDefault()
          pasteAtTime(currentTime)
          break

        // Cmd+X: cut
        case e.key === 'x' && isMod:
          e.preventDefault()
          cutSelected()
          break

        // Cmd+A: select all
        case e.key === 'a' && isMod:
          e.preventDefault()
          selectAllClips()
          break

        // Cmd+Z: undo
        case e.key === 'z' && isMod && !e.shiftKey:
          // Handled elsewhere
          break

        // Cmd+Shift+Z: redo
        case e.key === 'z' && isMod && e.shiftKey:
          // Handled elsewhere
          break

        // Cmd+D: duplicate
        case e.key === 'd' && isMod:
          e.preventDefault()
          duplicateSelected()
          break

        // Arrow left: move playhead 1 frame (~0.033s)
        case e.key === 'ArrowLeft' && !isMod && !e.shiftKey:
          e.preventDefault()
          setCurrentTime(Math.max(0, currentTime - 0.033))
          break

        // Arrow right: move playhead 1 frame
        case e.key === 'ArrowRight' && !isMod && !e.shiftKey:
          e.preventDefault()
          setCurrentTime(Math.min(duration, currentTime + 0.033))
          break

        // Shift+Arrow: move 1 second
        case e.key === 'ArrowLeft' && !isMod && e.shiftKey:
          e.preventDefault()
          setCurrentTime(Math.max(0, currentTime - 1))
          break

        case e.key === 'ArrowRight' && !isMod && e.shiftKey:
          e.preventDefault()
          setCurrentTime(Math.min(duration, currentTime + 1))
          break

        // Cmd+Arrow: move 5 seconds
        case e.key === 'ArrowLeft' && isMod:
          e.preventDefault()
          setCurrentTime(Math.max(0, currentTime - 5))
          break

        case e.key === 'ArrowRight' && isMod:
          e.preventDefault()
          setCurrentTime(Math.min(duration, currentTime + 5))
          break

        // Home: go to start
        case e.key === 'Home':
          e.preventDefault()
          setCurrentTime(0)
          break

        // End: go to end
        case e.key === 'End':
          e.preventDefault()
          setCurrentTime(duration)
          break

        // +/-: zoom
        case e.key === '=' || e.key === '+':
          e.preventDefault()
          setZoom(zoom + 25)
          break

        case e.key === '-' && !isMod:
          e.preventDefault()
          setZoom(zoom - 25)
          break

        // F: fit to screen
        case e.key === 'f' && !isMod:
          e.preventDefault()
          if (tracksRef.current && duration > 0) {
            const w = tracksRef.current.clientWidth - 140 // subtract header
            const newZoom = Math.round((w / (duration * 80)) * 100 * 100) / 100
            setZoom(Math.max(25, Math.min(400, newZoom)))
            setScrollLeft(0)
          }
          break

        // M: add marker
        case e.key === 'm' && !isMod:
          e.preventDefault()
          addMarker(currentTime)
          addToast('סמן נוסף', 'info')
          break

        // N: toggle snap
        case e.key === 'n' && !isMod:
          e.preventDefault()
          toggleSnap()
          break

        // R: toggle ripple
        case e.key === 'r' && !isMod:
          e.preventDefault()
          toggleRipple()
          break

        // Escape: clear selection
        case e.key === 'Escape':
          clearSelection()
          hideContextMenu()
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    isPlaying, setIsPlaying, currentTime, duration, setCurrentTime,
    splitAtPlayhead, removeSelectedClips, copySelected, cutSelected,
    pasteAtTime, selectAllClips, duplicateSelected, zoom, setZoom,
    setScrollLeft, addMarker, toggleSnap, toggleRipple, clearSelection,
    hideContextMenu, addToast,
  ])

  // Timeline resize handle
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    const startY = e.clientY
    const startHeight = timelineHeight

    const handleMove = (moveE: MouseEvent) => {
      const delta = startY - moveE.clientY
      setTimelineHeight(startHeight + delta)
    }

    const handleUp = () => {
      setIsResizing(false)
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }, [timelineHeight, setTimelineHeight])

  // Drop from sidebar
  const [droppingFromSidebar, setDroppingFromSidebar] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    const data = e.dataTransfer.types
    if (data.includes('application/x-media-item') || data.includes('application/x-broll-item')) {
      e.preventDefault()
      setDroppingFromSidebar(true)
    }
  }, [])

  const handleDragLeave = useCallback(() => {
    setDroppingFromSidebar(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    setDroppingFromSidebar(false)
    const brollData = e.dataTransfer.getData('application/x-broll-item')
    if (brollData) {
      try {
        const item = JSON.parse(brollData)
        const rect = tracksRef.current?.getBoundingClientRect()
        const dropTime = rect
          ? Math.max(0, Math.min(duration, ((e.clientX - rect.left + scrollLeft) / (duration * pixelsPerSecond)) * duration))
          : currentTime

        const addBRollItem = useEditorStore.getState().addBRollItem
        addBRollItem({
          id: `broll-${Date.now()}`,
          imageUrl: item.imageUrl,
          startTime: dropTime,
          duration: item.duration || 3,
          source: item.source || 'upload',
          prompt: item.prompt,
        })
        addToast('B-Roll נוסף לציר הזמן', 'success')
      } catch { /* ignore */ }
    }
  }, [duration, scrollLeft, pixelsPerSecond, currentTime, addToast])

  // Sort tracks by order
  const sortedTracks = [...tracks].sort((a, b) => a.order - b.order)

  return (
    <div
      ref={containerRef}
      className="bg-bg-deepest rounded-xl border border-white/[0.06] overflow-hidden h-full flex flex-col"
      dir="rtl"
    >
      {/* Resize handle */}
      <div
        className={`h-1.5 cursor-row-resize hover:bg-accent-purple/20 transition-colors flex items-center justify-center ${
          isResizing ? 'bg-accent-purple/30' : ''
        }`}
        onMouseDown={handleResizeStart}
        onDoubleClick={() => setTimelineHeight(280)}
      >
        <div className="w-10 h-0.5 bg-white/[0.08] rounded" />
      </div>

      {/* Toolbar */}
      <TimelineToolbar />

      {/* Time Ruler */}
      <TimeRuler />

      {/* Tracks area */}
      <div
        ref={tracksRef}
        id="timeline-tracks-container"
        className={`flex-1 overflow-auto relative ${droppingFromSidebar ? 'ring-2 ring-accent-purple/40 ring-dashed' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => hideContextMenu()}
      >
        <div className="min-h-full">
          {sortedTracks.map((track) => (
            <TrackRow key={track.id} track={track} />
          ))}

          {/* Playhead vertical line across all tracks */}
          {duration > 0 && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-[#FF6B8A] z-30 pointer-events-none"
              style={{ left: `${140 + currentTime * pixelsPerSecond - scrollLeft}px` }}
            />
          )}
        </div>

        {/* Drop zone indicator */}
        {droppingFromSidebar && (
          <div className="absolute inset-0 border-2 border-dashed border-accent-purple/40 rounded-lg bg-accent-purple/5 flex items-center justify-center pointer-events-none z-30">
            <span className="text-accent-purple text-xs font-medium">שחרר כאן להוספה לציר הזמן</span>
          </div>
        )}
      </div>

      {/* Add layer button */}
      <div className="px-3 py-1.5 border-t border-white/[0.06] shrink-0 flex items-center justify-between">
        <AddLayerButton />
        <div className="flex items-center gap-2 text-[9px] text-text-muted">
          {selectedClipIds.length > 0 && (
            <span className="text-accent-purple">{selectedClipIds.length} נבחרו</span>
          )}
          <span>
            {snapEnabled ? '🧲 Snap' : ''}
          </span>
        </div>
      </div>

      {/* Context Menu */}
      <ContextMenu />
    </div>
  )
}
