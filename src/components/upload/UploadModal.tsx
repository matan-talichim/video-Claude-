import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { CloudUpload, X, GripVertical, Video, Music, Plus, Merge, ArrowLeftRight, AlertCircle } from 'lucide-react'
import Modal from '../Modal'
import { useUploadsStore } from '../../stores/uploadsStore'
import { useProjectsStore } from '../../stores/projectsStore'


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
  const [transition, setTransition] = useState<'none' | 'fade' | 'crossDissolve'>('none')
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dropIdx, setDropIdx] = useState<number | null>(null)
  const [projectName, setProjectName] = useState('')
  const [nameError, setNameError] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [completedProjects, setCompletedProjects] = useState<Array<{ id: string; name: string }>>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const addUploadFile = useUploadsStore((s) => s.addFile)
  const simulateUpload = useUploadsStore((s) => s.simulateUpload)
  const addProject = useProjectsStore((s) => s.addProject)


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

  const handleStartUpload = () => {
    if (!projectName.trim()) {
      setNameError(true)
      return
    }
    setNameError(false)
    setIsUploading(true)
    setUploadProgress(0)

    const projectIds: string[] = []

    if (mergeEnabled || files.length === 1) {
      // Single project from first file (or merged)
      const primaryFile = files[0]
      const blobUrl = URL.createObjectURL(primaryFile.nativeFile)
      const mediaType = primaryFile.type

      const projectId = addProject({
        name: projectName.trim(),
        mediaFile: primaryFile.nativeFile,
        mediaBlobUrl: blobUrl,
        mediaType,
        source: 'upload',
      })
      projectIds.push(projectId)

      const uploadId = addUploadFile({
        name: primaryFile.name,
        size: primaryFile.size,
        sizeBytes: primaryFile.sizeBytes,
        type: primaryFile.type,
        source: 'upload',
        status: 'waiting',
        progress: 0,
        thumbnailGradient: '',
        projectId,
        file: primaryFile.nativeFile,
        blobUrl,
      })
      simulateUpload(uploadId)
    } else {
      // Create separate project for EACH file
      files.forEach((file, idx) => {
        const blobUrl = URL.createObjectURL(file.nativeFile)
        const mediaType = file.type
        const name = files.length > 1
          ? `${projectName.trim()} (${idx + 1})`
          : projectName.trim()

        const projectId = addProject({
          name,
          mediaFile: file.nativeFile,
          mediaBlobUrl: blobUrl,
          mediaType,
          source: 'upload',
        })
        projectIds.push(projectId)

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
          blobUrl,
        })
        simulateUpload(uploadId)
      })
    }

    // Simulate upload progress with visual feedback
    let progress = 0
    const projectNames = files.map((_f, i) => {
      if (mergeEnabled || files.length === 1) return projectName.trim()
      return files.length > 1 ? `${projectName.trim()} (${i + 1})` : projectName.trim()
    })
    const progressInterval = setInterval(() => {
      progress += 8
      setUploadProgress(Math.min(progress, 100))
      if (progress >= 100) {
        clearInterval(progressInterval)
        setTimeout(() => {
          setIsUploading(false)
          setUploadProgress(0)
          // If multiple separate projects, show completion dialog
          if (!mergeEnabled && files.length > 1) {
            const projects = projectIds.map((id, i) => ({ id, name: projectNames[i] || `פרויקט ${i + 1}` }))
            setCompletedProjects(projects)
          } else {
            // Single project - navigate directly
            setFiles([])
            setProjectName('')
            onClose()
            if (projectIds.length > 0) navigate(`/editor/${projectIds[0]}`)
          }
        }, 500)
      }
    }, 200)
  }

  const handleClose = () => {
    if (isUploading) return // Don't close while uploading
    setFiles([])
    setMergeEnabled(false)
    setTransition('none')
    setProjectName('')
    setNameError(false)
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
                {uploadProgress < 100 ? 'מעלה...' : 'מעבד...'}
              </h3>
              <p className="text-sm text-text-muted mb-4">{projectName}</p>
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

        {/* Completion dialog for multiple projects */}
        {completedProjects.length > 0 && !isUploading && (
          <div className="space-y-4">
            <div className="text-center py-4">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-success/10 flex items-center justify-center">
                <CloudUpload size={32} className="text-success" />
              </div>
              <h3 className="text-lg font-medium text-text-primary mb-1">
                הועלו {completedProjects.length} פרויקטים בהצלחה!
              </h3>
            </div>
            <div className="space-y-2">
              {completedProjects.map((proj, i) => (
                <div key={proj.id} className="flex items-center gap-3 p-3 rounded-xl border border-white/[0.06] bg-bg-card hover:border-white/[0.12] transition-all">
                  <span className="w-6 h-6 rounded-full bg-accent-purple/10 flex items-center justify-center text-xs text-accent-purple font-mono">{i + 1}</span>
                  <span className="flex-1 text-sm text-text-primary">{proj.name}</span>
                  <button
                    onClick={() => { setCompletedProjects([]); setFiles([]); setProjectName(''); onClose(); navigate(`/editor/${proj.id}`) }}
                    className="px-3 py-1.5 bg-accent-purple/10 hover:bg-accent-purple/20 text-accent-purple rounded-lg text-xs transition-colors"
                  >
                    פתח
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => { setCompletedProjects([]); setFiles([]); setProjectName(''); onClose(); navigate(`/editor/${completedProjects[0].id}`) }}
              className="w-full py-3 bg-accent-purple hover:bg-accent-purple/90 rounded-xl text-sm font-medium transition-all shadow-lg shadow-accent-purple/20"
            >
              פתח את הראשון
            </button>
          </div>
        )}

        {!isUploading && completedProjects.length === 0 && (
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

            {/* Merge options */}
            {files.length >= 2 && (
              <div className="bg-bg-card rounded-xl p-4 border border-white/[0.06] space-y-3">
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
                  <div className="space-y-2 pr-6">
                    <p className="text-xs text-text-muted">הסרטון הסופי יהיה בסדר הבא:</p>
                    <div className="space-y-1">
                      {files.map((f, i) => (
                        <div key={f.id} className="flex items-center gap-2 text-xs text-text-secondary">
                          <span className="font-mono text-accent-purple">{i + 1}.</span>
                          <span className="truncate">{f.name}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <ArrowLeftRight size={14} className="text-text-muted" />
                      <span className="text-xs text-text-muted">מעבר בין הקבצים:</span>
                      <select
                        value={transition}
                        onChange={(e) => setTransition(e.target.value as typeof transition)}
                        className="px-2 py-1 bg-bg-elevated rounded-lg border border-white/[0.06] text-xs text-text-primary focus:outline-none cursor-pointer"
                      >
                        <option value="none">ללא</option>
                        <option value="fade">Fade</option>
                        <option value="crossDissolve">Cross dissolve</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-text-muted pr-6">כל קובץ ייפתח כפרויקט נפרד</p>
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

            {/* Action buttons */}
            {files.length > 0 && (
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleStartUpload}
                  disabled={!projectName.trim()}
                  className="flex items-center gap-2 px-6 py-3 bg-accent-purple hover:bg-accent-purple/90 rounded-xl text-sm font-medium transition-all shadow-lg shadow-accent-purple/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CloudUpload size={18} /> התחל העלאה
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
      </div>
    </Modal>
  )
}
