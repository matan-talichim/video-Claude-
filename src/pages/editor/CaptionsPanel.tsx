import { useState } from 'react'
import { Subtitles, AlignCenter, AlignRight, AlignLeft, Bold, Italic, Sparkles, Eye, EyeOff, Trash2, Edit3, Plus, ChevronDown, Loader2, X } from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'
import type { CaptionStyle } from '../../stores/editorStore'
import { languageFlags, languageNames } from '../../stores/editorStore'
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

const availableLanguages = Object.entries(languageNames).map(([code, name]) => ({
  code,
  name,
  flag: languageFlags[code] || '',
}))

export default function CaptionsPanel({ onClose }: { onClose: () => void }) {
  const { transcript, captions, captionStyle, setCaptionStyle, generateCaptionsFromTranscript } = useEditorStore()
  const captionTracks = useEditorStore((s) => s.captionTracks)
  const setActiveCaptionTrack = useEditorStore((s) => s.setActiveCaptionTrack)
  const addCaptionTrack = useEditorStore((s) => s.addCaptionTrack)
  const removeCaptionTrack = useEditorStore((s) => s.removeCaptionTrack)
  const updateCaptionInTrack = useEditorStore((s) => s.updateCaptionInTrack)
  const hideAllCaptionTracks = useEditorStore((s) => s.hideAllCaptionTracks)
  const { addToast } = useUIStore()
  const [section, setSection] = useState<'languages' | 'style' | 'animation' | 'position'>('languages')
  const [showAddLanguage, setShowAddLanguage] = useState(false)
  const [translatingLang, setTranslatingLang] = useState<string | null>(null)
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null)
  const [editingCaptionIdx, setEditingCaptionIdx] = useState<number | null>(null)
  const [editText, setEditText] = useState('')

  const handleGenerate = () => {
    if (transcript.length === 0) {
      addToast('אין תמלול זמין ליצירת כתוביות', 'warning')
      return
    }
    generateCaptionsFromTranscript()
    addToast('כתוביות נוצרו בהצלחה!', 'success')
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

  const handleAddLanguage = async (langCode: string) => {
    const existing = captionTracks.find((t) => t.language === langCode)
    if (existing) {
      addToast(`שפה ${languageNames[langCode]} כבר קיימת`, 'warning')
      return
    }
    const sourceTrack = captionTracks.find((t) => t.isSource)
    if (!sourceTrack || sourceTrack.captions.length === 0) {
      addToast('יש ליצור כתוביות בשפת המקור תחילה', 'warning')
      return
    }

    setTranslatingLang(langCode)
    setShowAddLanguage(false)

    // Simulate translation via POST /api/translate/batch
    try {
      const translatedCaptions = sourceTrack.captions.map((cap, i) => ({
        id: `cap-${langCode}-${Date.now()}-${i}`,
        text: cap.text, // In production, this would be the translated text from DeepL
        startTime: cap.startTime,
        endTime: cap.endTime,
      }))

      // Simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 1500))

      addCaptionTrack(
        langCode,
        languageNames[langCode] || langCode,
        languageFlags[langCode] || '',
        translatedCaptions
      )
      addToast(`נוספה שפה: ${languageNames[langCode]}`, 'success')
    } catch {
      addToast('שגיאה בתרגום הכתוביות', 'error')
    }
    setTranslatingLang(null)
  }

  const handleDeleteTrack = (trackId: string, trackName: string) => {
    const track = captionTracks.find((t) => t.id === trackId)
    if (track?.isSource) {
      addToast('לא ניתן למחוק את שפת המקור', 'warning')
      return
    }
    removeCaptionTrack(trackId)
    addToast(`שפה ${trackName} הוסרה`, 'info')
  }

  const handleStartEdit = (trackId: string) => {
    setEditingTrackId(trackId)
    setEditingCaptionIdx(null)
  }

  const handleEditCaption = (idx: number, text: string) => {
    setEditingCaptionIdx(idx)
    setEditText(text)
  }

  const handleSaveCaption = () => {
    if (editingTrackId && editingCaptionIdx !== null) {
      updateCaptionInTrack(editingTrackId, editingCaptionIdx, editText)
      setEditingCaptionIdx(null)
      setEditText('')
    }
  }

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }

  const editingTrack = editingTrackId ? captionTracks.find((t) => t.id === editingTrackId) : null

  const usedLanguages = new Set(captionTracks.map((t) => t.language))

  return (
    <div className="flex flex-col h-full glass rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center justify-between p-3 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2">
          <Subtitles size={16} className="text-accent-purple" />
          <span className="font-bold text-sm text-text-primary">כתוביות</span>
          {captionTracks.length > 0 && (
            <span className="text-[10px] bg-accent-purple/20 text-accent-purple px-1.5 py-0.5 rounded-full">
              {captionTracks.length} שפות
            </span>
          )}
        </div>
        <button onClick={onClose} className="text-xs text-text-muted hover:text-text-primary transition-colors">סגור</button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Generate button */}
        {captions.length === 0 && (
          <button
            onClick={handleGenerate}
            className="w-full py-2 bg-accent-purple/15 hover:bg-accent-purple/25 border border-accent-purple/20 rounded-xl text-sm text-accent-purple font-medium transition-all flex items-center justify-center gap-2"
          >
            <Sparkles size={14} />
            יצר כתוביות מתמלול
          </button>
        )}

        {/* Section tabs */}
        {captions.length > 0 && (
          <>
            <div className="flex bg-white/[0.04] rounded-lg p-0.5">
              <button onClick={() => { setSection('languages'); setEditingTrackId(null) }} className={`flex-1 py-1.5 text-xs rounded-md transition-all font-medium ${section === 'languages' ? 'bg-accent-purple text-white shadow-sm' : 'text-text-muted hover:text-text-secondary'}`}>שפות</button>
              <button onClick={() => { setSection('style'); setEditingTrackId(null) }} className={`flex-1 py-1.5 text-xs rounded-md transition-all font-medium ${section === 'style' ? 'bg-accent-purple text-white shadow-sm' : 'text-text-muted hover:text-text-secondary'}`}>סגנון</button>
              <button onClick={() => { setSection('animation'); setEditingTrackId(null) }} className={`flex-1 py-1.5 text-xs rounded-md transition-all font-medium ${section === 'animation' ? 'bg-accent-purple text-white shadow-sm' : 'text-text-muted hover:text-text-secondary'}`}>אנימציה</button>
              <button onClick={() => { setSection('position'); setEditingTrackId(null) }} className={`flex-1 py-1.5 text-xs rounded-md transition-all font-medium ${section === 'position' ? 'bg-accent-purple text-white shadow-sm' : 'text-text-muted hover:text-text-secondary'}`}>מיקום</button>
            </div>

            {section === 'languages' && !editingTrackId && (
              <div className="space-y-3">
                <div className="text-xs text-text-muted">שפות כתוביות:</div>

                {/* Translation in progress */}
                {translatingLang && (
                  <div className="p-3 bg-accent-purple/5 border border-accent-purple/20 rounded-xl flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin text-accent-purple" />
                    <span className="text-sm text-accent-purple">מתרגם ל{languageNames[translatingLang]}...</span>
                  </div>
                )}

                {/* Language tracks list */}
                {captionTracks.map((track) => (
                  <div key={track.id} className={`p-3 rounded-xl border transition-all ${track.isVisible ? 'bg-accent-purple/10 border-accent-purple/30' : 'bg-white/[0.04] border-white/[0.06]'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{track.flag}</span>
                        <span className="text-sm font-medium text-text-primary">{track.languageName}</span>
                        <span className="text-[10px] text-text-muted">({track.captions.length} כתוביות)</span>
                        {track.isSource && (
                          <span className="text-[9px] bg-blue-500/20 text-blue-400 px-1 py-0.5 rounded">מקור</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {/* Show/hide on video */}
                      <button
                        onClick={() => {
                          if (track.isVisible) {
                            hideAllCaptionTracks()
                          } else {
                            setActiveCaptionTrack(track.id)
                          }
                        }}
                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] transition-colors ${
                          track.isVisible
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-white/[0.06] text-text-secondary hover:bg-white/[0.1]'
                        }`}
                      >
                        {track.isVisible ? <Eye size={10} /> : <EyeOff size={10} />}
                        {track.isVisible ? 'מוצג על הסרטון' : 'הצג על הסרטון'}
                      </button>
                      {/* Edit captions */}
                      <button
                        onClick={() => handleStartEdit(track.id)}
                        className="flex items-center gap-1 px-2 py-1 bg-white/[0.06] hover:bg-white/[0.1] rounded-lg text-[10px] text-text-secondary transition-colors"
                      >
                        <Edit3 size={10} /> ערוך כתוביות
                      </button>
                      {/* Delete (not source) */}
                      {!track.isSource && (
                        <button
                          onClick={() => handleDeleteTrack(track.id, track.languageName)}
                          className="flex items-center gap-1 px-2 py-1 bg-red-500/10 hover:bg-red-500/20 rounded-lg text-[10px] text-red-400 transition-colors"
                        >
                          <Trash2 size={10} /> מחק
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {/* Add language button */}
                <div className="relative">
                  <button
                    onClick={() => setShowAddLanguage(!showAddLanguage)}
                    disabled={!!translatingLang}
                    className="w-full py-2 bg-white/[0.04] hover:bg-white/[0.08] border border-dashed border-white/[0.12] rounded-xl text-sm text-text-secondary font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                  >
                    <Plus size={14} /> הוסף שפה חדשה
                    <ChevronDown size={12} className={`transition-transform ${showAddLanguage ? 'rotate-180' : ''}`} />
                  </button>

                  {showAddLanguage && (
                    <div className="mt-2 max-h-48 overflow-y-auto bg-[#1A1A2E] rounded-xl border border-white/[0.1] shadow-xl">
                      {availableLanguages
                        .filter((l) => !usedLanguages.has(l.code))
                        .map((lang) => (
                          <button
                            key={lang.code}
                            onClick={() => handleAddLanguage(lang.code)}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.06] transition-colors text-right"
                          >
                            <span>{lang.flag}</span>
                            <span className="text-sm text-text-primary">{lang.name}</span>
                            <span className="text-[10px] text-text-muted mr-auto">{lang.code}</span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>

                {/* Regenerate captions */}
                <button
                  onClick={handleGenerate}
                  className="w-full py-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-xl text-xs text-text-muted font-medium transition-all flex items-center justify-center gap-2"
                >
                  <Sparkles size={12} />
                  יצר כתוביות מחדש
                </button>
              </div>
            )}

            {/* Edit captions for specific track */}
            {section === 'languages' && editingTrack && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>{editingTrack.flag}</span>
                    <span className="text-sm font-medium text-text-primary">{editingTrack.languageName}</span>
                  </div>
                  <button
                    onClick={() => setEditingTrackId(null)}
                    className="p-1 hover:bg-white/[0.06] rounded-lg transition-colors text-text-muted hover:text-text-primary"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="space-y-1 max-h-[400px] overflow-y-auto">
                  {editingTrack.captions.map((cap, idx) => (
                    <div key={cap.id} className="flex items-start gap-2 p-2 bg-white/[0.03] rounded-lg">
                      <span className="text-[9px] text-text-muted font-mono whitespace-nowrap pt-1">
                        {formatTime(cap.startTime)} - {formatTime(cap.endTime)}
                      </span>
                      {editingCaptionIdx === idx ? (
                        <div className="flex-1 flex gap-1">
                          <input
                            type="text"
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveCaption(); if (e.key === 'Escape') setEditingCaptionIdx(null) }}
                            autoFocus
                            className="flex-1 bg-white/[0.08] rounded px-2 py-1 text-xs text-text-primary border border-accent-purple/30 outline-none"
                            dir="auto"
                          />
                          <button onClick={handleSaveCaption} className="text-[10px] text-accent-purple hover:text-accent-purple/80">שמור</button>
                        </div>
                      ) : (
                        <div className="flex-1 flex items-start justify-between gap-1">
                          <span className="text-xs text-text-secondary leading-relaxed" dir="auto">{cap.text}</span>
                          <button
                            onClick={() => handleEditCaption(idx, cap.text)}
                            className="p-0.5 hover:bg-white/[0.06] rounded transition-colors text-text-muted hover:text-text-primary shrink-0"
                          >
                            <Edit3 size={10} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {section === 'style' && (
              <div className="space-y-3">
                <div className="text-xs text-text-muted">סגנון כתוביות (כל השפות):</div>
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
          </>
        )}
      </div>
    </div>
  )
}
