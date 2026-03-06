import { useState, useRef, useCallback } from 'react'
import { CloudUpload, X, GripVertical, Video, Music, Plus, Merge, ArrowLeftRight } from 'lucide-react'
import Modal from '../Modal'
import { useUploadsStore } from '../../stores/uploadsStore'
import { useUIStore } from '../../stores/uiStore'

interface LocalFile {
  id: string
  name: string
  size: string
  sizeBytes: number
  type: 'video' | 'audio'
}

const ACCEPTED_TYPES = '.mp4,.mov,.webm,.mp3,.wav,.m4a'
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm']

function getFileType(name: string): 'video' | 'audio' {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return VIDEO_EXTENSIONS.includes(ext) ? 'video' : 'audio'
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)}MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`
}

interface UploadModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function UploadModal({ isOpen, onClose }: UploadModalProps) {
  const [files, setFiles] = useState<LocalFile[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [mergeEnabled, setMergeEnabled] = useState(false)
  const [transition, setTransition] = useState<'none' | 'fade' | 'crossDissolve'>('none')
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dropIdx, setDropIdx] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const addFile = useUploadsStore((s) => s.addFile)
  const simulateUpload = useUploadsStore((s) => s.simulateUpload)
  const addToast = useUIStore((s) => s.addToast)

  const processNativeFiles = useCallback((nativeFiles: FileList | File[]) => {
    const newFiles: LocalFile[] = Array.from(nativeFiles).map((f) => ({
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name: f.name,
      size: formatSize(f.size),
      sizeBytes: f.size,
      type: getFileType(f.name),
    }))
    setFiles((prev) => [...prev, ...newFiles])
  }, [])

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

  // Reorder drag handlers
  const handleReorderDragStart = (idx: number) => {
    setDragIdx(idx)
  }

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
    files.forEach((file) => {
      const id = addFile({
        name: file.name,
        size: file.size,
        sizeBytes: file.sizeBytes,
        type: file.type,
        source: 'upload',
        status: 'waiting',
        progress: 0,
        thumbnailGradient: '',
      })
      simulateUpload(id)
    })
    addToast('ההעלאה ממשיכה ברקע. תוכל להמשיך לעבוד.', 'info')
    setFiles([])
    onClose()
  }

  const handleClose = () => {
    setFiles([])
    setMergeEnabled(false)
    setTransition('none')
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="העלה קבצים" subtitle="העלה קבצי וידאו או אודיו" size="full">
      <div className="space-y-6">
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
          <p className="text-xs text-text-muted">MP4, MOV, WebM, MP3, WAV, M4A • עד 2GB לכל קובץ</p>
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
                  {/* Drag handle */}
                  <div className="cursor-grab active:cursor-grabbing text-text-muted hover:text-text-secondary">
                    <GripVertical size={18} />
                  </div>
                  {/* Order number */}
                  <span className="w-6 h-6 rounded-full bg-white/[0.06] flex items-center justify-center text-xs text-text-muted font-mono">
                    {idx + 1}
                  </span>
                  {/* File icon */}
                  {file.type === 'video' ? (
                    <Video size={18} className="text-accent-blue shrink-0" />
                  ) : (
                    <Music size={18} className="text-accent-purple shrink-0" />
                  )}
                  {/* File info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-text-primary truncate">{file.name}</div>
                    <div className="text-xs text-text-muted">{file.size}</div>
                  </div>
                  {/* Status */}
                  <span className="text-xs text-text-muted px-2 py-0.5 rounded-full bg-white/[0.04]">ממתין</span>
                  {/* Remove */}
                  <button
                    onClick={() => removeFile(file.id)}
                    className="p-1 text-text-muted hover:text-error rounded transition-colors hover:bg-error/10"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>

            {/* Add more */}
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

        {/* Action buttons */}
        {files.length > 0 && (
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleStartUpload}
              className="flex items-center gap-2 px-6 py-3 bg-accent-purple hover:bg-accent-purple/90 rounded-xl text-sm font-medium transition-all shadow-lg shadow-accent-purple/20"
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
      </div>
    </Modal>
  )
}
