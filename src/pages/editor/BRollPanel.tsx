import { useState, useRef } from 'react'
import { Image, Trash2, Loader2, Upload, Sparkles, Copy, RefreshCw, ChevronDown, ChevronUp, Layers, Move, Eye, Palette, Play, Lock, Unlock, X } from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'
import type { BRollItem } from '../../stores/editorStore'
import { useUIStore } from '../../stores/uiStore'
import { useUsageStore } from '../../stores/usageStore'
import { api } from '../../services/api'

const displayModes: Array<{ id: BRollItem['displayMode']; label: string }> = [
  { id: 'fullscreen', label: 'מסך מלא' },
  { id: 'pip', label: 'תמונה בתמונה' },
  { id: 'halfLeft', label: 'חצי מסך שמאל' },
  { id: 'halfRight', label: 'חצי מסך ימין' },
]

const entranceOptions: Array<{ id: BRollItem['entranceAnimation']; label: string }> = [
  { id: 'none', label: 'ללא' },
  { id: 'fadeIn', label: 'עמעום (Fade In)' },
  { id: 'slideRight', label: 'הזזה מימין' },
  { id: 'slideLeft', label: 'הזזה משמאל' },
  { id: 'slideUp', label: 'הזזה מלמטה' },
  { id: 'zoomIn', label: 'זום אין' },
]

const exitOptions: Array<{ id: BRollItem['exitAnimation']; label: string }> = [
  { id: 'none', label: 'ללא' },
  { id: 'fadeOut', label: 'עמעום (Fade Out)' },
  { id: 'slideRight', label: 'הזזה לימין' },
  { id: 'slideLeft', label: 'הזזה לשמאל' },
  { id: 'slideUp', label: 'הזזה למעלה' },
  { id: 'zoomOut', label: 'זום אאוט' },
]

const fitOptions: Array<{ id: BRollItem['objectFit']; label: string }> = [
  { id: 'cover', label: 'מלא' },
  { id: 'contain', label: 'התאם' },
  { id: 'fill', label: 'מתח' },
]

