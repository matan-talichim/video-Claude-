import { useState, useRef } from 'react'
import { useEditorStore } from '../../stores/editorStore'
import { useTimelineStore } from '../../stores/timelineStore'
import { useUIStore } from '../../stores/uiStore'
import type { ProjectMediaFile } from '../../stores/editorStore'

interface LeftPanelProps {
  activeTab: string
  setActiveTab: (tab: string) => void
}

const tabs = [
  { id: 'media', icon: '📁', label: 'מדיה' },
  { id: 'layers', icon: '📑', label: 'שכבות' },
  { id: 'audio', icon: '🎵', label: 'אודיו' },
  { id: 'text', icon: 'T', label: 'טקסט' },
  { id: 'images', icon: '🖼', label: 'תמונות' },
  { id: 'subtitles', icon: '💬', label: 'כתוביות' },
  { id: 'transcript', icon: '📝', label: 'תמלול' },
  { id: 'translate', icon: '🌐', label: 'תרגום' },
  { id: 'transitions', icon: '🌅', label: 'מעברים' },
  { id: 'ai', icon: '🤖', label: 'AI' },
  { id: 'record', icon: '🔴', label: 'הקלט' },
]

export default function LeftPanel({ activeTab, setActiveTab }: LeftPanelProps) {
  return (
    <div className="flex h-full">
      {/* Tab bar */}
      <div className="w-16 bg-[#0D0D15] border-l border-white/5 flex flex-col items-center py-2 gap-1 overflow-y-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(activeTab === tab.id ? '' : tab.id)}
            className={`w-12 h-12 flex flex-col items-center justify-center rounded-lg text-[10px] gap-0.5 transition shrink-0 ${
              activeTab === tab.id
                ? 'bg-purple-600/20 text-purple-400'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
            }`}
          >
            <span className="text-base">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Panel content */}
      {activeTab && (
        <div className="w-72 bg-[#111118] border-l border-white/5 overflow-y-auto">
          {activeTab === 'media' && <MediaLibraryPanel />}
          {activeTab === 'layers' && <LayersPanel />}
          {activeTab === 'audio' && <AudioAddPanel />}
          {activeTab === 'text' && <TextAddPanel />}
          {activeTab === 'images' && <ImagesPanel />}
          {activeTab === 'subtitles' && <SubtitlesPanel />}
          {activeTab === 'transcript' && <TranscriptPanelMini />}
          {activeTab === 'translate' && <TranslatePanel />}
          {activeTab === 'transitions' && <TransitionsPanel />}
          {activeTab === 'ai' && <AIPanel />}
          {activeTab === 'record' && <RecordPanel />}
        </div>
      )}
    </div>
  )
}

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60).toString().padStart(2, '0')
  const sec = Math.floor(s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

// ============ MEDIA LIBRARY ============
function MediaLibraryPanel() {
  const projectMedia = useEditorStore((s) => s.projectMedia)
  const addMediaToProject = useEditorStore((s) => s.addMediaToProject)
  const addToast = useUIStore((s) => s.addToast)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUpload = () => {
    fileInputRef.current?.click()
  }

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    for (const file of Array.from(files)) {
      const url = URL.createObjectURL(file)
      const type = file.type.startsWith('video') ? 'video' : file.type.startsWith('audio') ? 'audio' : 'image'
      const media: ProjectMediaFile = {
        id: `media-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: file.name,
        url,
        type: type as 'video' | 'audio' | 'image',
        size: file.size,
        file,
      }
      addMediaToProject(media)
    }
    addToast('קבצים נוספו לפרויקט', 'success')
    e.target.value = ''
  }

  return (
    <div className="p-3 space-y-4" dir="rtl">
      <h3 className="text-white font-medium text-sm">📁 ספריית מדיה</h3>

      <input ref={fileInputRef} type="file" multiple accept="video/*,audio/*,image/*" className="hidden" onChange={handleFiles} />

      <button
        onClick={handleUpload}
        className="w-full border-2 border-dashed border-white/10 rounded-lg p-4 text-center hover:border-purple-500/50 transition"
      >
        <span className="text-2xl block mb-1">⬆</span>
        <span className="text-sm text-gray-400">העלה קבצים</span>
        <span className="text-xs text-gray-600 block">וידאו, תמונות, אודיו</span>
      </button>

      <div>
        <h4 className="text-xs text-gray-500 mb-2">פרויקט נוכחי</h4>
        <div className="space-y-1">
          {projectMedia.length === 0 && (
            <p className="text-gray-600 text-xs text-center py-2">אין קבצים בפרויקט</p>
          )}
          {projectMedia.map((file) => (
            <div
              key={file.id}
              draggable
              className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 cursor-grab active:cursor-grabbing group"
            >
              <div className="w-12 h-8 bg-black rounded overflow-hidden flex-shrink-0 flex items-center justify-center">
                {file.type === 'video' && <span className="text-xs">🎬</span>}
                {file.type === 'image' && <span className="text-xs">🖼</span>}
                {file.type === 'audio' && <span className="text-xs text-green-400">🎵</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white text-xs truncate">{file.name}</div>
                <div className="text-gray-500 text-[10px]">
                  {file.duration ? formatTime(file.duration) : ''} {formatSize(file.size)}
                </div>
              </div>
              <button className="opacity-0 group-hover:opacity-100 text-purple-400 text-xs hover:text-purple-300">
                + הוסף
              </button>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-gray-600 text-center">גרור קבצים לטיימליין כדי להוסיף</p>
    </div>
  )
}

// ============ LAYERS PANEL ============
function LayersPanel() {
  const tracks = useTimelineStore((s) => s.tracks)
  const toggleTrackVisibility = useTimelineStore((s) => s.toggleTrackVisibility)
  const toggleTrackLock = useTimelineStore((s) => s.toggleTrackLock)
  const addTrack = useTimelineStore((s) => s.addTrack)
  const [showAddLayer, setShowAddLayer] = useState(false)

  const trackIcons: Record<string, string> = {
    video: '🎥', audio: '🎵', captions: '💬', broll: '🖼️', music: '🎵', text: '📝',
  }

  return (
    <div className="p-3 space-y-2" dir="rtl">
      <h3 className="text-white font-medium text-sm">📑 שכבות</h3>

      {tracks.map((track) => (
        <div
          key={track.id}
          className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/5"
        >
          <span className="text-gray-500 cursor-grab">⠿</span>
          <span className="text-sm">{trackIcons[track.type] || '📄'}</span>
          <span className="text-white text-xs flex-1 truncate">{track.label}</span>
          <button
            onClick={() => toggleTrackVisibility(track.id)}
            className={track.visible ? 'text-white' : 'text-gray-600'}
          >
            {track.visible ? '👁' : '👁‍🗨'}
          </button>
          <button
            onClick={() => toggleTrackLock(track.id)}
            className={track.locked ? 'text-yellow-400' : 'text-gray-600'}
          >
            {track.locked ? '🔒' : '🔓'}
          </button>
        </div>
      ))}

      {showAddLayer ? (
        <div className="space-y-1">
          {(['video', 'audio', 'text', 'broll', 'captions', 'music'] as const).map((type) => (
            <button
              key={type}
              onClick={() => { addTrack(type); setShowAddLayer(false); }}
              className="w-full text-right text-xs text-gray-300 hover:bg-white/5 p-2 rounded-lg"
            >
              {trackIcons[type]} {type}
            </button>
          ))}
        </div>
      ) : (
        <button
          onClick={() => setShowAddLayer(true)}
          className="w-full text-center text-purple-400 text-sm py-2 hover:bg-purple-500/10 rounded-lg"
        >
          + הוסף שכבה
        </button>
      )}
    </div>
  )
}

// ============ AUDIO ADD PANEL ============
function AudioAddPanel() {
  const addToast = useUIStore((s) => s.addToast)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const addMediaToProject = useEditorStore((s) => s.addMediaToProject)

  const handleUploadAudio = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    for (const file of Array.from(files)) {
      const url = URL.createObjectURL(file)
      addMediaToProject({
        id: `audio-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: file.name,
        url,
        type: 'audio',
        size: file.size,
        file,
      })
    }
    addToast('אודיו נוסף לפרויקט', 'success')
    e.target.value = ''
  }

  return (
    <div className="p-3 space-y-4" dir="rtl">
      <h3 className="text-white font-medium text-sm">🎵 אודיו</h3>

      <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleUploadAudio} />

      <button
        onClick={() => fileInputRef.current?.click()}
        className="w-full bg-purple-600 hover:bg-purple-500 text-white py-2 rounded-lg text-sm"
      >
        + העלה אודיו
      </button>

      <div>
        <h4 className="text-xs text-gray-500 mb-2">מוזיקת רקע:</h4>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full bg-white/5 hover:bg-white/10 text-gray-300 text-xs py-2 rounded-lg"
        >
          🎵 הוסף מוזיקת רקע
        </button>
      </div>

      <div>
        <h4 className="text-xs text-gray-500 mb-2">אפקטי קול:</h4>
        <div className="grid grid-cols-2 gap-2">
          {['אווירה', 'מעבר', 'צליל פעולה', 'התראה'].map((effect) => (
            <button key={effect} className="bg-white/5 hover:bg-white/10 rounded-lg p-2 text-xs text-gray-300">
              {effect}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============ TEXT ADD PANEL ============
function TextAddPanel() {
  const addTextOverlay = useEditorStore((s) => s.addTextOverlay)
  const duration = useEditorStore((s) => s.duration)
  const currentTime = useEditorStore((s) => s.currentTime)

  const createText = (overrides: Partial<Parameters<typeof addTextOverlay>[0]> = {}) => {
    addTextOverlay({
      id: `text-${Date.now()}`,
      text: 'טקסט חדש',
      x: 35, y: 40, width: 30, height: 10,
      rotation: 0,
      fontFamily: 'Heebo',
      fontSize: 32,
      fontWeight: 'normal',
      fontStyle: 'normal',
      color: '#FFFFFF',
      backgroundColor: 'transparent',
      backgroundOpacity: 0,
      textAlign: 'center',
      lineHeight: 1.2,
      letterSpacing: 0,
      shadow: null,
      outline: null,
      animation: { entrance: 'none', exit: 'none', duration: 0.5 },
      startTime: currentTime,
      endTime: Math.min(currentTime + 5, duration || 10),
      ...overrides,
    })
  }

  return (
    <div className="p-3 space-y-4" dir="rtl">
      <h3 className="text-white font-medium text-sm">T טקסט</h3>

      <button
        onClick={() => createText()}
        className="w-full bg-purple-600 hover:bg-purple-500 text-white py-2 rounded-lg text-sm"
      >
        + הוסף טקסט
      </button>

      <h4 className="text-xs text-gray-500">תבניות:</h4>
      <div className="grid grid-cols-2 gap-2">
        {[
          { name: 'כותרת', style: { fontSize: 48, fontWeight: 'bold' as const } },
          { name: 'כתובית', style: { fontSize: 24, backgroundColor: 'rgba(0,0,0,0.6)', backgroundOpacity: 0.6 } },
          { name: 'CTA', style: { fontSize: 32, fontWeight: 'bold' as const, backgroundColor: '#7C5CFF', backgroundOpacity: 1 } },
          { name: 'Lower Third', style: { fontSize: 20, y: 75 } },
          { name: 'ציטוט', style: { fontSize: 28, fontStyle: 'italic' as const } },
          { name: 'Handle', style: { fontSize: 18, color: '#7C5CFF' } },
        ].map((preset) => (
          <button
            key={preset.name}
            onClick={() => createText(preset.style)}
            className="bg-white/5 hover:bg-white/10 rounded-lg p-3 text-sm text-white text-center"
          >
            {preset.name}
          </button>
        ))}
      </div>
    </div>
  )
}

// ============ IMAGES PANEL ============
function ImagesPanel() {
  const addToast = useUIStore((s) => s.addToast)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const addMediaToProject = useEditorStore((s) => s.addMediaToProject)

  const handleUploadImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    for (const file of Array.from(files)) {
      const url = URL.createObjectURL(file)
      addMediaToProject({
        id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: file.name,
        url,
        type: 'image',
        size: file.size,
        file,
      })
    }
    addToast('תמונות נוספו', 'success')
    e.target.value = ''
  }

  return (
    <div className="p-3 space-y-4" dir="rtl">
      <h3 className="text-white font-medium text-sm">🖼 תמונות</h3>
      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleUploadImages} />
      <button onClick={() => fileInputRef.current?.click()} className="w-full bg-purple-600 hover:bg-purple-500 text-white py-2 rounded-lg text-sm">
        + העלה תמונות
      </button>
      <div>
        <h4 className="text-xs text-gray-500 mb-2">Shapes:</h4>
        <div className="grid grid-cols-3 gap-2">
          {['🟥', '🟦', '🟩', '⬛', '🔵', '🔺'].map((shape) => (
            <button key={shape} className="bg-white/5 hover:bg-white/10 rounded-lg p-3 text-xl text-center">
              {shape}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============ SUBTITLES PANEL ============
function SubtitlesPanel() {
  const captions = useEditorStore((s) => s.captions)
  const showCaptions = useEditorStore((s) => s.showCaptions)
  const setShowCaptions = useEditorStore((s) => s.setShowCaptions)
  const generateCaptionsFromTranscript = useEditorStore((s) => s.generateCaptionsFromTranscript)
  const transcript = useEditorStore((s) => s.transcript)

  return (
    <div className="p-3 space-y-4" dir="rtl">
      <h3 className="text-white font-medium text-sm">💬 כתוביות</h3>

      <label className="flex items-center gap-2">
        <input type="checkbox" checked={showCaptions} onChange={(e) => setShowCaptions(e.target.checked)} />
        <span className="text-xs text-gray-300">הצג כתוביות</span>
      </label>

      {transcript.length > 0 && captions.length === 0 && (
        <button
          onClick={generateCaptionsFromTranscript}
          className="w-full bg-purple-600 hover:bg-purple-500 text-white py-2 rounded-lg text-sm"
        >
          ✨ צור כתוביות מתמלול
        </button>
      )}

      <div className="space-y-1 max-h-64 overflow-y-auto">
        {captions.map((cap) => (
          <div key={cap.id} className="bg-white/5 rounded-lg p-2 text-xs">
            <div className="text-gray-400 text-[10px]">{formatTime(cap.startTime)} - {formatTime(cap.endTime)}</div>
            <div className="text-white mt-0.5">{cap.text}</div>
          </div>
        ))}
      </div>

      {captions.length === 0 && transcript.length === 0 && (
        <p className="text-gray-600 text-xs text-center">תמלל תחילה את הסרטון כדי ליצור כתוביות</p>
      )}
    </div>
  )
}

// ============ TRANSCRIPT PANEL (MINI) ============
function TranscriptPanelMini() {
  const transcript = useEditorStore((s) => s.transcript)
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime)

  return (
    <div className="p-3 space-y-4" dir="rtl">
      <h3 className="text-white font-medium text-sm">📝 תמלול</h3>

      {transcript.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-gray-500 text-xs">אין תמלול</p>
          <p className="text-gray-600 text-[10px] mt-1">השתמש בכלי AI לתמלול אוטומטי</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {transcript.map((seg, i) => (
            <div
              key={i}
              className="bg-white/5 rounded-lg p-2 text-xs cursor-pointer hover:bg-white/10"
              onClick={() => {
                if (seg.segStart !== undefined) setCurrentTime(seg.segStart)
              }}
            >
              <div className="text-purple-400 text-[10px] mb-0.5">{seg.speaker} - {seg.startTime}</div>
              <div className="text-white">{seg.words.map((w) => w.text).join(' ')}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============ TRANSLATE PANEL ============
function TranslatePanel() {
  const glossaryTerms = useEditorStore((s) => s.glossaryTerms)
  const addGlossaryTerm = useEditorStore((s) => s.addGlossaryTerm)
  const updateGlossaryTerm = useEditorStore((s) => s.updateGlossaryTerm)
  const removeGlossaryTerm = useEditorStore((s) => s.removeGlossaryTerm)
  const captionTracks = useEditorStore((s) => s.captionTracks)
  const [targetLang, setTargetLang] = useState('en')

  const languages = [
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'ar', name: 'العربية', flag: '🇸🇦' },
    { code: 'ru', name: 'Русский', flag: '🇷🇺' },
    { code: 'fr', name: 'Français', flag: '🇫🇷' },
    { code: 'es', name: 'Español', flag: '🇪🇸' },
    { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  ]

  return (
    <div className="p-3 space-y-4" dir="rtl">
      <h3 className="text-white font-medium text-sm">🌐 תרגום</h3>

      <div>
        <h4 className="text-xs text-gray-400 mb-2">שפת יעד:</h4>
        <div className="grid grid-cols-2 gap-1">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => setTargetLang(lang.code)}
              className={`text-xs p-2 rounded-lg ${
                targetLang === lang.code ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30' : 'bg-white/5 text-gray-300 hover:bg-white/10'
              }`}
            >
              {lang.flag} {lang.name}
            </button>
          ))}
        </div>
      </div>

      <button className="w-full bg-purple-600 hover:bg-purple-500 text-white py-2 rounded-lg text-sm">
        🌐 תרגם כתוביות
      </button>

      {captionTracks.length > 0 && (
        <div>
          <h4 className="text-xs text-gray-400 mb-1">תרגומים קיימים:</h4>
          {captionTracks.filter((t) => !t.isSource).map((track) => (
            <div key={track.id} className="flex items-center gap-2 text-xs py-1">
              <span>{track.flag}</span>
              <span className="text-gray-300">{track.languageName}</span>
              <span className="text-gray-500">({track.captions.length})</span>
            </div>
          ))}
        </div>
      )}

      {/* Glossary */}
      <div className="mt-4">
        <h4 className="text-xs text-gray-400 mb-2">📖 מילון מונחים (לא לתרגם)</h4>

        {glossaryTerms.map((term, i) => (
          <div key={i} className="flex items-center gap-2 mb-1">
            <input
              value={term.source}
              onChange={(e) => updateGlossaryTerm(i, 'source', e.target.value)}
              className="flex-1 bg-black/30 text-white text-xs rounded px-2 py-1"
              placeholder="מונח מקורי"
            />
            <span className="text-gray-500">→</span>
            <input
              value={term.target}
              onChange={(e) => updateGlossaryTerm(i, 'target', e.target.value)}
              className="flex-1 bg-black/30 text-white text-xs rounded px-2 py-1"
              placeholder="תרגום (או השאר ריק)"
            />
            <button onClick={() => removeGlossaryTerm(i)} className="text-red-400 text-xs">✕</button>
          </div>
        ))}

        <button onClick={addGlossaryTerm} className="text-purple-400 text-xs">+ הוסף מונח</button>

        <p className="text-[10px] text-gray-600 mt-2">
          מונחים כמו שמות מותג, שמות אנשים או מונחים טכניים שלא צריך לתרגם.
        </p>
      </div>
    </div>
  )
}

// ============ TRANSITIONS PANEL ============
function TransitionsPanel() {
  const transitions = [
    { id: 'none', name: 'ללא', icon: '✂️' },
    { id: 'fade', name: 'עמעום', icon: '🌅' },
    { id: 'dissolve', name: 'המסה', icon: '💫' },
    { id: 'slideLeft', name: 'החלקה שמאלה', icon: '⬅️' },
    { id: 'slideRight', name: 'החלקה ימינה', icon: '➡️' },
    { id: 'zoom', name: 'זום פנימה', icon: '🔍' },
    { id: 'spin', name: 'סיבוב', icon: '🌀' },
    { id: 'blur', name: 'טשטוש', icon: '🌫️' },
    { id: 'flash', name: 'הבזק', icon: '⚡' },
    { id: 'glitch', name: "גליץ'", icon: '📺' },
    { id: 'wipe', name: 'מחיקה', icon: '🧹' },
  ]

  return (
    <div className="p-3 space-y-4" dir="rtl">
      <h3 className="text-white font-medium text-sm">🌅 מעברים</h3>
      <p className="text-[10px] text-gray-500">בחר מעבר וגרור בין שני קליפים בטיימליין</p>
      <div className="grid grid-cols-2 gap-2">
        {transitions.map((t) => (
          <button
            key={t.id}
            draggable
            className="bg-white/5 hover:bg-white/10 rounded-lg p-3 text-center cursor-grab active:cursor-grabbing"
          >
            <span className="text-xl block">{t.icon}</span>
            <span className="text-xs text-gray-300 mt-1 block">{t.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ============ AI PANEL ============
function AIPanel() {
  const openModal = useUIStore((s) => s.openModal)

  const aiTools = [
    { label: '✨ שפר אוטומטי', modal: 'quickStyle' },
    { label: '✂️ Smart Cut (הסר שתיקות)', modal: 'silence' },
    { label: '🧹 הסר מילות מילוי', modal: 'fillerWords' },
    { label: '💬 כתוביות אוטומטיות', modal: 'captions' },
    { label: '🎙 קריינות AI', modal: 'voiceover' },
    { label: '🎨 Color Grade', modal: 'colorGrade' },
    { label: '🖼 B-Roll חכם', modal: 'broll' },
    { label: '👁 קשר עין', modal: 'eyeContact' },
    { label: '🎯 מרכז דובר', modal: 'speakerCenter' },
    { label: '🔊 נקה אודיו', modal: 'noiseRemoval' },
    { label: '🎬 זהה סצנות', modal: 'sceneDetection' },
    { label: '📱 צור קליפים לרשתות', modal: 'socialClips' },
  ]

  return (
    <div className="p-3 space-y-4" dir="rtl">
      <h3 className="text-white font-medium text-sm">🤖 כלי AI</h3>
      <div className="space-y-2">
        {aiTools.map((tool) => (
          <button
            key={tool.modal}
            onClick={() => openModal(tool.modal)}
            className="w-full bg-white/5 hover:bg-white/10 text-white text-xs py-2.5 rounded-lg text-right px-3"
          >
            {tool.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ============ RECORD PANEL ============
function RecordPanel() {
  const [isRecording, setIsRecording] = useState(false)
  const addToast = useUIStore((s) => s.addToast)
  const addMediaToProject = useEditorStore((s) => s.addMediaToProject)
  const recordersRef = useRef<MediaRecorder[]>([])
  const streamsRef = useRef<MediaStream[]>([])

  const startRecording = async (type: 'screen' | 'camera' | 'screen+camera' | 'audio') => {
    try {
      const streams: MediaStream[] = []

      if (type === 'screen' || type === 'screen+camera') {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
        streams.push(screenStream)
      }

      if (type === 'camera' || type === 'screen+camera') {
        const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        streams.push(cameraStream)
      }

      if (type === 'audio') {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true })
        streams.push(audioStream)
      }

      streamsRef.current = streams
      const recorders = streams.map((stream) => {
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' })
        const chunks: Blob[] = []
        recorder.ondataavailable = (e) => chunks.push(e.data)
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: type === 'audio' ? 'audio/webm' : 'video/webm' })
          const url = URL.createObjectURL(blob)
          addMediaToProject({
            id: `rec-${Date.now()}`,
            name: `הקלטה-${new Date().toLocaleTimeString('he-IL')}`,
            url,
            type: type === 'audio' ? 'audio' : 'video',
            size: blob.size,
          })
          addToast('ההקלטה נוספה לפרויקט', 'success')
        }
        return recorder
      })

      recorders.forEach((r) => r.start())
      recordersRef.current = recorders
      setIsRecording(true)
    } catch (e) {
      addToast('שגיאה בהקלטה: ' + (e instanceof Error ? e.message : 'שגיאה לא ידועה'), 'error')
    }
  }

  const stopRecording = () => {
    recordersRef.current.forEach((r) => { if (r.state === 'recording') r.stop() })
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()))
    setIsRecording(false)
  }

  return (
    <div className="p-3 space-y-4" dir="rtl">
      <h3 className="text-white font-medium text-sm">🔴 הקלטה</h3>

      {isRecording ? (
        <button
          onClick={stopRecording}
          className="w-full bg-red-600 hover:bg-red-500 text-white py-3 rounded-lg flex items-center justify-center gap-2 animate-pulse"
        >
          ⏹ עצור הקלטה
        </button>
      ) : (
        <>
          <button
            onClick={() => startRecording('screen+camera')}
            className="w-full bg-red-600 hover:bg-red-500 text-white py-3 rounded-lg flex items-center justify-center gap-2"
          >
            🖥 + 📷 מסך + מצלמה
          </button>

          <button
            onClick={() => startRecording('screen')}
            className="w-full bg-white/10 hover:bg-white/15 text-white py-2 rounded-lg text-sm"
          >
            🖥 מסך בלבד
          </button>

          <button
            onClick={() => startRecording('camera')}
            className="w-full bg-white/10 hover:bg-white/15 text-white py-2 rounded-lg text-sm"
          >
            📷 מצלמה בלבד
          </button>

          <button
            onClick={() => startRecording('audio')}
            className="w-full bg-white/10 hover:bg-white/15 text-white py-2 rounded-lg text-sm"
          >
            🎙 מיקרופון בלבד
          </button>
        </>
      )}

      <p className="text-[10px] text-gray-600">ההקלטות יתווספו כשכבות נפרדות בטיימליין</p>
    </div>
  )
}
