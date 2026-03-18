import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { CloudUpload, X, GripVertical, Video, Music, Plus, Merge, ArrowLeftRight, AlertCircle, Check, Pencil, Bot } from 'lucide-react'
import Modal from '../Modal'
import AutoEditWizard from './AutoEditWizard'
import AutoEditorEntry from '../../features/auto-editor'
import { useAutoEditorStore } from '../../features/auto-editor/store/autoEditorStore'
import { useUploadsStore } from '../../stores/uploadsStore'
import { useProjectsStore } from '../../stores/projectsStore'
import { useUIStore } from '../../stores/uiStore'

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

interface LocalFile {
  id: string
  name: string
  size: string
  sizeBytes: number
  type: 'video' | 'audio'
  nativeFile: File
}

const ACCEPTED_TYPES = '.mp4,.mov,.webm,.mp3,.wav,.m4a,.avi,.mkv,.flac,.ogg,.mpeg,.mpga,.oga,.ogv'
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'avi', 'mkv', 'mpeg', 'ogv']

function getFileType(name: string): 'video' | 'audio' {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return VIDEO_EXTENSIONS.includes(ext) ? 'video' : 'audio'
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)}MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`
}

function getNameFromFile(name: string): string {
  return name.replace(/\.[^.]+$/, '')
}

interface UploadModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function UploadModal({ isOpen, onClose }: UploadModalProps) {
  const navigate = useNavigate()
  const [files, setFiles] = useState<LocalFile[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [mergeEnabled, setMergeEnabled] = useState(false)
  const [transition, setTransition] = useState('none')
  const [transitionDuration, setTransitionDuration] = useState(1.0)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dropIdx, setDropIdx] = useState<number | null>(null)
  const [projectName, setProjectName] = useState('')
  const [nameError, setNameError] = useState(false)
  const [showChoice, setShowChoice] = useState(false)
  const [showAutoEdit, setShowAutoEdit] = useState(false)
  const [showMarketingEditor, setShowMarketingEditor] = useState(false)
  const resetAutoEditor = useAutoEditorStore((s) => s.reset)
  const [isUploading, setIsUploading] = useState(false)
  const [isMerging, setIsMerging] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [statusText, setStatusText] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const addUploadFile = useUploadsStore((s) => s.addFile)
  const simulateUpload = useUploadsStore((s) => s.simulateUpload)
  const addProject = useProjectsStore((s) => s.addProject)
  const addToast = useUIStore((s) => s.addToast)


  const processNativeFiles = useCallback((nativeFiles: FileList | File[]) => {
    const newFiles: LocalFile[] = Array.from(nativeFiles).map((f) => ({
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name: f.name,
      size: formatSize(f.size),
      sizeBytes: f.size,
      type: getFileType(f.name),
      nativeFile: f,
    }))
    setFiles((prev) => {
      const updated = [...prev, ...newFiles]
      // Auto-suggest project name from first file
      if (prev.length === 0 && newFiles.length > 0 && !projectName) {
        setProjectName(getNameFromFile(newFiles[0].name))
      }
      return updated
    })
  }, [projectName])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) {
      processNativeFiles(e.dataTransfer.files)
    }
  }, [processNativeFiles])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  const handleReorderDragStart = (idx: number) => setDragIdx(idx)

  const handleReorderDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    setDropIdx(idx)
  }

  const handleReorderDrop = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault()
    if (dragIdx === null || dragIdx === targetIdx) {
      setDragIdx(null)
      setDropIdx(null)
      return
    }
    setFiles((prev) => {
      const arr = [...prev]
      const [item] = arr.splice(dragIdx, 1)
      arr.splice(targetIdx, 0, item)
      return arr
    })
    setDragIdx(null)
    setDropIdx(null)
  }

  const handleStartUpload = async () => {
    if (!projectName.trim()) {
      setNameError(true)
      return
    }
    setNameError(false)
    setIsUploading(true)
    setUploadProgress(0)

    if (mergeEnabled && files.length > 1) {
      // MERGE FLOW: upload all files, merge on server, create one project with merged video
      setIsMerging(true)
      setStatusText('מעלה קבצים...')
      setUploadProgress(20)

      const formData = new FormData()
      files.forEach((f, i) => {
        formData.append('files', f.nativeFile)
        formData.append('order', String(i))
      })
      formData.append('transition', transition)
      formData.append('transitionDuration', String(transitionDuration))

      try {
        setStatusText('מאחד סרטונים... ⏳')
        setUploadProgress(50)

        const response = await fetch('http://localhost:3001/api/merge', {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          const err = await response.json().catch(() => ({}))
          throw new Error(err.message || 'Merge failed')
        }

        setUploadProgress(80)
        setStatusText('מעבד תוצאה...')

        const result = await response.json()
        // Fetch the merged file blob
        const blobResponse = await fetch(`http://localhost:3001${result.url}`)
        const mergedBlob = await blobResponse.blob()
        const mergedFile = new File([mergedBlob], projectName.trim() + '.mp4', { type: 'video/mp4' })
        const mergedUrl = URL.createObjectURL(mergedBlob)

        setUploadProgress(95)

        // Create ONE project with ONE merged video
        const projectId = addProject({
          name: projectName.trim(),
          mediaFile: mergedFile,
          mediaBlobUrl: mergedUrl,
          mediaType: 'video',
          source: 'upload',
          videos: [{
            file: mergedFile,
            blobUrl: mergedUrl,
            mediaType: 'video' as const,
          }],
        })

        setUploadProgress(100)
        addToast('הסרטונים אוחדו בהצלחה!', 'success')

        setTimeout(() => {
          setIsUploading(false)
          setIsMerging(false)
          setUploadProgress(0)
          setStatusText('')
          setFiles([])
          setProjectName('')
          setMergeEnabled(false)
          setTransition('none')
          onClose()
          navigate(`/editor/${projectId}`)
        }, 500)
      } catch (error: any) {
        setIsUploading(false)
        setIsMerging(false)
        setUploadProgress(0)
        setStatusText('')
        addToast(error.message || 'שגיאה באיחוד. נסה שוב.', 'error')
      }
    } else {
      // NORMAL FLOW (no merge) - one project with separate videos
      const videosData = files.map((file) => ({
        file: file.nativeFile,
        blobUrl: URL.createObjectURL(file.nativeFile),
        mediaType: file.type,
      }))

      const projectId = addProject({
        name: projectName.trim(),
        mediaFile: files[0]?.nativeFile,
        mediaBlobUrl: videosData[0]?.blobUrl,
        mediaType: files[0]?.type,
        source: 'upload',
        videos: videosData,
      })

      // Track uploads
      files.forEach((file) => {
        const uploadId = addUploadFile({
          name: file.name,
          size: file.size,
          sizeBytes: file.sizeBytes,
          type: file.type,
          source: 'upload',
          status: 'waiting',
          progress: 0,
          thumbnailGradient: '',
          projectId,
          file: file.nativeFile,
          blobUrl: URL.createObjectURL(file.nativeFile),
        })
        simulateUpload(uploadId)
      })

      // Simulate upload progress with visual feedback
      let progress = 0
      const progressInterval = setInterval(() => {
        progress += 8
        setUploadProgress(Math.min(progress, 100))
        if (progress >= 100) {
          clearInterval(progressInterval)
          setTimeout(() => {
            setIsUploading(false)
            setUploadProgress(0)
            setFiles([])
            setProjectName('')
            setMergeEnabled(false)
            setTransition('none')
            onClose()
            navigate(`/editor/${projectId}`)
          }, 500)
        }
      }, 200)
    }
  }

  const handleClose = () => {
    if (isUploading) return // Don't close while uploading

    // Don't close while auto-editor is processing
    const autoEditorStep = useAutoEditorStore.getState().step
    const isAutoEditorProcessing = autoEditorStep !== 'idle' && autoEditorStep !== 'done' && autoEditorStep !== 'error'
    if (isAutoEditorProcessing) {
      console.warn('[UPLOAD-MODAL] Blocked close during auto-editor processing, step:', autoEditorStep)
      return
    }

    setFiles([])
    setMergeEnabled(false)
    setTransition('none')
    setProjectName('')
    setNameError(false)
    setShowChoice(false)
    setShowAutoEdit(false)
    setShowMarketingEditor(false)
    resetAutoEditor()
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="העלה קבצים" subtitle="העלה קבצי וידאו או אודיו" size="full">
      <div className="space-y-6">
        {/* Upload progress overlay */}
        {isUploading && (
          <div className="space-y-4">
            <div className="text-center py-8">
              <CloudUpload size={48} className="mx-auto mb-4 text-accent-purple animate-bounce" />
              <h3 className="text-lg font-medium text-text-primary mb-2">
                {isMerging ? statusText : (uploadProgress < 100 ? 'מעלה...' : 'מעבד...')}
              </h3>
              <p className="text-sm text-text-muted mb-4">{projectName} ({files.length} קבצים)</p>
              <div className="max-w-md mx-auto">
                <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-l from-accent-purple to-accent-blue rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <span className="text-xs text-text-muted mt-2 block">{Math.round(uploadProgress)}%</span>
              </div>
            </div>
          </div>
        )}

        {!isUploading && !showChoice && !showAutoEdit && !showMarketingEditor && (
          <>
            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
                dragOver
                  ? 'border-accent-purple bg-accent-purple/5 scale-[1.01]'
                  : 'border-white/[0.12] hover:border-accent-purple/40 hover:bg-white/[0.02]'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPTED_TYPES}
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) processNativeFiles(e.target.files)
                  e.target.value = ''
                }}
              />
              <CloudUpload size={64} className={`mx-auto mb-4 ${dragOver ? 'text-accent-purple' : 'text-text-muted'} transition-colors`} />
              <p className="text-lg font-medium text-text-primary mb-1">גרור קבצים לכאן</p>
              <p className="text-sm text-text-muted mb-2">או לחץ לבחירת קבצים</p>
              <p className="text-xs text-text-muted">MP4, MOV, WebM, AVI, MKV, MP3, WAV, M4A, FLAC, OGG</p>
              <p className="text-xs text-text-muted mt-1">ניתן להעלות קבצים בכל גודל</p>
            </div>

            {/* File list */}
            {files.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-text-primary">{files.length} קבצים נבחרו</h3>
                <div className="space-y-2">
                  {files.map((file, idx) => (
                    <div
                      key={file.id}
                      draggable
                      onDragStart={() => handleReorderDragStart(idx)}
                      onDragOver={(e) => handleReorderDragOver(e, idx)}
                      onDrop={(e) => handleReorderDrop(e, idx)}
                      onDragEnd={() => { setDragIdx(null); setDropIdx(null) }}
                      className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                        dragIdx === idx
                          ? 'opacity-50 border-accent-purple/40 bg-accent-purple/5'
                          : dropIdx === idx
                            ? 'border-accent-purple/40 bg-accent-purple/5'
                            : 'border-white/[0.06] bg-bg-card hover:border-white/[0.12]'
                      }`}
                    >
                      <div className="cursor-grab active:cursor-grabbing text-text-muted hover:text-text-secondary">
                        <GripVertical size={18} />
                      </div>
                      <span className="w-6 h-6 rounded-full bg-white/[0.06] flex items-center justify-center text-xs text-text-muted font-mono">
                        {idx + 1}
                      </span>
                      {file.type === 'video' ? (
                        <Video size={18} className="text-accent-blue shrink-0" />
                      ) : (
                        <Music size={18} className="text-accent-purple shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-text-primary truncate">{file.name}</div>
                        <div className="text-xs text-text-muted">{file.size}</div>
                      </div>
                      <span className="text-xs text-text-muted px-2 py-0.5 rounded-full bg-white/[0.04]">ממתין</span>
                      <button
                        onClick={() => removeFile(file.id)}
                        className="p-1 text-text-muted hover:text-error rounded transition-colors hover:bg-error/10"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-accent-purple hover:bg-accent-purple/5 rounded-xl transition-colors w-full justify-center border border-dashed border-accent-purple/30"
                >
                  <Plus size={16} /> הוסף עוד קבצים
                </button>
              </div>
            )}

            {/* Merge options - informational: toggle controls merge behavior, not project creation */}
            {files.length >= 2 && (
              <div className="bg-bg-card rounded-xl p-4 border border-white/[0.06] space-y-3">
                <div className="flex items-center gap-2 text-xs text-accent-blue">
                  <Merge size={14} />
                  <span>כל הקבצים ייכנסו לפרויקט אחד</span>
                </div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <button
                    onClick={() => setMergeEnabled(!mergeEnabled)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${mergeEnabled ? 'bg-accent-purple' : 'bg-white/[0.12]'}`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${mergeEnabled ? 'left-0.5' : 'right-0.5'}`} />
                  </button>
                  <div className="flex items-center gap-2">
                    <Merge size={16} className="text-text-muted" />
                    <span className="text-sm text-text-primary">חבר את כל הקבצים לסרטון אחד</span>
                  </div>
                </label>

                {mergeEnabled ? (
                  <div className="space-y-3 pr-6">
                    <p className="text-xs text-text-muted">הסרטון הסופי יהיה בסדר הבא:</p>
                    <div className="space-y-1">
                      {files.map((f, i) => (
                        <div key={f.id} className="flex items-center gap-2 text-xs text-text-secondary">
                          <span className="font-mono text-accent-purple">{i + 1}.</span>
                          <span className="truncate">{f.name}</span>
                        </div>
                      ))}
                    </div>

                    {/* Transition selection grid */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <ArrowLeftRight size={14} className="text-text-muted" />
                        <span className="text-xs text-text-muted font-medium">מעבר בין הקבצים:</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 max-h-48 overflow-y-auto">
                        {TRANSITIONS.map((t) => (
                          <button
                            key={t.id}
                            onClick={() => setTransition(t.id)}
                            className={`relative flex flex-col items-center gap-0.5 p-2 rounded-lg border transition-all text-center ${
                              transition === t.id
                                ? 'border-accent-purple bg-accent-purple/10 text-accent-purple'
                                : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.15] text-text-secondary hover:text-text-primary'
                            }`}
                          >
                            {transition === t.id && (
                              <div className="absolute top-1 left-1">
                                <Check size={10} className="text-accent-purple" />
                              </div>
                            )}
                            <span className="text-lg leading-none">{t.icon}</span>
                            <span className="text-[10px] font-medium leading-tight">{t.name}</span>
                            <span className="text-[8px] text-text-muted leading-tight">{t.description}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Transition duration slider */}
                    {transition !== 'none' && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-text-muted">משך מעבר:</span>
                          <span className="text-xs text-accent-purple font-mono">{transitionDuration.toFixed(1)} שניות</span>
                        </div>
                        <input
                          type="range"
                          min="0.3"
                          max="3"
                          step="0.1"
                          value={transitionDuration}
                          onChange={(e) => setTransitionDuration(parseFloat(e.target.value))}
                          className="w-full h-1.5 bg-white/[0.06] rounded-full appearance-none cursor-pointer accent-accent-purple"
                        />
                        <div className="flex justify-between text-[9px] text-text-muted">
                          <span>0.3s</span>
                          <span>3.0s</span>
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-accent-blue">האיחוד יתבצע אוטומטית בלחיצה על ״התחל העלאה״</p>
                  </div>
                ) : (
                  <p className="text-xs text-text-muted pr-6">כל קובץ יופיע בנפרד בסרגל המדיה של הפרויקט</p>
                )}
              </div>
            )}

            {/* Project name input - shown after files are selected */}
            {files.length > 0 && (
              <div className="bg-bg-card rounded-xl p-4 border border-white/[0.06] space-y-2">
                <label className="text-sm font-medium text-text-primary block">שם הפרויקט:</label>
                <input
                  value={projectName}
                  onChange={(e) => {
                    setProjectName(e.target.value)
                    if (e.target.value.trim()) setNameError(false)
                  }}
                  placeholder="הזן שם לפרויקט..."
                  className={`w-full px-4 py-2.5 bg-bg-elevated rounded-xl border text-sm text-text-primary placeholder-text-muted focus:outline-none transition-colors ${
                    nameError
                      ? 'border-error focus:border-error'
                      : 'border-white/[0.06] focus:border-accent-purple/40'
                  }`}
                  autoFocus
                />
                {nameError && (
                  <div className="flex items-center gap-1.5 text-error text-xs">
                    <AlertCircle size={12} />
                    נא להזין שם לפרויקט
                  </div>
                )}
                <p className="text-xs text-text-muted">הקבצים נשמרים באופן זמני. חבר backend לשמירה קבועה</p>
                {files.some(f => f.sizeBytes > 100 * 1024 * 1024) && (
                  <p className="text-xs text-yellow-400">קבצים גדולים עשויים לקחת יותר זמן לעיבוד</p>
                )}
              </div>
            )}

            {/* Action buttons - show "Continue" to go to choice */}
            {files.length > 0 && (
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => {
                    if (!projectName.trim()) {
                      setNameError(true)
                      return
                    }
                    setNameError(false)
                    setShowChoice(true)
                  }}
                  disabled={!projectName.trim()}
                  className="flex items-center gap-2 px-6 py-3 bg-accent-purple hover:bg-accent-purple/90 rounded-xl text-sm font-medium transition-all shadow-lg shadow-accent-purple/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CloudUpload size={18} /> המשך
                </button>
                <button
                  onClick={handleClose}
                  className="px-6 py-3 text-sm text-text-muted hover:text-text-primary transition-colors"
                >
                  ביטול
                </button>
              </div>
            )}
          </>
        )}

        {/* Marketing Auto-Editor */}
        {!isUploading && showMarketingEditor && (
          <AutoEditorEntry
            files={files}
            onBack={() => {
              const step = useAutoEditorStore.getState().step
              const isProcessing = step !== 'idle' && step !== 'done' && step !== 'error'
              if (isProcessing) {
                console.warn('[UPLOAD-MODAL] Blocked onBack during auto-editor processing, step:', step)
                return
              }
              setShowMarketingEditor(false)
              setShowChoice(true)
              resetAutoEditor()
            }}
            onClose={handleClose}
          />
        )}

        {/* Choice screen: Editor vs Auto-Edit */}
        {!isUploading && showChoice && !showAutoEdit && !showMarketingEditor && (
          <div className="space-y-6 py-4">
            <h3 className="text-center text-xl font-bold text-text-primary">מה תרצה לעשות עם הקבצים?</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
              <button
                onClick={() => {
                  setShowChoice(false)
                  handleStartUpload()
                }}
                className="p-6 rounded-2xl border-2 border-white/[0.06] hover:border-accent-blue/40 bg-gradient-to-br from-blue-600/10 to-blue-400/5 hover:from-blue-600/20 hover:to-blue-400/10 text-center transition-all hover:-translate-y-1 group"
              >
                <div className="w-14 h-14 mx-auto mb-3 rounded-xl bg-accent-blue/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Pencil size={24} className="text-accent-blue" />
                </div>
                <div className="text-base font-bold text-text-primary mb-2">העבר לעורך</div>
                <div className="text-sm text-text-muted leading-relaxed">
                  אעלה את הקבצים ואערוך ידנית בעורך
                </div>
              </button>
              <button
                onClick={() => {
                  setShowChoice(false)
                  setShowMarketingEditor(true)
                }}
                className="p-6 rounded-2xl border-2 border-white/[0.06] hover:border-accent-purple/40 bg-gradient-to-br from-purple-600/10 to-purple-400/5 hover:from-purple-600/20 hover:to-purple-400/10 text-center transition-all hover:-translate-y-1 group relative overflow-hidden"
              >
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-accent-purple/20 text-[10px] text-accent-purple font-medium">
                  AI
                </div>
                <div className="w-14 h-14 mx-auto mb-3 rounded-xl bg-accent-purple/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Bot size={24} className="text-accent-purple" />
                </div>
                <div className="text-base font-bold text-text-primary mb-2">עריכה אוטומטית</div>
                <div className="text-sm text-text-muted leading-relaxed">
                  AI יערוך את הסרטון אוטומטית לפי ההעדפות שלי
                </div>
              </button>
            </div>
            <div className="text-center">
              <button
                onClick={() => setShowChoice(false)}
                className="text-sm text-text-muted hover:text-text-primary transition-colors"
              >
                ← חזרה לבחירת קבצים
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Auto-Edit Wizard */}
      <AutoEditWizard
        isOpen={showAutoEdit}
        onClose={handleClose}
        onBack={() => {
          setShowAutoEdit(false)
          setShowChoice(true)
        }}
        files={files}
        projectName={projectName}
      />
    </Modal>
  )
}
