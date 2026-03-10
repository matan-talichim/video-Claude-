import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowRight, Save, Check, FileText, Bot, FolderOpen, Image, Subtitles, Volume2, Settings, Package } from 'lucide-react'
import EditorToolbar from './EditorToolbar'
import TranscriptPanel from './TranscriptPanel'
import VideoPanel from './VideoPanel'
import TimelinePanel from './TimelinePanel'
import AISidebar from './AISidebar'
import CaptionsPanel from './CaptionsPanel'
import BRollPanel from './BRollPanel'
import MediaSidebar from './MediaSidebar'
import AudioPanel from './AudioPanel'
import ProjectSettingsPanel from './ProjectSettingsPanel'
import ExportsPanel from './ExportsPanel'
import EditorModals from './EditorModals'
import ToastContainer from '../../components/Toast'
import { useEditorStore } from '../../stores/editorStore'
import { useProjectsStore } from '../../stores/projectsStore'
import { useUIStore } from '../../stores/uiStore'
import { useTimelineStore } from '../../stores/timelineStore'

type PanelId = 'transcript' | 'ai' | 'media' | 'broll' | 'captions' | 'audio' | 'exports' | 'settings'

const panelTabs: { id: PanelId; icon: typeof FileText; label: string; tooltip: string }[] = [
  { id: 'transcript', icon: FileText, label: 'תמלול', tooltip: 'תמלול - עריכת טקסט' },
  { id: 'ai', icon: Bot, label: 'עוזר AI', tooltip: 'עוזר AI - עריכה חכמה' },
  { id: 'media', icon: FolderOpen, label: 'קבצים', tooltip: 'קבצים - ניהול מדיה' },
  { id: 'broll', icon: Image, label: 'B-Roll', tooltip: 'B-Roll - קטעי וידאו משלימים' },
  { id: 'captions', icon: Subtitles, label: 'כתוביות', tooltip: 'כתוביות - עריכת כתוביות' },
  { id: 'audio', icon: Volume2, label: 'אודיו', tooltip: 'אודיו - עריכת שמע' },
  { id: 'exports', icon: Package, label: 'ערוכים', tooltip: 'ערוכים - קבצים מיוצאים' },
  { id: 'settings', icon: Settings, label: 'הגדרות', tooltip: 'הגדרות - הגדרות הפרויקט' },
]

