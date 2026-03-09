import { useState } from 'react'
import { Subtitles, Type, Palette, AlignCenter, AlignRight, AlignLeft, Bold, Italic, ChevronDown, Sparkles } from 'lucide-react'
import { useEditorStore, CaptionStyle } from '../../stores/editorStore'
import { useUIStore } from '../../stores/uiStore'

const presets: Array<{ id: CaptionStyle['preset']; label: string; desc: string }> = [
  { id: 'classic', label: 'קלאסי', desc: 'רקע שחור שקוף' },
  { id: 'modern', label: 'מודרני', desc: 'רקע צבעוני מעוגל' },
  { id: 'karaoke', label: 'קריוקי', desc: 'מילים מודגשות בזמן אמת' },
  { id: 'minimal', label: 'מינימלי', desc: 'טקסט לבן בלבד' },
]

const animations: Array<{ id: CaptionStyle['animation']; label: string }> = [
  { id: 'none', label: 'ללא' },
  { id: 'fade', label: 'דהייה' },
  { id: 'slideUp', label: 'החלקה למעלה' },
  { id: 'typewriter', label: 'מכונת כתיבה' },
  { id: 'wordByWord', label: 'מילה-מילה' },
  { id: 'bounce', label: 'קפיצה' },
  { id: 'zoom', label: 'זום' },
]

const positions: Array<{ id: CaptionStyle['position']; label: string }> = [
  { id: 'top', label: 'למעלה' },
  { id: 'center', label: 'מרכז' },
  { id: 'bottom', label: 'למטה' },
]

