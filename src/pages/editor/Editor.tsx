import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowRight, Bot, Save, Check, Subtitles, Image } from 'lucide-react'
import EditorToolbar from './EditorToolbar'
import TranscriptPanel from './TranscriptPanel'
import VideoPanel from './VideoPanel'
import TimelinePanel from './TimelinePanel'
import AISidebar from './AISidebar'
import CaptionsPanel from './CaptionsPanel'
import BRollPanel from './BRollPanel'
import EditorModals from './EditorModals'
import ToastContainer from '../../components/Toast'
import { useEditorStore } from '../../stores/editorStore'
import { useProjectsStore } from '../../stores/projectsStore'
import { useUIStore } from '../../stores/uiStore'

export default function Editor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [showAI, setShowAI] = useState(true)
  const [showCaptionsPanel, setShowCaptionsPanel] = useState(false)
  const [showBRollPanel, setShowBRollPanel] = useState(false)
  const [timelineExpanded, setTimelineExpanded] = useState(true)
  const [saveIndicator, setSaveIndicator] = useState<'idle' | 'saving' | 'saved'>('idle')
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { loadProject, projectId, projectName, isDirty, markSaved, mediaBlobUrl, transcript, editHistory } = useEditorStore()
  const getProject = useProjectsStore((s) => s.getProject)
  const saveEditorState = useProjectsStore((s) => s.saveEditorState)


  // Load project on mount
  useEffect(() => {
    if (!id) return
    const project = getProject(id)
    if (project) {
      loadProject({
        id: project.id,
        name: project.name,
        isDemo: false,
        mediaFile: project.mediaFile,
        mediaBlobUrl: project.mediaBlobUrl,
        mediaType: project.mediaType,
        transcript: project.transcript,
        editHistory: project.editHistory,
      })
    } else {
      loadProject({
        id,
        name: 'פרויקט חדש',
        isDemo: false,
      })
    }
    return () => {
      // Cleanup blob URLs is handled by the store
    }
  }, [id, getProject, loadProject])

  // Auto-save every 30 seconds
  const doSave = useCallback(() => {
    if (!projectId || !isDirty) return
    setSaveIndicator('saving')
    saveEditorState(projectId, {
      name: projectName,
      transcript,
      editHistory,
      mediaBlobUrl: mediaBlobUrl ?? undefined,
    })
    markSaved()
    setTimeout(() => {
      setSaveIndicator('saved')
      setTimeout(() => setSaveIndicator('idle'), 2000)
    }, 300)
  }, [projectId, isDirty, projectName, transcript, editHistory, mediaBlobUrl, saveEditorState, markSaved])

  useEffect(() => {
    autoSaveRef.current = setInterval(doSave, 30000)
    return () => {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current)
    }
  }, [doSave])

  // Keyboard shortcut Cmd+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        doSave()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault()
        useUIStore.getState().openModal('export')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [doSave])

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

  const handleBack = () => {
    if (isDirty) {
      const save = window.confirm('יש שינויים שלא נשמרו. לשמור לפני יציאה?')
      if (save) {
        doSave()
      }
    }
    navigate('/')
  }

  return (
    <div className="h-screen flex flex-col bg-bg-deepest text-text-primary overflow-hidden">
      {/* Top nav */}
      <div className="flex items-center gap-3 px-4 py-2 glass gradient-border-bottom shrink-0 relative z-20">
        <button onClick={handleBack} className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary transition-colors">
          <ArrowRight size={16} />
          חזרה
        </button>

        {/* Save indicator */}
        <div className="flex items-center gap-1.5 text-xs">
          {saveIndicator === 'saving' && (
            <span className="flex items-center gap-1 text-text-muted animate-pulse">
              <Save size={12} /> שומר...
            </span>
          )}
          {saveIndicator === 'saved' && (
            <span className="flex items-center gap-1 text-success">
              <Check size={12} /> נשמר
            </span>
          )}
        </div>

        <div className="flex-1" />
        {!showCaptionsPanel && (
          <button
            onClick={() => setShowCaptionsPanel(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-lg text-sm text-text-secondary hover:text-text-primary transition-all"
          >
            <Subtitles size={14} />
            כתוביות
          </button>
        )}
        {!showBRollPanel && (
          <button
            onClick={() => setShowBRollPanel(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-lg text-sm text-text-secondary hover:text-text-primary transition-all"
          >
            <Image size={14} />
            B-Roll
          </button>
        )}
        {!showAI && (
          <button
            onClick={() => setShowAI(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-purple/10 hover:bg-accent-purple/20 border border-accent-purple/20 rounded-lg text-sm text-accent-purple transition-all"
          >
            <Bot size={14} />
            עוזר AI
          </button>
        )}
      </div>

      <EditorToolbar />

      {/* Main editor area */}
      <div className="flex flex-1 overflow-hidden">
        {showAI && (
          <div className="w-80 shrink-0 p-2 animate-slide-in-right">
            <AISidebar onClose={() => setShowAI(false)} />
          </div>
        )}
        {showCaptionsPanel && (
          <div className="w-72 shrink-0 p-2 animate-slide-in-right">
            <CaptionsPanel onClose={() => setShowCaptionsPanel(false)} />
          </div>
        )}
        {showBRollPanel && (
          <div className="w-72 shrink-0 p-2 animate-slide-in-right">
            <BRollPanel onClose={() => setShowBRollPanel(false)} />
          </div>
        )}

        <div className="flex-1 flex flex-col overflow-hidden p-2 gap-2">
          <div className="flex flex-1 gap-2 overflow-hidden">
            <div className="flex-1">
              <VideoPanel />
            </div>
            <div className="w-[40%] shrink-0">
              <TranscriptPanel />
            </div>
          </div>
          {timelineExpanded && (
            <div className="h-52 shrink-0 relative">
              <button
                onClick={() => setTimelineExpanded(false)}
                className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-8 h-3 bg-bg-elevated rounded-full border border-white/[0.06] hover:border-white/[0.12] flex items-center justify-center cursor-pointer transition-colors"
              >
                <div className="w-4 h-0.5 bg-text-muted rounded" />
              </button>
              <TimelinePanel />
            </div>
          )}
          {!timelineExpanded && (
            <button
              onClick={() => setTimelineExpanded(true)}
              className="h-8 shrink-0 bg-bg-panel rounded-xl border border-white/[0.06] hover:border-white/[0.12] flex items-center justify-center text-text-muted hover:text-text-secondary text-xs transition-colors"
            >
              הצג ציר זמן
            </button>
          )}
        </div>
      </div>

      <EditorModals />
      <ToastContainer />
    </div>
  )
}
