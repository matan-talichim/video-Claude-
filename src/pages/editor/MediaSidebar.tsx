import { useState, useRef } from 'react'
import { Film, Upload, Trash2, GripVertical, Loader2, Merge, AlertTriangle, ChevronDown, ChevronLeft, ArrowLeftRight, Check } from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'
import { useProjectsStore } from '../../stores/projectsStore'
import { useUIStore } from '../../stores/uiStore'
import { api } from '../../services/api'

const TRANSITIONS = [
  { id: 'none', name: 'ללא', icon: '—', description: 'חיבור ישיר ללא מעבר' },
  { id: 'fade', name: 'עמעום', icon: '🌫', description: 'עמעום הדרגתי בין הסרטונים' },
  { id: 'dissolve', name: 'המסה', icon: '💫', description: 'המסה חלקה בין הסרטונים' },
  { id: 'wipe-left', name: 'מחיקה שמאלה', icon: '👈', description: 'הסרטון הבא נכנס משמאל' },
  { id: 'wipe-right', name: 'מחיקה ימינה', icon: '👉', description: 'הסרטון הבא נכנס מימין' },
  { id: 'wipe-up', name: 'מחיקה למעלה', icon: '👆', description: 'הסרטון הבא נכנס מלמטה' },
  { id: 'wipe-down', name: 'מחיקה למטה', icon: '👇', description: 'הסרטון הבא נכנס מלמעלה' },
  { id: 'slide-left', name: 'הזזה שמאלה', icon: '⬅️', description: 'שני הסרטונים זזים שמאלה' },
  { id: 'slide-right', name: 'הזזה ימינה', icon: '➡️', description: 'שני הסרטונים זזים ימינה' },
  { id: 'zoom-in', name: 'זום פנימה', icon: '🔍', description: 'זום פנימה למרכז' },
  { id: 'zoom-out', name: 'זום החוצה', icon: '🔎', description: 'זום החוצה מהמרכז' },
  { id: 'blur', name: 'טשטוש', icon: '🌀', description: 'טשטוש ומעבר' },
  { id: 'flash', name: 'הבזק', icon: '⚡', description: 'הבזק לבן בין הסרטונים' },
  { id: 'black', name: 'מעבר שחור', icon: '⬛', description: 'עמעום לשחור ובחזרה' },
  { id: 'spin', name: 'סיבוב', icon: '🔄', description: 'סיבוב בין הסרטונים' },
]

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = Math.floor(seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export default function MediaSidebar({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { loadMedia, isDirty } = useEditorStore()
  const { addToast } = useUIStore()
  const project = useProjectsStore((s) => s.projects.find((p) => p.id === projectId))
  const addVideoToProject = useProjectsStore((s) => s.addVideoToProject)
  const reorderVideos = useProjectsStore((s) => s.reorderVideos)
  const removeVideoFromProject = useProjectsStore((s) => s.removeVideoFromProject)
  const setActiveVideo = useProjectsStore((s) => s.setActiveVideo)
  const replaceVideosWithMerged = useProjectsStore((s) => s.replaceVideosWithMerged)
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [showSaveDialog, setShowSaveDialog] = useState<{ targetVideoId: string } | null>(null)
  const [isMerging, setIsMerging] = useState(false)
  const [showMergeDialog, setShowMergeDialog] = useState(false)
  const [mergeTransition, setMergeTransition] = useState('none')
  const [mergeTransitionDuration, setMergeTransitionDuration] = useState(1.0)
  const [showOriginalFiles, setShowOriginalFiles] = useState(false)
  const [originalFileNames, setOriginalFileNames] = useState<string[]>([])

  const videos = project?.videos?.slice().sort((a, b) => a.order - b.order) || []
  const activeVideoId = project?.activeVideoId || null
  const isMergedProject = videos.length === 1 && videos[0]?.fileName.includes('(מאוחד)')

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || !projectId) return
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const blobUrl = URL.createObjectURL(file)
      const mediaType = file.type.startsWith('video/') ? 'video' as const : 'audio' as const
      addVideoToProject(projectId, file, blobUrl, mediaType)
    }
    addToast(`${files.length} קבצים הוספו לפרויקט!`, 'success')
    e.target.value = ''
  }

  const handleSwitchVideo = (videoId: string) => {
    if (videoId === activeVideoId) return
    const video = videos.find((v) => v.id === videoId)
    if (!video) return

    if (isDirty) {
      setShowSaveDialog({ targetVideoId: videoId })
      return
    }

    doSwitchVideo(video)
  }

  const doSwitchVideo = (video: typeof videos[0]) => {
    loadMedia(video.file, video.blobUrl, video.mediaType)
    setActiveVideo(projectId, video.id)
    addToast(`נטען: ${video.fileName}`, 'success')
    setShowSaveDialog(null)
  }

  const handleRemove = (e: React.MouseEvent, videoId: string) => {
    e.stopPropagation()
    if (videos.length <= 1) {
      addToast('לא ניתן למחוק את הקובץ האחרון', 'warning')
      return
    }
    removeVideoFromProject(projectId, videoId)
    if (videoId === activeVideoId) {
      const remaining = videos.filter((v) => v.id !== videoId)
      if (remaining.length > 0) {
        doSwitchVideo(remaining[0])
      }
    }
  }

  const [overIdx, setOverIdx] = useState<number | null>(null)

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDragIdx(idx)
    // Set drag data so timeline can accept drops
    const video = videos[idx]
    if (video) {
      e.dataTransfer.setData('application/x-media-item', JSON.stringify({
        id: video.id,
        fileName: video.fileName,
        blobUrl: video.blobUrl,
        duration: video.duration,
        mediaType: video.mediaType,
      }))
      e.dataTransfer.effectAllowed = 'move'
    }
  }
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    setOverIdx(idx)
    if (dragIdx === null || dragIdx === idx) return
    reorderVideos(projectId, dragIdx, idx)
    setDragIdx(idx)
  }
  const handleDragEnd = () => { setDragIdx(null); setOverIdx(null) }

  const handleMerge = async () => {
    if (videos.length < 2) {
      addToast('נדרשים לפחות 2 קבצים למיזוג', 'warning')
      return
    }
    // Store original file names before merge
    const origNames = videos.map((v) => v.fileName)
    setShowMergeDialog(false)
    setIsMerging(true)
    try {
      const sortedFiles = videos.map((v) => v.file)
      const result = await api.mergeVideos(sortedFiles, mergeTransition, mergeTransitionDuration)
      if (result.url) {
        const response = await fetch(`http://localhost:3001${result.url}`)
        const blob = await response.blob()
        const file = new File([blob], `${project?.name || 'merged'}.mp4`, { type: 'video/mp4' })
        const blobUrl = URL.createObjectURL(blob)

        // Calculate total duration from videos
        const totalDuration = videos.reduce((sum, v) => sum + (v.duration || 0), 0)

        // Replace all individual videos with the merged one
        replaceVideosWithMerged(projectId, file, blobUrl, totalDuration, origNames)

        // Load merged video in editor
        loadMedia(file, blobUrl, 'video')

        // Store original file names for display
        setOriginalFileNames(origNames)
        setShowOriginalFiles(false)

        addToast('✅ הסרטונים אוחדו לסרטון אחד!', 'success')
      }
    } catch {
      addToast('שגיאה במיזוג הסרטונים', 'error')
    }
    setIsMerging(false)
  }

  return (
    <div className="flex flex-col h-full glass rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center justify-between p-3 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2">
          <Film size={16} className="text-accent-blue" />
          <span className="font-bold text-sm text-text-primary">קבצי הפרויקט</span>
          <span className="text-[10px] text-text-muted">({videos.length})</span>
        </div>
        <button onClick={onClose} className="text-xs text-text-muted hover:text-text-primary transition-colors">סגור</button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        <input ref={fileRef} type="file" accept="video/*,audio/*" multiple className="hidden" onChange={handleUpload} />
        <button onClick={() => fileRef.current?.click()}
          className="w-full py-4 bg-white/[0.03] hover:bg-white/[0.06] border-2 border-dashed border-white/[0.12] hover:border-accent-purple/30 rounded-xl text-text-secondary transition-all flex flex-col items-center gap-1">
          <Upload size={20} className="text-text-muted" />
          <span className="text-xs">הוסף קבצי מדיה</span>
        </button>

        {videos.map((video, idx) => (
          <div key={video.id}
            draggable={!isMergedProject}
            onDragStart={(e) => handleDragStart(e, idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDragEnd={handleDragEnd}
            className={`flex items-center gap-2 p-2 rounded-lg border transition-all cursor-pointer ${
              video.id === activeVideoId
                ? 'bg-accent-purple/10 border-accent-purple/30'
                : 'bg-white/[0.03] border-white/[0.06] hover:border-white/[0.12]'
            } ${dragIdx === idx ? 'opacity-40 scale-[0.98]' : ''} ${overIdx === idx && dragIdx !== idx ? 'border-t-2 border-t-accent-purple' : ''}`}
            style={{ transition: 'all 200ms ease' }}
            onClick={() => handleSwitchVideo(video.id)}>
            {!isMergedProject && (
              <GripVertical size={12} className="text-text-muted cursor-grab shrink-0" />
            )}
            <span className="w-5 h-5 rounded-full bg-white/[0.06] flex items-center justify-center text-[9px] text-text-muted font-mono shrink-0">
              {isMergedProject ? '🎬' : idx + 1}
            </span>
            <div className="w-10 h-8 bg-white/[0.04] rounded flex items-center justify-center shrink-0">
              <Film size={14} className="text-text-muted" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-text-primary truncate">{video.fileName}</p>
              <p className="text-[9px] text-text-muted">
                {formatFileSize(video.size)}
                {video.duration > 0 && ` • ${formatDuration(video.duration)}`}
                {' - '}{video.mediaType === 'video' ? 'וידאו' : 'אודיו'}
              </p>
            </div>
            {video.id === activeVideoId ? (
              <span className="text-[8px] px-1.5 py-0.5 bg-accent-purple/20 text-accent-purple rounded flex items-center gap-0.5">
                ✏️ עריכה פעילה
              </span>
            ) : video.isTranscribed ? (
              <span className="text-[8px] px-1 py-0.5 bg-success/20 text-success rounded">תומלל</span>
            ) : null}
            {!isMergedProject && (
              <button onClick={(e) => handleRemove(e, video.id)}
                className="p-1 text-text-muted hover:text-red-400 transition-colors shrink-0">
                <Trash2 size={11} />
              </button>
            )}
          </div>
        ))}

        {/* Original files collapsible section (shown after merge) */}
        {originalFileNames.length > 0 && (
          <div className="border border-white/[0.06] rounded-lg overflow-hidden">
            <button
              onClick={() => setShowOriginalFiles(!showOriginalFiles)}
              className="w-full flex items-center gap-2 p-2 text-xs text-text-muted hover:text-text-secondary hover:bg-white/[0.03] transition-all"
            >
              {showOriginalFiles ? <ChevronDown size={12} /> : <ChevronLeft size={12} />}
              <span>קבצים מקוריים ({originalFileNames.length})</span>
            </button>
            {showOriginalFiles && (
              <div className="px-3 pb-2 space-y-1">
                {originalFileNames.map((name, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px] text-text-muted py-0.5">
                    <span className="font-mono text-accent-purple/60">{i + 1}.</span>
                    <Film size={10} className="text-text-muted/50 shrink-0" />
                    <span className="truncate">{name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {videos.length >= 2 && !isMergedProject && (
          <button onClick={() => setShowMergeDialog(true)} disabled={isMerging}
            className="w-full flex items-center justify-center gap-1.5 py-2 bg-accent-purple/10 hover:bg-accent-purple/20 border border-accent-purple/20 rounded-lg text-xs text-accent-purple transition-all disabled:opacity-50">
            {isMerging ? <Loader2 size={12} className="animate-spin" /> : <Merge size={12} />}
            {isMerging ? 'ממזג...' : 'אחד את כל הסרטונים'}
          </button>
        )}
      </div>

      {/* Merge dialog */}
      {showMergeDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => setShowMergeDialog(false)}>
          <div className="glass rounded-2xl p-5 max-w-sm w-full mx-4 space-y-4 animate-scale-in" style={{ border: '1px solid rgba(255,255,255,0.1)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Merge size={20} className="text-accent-purple" />
              <h3 className="font-bold text-text-primary text-sm">איחוד סרטונים</h3>
            </div>
            <p className="text-xs text-text-muted">הסרטונים יאוחדו בסדר הבא:</p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {videos.map((v, i) => (
                <div key={v.id} className="flex items-center gap-2 text-xs text-text-secondary p-1.5 bg-white/[0.03] rounded">
                  <span className="font-mono text-accent-purple w-4">{i + 1}.</span>
                  <Film size={12} className="text-text-muted shrink-0" />
                  <span className="truncate flex-1">{v.fileName}</span>
                  <span className="text-text-muted">{formatFileSize(v.size)}</span>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <ArrowLeftRight size={14} className="text-text-muted" />
                <span className="text-xs text-text-muted font-medium">מעבר בין הקבצים:</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 max-h-40 overflow-y-auto">
                {TRANSITIONS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setMergeTransition(t.id)}
                    className={`relative flex flex-col items-center gap-0.5 p-1.5 rounded-lg border transition-all text-center ${
                      mergeTransition === t.id
                        ? 'border-accent-purple bg-accent-purple/10 text-accent-purple'
                        : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.15] text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {mergeTransition === t.id && (
                      <div className="absolute top-0.5 left-0.5">
                        <Check size={8} className="text-accent-purple" />
                      </div>
                    )}
                    <span className="text-base leading-none">{t.icon}</span>
                    <span className="text-[9px] font-medium leading-tight">{t.name}</span>
                  </button>
                ))}
              </div>
              {mergeTransition !== 'none' && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-text-muted">משך מעבר:</span>
                    <span className="text-[10px] text-accent-purple font-mono">{mergeTransitionDuration.toFixed(1)}s</span>
                  </div>
                  <input
                    type="range"
                    min="0.3"
                    max="3"
                    step="0.1"
                    value={mergeTransitionDuration}
                    onChange={(e) => setMergeTransitionDuration(parseFloat(e.target.value))}
                    className="w-full h-1 bg-white/[0.06] rounded-full appearance-none cursor-pointer accent-accent-purple"
                  />
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={handleMerge}
                className="flex-1 py-2 bg-accent-purple hover:bg-accent-purple/90 rounded-xl text-sm font-medium text-white transition-all flex items-center justify-center gap-1.5">
                <Merge size={14} /> אחד
              </button>
              <button onClick={() => setShowMergeDialog(false)}
                className="px-4 py-2 bg-white/[0.06] hover:bg-white/[0.1] rounded-xl text-sm text-text-secondary transition-colors">
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save confirmation dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => setShowSaveDialog(null)}>
          <div className="glass rounded-2xl p-5 max-w-sm w-full mx-4 space-y-4 animate-scale-in" style={{ border: '1px solid rgba(255,255,255,0.1)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <AlertTriangle size={20} className="text-warning" />
              <h3 className="font-bold text-text-primary text-sm">שינויים שלא נשמרו</h3>
            </div>
            <p className="text-sm text-text-secondary">יש שינויים שלא נשמרו. להמשיך?</p>
            <div className="flex gap-2">
              <button onClick={() => {
                useEditorStore.getState().markSaved()
                const video = videos.find((v) => v.id === showSaveDialog.targetVideoId)
                if (video) doSwitchVideo(video)
              }}
                className="flex-1 py-2 bg-accent-purple hover:bg-accent-purple/90 rounded-xl text-sm font-medium text-white transition-all">
                המשך בלי לשמור
              </button>
              <button onClick={() => setShowSaveDialog(null)}
                className="px-4 py-2 bg-white/[0.06] hover:bg-white/[0.1] rounded-xl text-sm text-text-secondary transition-colors">
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