export default function CaptionsPanel({ onClose }: { onClose: () => void }) {
  const { transcript, captions, captionStyle, setCaptionStyle, generateCaptionsFromTranscript, setShowCaptions, showCaptions } = useEditorStore()
  const { addToast } = useUIStore()
  const [section, setSection] = useState<'style' | 'animation' | 'position'>('style')

  const handleGenerate = () => {
    if (transcript.length === 0) {
      addToast('אין תמלול זמין ליצירת כתוביות', 'warning')
      return
    }
    generateCaptionsFromTranscript()
    addToast(`נוצרו ${captions.length || 'כתוביות'} כתוביות!`, 'success')
  }

  const handlePresetChange = (preset: CaptionStyle['preset']) => {
    switch (preset) {
      case 'classic':
        setCaptionStyle({ preset, bgColor: '#000000', bgOpacity: 0.7, textColor: '#FFFFFF', outline: false, bold: false })
        break
      case 'modern':
        setCaptionStyle({ preset, bgColor: '#7C5CFF', bgOpacity: 0.85, textColor: '#FFFFFF', outline: false, bold: true })
        break
      case 'karaoke':
        setCaptionStyle({ preset, bgColor: '#000000', bgOpacity: 0, textColor: '#FFFFFF', outline: true, outlineColor: '#000000', bold: true })
        break
      case 'minimal':
        setCaptionStyle({ preset, bgColor: '#000000', bgOpacity: 0, textColor: '#FFFFFF', outline: false, bold: false })
        break
    }
  }

  return (
    <div className="flex flex-col h-full glass rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center justify-between p-3 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2">
          <Subtitles size={16} className="text-accent-purple" />
          <span className="font-bold text-sm text-text-primary">כתוביות</span>
        </div>
        <button onClick={onClose} className="text-xs text-text-muted hover:text-text-primary transition-colors">סגור</button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Toggle captions */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-primary">הצג כתוביות</span>
          <div
            onClick={() => setShowCaptions(!showCaptions)}
            className={`w-10 h-5 rounded-full cursor-pointer relative transition-colors ${showCaptions ? 'bg-accent-purple' : 'bg-white/[0.12]'}`}
          >
            <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all shadow-sm ${showCaptions ? 'left-0.5' : 'left-[22px]'}`} />
          </div>
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          className="w-full py-2 bg-accent-purple/15 hover:bg-accent-purple/25 border border-accent-purple/20 rounded-xl text-sm text-accent-purple font-medium transition-all flex items-center justify-center gap-2"
        >
          <Sparkles size={14} />
          {captions.length > 0 ? 'יצר כתוביות מחדש' : 'יצר כתוביות מתמלול'}
        </button>

        {captions.length > 0 && (
          <p className="text-xs text-text-muted text-center">{captions.length} כתוביות נוצרו</p>
        )}

        {/* Section tabs */}
        <div className="flex bg-white/[0.04] rounded-lg p-0.5">
          <button onClick={() => setSection('style')} className={`flex-1 py-1.5 text-xs rounded-md transition-all font-medium ${section === 'style' ? 'bg-accent-purple text-white shadow-sm' : 'text-text-muted hover:text-text-secondary'}`}>סגנון</button>
          <button onClick={() => setSection('animation')} className={`flex-1 py-1.5 text-xs rounded-md transition-all font-medium ${section === 'animation' ? 'bg-accent-purple text-white shadow-sm' : 'text-text-muted hover:text-text-secondary'}`}>אנימציה</button>
          <button onClick={() => setSection('position')} className={`flex-1 py-1.5 text-xs rounded-md transition-all font-medium ${section === 'position' ? 'bg-accent-purple text-white shadow-sm' : 'text-text-muted hover:text-text-secondary'}`}>מיקום</button>
        </div>

        {section === 'style' && (
          <div className="space-y-3">
            {/* Presets */}
            <div className="grid grid-cols-2 gap-2">
              {presets.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handlePresetChange(p.id)}
                  className={`p-2.5 rounded-xl text-center transition-all border ${captionStyle.preset === p.id ? 'bg-accent-purple/15 border-accent-purple/40 text-accent-purple' : 'bg-white/[0.04] border-white/[0.06] text-text-secondary hover:border-white/[0.12]'}`}
                >
                  <span className="text-xs font-medium block">{p.label}</span>
                  <span className="text-[10px] text-text-muted block mt-0.5">{p.desc}</span>
                </button>
              ))}
            </div>

            {/* Font size */}
            <div>
              <label className="text-xs text-text-muted block mb-1">גודל גופן ({captionStyle.fontSize}px)</label>
              <input type="range" min="14" max="48" value={captionStyle.fontSize} onChange={(e) => setCaptionStyle({ fontSize: Number(e.target.value) })} className="w-full accent-accent-purple" />
            </div>

            {/* Colors */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-text-muted block mb-1">צבע טקסט</label>
                <input type="color" value={captionStyle.textColor} onChange={(e) => setCaptionStyle({ textColor: e.target.value })} className="w-full h-7 rounded cursor-pointer" />
              </div>
              <div className="flex-1">
                <label className="text-xs text-text-muted block mb-1">צבע רקע</label>
                <input type="color" value={captionStyle.bgColor} onChange={(e) => setCaptionStyle({ bgColor: e.target.value })} className="w-full h-7 rounded cursor-pointer" />
              </div>
            </div>

            {/* BG Opacity */}
            <div>
              <label className="text-xs text-text-muted block mb-1">שקיפות רקע ({Math.round(captionStyle.bgOpacity * 100)}%)</label>
              <input type="range" min="0" max="100" value={captionStyle.bgOpacity * 100} onChange={(e) => setCaptionStyle({ bgOpacity: Number(e.target.value) / 100 })} className="w-full accent-accent-purple" />
            </div>

            {/* Bold / Italic */}
            <div className="flex gap-2">
              <button
                onClick={() => setCaptionStyle({ bold: !captionStyle.bold })}
                className={`flex-1 p-2 rounded-lg text-sm transition-all border ${captionStyle.bold ? 'bg-accent-purple/15 border-accent-purple/40 text-accent-purple' : 'bg-white/[0.04] border-white/[0.06] text-text-muted'}`}
              >
                <Bold size={14} className="mx-auto" />
              </button>
              <button
                onClick={() => setCaptionStyle({ italic: !captionStyle.italic })}
                className={`flex-1 p-2 rounded-lg text-sm transition-all border ${captionStyle.italic ? 'bg-accent-purple/15 border-accent-purple/40 text-accent-purple' : 'bg-white/[0.04] border-white/[0.06] text-text-muted'}`}
              >
                <Italic size={14} className="mx-auto" />
              </button>
              <button
                onClick={() => setCaptionStyle({ outline: !captionStyle.outline })}
                className={`flex-1 p-2 rounded-lg text-xs transition-all border ${captionStyle.outline ? 'bg-accent-purple/15 border-accent-purple/40 text-accent-purple' : 'bg-white/[0.04] border-white/[0.06] text-text-muted'}`}
              >
                קו מתאר
              </button>
            </div>
          </div>
        )}

        {section === 'animation' && (
          <div className="space-y-2">
            {animations.map((a) => (
              <button
                key={a.id}
                onClick={() => setCaptionStyle({ animation: a.id })}
                className={`w-full p-2.5 rounded-xl text-right text-sm transition-all border ${captionStyle.animation === a.id ? 'bg-accent-purple/15 border-accent-purple/40 text-accent-purple' : 'bg-white/[0.04] border-white/[0.06] text-text-secondary hover:border-white/[0.12]'}`}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}

        {section === 'position' && (
          <div className="space-y-3">
            {/* Position */}
            <div className="space-y-2">
              <label className="text-xs text-text-muted">מיקום אנכי</label>
              <div className="flex gap-2">
                {positions.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setCaptionStyle({ position: p.id })}
                    className={`flex-1 p-2 rounded-lg text-xs transition-all border ${captionStyle.position === p.id ? 'bg-accent-purple/15 border-accent-purple/40 text-accent-purple' : 'bg-white/[0.04] border-white/[0.06] text-text-muted'}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Alignment */}
            <div className="space-y-2">
              <label className="text-xs text-text-muted">יישור טקסט</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setCaptionStyle({ alignment: 'right' })}
                  className={`flex-1 p-2 rounded-lg transition-all border ${captionStyle.alignment === 'right' ? 'bg-accent-purple/15 border-accent-purple/40 text-accent-purple' : 'bg-white/[0.04] border-white/[0.06] text-text-muted'}`}
                >
                  <AlignRight size={14} className="mx-auto" />
                </button>
                <button
                  onClick={() => setCaptionStyle({ alignment: 'center' })}
                  className={`flex-1 p-2 rounded-lg transition-all border ${captionStyle.alignment === 'center' ? 'bg-accent-purple/15 border-accent-purple/40 text-accent-purple' : 'bg-white/[0.04] border-white/[0.06] text-text-muted'}`}
                >
                  <AlignCenter size={14} className="mx-auto" />
                </button>
                <button
                  onClick={() => setCaptionStyle({ alignment: 'left' })}
                  className={`flex-1 p-2 rounded-lg transition-all border ${captionStyle.alignment === 'left' ? 'bg-accent-purple/15 border-accent-purple/40 text-accent-purple' : 'bg-white/[0.04] border-white/[0.06] text-text-muted'}`}
                >
                  <AlignLeft size={14} className="mx-auto" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
