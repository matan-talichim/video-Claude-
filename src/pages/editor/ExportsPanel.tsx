import { useState } from 'react'
import { Download, Play, Trash2, Package, X } from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'
import { useUIStore } from '../../stores/uiStore'

export default function ExportsPanel({ onClose }: { onClose?: () => void }) {
  const editedFiles = useEditorStore((s) => s.editedFiles)
  const removeEditedFile = useEditorStore((s) => s.removeEditedFile)
  const clearEditedFiles = useEditorStore((s) => s.clearEditedFiles)
  const { addToast } = useUIStore()
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const handleDownload = (file: typeof editedFiles[0]) => {
    const a = document.createElement('a')
    a.href = file.blobUrl
    a.download = `${file.name}.${getExtension(file.format)}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const handleDownloadAll = () => {
    editedFiles.forEach((file) => {
      handleDownload(file)
    })
    addToast(`הורדו ${editedFiles.length} קבצים`, 'success')
  }

  const handleRemove = (id: string) => {
    removeEditedFile(id)
    addToast('הקובץ הוסר', 'info')
  }

  const handleClearAll = () => {
    if (confirmClear) {
      clearEditedFiles()
      setConfirmClear(false)
      addToast('כל הקבצים הוסרו', 'info')
    } else {
      setConfirmClear(true)
      setTimeout(() => setConfirmClear(false), 3000)
    }
  }

  const formatDate = (d: Date) => {
    const date = new Date(d)
    return `${date.getDate()}/${date.getMonth() + 1} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
  }

  const formatSize = (blob: Blob) => {
    const bytes = blob.size
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const fmtDuration = (s: number) => {
    if (!s || !isFinite(s)) return '--:--'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="h-full flex flex-col bg-bg-panel rounded-xl border border-white/[0.06] overflow-hidden" dir="rtl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Package size={16} className="text-accent-purple" />
          <span className="font-medium text-sm">ערוכים</span>
          {editedFiles.length > 0 && (
            <span className="text-[10px] bg-accent-purple/20 text-accent-purple px-1.5 py-0.5 rounded-full">{editedFiles.length}</span>
          )}
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 hover:bg-white/[0.06] rounded-lg transition-colors text-text-muted hover:text-text-primary">
            <X size={14} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {editedFiles.length === 0 && (
          <div className="py-12 text-center text-text-muted text-sm">
            <Package size={32} className="mx-auto mb-3 opacity-20" />
            <p>אין קבצים ערוכים עדיין</p>
            <p className="text-xs mt-1">ייצא פרויקט והקבצים יופיעו כאן</p>
          </div>
        )}

        {editedFiles.map((file) => (
          <div key={file.id} className="p-3 bg-white/[0.04] rounded-xl border border-white/[0.06] space-y-2">
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text-primary truncate">{file.name}</p>
                <div className="flex items-center gap-2 text-[10px] text-text-muted mt-0.5">
                  <span>{file.format.toUpperCase()}</span>
                  <span>·</span>
                  <span>{fmtDuration(file.duration)}</span>
                  <span>·</span>
                  <span>{formatSize(file.blob)}</span>
                </div>
                <div className="text-[10px] text-text-muted mt-0.5">{formatDate(file.createdAt)}</div>
              </div>
            </div>

            {file.appliedEdits.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {file.appliedEdits.map((edit, i) => (
                  <span key={i} className="text-[9px] bg-accent-purple/10 text-accent-purple px-1.5 py-0.5 rounded">{edit}</span>
                ))}
              </div>
            )}

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPreviewUrl(file.blobUrl)}
                className="flex items-center gap-1 px-2 py-1 bg-white/[0.06] hover:bg-white/[0.1] rounded-lg text-[10px] text-text-secondary transition-colors"
              >
                <Play size={10} /> צפה
              </button>
              <button
                onClick={() => handleDownload(file)}
                className="flex items-center gap-1 px-2 py-1 bg-accent-purple/10 hover:bg-accent-purple/20 text-accent-purple rounded-lg text-[10px] transition-colors"
              >
                <Download size={10} /> הורד
              </button>
              <button
                onClick={() => handleRemove(file.id)}
                className="flex items-center gap-1 px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-[10px] transition-colors"
              >
                <Trash2 size={10} /> מחק
              </button>
            </div>
          </div>
        ))}
      </div>

      {editedFiles.length > 0 && (
        <div className="px-3 py-2 border-t border-white/[0.06] space-y-1.5">
          <button onClick={handleDownloadAll}
            className="w-full py-2 bg-accent-purple hover:bg-accent-purple/90 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5">
            <Download size={12} /> הורד הכל ({editedFiles.length})
          </button>
          <button onClick={handleClearAll}
            className={`w-full py-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
              confirmClear ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-white/[0.04] text-text-muted hover:bg-white/[0.08]'
            }`}>
            <Trash2 size={12} /> {confirmClear ? 'לחץ שוב לאישור' : 'נקה הכל'}
          </button>
        </div>
      )}

      {/* Preview modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setPreviewUrl(null)}>
          <div className="relative max-w-3xl w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setPreviewUrl(null)} className="absolute -top-8 left-0 text-white/70 hover:text-white text-sm">
              ✕ סגור
            </button>
            <video src={previewUrl} controls autoPlay className="w-full rounded-xl" />
          </div>
        </div>
      )}
    </div>
  )
}

function getExtension(format: string): string {
  if (format.startsWith('mp4') || format === 'mp4-916' || format === 'mp4-11') return 'mp4'
  if (format === 'webm') return 'webm'
  if (format.startsWith('mp3')) return 'mp3'
  if (format === 'wav') return 'wav'
  if (format === 'srt') return 'srt'
  if (format === 'vtt') return 'vtt'
  if (format === 'txt') return 'txt'
  return format
}