export default function BRollPanel({ onClose }: { onClose: () => void }) {
  const { bRollItems, addBRollItem, removeBRollItem, updateBRollItem, duplicateBRollItem, moveBRollLayer, currentTime, duration, selectedBRollId, setSelectedBRollId } = useEditorStore()
  const { addToast } = useUIStore()
  const addDalleUsage = useUsageStore((s) => s.addDalleUsage)
  const [prompt, setPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const replaceFileRef = useRef<HTMLInputElement>(null)

  const selectedItem = bRollItems.find(b => b.id === selectedBRollId)

  const handleGenerateImage = async () => {
    if (!prompt.trim()) return
    setIsGenerating(true)
    try {
      const result = await api.generateImage(prompt.trim())
      addDalleUsage()
      addBRollItem({
        id: `broll-${Date.now()}`,
        imageUrl: result.url,
        startTime: currentTime,
        duration: 5,
        source: 'ai',
        prompt: prompt.trim(),
      })
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
    addBRollItem({
      id: `broll-${Date.now()}`,
      imageUrl: url,
      startTime: currentTime,
      duration: 5,
      source: 'upload',
    })
    addToast('תמונה הועלתה והוספה!', 'success')
    e.target.value = ''
  }

  const handleReplaceImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedBRollId) return
    const url = URL.createObjectURL(file)
    updateBRollItem(selectedBRollId, { imageUrl: url })
    addToast('התמונה הוחלפה!', 'success')
    e.target.value = ''
  }

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`

  // If an item is selected, show properties panel
  if (selectedItem) {
    return (
      <div className="flex flex-col h-full glass rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center justify-between p-3 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={() => setSelectedBRollId(null)} className="p-1 hover:bg-white/[0.06] rounded transition-colors text-text-muted hover:text-text-primary">
              <ChevronDown size={14} />
            </button>
            <span className="font-bold text-sm text-text-primary">מאפייני B-Roll</span>
          </div>
          <button onClick={onClose} className="text-xs text-text-muted hover:text-text-primary transition-colors">סגור</button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {/* Thumbnail */}
          <img src={selectedItem.imageUrl} alt="B-Roll" className="w-full h-20 object-cover rounded-lg" />

          {/* Position Mode */}
          <div className="space-y-1.5">
            <label className="text-xs text-text-muted flex items-center gap-1"><Move size={11} /> מיקום</label>
            <select
              value={selectedItem.displayMode}
              onChange={(e) => updateBRollItem(selectedItem.id, { displayMode: e.target.value as BRollItem['displayMode'] })}
              className="w-full px-2 py-1.5 bg-white/[0.04] rounded-lg border border-white/[0.06] text-xs text-text-primary focus:outline-none cursor-pointer"
            >
              {displayModes.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>

          {/* X/Y/W/H inputs for PIP mode */}
          {selectedItem.displayMode === 'pip' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-text-muted">X (%)</label>
                <input type="number" value={selectedItem.x} onChange={(e) => updateBRollItem(selectedItem.id, { x: Number(e.target.value) })} className="w-full px-2 py-1 bg-white/[0.04] rounded text-xs text-text-primary border border-white/[0.06]" min={0} max={100} />
              </div>
              <div>
                <label className="text-[10px] text-text-muted">Y (%)</label>
                <input type="number" value={selectedItem.y} onChange={(e) => updateBRollItem(selectedItem.id, { y: Number(e.target.value) })} className="w-full px-2 py-1 bg-white/[0.04] rounded text-xs text-text-primary border border-white/[0.06]" min={0} max={100} />
              </div>
              <div>
                <label className="text-[10px] text-text-muted">רוחב (%)</label>
                <input type="number" value={selectedItem.width} onChange={(e) => updateBRollItem(selectedItem.id, { width: Number(e.target.value) })} className="w-full px-2 py-1 bg-white/[0.04] rounded text-xs text-text-primary border border-white/[0.06]" min={5} max={100} />
              </div>
              <div className="flex items-end gap-1">
                <div className="flex-1">
                  <label className="text-[10px] text-text-muted">גובה (%)</label>
                  <input type="number" value={selectedItem.height} onChange={(e) => updateBRollItem(selectedItem.id, { height: Number(e.target.value) })} className="w-full px-2 py-1 bg-white/[0.04] rounded text-xs text-text-primary border border-white/[0.06]" min={5} max={100} />
                </div>
                <button onClick={() => updateBRollItem(selectedItem.id, { lockAspectRatio: !selectedItem.lockAspectRatio })} className={`p-1 rounded transition-colors ${selectedItem.lockAspectRatio ? 'text-accent-purple bg-accent-purple/10' : 'text-text-muted hover:bg-white/[0.06]'}`} title="נעילת יחס גובה-רוחב">
                  {selectedItem.lockAspectRatio ? <Lock size={12} /> : <Unlock size={12} />}
                </button>
              </div>
            </div>
          )}

          {/* Timing */}
          <div className="space-y-1.5">
            <label className="text-xs text-text-muted flex items-center gap-1"><Play size={11} /> תזמון</label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-text-muted">התחלה (שניות)</label>
                <div className="flex items-center gap-1">
                  <button onClick={() => updateBRollItem(selectedItem.id, { startTime: Math.max(0, selectedItem.startTime - 0.5) })} className="p-0.5 bg-white/[0.04] rounded text-text-muted hover:text-text-primary text-xs">-</button>
                  <input type="number" value={Number(selectedItem.startTime.toFixed(1))} onChange={(e) => updateBRollItem(selectedItem.id, { startTime: Math.max(0, Number(e.target.value)) })} className="flex-1 px-2 py-1 bg-white/[0.04] rounded text-xs text-text-primary border border-white/[0.06]" step={0.5} min={0} max={duration} />
                  <button onClick={() => updateBRollItem(selectedItem.id, { startTime: Math.min(duration, selectedItem.startTime + 0.5) })} className="p-0.5 bg-white/[0.04] rounded text-text-muted hover:text-text-primary text-xs">+</button>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-text-muted">סיום (שניות)</label>
                <input type="number" value={Number((selectedItem.startTime + selectedItem.duration).toFixed(1))} onChange={(e) => updateBRollItem(selectedItem.id, { duration: Math.max(0.5, Number(e.target.value) - selectedItem.startTime) })} className="w-full px-2 py-1 bg-white/[0.04] rounded text-xs text-text-primary border border-white/[0.06]" step={0.5} />
              </div>
            </div>
            <p className="text-[10px] text-text-muted">משך: {selectedItem.duration.toFixed(1)} שניות ({fmtTime(selectedItem.startTime)} - {fmtTime(selectedItem.startTime + selectedItem.duration)})</p>
          </div>

          {/* Animations */}
          <div className="space-y-1.5">
            <label className="text-xs text-text-muted">אנימציות</label>
            <div className="space-y-2">
              <div>
                <label className="text-[10px] text-text-muted">כניסה</label>
                <select value={selectedItem.entranceAnimation} onChange={(e) => updateBRollItem(selectedItem.id, { entranceAnimation: e.target.value as BRollItem['entranceAnimation'] })} className="w-full px-2 py-1 bg-white/[0.04] rounded-lg border border-white/[0.06] text-xs text-text-primary focus:outline-none cursor-pointer">
                  {entranceOptions.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-text-muted">יציאה</label>
                <select value={selectedItem.exitAnimation} onChange={(e) => updateBRollItem(selectedItem.id, { exitAnimation: e.target.value as BRollItem['exitAnimation'] })} className="w-full px-2 py-1 bg-white/[0.04] rounded-lg border border-white/[0.06] text-xs text-text-primary focus:outline-none cursor-pointer">
                  {exitOptions.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-text-muted">משך אנימציה ({selectedItem.animationDuration.toFixed(1)}s)</label>
                <input type="range" min="0.2" max="2" step="0.1" value={selectedItem.animationDuration} onChange={(e) => updateBRollItem(selectedItem.id, { animationDuration: Number(e.target.value) })} className="w-full accent-accent-purple" />
              </div>
            </div>
          </div>

          {/* Visual Controls */}
          <div className="space-y-1.5">
            <label className="text-xs text-text-muted flex items-center gap-1"><Palette size={11} /> תצוגה</label>

            <div>
              <label className="text-[10px] text-text-muted">שקיפות ({selectedItem.opacity}%)</label>
              <input type="range" min="0" max="100" value={selectedItem.opacity} onChange={(e) => updateBRollItem(selectedItem.id, { opacity: Number(e.target.value) })} className="w-full accent-accent-purple" />
            </div>

            <div>
              <label className="text-[10px] text-text-muted">פינות מעוגלות ({selectedItem.borderRadius}px)</label>
              <input type="range" min="0" max="50" value={selectedItem.borderRadius} onChange={(e) => updateBRollItem(selectedItem.id, { borderRadius: Number(e.target.value) })} className="w-full accent-accent-purple" />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[10px] text-text-muted">צל</span>
              <div onClick={() => updateBRollItem(selectedItem.id, { shadowEnabled: !selectedItem.shadowEnabled })} className={`w-8 h-4 rounded-full cursor-pointer relative transition-colors ${selectedItem.shadowEnabled ? 'bg-accent-purple' : 'bg-white/[0.12]'}`}>
                <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all ${selectedItem.shadowEnabled ? 'left-0.5' : 'left-[18px]'}`} />
              </div>
            </div>
            {selectedItem.shadowEnabled && (
              <div>
                <label className="text-[10px] text-text-muted">עוצמת צל ({selectedItem.shadowIntensity}%)</label>
                <input type="range" min="0" max="100" value={selectedItem.shadowIntensity} onChange={(e) => updateBRollItem(selectedItem.id, { shadowIntensity: Number(e.target.value) })} className="w-full accent-accent-purple" />
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-[10px] text-text-muted">מסגרת</span>
              <div onClick={() => updateBRollItem(selectedItem.id, { borderEnabled: !selectedItem.borderEnabled })} className={`w-8 h-4 rounded-full cursor-pointer relative transition-colors ${selectedItem.borderEnabled ? 'bg-accent-purple' : 'bg-white/[0.12]'}`}>
                <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all ${selectedItem.borderEnabled ? 'left-0.5' : 'left-[18px]'}`} />
              </div>
            </div>
            {selectedItem.borderEnabled && (
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="text-[10px] text-text-muted">צבע</label>
                  <input type="color" value={selectedItem.borderColor} onChange={(e) => updateBRollItem(selectedItem.id, { borderColor: e.target.value })} className="w-full h-6 rounded cursor-pointer" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-text-muted">עובי ({selectedItem.borderWidth}px)</label>
                  <input type="range" min="1" max="10" value={selectedItem.borderWidth} onChange={(e) => updateBRollItem(selectedItem.id, { borderWidth: Number(e.target.value) })} className="w-full accent-accent-purple" />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-[10px] text-text-muted">טשטוש רקע</span>
              <div onClick={() => updateBRollItem(selectedItem.id, { blurBackground: !selectedItem.blurBackground })} className={`w-8 h-4 rounded-full cursor-pointer relative transition-colors ${selectedItem.blurBackground ? 'bg-accent-purple' : 'bg-white/[0.12]'}`}>
                <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all ${selectedItem.blurBackground ? 'left-0.5' : 'left-[18px]'}`} />
              </div>
            </div>
          </div>

          {/* Fit */}
          <div className="space-y-1.5">
            <label className="text-xs text-text-muted">התאמה</label>
            <div className="flex gap-1">
              {fitOptions.map(f => (
                <button key={f.id} onClick={() => updateBRollItem(selectedItem.id, { objectFit: f.id })} className={`flex-1 py-1.5 text-[10px] rounded-lg transition-all border ${selectedItem.objectFit === f.id ? 'bg-accent-purple/15 border-accent-purple/40 text-accent-purple' : 'bg-white/[0.04] border-white/[0.06] text-text-muted'}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Layer */}
          <div className="space-y-1.5">
            <label className="text-xs text-text-muted flex items-center gap-1"><Layers size={11} /> שכבה</label>
            <div className="flex gap-2">
              <button onClick={() => moveBRollLayer(selectedItem.id, 'up')} className="flex-1 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-lg text-[10px] text-text-secondary transition-all flex items-center justify-center gap-1"><ChevronUp size={10} /> קדימה</button>
              <button onClick={() => moveBRollLayer(selectedItem.id, 'down')} className="flex-1 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-lg text-[10px] text-text-secondary transition-all flex items-center justify-center gap-1"><ChevronDown size={10} /> אחורה</button>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2 border-t border-white/[0.06] pt-3">
            <button onClick={() => duplicateBRollItem(selectedItem.id)} className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-lg text-xs text-text-secondary transition-all"><Copy size={12} /> שכפל</button>
            <input ref={replaceFileRef} type="file" accept="image/*" className="hidden" onChange={handleReplaceImage} />
            <button onClick={() => replaceFileRef.current?.click()} className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-lg text-xs text-text-secondary transition-all"><RefreshCw size={12} /> החלף תמונה</button>
            <button onClick={() => { removeBRollItem(selectedItem.id); setSelectedBRollId(null) }} className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-xs text-red-400 transition-all"><Trash2 size={12} /> מחק</button>
          </div>
        </div>
      </div>
    )
  }

  // Default list view
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
          <div
            key={item.id}
            className={`rounded-xl border overflow-hidden cursor-pointer transition-all ${selectedBRollId === item.id ? 'border-accent-purple/50 bg-accent-purple/5' : 'border-white/[0.06] hover:border-white/[0.12]'}`}
            onClick={() => setSelectedBRollId(item.id)}
            onDoubleClick={() => setSelectedBRollId(item.id)}
          >
            <img src={item.imageUrl} alt={item.prompt || 'B-Roll'} className="w-full h-24 object-cover" />
            <div className="p-2 space-y-1">
              {item.prompt && <p className="text-[10px] text-text-muted truncate">{item.prompt}</p>}
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-text-muted">{fmtTime(item.startTime)} - {fmtTime(item.startTime + item.duration)}</p>
                <div className="flex items-center gap-1">
                  <button onClick={(e) => { e.stopPropagation(); duplicateBRollItem(item.id) }} className="p-1 text-text-muted hover:text-accent-purple hover:bg-accent-purple/10 rounded transition-colors" title="שכפל"><Copy size={10} /></button>
                  <button onClick={(e) => { e.stopPropagation(); removeBRollItem(item.id) }} className="p-1 text-text-muted hover:text-red-400 hover:bg-red-500/10 rounded transition-colors" title="מחק"><Trash2 size={10} /></button>
                </div>
              </div>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.04] text-text-muted">{displayModes.find(m => m.id === item.displayMode)?.label || 'מסך מלא'}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
