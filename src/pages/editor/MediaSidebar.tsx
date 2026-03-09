import { useState, useRef } from 'react'
import { Film, Upload, Trash2, GripVertical, Loader2, Merge, AlertTriangle } from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'
import { useUIStore } from '../../stores/uiStore'
import { api } from '../../services/api'

interface MediaItem {
  id: string
  name: string
  file: File
  blobUrl: string
  type: 'video' | 'audio'
  size: number
  duration?: number
}

export default function MediaSidebar({ onClose }: { onClose: () => void }) {
  const { mediaFile, mediaBlobUrl, loadMedia, isDirty, projectName } = useEditorStore()
  const { addToast } = useUIStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [mediaItems, setMediaItems] = useState<MediaItem[]>(() => {
    if (mediaFile && mediaBlobUrl) {
      return [{
        id: 'current',
        name: mediaFile.name,
        file: mediaFile,
        blobUrl: mediaBlobUrl,
        type: mediaFile.type.startsWith('video/') ? 'video' : 'audio',
        size: mediaFile.size,
      }]
    }
    return []
  })
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [showSaveDialog, setShowSaveDialog] = useState<{ targetIdx: number } | null>(null)
  const [isMerging, setIsMerging] = useState(false)

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    const newItems: MediaItem[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      newItems.push({
        id: `media-${Date.now()}-${i}`,
        name: file.name,
        file,
        blobUrl: URL.createObjectURL(file),
        type: file.type.startsWith('video/') ? 'video' : 'audio',
        size: file.size,
      })
    }
    setMediaItems(prev => [...prev, ...newItems])
    addToast(`${newItems.length} קבצים הועלו!`, 'success')
    e.target.value = ''
  }

  const handleSwitchMedia = (idx: number) => {
    const item = mediaItems[idx]
    if (!item) return

    if (isDirty) {
      setShowSaveDialog({ targetIdx: idx })
      return
    }

    doSwitchMedia(item)
  }

  const doSwitchMedia = (item: MediaItem) => {
    loadMedia(item.file, item.blobUrl, item.type)
    addToast(`נטען: ${item.name}`, 'success')
    setShowSaveDialog(null)
  }

  const handleRemove = (idx: number) => {
    const item = mediaItems[idx]
    if (item.id === 'current') {
      addToast('לא ניתן למחוק את המדיה הפעילה', 'warning')
      return
    }
    URL.revokeObjectURL(item.blobUrl)
    setMediaItems(prev => prev.filter((_, i) => i !== idx))
  }

  const handleDragStart = (idx: number) => setDragIdx(idx)
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    if (dragIdx === null || dragIdx === idx) return
    const items = [...mediaItems]
    const [moved] = items.splice(dragIdx, 1)
    items.splice(idx, 0, moved)
    setMediaItems(items)
    setDragIdx(idx)
  }
  const handleDragEnd = () => setDragIdx(null)

  const handleMerge = async () => {
    if (mediaItems.length < 2) {
      addToast('נדרשים לפחות 2 קבצים למיזוג', 'warning')
      return
    }
    setIsMerging(true)
    try {
      const result = await api.mergeVideos(mediaItems.map(m => m.file))
      const response = await fetch(`http://localhost:3001${result.url}`)
      const blob = await response.blob()
      const file = new File([blob], 'merged.mp4', { type: 'video/mp4' })
      const blobUrl = URL.createObjectURL(blob)
      loadMedia(file, blobUrl, 'video')
      addToast('הסרטונים מוזגו בהצלחה!', 'success')
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
          <span className="font-bold text-sm text-text-primary">מדיה</span>
          <span className="text-[10px] text-text-muted">({mediaItems.length})</span>
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

        {mediaItems.map((item, idx) => (
          <div key={item.id}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDragEnd={handleDragEnd}
            className={`flex items-center gap-2 p-2 rounded-lg border transition-all cursor-pointer ${
              item.blobUrl === mediaBlobUrl
                ? 'bg-accent-purple/10 border-accent-purple/30'
                : 'bg-white/[0.03] border-white/[0.06] hover:border-white/[0.12]'
            } ${dragIdx === idx ? 'opacity-50' : ''}`}
            onClick={() => handleSwitchMedia(idx)}>
            <GripVertical size={12} className="text-text-muted cursor-grab shrink-0" />
            <div className="w-10 h-8 bg-white/[0.04] rounded flex items-center justify-center shrink-0">
              <Film size={14} className="text-text-muted" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-text-primary truncate">{item.name}</p>
              <p className="text-[9px] text-text-muted">{(item.size / 1024 / 1024).toFixed(1)}MB - {item.type === 'video' ? 'וידאו' : 'אודיו'}</p>
            </div>
            {item.blobUrl === mediaBlobUrl && (
              <span className="text-[8px] px-1 py-0.5 bg-accent-purple/20 text-accent-purple rounded">פעיל</span>
            )}
            <button onClick={(e) => { e.stopPropagation(); handleRemove(idx) }}
              className="p-1 text-text-muted hover:text-red-400 transition-colors shrink-0">
              <Trash2 size={11} />
            </button>
          </div>
        ))}

        {mediaItems.length >= 2 && (
          <button onClick={handleMerge} disabled={isMerging}
            className="w-full flex items-center justify-center gap-1.5 py-2 bg-accent-purple/10 hover:bg-accent-purple/20 border border-accent-purple/20 rounded-lg text-xs text-accent-purple transition-all disabled:opacity-50">
            {isMerging ? <Loader2 size={12} className="animate-spin" /> : <Merge size={12} />}
            {isMerging ? 'ממזג...' : 'מזג סרטונים'}
          </button>
        )}
      </div>

      {/* Save confirmation dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => setShowSaveDialog(null)}>
          <div className="glass rounded-2xl p-5 max-w-sm w-full mx-4 space-y-4 animate-scale-in" style={{ border: '1px solid rgba(255,255,255,0.1)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <AlertTriangle size={20} className="text-warning" />
              <h3 className="font-bold text-text-primary text-sm">שינויים שלא נשמרו</h3>
            </div>
            <p className="text-sm text-text-secondary">יש שינויים שלא נשמרו בפרויקט "{projectName}". מה לעשות?</p>
            <div className="flex gap-2">
              <button onClick={() => {
                useEditorStore.getState().markSaved()
                doSwitchMedia(mediaItems[showSaveDialog.targetIdx])
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
