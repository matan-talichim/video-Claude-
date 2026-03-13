import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import TopBar from './TopBar'
import LeftPanel from './LeftPanel'
import Canvas from './Canvas'
import InspectorPanel from './InspectorPanel'
import TimelinePanel from './TimelinePanel'
import EditorModals from './EditorModals'
import ShortcutsModal from './ShortcutsModal'
import ToastContainer from '../../components/Toast'
import { useEditorStore } from '../../stores/editorStore'
import { useProjectsStore } from '../../stores/projectsStore'
import { useUIStore } from '../../stores/uiStore'
import { useTimelineStore } from '../../stores/timelineStore'
import { useUserProfileStore } from '../../stores/userProfileStore'
import type { SelectedCanvasItem } from '../../stores/editorStore'

export default function Editor() {
  const { id } = useParams<{ id: string }>()
  const [activeLeftTab, setActiveLeftTab] = useState<string>('media')
  const [timelineExpanded, setTimelineExpanded] = useState(true)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { loadProject, projectId, projectName, isDirty, markSaved, mediaBlobUrl, transcript, editHistory, deletedRegions } = useEditorStore()
  const selectedCanvasItem = useEditorStore((s) => s.selectedCanvasItem)
  const setSelectedCanvasItem = useEditorStore((s) => s.setSelectedCanvasItem)
  const timelineHeight = useTimelineStore((s) => s.timelineHeight)
  const getProject = useProjectsStore((s) => s.getProject)
  const saveEditorState = useProjectsStore((s) => s.saveEditorState)

  const handleSelect = useCallback((item: SelectedCanvasItem | null) => {
    setSelectedCanvasItem(item)
  }, [setSelectedCanvasItem])

  // Load project on mount
  useEffect(() => {
    if (!id) return
    const project = getProject(id)
    if (project) {
      const activeVideo = project.videos?.find((v) => v.id === project.activeVideoId) || project.videos?.[0]
      const mediaFile = activeVideo?.file ?? project.mediaFile
      let mediaBlobUrl = activeVideo?.blobUrl ?? project.mediaBlobUrl
      const mediaType = activeVideo?.mediaType ?? project.mediaType
      const transcript = activeVideo?.transcript?.length ? activeVideo.transcript : project.transcript

      // Check if auto-editor stored a video URL as fallback
      const autoEditorUrl = localStorage.getItem('autoEditorVideoUrl')
      if (autoEditorUrl && (!mediaBlobUrl || mediaBlobUrl.startsWith('blob:') && !mediaFile)) {
        console.log('[EDITOR] Using auto-editor video URL:', autoEditorUrl)
        mediaBlobUrl = autoEditorUrl
      }
      localStorage.removeItem('autoEditorVideoUrl')

      // Load auto-editor transcript if available
      let autoTranscript: any[] | undefined = transcript
      if (!autoTranscript?.length) {
        const storedTranscript = localStorage.getItem('autoEditorTranscript')
        if (storedTranscript) {
          try {
            const parsed = JSON.parse(storedTranscript)
            if (parsed?.segments?.length) {
              autoTranscript = parsed.segments.map((s: any) => ({
                start: s.start || 0,
                end: s.end || 0,
                text: s.text || '',
                speaker: s.speaker || '',
              }))
              console.log('[EDITOR] Loaded auto-editor transcript:', autoTranscript?.length, 'segments')
            }
          } catch { /* ignore */ }
        }
      }
      localStorage.removeItem('autoEditorTranscript')

      loadProject({
        id: project.id,
        name: project.name,
        isDemo: false,
        mediaFile,
        mediaBlobUrl,
        mediaType,
        transcript: autoTranscript,
        editHistory: project.editHistory,
        deletedRegions: project.deletedRegions,
      })
    } else {
      // No project found - check if auto-editor stored a video URL
      const autoEditorUrl = localStorage.getItem('autoEditorVideoUrl')
      localStorage.removeItem('autoEditorVideoUrl')
      localStorage.removeItem('autoEditorTranscript')

      loadProject({
        id,
        name: 'פרויקט חדש',
        isDemo: false,
        mediaBlobUrl: autoEditorUrl || undefined,
        mediaType: autoEditorUrl ? 'video' : undefined,
      })
    }
  }, [id, getProject, loadProject])

  // Silent learning: finalize edit profile when leaving editor
  useEffect(() => {
    return () => {
      if (projectId) {
        useUserProfileStore.getState().finalizeEdit(projectId)
      }
    }
  }, [projectId])

  // Auto-save every 30 seconds
  const doSave = useCallback(() => {
    if (!projectId || !isDirty) return
    saveEditorState(projectId, {
      name: projectName,
      transcript,
      editHistory,
      deletedRegions,
      mediaBlobUrl: mediaBlobUrl ?? undefined,
    })
    markSaved()
    setLastSaved(new Date())

    // Also save to localStorage for auto-restore
    const state = useEditorStore.getState()
    const saveData = {
      projectSize: state.projectSize,
      captionStyle: state.captionStyle,
      effects: state.editorEffects,
      timestamp: Date.now(),
    }
    localStorage.setItem(`project_${projectId}_autosave`, JSON.stringify(saveData))
  }, [projectId, isDirty, projectName, transcript, editHistory, deletedRegions, mediaBlobUrl, saveEditorState, markSaved])

  useEffect(() => {
    autoSaveRef.current = setInterval(doSave, 30000)
    return () => {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current)
    }
  }, [doSave])

  // On load, check for autosave
  useEffect(() => {
    if (!projectId) return
    const saved = localStorage.getItem(`project_${projectId}_autosave`)
    if (saved) {
      try {
        const data = JSON.parse(saved)
        const age = Date.now() - data.timestamp
        if (age < 86400000) { // Less than 24 hours
          // Silently restore settings
          if (data.projectSize) {
            useEditorStore.getState().setProjectSize(data.projectSize.width, data.projectSize.height)
          }
        }
      } catch {
        // ignore parse errors
      }
    }
  }, [projectId])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        doSave()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault()
        useUIStore.getState().openModal('export')
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) {
          useEditorStore.getState().redoLastEdit()
        } else {
          useEditorStore.getState().undoLastEdit()
        }
        return
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === 'Escape') {
        e.preventDefault()
        setSelectedCanvasItem(null)
        return
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const selected = useEditorStore.getState().selectedCanvasItem
        if (selected) {
          e.preventDefault()
          if (selected.type === 'text') useEditorStore.getState().removeTextOverlay(selected.id)
          if (selected.type === 'shape') useEditorStore.getState().removeShape(selected.id)
          setSelectedCanvasItem(null)
          return
        }
        // Try deleting timeline selection
        const timelineSelected = useTimelineStore.getState().selectedClipIds
        if (timelineSelected.length > 0) {
          e.preventDefault()
          useTimelineStore.getState().removeSelectedClips()
          return
        }
      }

      if (e.key === ' ') {
        e.preventDefault()
        useEditorStore.getState().togglePlay()
        return
      }

      if (e.key === 's' || e.key === 'S') {
        e.preventDefault()
        useEditorStore.getState().splitAtPlayhead()
        return
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [doSave, setSelectedCanvasItem])

  // Warn on navigate away with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  return (
    <div className="h-screen flex flex-col bg-[#0A0A0F]" dir="rtl">
      {/* ZONE 1: TOP BAR */}
      <TopBar lastSaved={lastSaved} onSave={doSave} />

      {/* MAIN AREA - 3 columns */}
      <div className="flex-1 flex overflow-hidden">
        {/* RIGHT SIDEBAR (RTL = first = right) - Add things */}
        <LeftPanel activeTab={activeLeftTab} setActiveTab={setActiveLeftTab} />

        {/* CENTER - Canvas + Timeline */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* ZONE 4: CANVAS */}
          <Canvas selectedItem={selectedCanvasItem} onSelect={handleSelect} />

          {/* ZONE 5: TIMELINE */}
          {timelineExpanded ? (
            <div className="shrink-0 relative border-t border-white/5" style={{ height: timelineHeight }}>
              <TimelinePanel />
            </div>
          ) : (
            <button
              onClick={() => setTimelineExpanded(true)}
              className="h-8 shrink-0 bg-[#111118] border-t border-white/5 hover:bg-white/5 flex items-center justify-center text-gray-500 hover:text-gray-300 text-xs transition-colors"
            >
              הצג ציר זמן
            </button>
          )}
        </div>

        {/* LEFT SIDEBAR (RTL = last = left) - Inspector */}
        <InspectorPanel selectedItem={selectedCanvasItem} />
      </div>

      <EditorModals />
      <ShortcutsModal />
      <ToastContainer />
    </div>
  )
}