export default function Editor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activePanel, setActivePanel] = useState<PanelId | null>('transcript')
  const [timelineExpanded, setTimelineExpanded] = useState(true)
  const [saveIndicator, setSaveIndicator] = useState<'idle' | 'saving' | 'saved'>('idle')
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { loadProject, projectId, projectName, isDirty, markSaved, mediaBlobUrl, transcript, editHistory, deletedRegions } = useEditorStore()
  const timelineHeight = useTimelineStore((s) => s.timelineHeight)
  const getProject = useProjectsStore((s) => s.getProject)
  const saveEditorState = useProjectsStore((s) => s.saveEditorState)

  const togglePanel = (panelId: PanelId) => {
    setActivePanel((prev) => (prev === panelId ? null : panelId))
  }

  // Load project on mount
  useEffect(() => {
    if (!id) return
    const project = getProject(id)
    if (project) {
      const activeVideo = project.videos?.find((v) => v.id === project.activeVideoId) || project.videos?.[0]
      const mediaFile = activeVideo?.file ?? project.mediaFile
      const mediaBlobUrl = activeVideo?.blobUrl ?? project.mediaBlobUrl
      const mediaType = activeVideo?.mediaType ?? project.mediaType
      const transcript = activeVideo?.transcript?.length ? activeVideo.transcript : project.transcript

      loadProject({
        id: project.id,
        name: project.name,
        isDemo: false,
        mediaFile,
        mediaBlobUrl,
        mediaType,
        transcript,
        editHistory: project.editHistory,
        deletedRegions: project.deletedRegions,
      })
    } else {
      loadProject({
        id,
        name: 'פרויקט חדש',
        isDemo: false,
      })
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
      deletedRegions,
      mediaBlobUrl: mediaBlobUrl ?? undefined,
    })
    markSaved()
    setTimeout(() => {
      setSaveIndicator('saved')
      setTimeout(() => setSaveIndicator('idle'), 2000)
    }, 300)
  }, [projectId, isDirty, projectName, transcript, editHistory, deletedRegions, mediaBlobUrl, saveEditorState, markSaved])

  useEffect(() => {
    autoSaveRef.current = setInterval(doSave, 30000)
    return () => {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current)
    }
  }, [doSave])

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

      // Panel shortcuts (only without modifier keys)
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const panelKeys: Record<string, PanelId> = {
        '1': 'transcript',
        '2': 'ai',
        '3': 'media',
        '4': 'broll',
        '5': 'captions',
      }

      if (e.key === '0') {
        e.preventDefault()
        setActivePanel(null)
        return
      }

      if (panelKeys[e.key]) {
        e.preventDefault()
        togglePanel(panelKeys[e.key])
        return
      }

      if (e.key === 'Tab') {
        e.preventDefault()
        setActivePanel((prev) => {
          if (!prev) return panelTabs[0].id
          const idx = panelTabs.findIndex((t) => t.id === prev)
          return panelTabs[(idx + 1) % panelTabs.length].id
        })
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

        {/* Panel shortcut hints */}
        <div className="flex items-center gap-1 text-[9px] text-text-muted">
          <span>0: סגור הכל</span>
          <span className="text-white/10">|</span>
          <span>1-5: פאנלים</span>
          <span className="text-white/10">|</span>
          <span>Tab: הבא</span>
        </div>
      </div>

      <EditorToolbar />

      {/* Main editor area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main content - video + timeline */}
        <div className="flex-1 flex flex-col overflow-hidden p-2 gap-2">
          <div className="flex-1 overflow-hidden">
            <VideoPanel />
          </div>
          {timelineExpanded && (
            <div className="shrink-0 relative" style={{ height: timelineHeight }}>
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

        {/* Panel content - slides in/out */}
        {activePanel && (
          <div className="w-[350px] shrink-0 p-2 animate-slide-in-right overflow-hidden">
            {activePanel === 'transcript' && <TranscriptPanel />}
            {activePanel === 'ai' && <AISidebar onClose={() => setActivePanel(null)} />}
            {activePanel === 'media' && id && <MediaSidebar projectId={id} onClose={() => setActivePanel(null)} />}
            {activePanel === 'broll' && <BRollPanel onClose={() => setActivePanel(null)} />}
            {activePanel === 'captions' && <CaptionsPanel onClose={() => setActivePanel(null)} />}
            {activePanel === 'audio' && <AudioPanel onClose={() => setActivePanel(null)} />}
            {activePanel === 'exports' && <ExportsPanel onClose={() => setActivePanel(null)} />}
            {activePanel === 'settings' && <ProjectSettingsPanel onClose={() => setActivePanel(null)} />}
          </div>
        )}

        {/* Tab bar - always visible on LEFT (RTL: appears on the left visually) */}
        <div className="w-16 shrink-0 bg-[#12121A] border-r border-white/[0.06] flex flex-col items-center py-2 gap-1">
          {panelTabs.map((tab, idx) => (
            <button
              key={tab.id}
              onClick={() => togglePanel(tab.id)}
              className={`w-14 h-14 rounded-lg flex flex-col items-center justify-center gap-1 transition-all group relative ${
                activePanel === tab.id
                  ? 'bg-accent-purple/20 text-accent-purple border border-accent-purple/30'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5 border border-transparent'
              }`}
            >
              <tab.icon size={18} />
              <span className="text-[9px] leading-tight">{tab.label}</span>
              {/* Tooltip on hover - appears to the LEFT in RTL */}
              <div className="absolute left-full px-2 py-1 bg-[#1a1a2e] border border-white/[0.12] rounded text-[10px] text-text-primary whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg" style={{ marginLeft: '8px' }}>
                {tab.tooltip}
                {idx < 5 && <span className="text-text-muted mr-1"> ({idx + 1})</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      <EditorModals />
      <ToastContainer />
    </div>
  )
}
