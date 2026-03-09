import { useState, useRef } from 'react'
import { Image, Plus, Trash2, Loader2, Upload, Sparkles } from 'lucide-react'
import { useEditorStore, BRollItem } from '../../stores/editorStore'
import { useUIStore } from '../../stores/uiStore'
import { useUsageStore } from '../../stores/usageStore'
import { api } from '../../services/api'

export default function BRollPanel({ onClose }: { onClose: () => void }) {
  const { bRollItems, addBRollItem, removeBRollItem, updateBRollItem, currentTime, duration } = useEditorStore()
  const { addToast } = useUIStore()
  const addDalleUsage = useUsageStore((s) => s.addDalleUsage)
  const [prompt, setPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleGenerateImage = async () => {
    if (!prompt.trim()) return
    setIsGenerating(true)
    try {
      const result = await api.generateImage(prompt.trim())
      addDalleUsage()
      const item: BRollItem = {
        id: `broll-${Date.now()}`,
        imageUrl: result.url,
        startTime: currentTime,
        duration: 5,
        source: 'ai',
        prompt: prompt.trim(),
      }
      addBRollItem(item)
      setPrompt('')
      addToast('תמונה נוצרה והוספה!', 'success')
    } catch {
      addToast('שגיאה ביצירת תמונה. נסה שוב.', 'error')
    }
    setIsGenerating(false)
  }

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    const item: BRollItem = {
      id: `broll-${Date.now()}`,
      imageUrl: url,
      startTime: currentTime,
      duration: 5,
      source: 'upload',
    }
    addBRollItem(item)
    addToast('תמונה הועלתה והוספה!', 'success')
    e.target.value = ''
  }

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`

  return (
    <div className="flex flex-col h-full glass rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center justify-between p-3 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2">
          <Image size={16} className="text-accent-blue" />
          <span className="font-bold text-sm text-text-primary">B-Roll</span>
        </div>
        <button onClick={onClose} className="text-xs text-text-muted hover:text-text-primary transition-colors">סגור</button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* AI Generate */}
        <div className="space-y-2">
          <label className="text-xs text-text-muted">יצירת תמונה עם AI (DALL-E)</label>
          <div className="flex gap-2">
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerateImage()}
              placeholder="תאר את התמונה..."
              className="flex-1 px-3 py-2 bg-white/[0.04] rounded-lg border border-white/[0.06] text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-purple/30"
            />
            <button
              onClick={handleGenerateImage}
              disabled={!prompt.trim() || isGenerating}
              className="p-2 bg-accent-purple hover:bg-accent-purple/90 disabled:opacity-50 rounded-lg transition-all"
            >
              {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            </button>
          </div>
        </div>

        {/* Upload */}
        <div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full py-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-xl text-sm text-text-secondary transition-all flex items-center justify-center gap-2"
          >
            <Upload size={14} /> העלה תמונה
          </button>
        </div>

        {/* B-Roll items list */}
        {bRollItems.length === 0 && (
          <div className="py-6 text-center text-text-muted text-xs">
            <Image size={24} className="mx-auto mb-2 opacity-30" />
            <p>אין תמונות B-Roll עדיין</p>
            <p className="mt-1">צור תמונה עם AI או העלה מהמחשב</p>
          </div>
        )}

        {bRollItems.map((item) => (
          <div key={item.id} className="rounded-xl border border-white/[0.06] overflow-hidden">
            <img src={item.imageUrl} alt={item.prompt || 'B-Roll'} className="w-full h-24 object-cover" />
            <div className="p-2 space-y-2">
              {item.prompt && <p className="text-[10px] text-text-muted truncate">{item.prompt}</p>}
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <label className="text-[10px] text-text-muted">התחלה</label>
                  <input
                    type="number"
                    value={Math.round(item.startTime)}
                    onChange={(e) => updateBRollItem(item.id, { startTime: Number(e.target.value) })}
                    className="w-full px-2 py-1 bg-white/[0.04] rounded text-xs text-text-primary border border-white/[0.06]"
                    step={1}
                    min={0}
                    max={duration}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-text-muted">משך (שניות)</label>
                  <input
                    type="number"
                    value={item.duration}
                    onChange={(e) => updateBRollItem(item.id, { duration: Number(e.target.value) })}
                    className="w-full px-2 py-1 bg-white/[0.04] rounded text-xs text-text-primary border border-white/[0.06]"
                    step={1}
                    min={1}
                    max={30}
                  />
                </div>
                <button
                  onClick={() => removeBRollItem(item.id)}
                  className="p-1.5 text-red-400 hover:bg-red-500/10 rounded transition-colors mt-3"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <p className="text-[10px] text-text-muted">{fmtTime(item.startTime)} - {fmtTime(item.startTime + item.duration)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
